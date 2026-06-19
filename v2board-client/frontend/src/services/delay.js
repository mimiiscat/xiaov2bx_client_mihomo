import { getElectron } from '../utils/electron'

const DEFAULT_GROUP = '🚀 节点选择'
const DEFAULT_URL = 'http://cp.cloudflare.com/generate_204'
const CACHE_TTL = 30 * 60 * 1000
const TESTING = -2
const TIMEOUT = 0
const ERROR = 1e6
const MIN_VISIBLE_DELAY_MS = 500

const hashKey = (name, group) => `${group ?? DEFAULT_GROUP}::${name}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class DelayManager {
  constructor() {
    this.cache = new Map()
    this.urlMap = new Map()
    this.listenerMap = new Map()
    this.groupListenerMap = new Map()
    this.pendingItemUpdates = new Map()
    this.pendingGroupUpdates = new Set()
    this.itemFlushScheduled = false
    this.groupFlushScheduled = false
    this.defaultUrl = DEFAULT_URL
    this.defaultTimeout = 10000
    this.defaultGroup = DEFAULT_GROUP
    this.delaySessionHeld = false
    this.batchSessionActive = false
    this.sessionStartPromise = null
  }

  configure({ defaultUrl, defaultTimeout, defaultGroup } = {}) {
    if (typeof defaultUrl === 'string' && defaultUrl.trim()) {
      this.defaultUrl = defaultUrl.trim()
    }
    const timeoutValue = Number(defaultTimeout)
    if (Number.isFinite(timeoutValue) && timeoutValue > 0) {
      this.defaultTimeout = Math.round(timeoutValue)
    }
    if (typeof defaultGroup === 'string' && defaultGroup.trim()) {
      this.defaultGroup = defaultGroup.trim()
    }
  }

  scheduleOnNextFrame(run) {
    if (typeof window !== 'undefined') {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run)
        return
      }
      if (typeof window.setTimeout === 'function') {
        window.setTimeout(run, 0)
        return
      }
    }
    Promise.resolve().then(run)
  }

  scheduleItemFlush() {
    if (this.itemFlushScheduled) return
    this.itemFlushScheduled = true
    this.scheduleOnNextFrame(() => {
      this.itemFlushScheduled = false
      const updates = this.pendingItemUpdates
      this.pendingItemUpdates = new Map()
      updates.forEach((queue, key) => {
        const listener = this.listenerMap.get(key)
        if (!listener) return
        queue.forEach((update) => {
          try {
            listener(update)
          } catch (error) {
            console.error(`[DelayManager] notify failed: ${key}`, error)
          }
        })
      })
    })
  }

  scheduleGroupFlush() {
    if (this.groupFlushScheduled) return
    this.groupFlushScheduled = true
    this.scheduleOnNextFrame(() => {
      this.groupFlushScheduled = false
      const groups = this.pendingGroupUpdates
      this.pendingGroupUpdates = new Set()
      groups.forEach((group) => {
        const listener = this.groupListenerMap.get(group)
        if (!listener) return
        try {
          listener()
        } catch (error) {
          console.error(`[DelayManager] group notify failed: ${group}`, error)
        }
      })
    })
  }

  queueGroupNotification(group) {
    this.pendingGroupUpdates.add(group)
    this.scheduleGroupFlush()
  }

  setUrl(group, url) {
    if (!group) return
    if (typeof url === 'string' && url.trim()) {
      this.urlMap.set(group, url.trim())
    }
  }

  getUrl(group) {
    if (group && this.urlMap.has(group)) return this.urlMap.get(group)
    return this.defaultUrl
  }

  setListener(name, group, listener) {
    if (!name || typeof listener !== 'function') return
    const key = hashKey(name, group)
    this.listenerMap.set(key, listener)
    const cached = this.getDelayUpdate(name, group)
    if (cached) {
      try {
        listener(cached)
      } catch (error) {
        console.error(`[DelayManager] initial notify failed: ${key}`, error)
      }
    }
  }

  removeListener(name, group) {
    this.listenerMap.delete(hashKey(name, group))
  }

  setGroupListener(group, listener) {
    if (!group || typeof listener !== 'function') return
    this.groupListenerMap.set(group, listener)
  }

  removeGroupListener(group) {
    this.groupListenerMap.delete(group)
  }

  setDelay(name, group, delay, meta = {}) {
    if (!name) return null
    const key = hashKey(name, group)
    const update = {
      delay,
      elapsed: meta.elapsed,
      updatedAt: Date.now(),
    }
    this.cache.set(key, update)

    const queue = this.pendingItemUpdates.get(key)
    if (queue) queue.push(update)
    else this.pendingItemUpdates.set(key, [update])

    this.scheduleItemFlush()
    return update
  }

  getDelayUpdate(name, group) {
    if (!name) return undefined
    const key = hashKey(name, group)
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() - entry.updatedAt > CACHE_TTL) {
      this.cache.delete(key)
      return undefined
    }
    return { ...entry }
  }

  getDelay(name, group) {
    const update = this.getDelayUpdate(name, group)
    return update ? update.delay : -1
  }

  clearGroup(group) {
    const prefix = `${group ?? DEFAULT_GROUP}::`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key)
    }
    this.queueGroupNotification(group ?? DEFAULT_GROUP)
  }

  async ensureDelaySession() {
    if (this.delaySessionHeld) return false
    if (this.sessionStartPromise) {
      return this.sessionStartPromise
    }

    this.sessionStartPromise = (async () => {
      const status = await getElectron().getStatus?.()
      if (status?.proxyOn) return false
      const result = await getElectron().startDelayTestSession?.()
      if (result?.started) {
        this.delaySessionHeld = true
        return true
      }
      return false
    })().finally(() => {
      this.sessionStartPromise = null
    })

    return this.sessionStartPromise
  }

  async releaseDelaySession(startedByThisRun = false) {
    if (!startedByThisRun && !this.delaySessionHeld) return
    if (this.batchSessionActive && !startedByThisRun) return
    await getElectron().stopDelayTestSession?.()
    this.delaySessionHeld = false
  }

  getDelayFix(proxy, group) {
    if (!proxy) return -1
    const update = this.getDelayUpdate(proxy.name, group)
    if (update && (update.delay >= 0 || update.delay === TESTING)) {
      return update.delay
    }
    if (proxy.history && proxy.history.length > 0) {
      return proxy.history[proxy.history.length - 1].delay || ERROR
    }
    if (Number.isFinite(proxy.delay)) return proxy.delay
    return -1
  }

  normalizeDelayResponse(resp, timeout) {
    const delay = Number(resp?.delay ?? resp?.data?.delay ?? resp?.data ?? resp)
    if (!Number.isFinite(delay)) return ERROR
    if (delay === TIMEOUT || (delay >= timeout && delay <= 1e5)) return TIMEOUT
    if (delay > 1e5) return ERROR
    return delay
  }

  async checkDelay(name, group, timeout = this.defaultTimeout) {
    if (!name) return { delay: ERROR, latency: null, status: 'error' }
    const effectiveGroup = group || this.defaultGroup
    const effectiveTimeout = Math.max(1000, Number(timeout) || this.defaultTimeout)
    const status = await getElectron().getStatus?.()
    let startedSession = false
    if (!status?.proxyOn && !this.batchSessionActive) {
      startedSession = await this.ensureDelaySession()
      if (!startedSession && !this.delaySessionHeld && !status?.proxyOn) {
        const update = this.setDelay(name, effectiveGroup, ERROR)
        return { ...update, latency: null, status: 'error' }
      }
    }
    this.setDelay(name, effectiveGroup, TESTING)
    const startTime = Date.now()

    try {
      const url = this.getUrl(effectiveGroup)
      const electron = getElectron()
      const result = await Promise.race([
        electron.getProxyDelay?.(name, url, effectiveTimeout),
        new Promise((resolve) => setTimeout(() => resolve({ delay: TIMEOUT }), effectiveTimeout)),
      ])

      const elapsed = Date.now() - startTime
      if (elapsed < MIN_VISIBLE_DELAY_MS) {
        await sleep(MIN_VISIBLE_DELAY_MS - elapsed)
      }

      const delay = this.normalizeDelayResponse(result, effectiveTimeout)
      const update = delay === ERROR
        ? this.setDelay(name, effectiveGroup, ERROR, { elapsed })
        : this.setDelay(name, effectiveGroup, delay, { elapsed })

      return {
        ...update,
        latency: update.delay === ERROR ? null : update.delay,
        status: update.delay === TESTING
          ? 'testing'
          : update.delay === TIMEOUT
            ? 'timeout'
            : update.delay === ERROR
              ? 'error'
              : 'ok',
      }
    } catch (error) {
      const elapsed = Date.now() - startTime
      if (elapsed < MIN_VISIBLE_DELAY_MS) {
        await sleep(MIN_VISIBLE_DELAY_MS - elapsed)
      }
      console.error(`[DelayManager] checkDelay failed: ${name}`, error)
      const update = this.setDelay(name, effectiveGroup, ERROR, { elapsed: Date.now() - startTime })
      return { ...update, latency: null, status: 'error' }
    } finally {
      if (startedSession) {
        await this.releaseDelaySession(true)
      }
    }
  }

  async checkProxyProvider(providerName) {
    if (!providerName) return null
    try {
      return await getElectron().healthcheckProxyProvider?.(providerName)
    } catch (error) {
      console.error(`[DelayManager] provider healthcheck failed: ${providerName}`, error)
      return null
    }
  }

  async checkGroupDelay(group, timeout = this.defaultTimeout) {
    const effectiveGroup = group || this.defaultGroup
    try {
      const url = this.getUrl(effectiveGroup)
      const result = await getElectron().delayGroup?.(effectiveGroup, url, timeout)
      this.queueGroupNotification(effectiveGroup)
      return result
    } catch (error) {
      console.error(`[DelayManager] group delay failed: ${effectiveGroup}`, error)
      return null
    }
  }

  async checkListDelay(nameList, group, timeout = this.defaultTimeout, concurrency = 36) {
    const effectiveGroup = group || this.defaultGroup
    const names = Array.isArray(nameList) ? nameList.filter(Boolean) : []
    if (!names.length) return {}

    const status = await getElectron().getStatus?.()
    let startedSession = false
    this.batchSessionActive = true
    try {
      if (!status?.proxyOn) {
        startedSession = await this.ensureDelaySession()
      }
    } catch (error) {
      console.error('[DelayManager] start delay session failed', error)
    }

    if (!status?.proxyOn && !this.delaySessionHeld) {
      names.forEach((name) => this.setDelay(name, effectiveGroup, ERROR))
      this.batchSessionActive = false
      return {}
    }

    names.forEach((name) => this.setDelay(name, effectiveGroup, TESTING))

    let index = 0
    const actualConcurrency = Math.min(concurrency, names.length, 10)
    const results = {}
    const worker = async () => {
      while (index < names.length) {
        const name = names[index++]
        if (!name) continue

        if (index > 1) {
          await sleep(Math.random() * 200)
        }

        const result = await this.checkDelay(name, effectiveGroup, timeout)
        results[name] = result
        this.queueGroupNotification(effectiveGroup)
      }
    }

    try {
      const workers = Array.from({ length: actualConcurrency }, () => worker())
      await Promise.allSettled(workers)
      if (startedSession) {
        await this.releaseDelaySession(true)
      }
    } finally {
      this.batchSessionActive = false
    }
    return results
  }

  formatDelay(delay, timeout = this.defaultTimeout) {
    if (delay === -1) return '-'
    if (delay === TESTING) return '测试中'
    if (delay === TIMEOUT || (delay >= timeout && delay <= 1e5)) return '超时'
    if (delay > 1e5) return '超时'
    return `${delay} ms`
  }

  formatDelayColor(delay, timeout = this.defaultTimeout) {
    if (delay === TESTING) return '#8ea0ff'
    if (delay < 0) return ''
    if (delay === TIMEOUT || delay >= timeout) return '#ff6b6b'
    if (delay >= 10000) return '#ff6b6b'
    if (delay >= 400) return '#ff922b'
    if (delay >= 250) return '#667eea'
    return '#51cf66'
  }
}

const delayManager = new DelayManager()

export default delayManager
