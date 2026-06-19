const { app, BrowserWindow, Tray, ipcMain, Menu, nativeImage } = require('electron')
const path = require('path')
const express = require('express')
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const net = require('net')
const http = require('http')
const killPort = require('kill-port')
const YAML = require('js-yaml')
const { shell, clipboard } = require('electron')
const { getArchDir: getPlatformArchDir, getMihomoBinaryCandidates } = require('./platform')
const APP_CONFIG_PATH = path.join(__dirname, '..', 'app.config.json')

let win = null
let tray = null
let frontendServer = null
let mihomoProcess = null
let isProxyOn = false
let serverUrl = getRuntimeConfig().backend_api_url || 'https://api.dudog.club'
let subscribeToken = ''
let authData = ''
let mihomoBinPath = ''
let mihomoConfigPath = ''
let selectedProxyName = ''
const DEFAULT_MIXED_PORT = 7897
const DEFAULT_DELAY_TEST_URL = 'http://cp.cloudflare.com/generate_204'
const DEFAULT_LATENCY_TIMEOUT = 10000
const DELAY_TIMEOUT = 0
const DELAY_ERROR = 1e6
let activeMixedPort = DEFAULT_MIXED_PORT
let activeControllerPort = 0
let trafficRequest = null
let trafficState = { up: 0, down: 0, uploadTotal: 0, downloadTotal: 0 }
let activeProxyName = ''
let isDelayTestSession = false
let startMihomoPromise = null
let refreshTrayMenu = () => {}
const MAIN_PROXY_GROUP = '🚀 节点选择'
const FALLBACK_PROXY_GROUP = '🐟 漏网之鱼'
const LATENCY_TEST_URL_KEY = 'defaultLatencyTest'
const LATENCY_TEST_TIMEOUT_KEY = 'defaultLatencyTimeout'

function readAppConfig() {
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'))
    }
  } catch (e) {
    console.error('[Config] Read app config error:', e.message)
  }
  return {
    app_name: 'v2Board',
    client_name: 'Mihomo',
    app_version: '1.0.0',
    app_id: 'com.v2board.client',
    product_name: 'v2Board',
    window_title: 'v2Board · Mihomo',
    page_title: 'v2Board 客户端',
    tray_tooltip: 'v2Board Client',
    backend_api_url: 'https://api.dudog.club',
  }
}

function getRuntimeConfig() {
  return readAppConfig()
}

function getConfig(key, fallback = '') {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json')
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return data[key] ?? fallback
    }
  } catch (e) {}
  return fallback
}

function setConfig(key, value) {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json')
    let data = {}
    if (fs.existsSync(configPath)) {
      data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
    data[key] = value
    fs.writeFileSync(configPath, JSON.stringify(data))
  } catch (e) {
    console.error('[Config] Error:', e.message)
  }
}


// ─── Path Helpers ──────────────────────────────────────────

function getArchDir() {
  return getPlatformArchDir(process.platform, process.arch)
}

function getLibsPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'libs', getArchDir())
    : path.join(__dirname, '..', 'libs', getArchDir())
}

function getGeoPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'libs', 'geo')
    : path.join(__dirname, '..', 'libs', 'geo')
}

// ─── Mihomo Core ───────────────────────────────────────────

function findMihomoBinary() {
  const libsPath = getLibsPath()
  const candidates = getMihomoBinaryCandidates(process.platform)
  for (const name of candidates) {
    const p = path.join(libsPath, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function buildBaseMihomoConfig() {
  return {
    port: 0,
    'mixed-port': activeMixedPort,
    'external-controller': `127.0.0.1:${activeControllerPort}`,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'warning',
    'unified-delay': true,
    ipv6: true,

    tun: {
      enable: false,
      stack: 'system',
      'auto-route': true,
      'auto-redirect': true,
      'auto-detect-interface': true,
      'dns-hijack': ['any:53'],
    },

    dns: {
      enable: true,
      listen: '0.0.0.0:1053',
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '100.64.0.1/10',
      'fake-ip-filter': ['*.lan', '*.local', 'time.windows.com', 'time.nist.gov'],
      'default-nameserver': ['8.8.8.8', '114.114.114.114'],
      nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
    },

    proxies: [],
    'proxy-groups': [
      {
        name: MAIN_PROXY_GROUP,
        type: 'select',
        proxies: ['♻️ 自动选择', 'DIRECT'],
      },
      {
        name: '♻️ 自动选择',
        type: 'url-test',
        proxies: ['DIRECT'],
        url: 'http://cp.cloudflare.com/generate_204',
        interval: 300,
        tolerance: 50,
      },
      { name: FALLBACK_PROXY_GROUP, type: 'select', proxies: [MAIN_PROXY_GROUP, 'DIRECT'] },
    ],

    rules: [
      'GEOSITE,cn,DIRECT',
      'GEOIP,cn,DIRECT,no-resolve',
      'GEOSITE,category-ads-all,DIRECT',
      `MATCH,${FALLBACK_PROXY_GROUP}`,
    ],

    "geodata-mode": true,
    "geodata-loader": 'standard',
  }
}

function getSavedSubscriptionPath() {
  return path.join(app.getPath('userData'), 'subscription.yaml')
}

function appendQuery(url, params) {
  try {
    const parsed = new URL(url)
    Object.entries(params).forEach(([key, value]) => parsed.searchParams.set(key, value))
    return parsed.toString()
  } catch (_) {
    const joiner = url.includes('?') ? '&' : '?'
    return `${url}${joiner}${new URLSearchParams(params).toString()}`
  }
}

function getStatusSnapshot() {
  return {
    proxyOn: isProxyOn,
    server: serverUrl,
    hasToken: !!authData,
    mainProxyGroup: MAIN_PROXY_GROUP,
    selectedProxyName,
    activeProxyName,
    mixedPort: activeMixedPort,
    traffic: trafficState,
    defaultLatencyTest: getConfig(LATENCY_TEST_URL_KEY, DEFAULT_DELAY_TEST_URL),
    defaultLatencyTimeout: Number(getConfig(LATENCY_TEST_TIMEOUT_KEY, DEFAULT_LATENCY_TIMEOUT)) || DEFAULT_LATENCY_TIMEOUT,
  }
}

function sendStatusSnapshot() {
  win?.webContents.send('status-snapshot', getStatusSnapshot())
}

function readCachedSubscription() {
  try {
    const cachePath = getSavedSubscriptionPath()
    if (!fs.existsSync(cachePath)) return null
    return YAML.load(fs.readFileSync(cachePath, 'utf-8'))
  } catch (err) {
    console.error('[Subscription] Cache read error:', err.message)
    return null
  }
}

function writeCachedSubscription(raw) {
  try {
    fs.writeFileSync(getSavedSubscriptionPath(), raw)
  } catch (err) {
    console.error('[Subscription] Cache write error:', err.message)
  }
}

async function fetchSubscriptionConfig() {
  const axios = require('axios')
  const subscribeResult = await fetchSubscription(authData)
  const subscribeUrl = subscribeResult?.data?.subscribe_url || subscribeResult?.data
  if (!subscribeUrl || typeof subscribeUrl !== 'string') {
    return readCachedSubscription()
  }

  const url = appendQuery(subscribeUrl, { flag: 'clash' })
  try {
    const resp = await axios.get(url, {
      timeout: 30000,
      responseType: 'text',
      headers: { 'User-Agent': 'clash' },
    })
    const raw = typeof resp.data === 'string' ? resp.data : String(resp.data)
    const parsed = YAML.load(raw)
    if (Array.isArray(parsed?.proxies) && parsed.proxies.length) {
      writeCachedSubscription(raw)
      return parsed
    }
  } catch (err) {
    console.error('[Subscription] Download error:', err.message)
  }

  return readCachedSubscription()
}

async function fetchMetaSubscriptionProxies() {
  const axios = require('axios')
  const subscribeResult = await fetchSubscription(authData)
  const subscribeUrl = subscribeResult?.data?.subscribe_url || subscribeResult?.data
  if (!subscribeUrl || typeof subscribeUrl !== 'string') return []

  try {
    const url = appendQuery(subscribeUrl, { flag: 'meta' })
    const resp = await axios.get(url, {
      timeout: 30000,
      responseType: 'text',
      headers: { 'User-Agent': 'clash' },
    })
    const parsed = YAML.load(typeof resp.data === 'string' ? resp.data : String(resp.data))
    return Array.isArray(parsed?.proxies) ? parsed.proxies.filter(p => p?.name && p?.type) : []
  } catch (err) {
    console.error('[Subscription] Meta proxy fetch error:', err.message)
    return []
  }
}

function applySubscriptionConfig(baseConfig, subscriptionConfig) {
  const proxies = Array.isArray(subscriptionConfig?.proxies) ? subscriptionConfig.proxies : []
  const usableProxies = proxies.filter(p => p && p.name && p.type)
  if (!usableProxies.length) return baseConfig
  return applyProxyList(baseConfig, usableProxies)
}

function uniqueProxyNames(proxies) {
  const seen = new Map()
  return proxies.map(proxy => {
    const original = proxy.name
    const count = seen.get(original) || 0
    seen.set(original, count + 1)
    if (!count) return proxy
    return { ...proxy, name: `${original} #${count + 1}` }
  })
}

function applyProxyList(baseConfig, proxies) {
  const usableProxies = uniqueProxyNames(proxies.filter(p => p && p.name && p.type))
  if (!usableProxies.length) return baseConfig

  const proxyNames = usableProxies.map(p => p.name)
  const savedSelected = selectedProxyName && proxyNames.includes(selectedProxyName)
    ? selectedProxyName
    : proxyNames[0]
  selectedProxyName = savedSelected
  setConfig('selectedProxyName', selectedProxyName)

  const restNames = proxyNames.filter(name => name !== savedSelected)
  baseConfig.proxies = usableProxies
  baseConfig['proxy-groups'][0].proxies = [savedSelected, '♻️ 自动选择', 'DIRECT', ...restNames]
  baseConfig['proxy-groups'][1].proxies = proxyNames
  baseConfig['proxy-groups'][2].proxies = [MAIN_PROXY_GROUP, savedSelected, 'DIRECT']

  return baseConfig
}

async function fetchUserUuid() {
  const info = await fetchUserInfo(authData)
  return info?.data?.uuid || ''
}

function boolFromInt(value) {
  return value === true || value === 1 || value === '1'
}

function getServerProtocol(server) {
  const rawType = String(server?.type || server?.protocol || '').trim().toLowerCase()
  const version = Number(server?.version || server?.protocol_version || 0)
  if (rawType === 'hysteria2' || rawType === 'hy2') return 'hysteria2'
  if (rawType === 'hysteria' && version === 2) return 'hysteria2'
  return rawType
}

function serverToProxy(server, userUuid) {
  const port = Number(server.server_port || server.port)
  if (!server?.name || !server?.host || !port) return null

  if (getServerProtocol(server) === 'hysteria2') {
    const proxy = {
      name: server.name,
      type: 'hysteria2',
      server: server.host,
      port,
      password: server.server_key || server.password || '',
      sni: server.server_name || server.host,
      'skip-cert-verify': boolFromInt(server.insecure),
      udp: true,
    }
    if (server.obfs) proxy.obfs = server.obfs
    if (server.obfs_password) proxy['obfs-password'] = server.obfs_password
    return proxy.password ? proxy : null
  }

  if (server.type === 'vless' && userUuid) {
    const tls = server.tls_settings || {}
    const rawNetwork = server.network || 'tcp'
    const networkSettings = server.network_settings || {}
    const header = networkSettings.header || {}
    const network = rawNetwork === 'tcp' && header.type === 'http' ? 'http' : rawNetwork
    const proxy = {
      name: server.name,
      type: 'vless',
      server: server.host,
      port,
      uuid: userUuid,
      udp: true,
      tls: !!server.tls,
      network,
    }
    if (server.flow) proxy.flow = server.flow
    proxy['skip-cert-verify'] = boolFromInt(tls.allow_insecure)
    if (tls.server_name) proxy.servername = tls.server_name
    if (tls.fingerprint) proxy['client-fingerprint'] = tls.fingerprint
    if (tls.public_key || tls.short_id) {
      proxy['reality-opts'] = {}
      if (tls.public_key) proxy['reality-opts']['public-key'] = tls.public_key
      if (tls.short_id) proxy['reality-opts']['short-id'] = tls.short_id
    }
    if (network === 'ws') {
      proxy['ws-opts'] = {
        path: networkSettings.path || '/',
        headers: networkSettings.host ? { Host: networkSettings.host } : undefined,
      }
    } else if (network === 'grpc') {
      proxy['grpc-opts'] = { 'grpc-service-name': networkSettings.serviceName || networkSettings.service_name || '' }
    } else if (network === 'http') {
      const request = header.request || {}
      proxy['http-opts'] = {
        headers: request.headers || {},
        path: request.path || [networkSettings.path || '/'],
      }
    } else if (network === 'xhttp') {
      proxy['xhttp-opts'] = {
        path: networkSettings.path || '/',
        host: networkSettings.host || tls.server_name || server.host,
        mode: networkSettings.mode || 'auto',
      }
    }
    return proxy
  }

  return null
}

async function fetchServerProxies() {
  const [serversResult, userUuid, metaProxies] = await Promise.all([
    fetchServers(authData),
    fetchUserUuid(),
    fetchMetaSubscriptionProxies(),
  ])
  const servers = Array.isArray(serversResult?.data) ? serversResult.data : []
  const metaByName = new Map(metaProxies.map(proxy => [proxy.name, proxy]))
  return servers
    .filter(server => server.show !== 0)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map(server => metaByName.get(server.name) || serverToProxy(server, userUuid))
    .filter(Boolean)
}

async function buildMihomoConfig() {
  const baseConfig = buildBaseMihomoConfig()
  const serverProxies = await fetchServerProxies()
  if (serverProxies.length) return applyProxyList(baseConfig, serverProxies)

  const subscriptionConfig = await fetchSubscriptionConfig()
  return applySubscriptionConfig(baseConfig, subscriptionConfig)
}

async function reloadMihomoConfiguration() {
  const config = await buildMihomoConfig()
  if (config?.proxies?.length) {
    writeMihomoConfig(config)
  }

  if (isProxyOn) {
    const preservedSelected = selectedProxyName
    stopMihomo()
    selectedProxyName = preservedSelected
    return startMihomo()
  }

  return !!config?.proxies?.length
}

function writeMihomoConfig(config) {
  if (!mihomoConfigPath) {
    const runtimeConfigDir = path.join(app.getPath('userData'), 'mihomo-runtime')
    fs.mkdirSync(runtimeConfigDir, { recursive: true })
    mihomoConfigPath = path.join(runtimeConfigDir, `config-${process.pid}.yaml`)
  }
  const yaml = YAML.dump(config, { lineWidth: -1, noRefs: true })
  fs.writeFileSync(mihomoConfigPath, yaml)
  return mihomoConfigPath
}

function resetTrafficState() {
  trafficState = { up: 0, down: 0, uploadTotal: 0, downloadTotal: 0 }
}

function stopTrafficStream() {
  if (trafficRequest) {
    try { trafficRequest.destroy() } catch (_) {}
    trafficRequest = null
  }
}

function startTrafficStream() {
  stopTrafficStream()
  resetTrafficState()
  sendStatusSnapshot()
  if (!activeControllerPort) return

  const req = http.get(`http://127.0.0.1:${activeControllerPort}/traffic`, (res) => {
    res.setEncoding('utf8')
    let buffer = ''
    res.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const sample = JSON.parse(line)
          const up = Number(sample.up || 0)
          const down = Number(sample.down || 0)
          trafficState = {
            up,
            down,
            uploadTotal: trafficState.uploadTotal + up,
            downloadTotal: trafficState.downloadTotal + down,
          }
          sendStatusSnapshot()
        } catch (_) {}
      }
    })
    res.on('end', () => {
      if (isProxyOn) setTimeout(startTrafficStream, 1000)
    })
  })

  req.on('error', () => {
    if (isProxyOn) setTimeout(startTrafficStream, 1000)
  })
  trafficRequest = req
}

function mihomoControllerRequest(method, pathname, body = null, requestTimeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!activeControllerPort) {
      reject(new Error('Mihomo controller is not ready'))
      return
    }

    const payload = body ? JSON.stringify(body) : ''
    const req = http.request({
      hostname: '127.0.0.1',
      port: activeControllerPort,
      path: pathname,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : undefined,
      timeout: requestTimeout,
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (!raw) {
            resolve(null)
            return
          }
          try { resolve(JSON.parse(raw)) } catch (_) { resolve(raw) }
        } else {
          reject(new Error(`Mihomo controller ${res.statusCode}: ${raw}`))
        }
      })
    })

    req.on('timeout', () => req.destroy(new Error('Mihomo controller timeout')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function waitForMihomoController(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await mihomoControllerRequest('GET', '/version')
      return true
    } catch (_) {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  return false
}

async function getMihomoSelectedProxy() {
  try {
    const group = await mihomoControllerRequest('GET', `/proxies/${encodeURIComponent(MAIN_PROXY_GROUP)}`)
    return group?.now || ''
  } catch (err) {
    console.error('[Mihomo] Read selected proxy error:', err.message)
    return ''
  }
}

async function selectMihomoProxy(name) {
  if (!name || (!isProxyOn && !isDelayTestSession)) return false
  try {
    await mihomoControllerRequest('PUT', `/proxies/${encodeURIComponent(MAIN_PROXY_GROUP)}`, { name })
    activeProxyName = await getMihomoSelectedProxy()
    console.log(`[Mihomo] ${MAIN_PROXY_GROUP} => ${activeProxyName || name}`)
    return activeProxyName === name
  } catch (err) {
    console.error('[Mihomo] Select proxy error:', err.message)
    return false
  }
}

async function fetchMihomoProxyDelay(name, testUrl = DEFAULT_DELAY_TEST_URL, timeout = DEFAULT_LATENCY_TIMEOUT) {
  if (!name || !(isProxyOn || isDelayTestSession)) return { delay: DELAY_ERROR, latency: null, status: 'error' }
  const startTime = Date.now()
  try {
    const currentUrl = Array.isArray(testUrl) ? (testUrl.find(Boolean) || DEFAULT_DELAY_TEST_URL) : (testUrl || DEFAULT_DELAY_TEST_URL)
    const effectiveTimeout = Math.max(1000, Number(timeout) || DEFAULT_LATENCY_TIMEOUT)
    const endpoint = `/proxies/${encodeURIComponent(name)}/delay?url=${encodeURIComponent(currentUrl)}&timeout=${effectiveTimeout}`
    const timeoutResult = new Promise((resolve) => {
      setTimeout(() => resolve({ delay: DELAY_TIMEOUT }), effectiveTimeout)
    })
    const resp = await Promise.race([
      mihomoControllerRequest('GET', endpoint, null, effectiveTimeout + 1000),
      timeoutResult,
    ])
    const elapsedTime = Date.now() - startTime
    if (elapsedTime < 500) {
      await new Promise((resolve) => setTimeout(resolve, 500 - elapsedTime))
    }
    const delay = Number(resp?.delay ?? resp?.data?.delay ?? resp?.data ?? resp)
    if (!Number.isFinite(delay)) {
      return { delay: DELAY_ERROR, latency: null, status: 'error', elapsed: Date.now() - startTime }
    }
    if (delay === DELAY_TIMEOUT || (delay >= effectiveTimeout && delay <= 1e5)) {
      return { delay: DELAY_TIMEOUT, latency: null, status: 'timeout', elapsed: Date.now() - startTime }
    }
    if (delay > 1e5) {
      return { delay: DELAY_ERROR, latency: null, status: 'error', elapsed: Date.now() - startTime }
    }
    return { delay, latency: delay, status: 'ok', elapsed: Date.now() - startTime }
  } catch (err) {
    const elapsedTime = Date.now() - startTime
    if (elapsedTime < 500) {
      await new Promise((resolve) => setTimeout(resolve, 500 - elapsedTime))
    }
    console.error(`[Mihomo] Delay test error for ${name}:`, err.message)
    return { delay: DELAY_ERROR, latency: null, status: 'error', elapsed: Date.now() - startTime }
  }
}

async function delayMihomoGroup(groupName, testUrl = DEFAULT_DELAY_TEST_URL, timeout = DEFAULT_LATENCY_TIMEOUT) {
  if (!groupName || !(isProxyOn || isDelayTestSession)) return null
  const currentUrl = Array.isArray(testUrl) ? (testUrl.find(Boolean) || DEFAULT_DELAY_TEST_URL) : (testUrl || DEFAULT_DELAY_TEST_URL)
  const effectiveTimeout = Math.max(1000, Number(timeout) || DEFAULT_LATENCY_TIMEOUT)
  try {
    const endpoint = `/group/${encodeURIComponent(groupName)}/delay?url=${encodeURIComponent(currentUrl)}&timeout=${effectiveTimeout}`
    return await mihomoControllerRequest('GET', endpoint, null, effectiveTimeout + 1000)
  } catch (err) {
    console.error(`[Mihomo] Group delay test error for ${groupName}:`, err.message)
    return null
  }
}

async function healthcheckMihomoProxyProvider(providerName) {
  if (!providerName || !(isProxyOn || isDelayTestSession)) return null
  try {
    const endpoint = `/providers/proxies/${encodeURIComponent(providerName)}/healthcheck`
    return await mihomoControllerRequest('GET', endpoint, null, DEFAULT_LATENCY_TIMEOUT + 1000)
  } catch (err) {
    console.error(`[Mihomo] Provider healthcheck error for ${providerName}:`, err.message)
    return null
  }
}

function execFilePromise(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr })
    })
  })
}

function findAvailablePort(preferredPort) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => {
      const fallback = net.createServer()
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port
        fallback.close(() => resolve(port))
      })
    })
    server.listen(preferredPort, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

async function getNetworkServices() {
  if (process.platform !== 'darwin') return []
  const { stdout } = await execFilePromise('networksetup', ['-listallnetworkservices'])
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('An asterisk') && !line.startsWith('*'))
}

async function setMacSystemProxy(enabled) {
  if (process.platform !== 'darwin') return
  const services = await getNetworkServices()
  const tasks = []
  for (const service of services) {
    if (enabled) {
      tasks.push(execFilePromise('networksetup', ['-setwebproxy', service, '127.0.0.1', String(activeMixedPort)]))
      tasks.push(execFilePromise('networksetup', ['-setsecurewebproxy', service, '127.0.0.1', String(activeMixedPort)]))
      tasks.push(execFilePromise('networksetup', ['-setsocksfirewallproxy', service, '127.0.0.1', String(activeMixedPort)]))
      tasks.push(execFilePromise('networksetup', ['-setwebproxystate', service, 'on']))
      tasks.push(execFilePromise('networksetup', ['-setsecurewebproxystate', service, 'on']))
      tasks.push(execFilePromise('networksetup', ['-setsocksfirewallproxystate', service, 'on']))
    } else {
      tasks.push(execFilePromise('networksetup', ['-setwebproxystate', service, 'off']))
      tasks.push(execFilePromise('networksetup', ['-setsecurewebproxystate', service, 'off']))
      tasks.push(execFilePromise('networksetup', ['-setsocksfirewallproxystate', service, 'off']))
    }
  }
  await Promise.all(tasks)
}

async function refreshWindowsInternetSettings() {
  if (process.platform !== 'win32') return
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinInet {
  [DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@;
    [void][WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0);
    [void][WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0);
  `
  const powershell = process.env.ComSpec ? 'powershell.exe' : 'powershell'
  await execFilePromise(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
}

async function setWindowsSystemProxy(enabled) {
  if (process.platform !== 'win32') return
  const proxyValue = `127.0.0.1:${activeMixedPort}`
  const proxyOverride = 'localhost;127.0.0.1;<local>'
  const ops = enabled
    ? [
        ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'],
        ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', proxyValue, '/f'],
        ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', proxyOverride, '/f'],
      ]
    : [
        ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'],
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer', '/f'],
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyOverride', '/f'],
      ]

  for (const args of ops) {
    const { error, stderr } = await execFilePromise('reg.exe', args)
    if (error) {
      const isDeleteMissingValue = args[0] === 'delete' && /unable to find the specified registry key or value/i.test(String(stderr || error.message || ''))
      if (!isDeleteMissingValue) {
        throw new Error((stderr || error.message || '').trim() || 'Windows system proxy update failed')
      }
    }
  }

  await refreshWindowsInternetSettings()
}

async function setSystemProxy(enabled) {
  if (process.platform === 'darwin') {
    return setMacSystemProxy(enabled)
  }
  if (process.platform === 'win32') {
    return setWindowsSystemProxy(enabled)
  }
}


async function startMihomo(options = {}) {
  if (mihomoProcess && (isProxyOn || isDelayTestSession)) return true
  if (startMihomoPromise) return startMihomoPromise
  startMihomoPromise = doStartMihomo(options).finally(() => {
    startMihomoPromise = null
  })
  return startMihomoPromise
}

async function doStartMihomo(options = {}) {
  const { enableSystemProxy = true, emitStatus = true } = options
  const binaryPath = findMihomoBinary()
  if (!binaryPath) {
    console.error('[Mihomo] Binary not found in', getLibsPath())
    return false
  }
  mihomoBinPath = binaryPath

  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, '755')
  }

  activeMixedPort = await findAvailablePort(DEFAULT_MIXED_PORT)
  activeControllerPort = await findAvailablePort(0)
  const config = await buildMihomoConfig()
  if (!config.proxies?.length) {
    console.error('[Mihomo] No usable proxies found from subscription')
    return false
  }
  writeMihomoConfig(config)

  mihomoProcess = spawn(binaryPath, ['-f', mihomoConfigPath], {
    cwd: getLibsPath(),
    env: {
      ...process.env,
      SAFE_PATHS: [
        process.env.SAFE_PATHS,
        process.env.APPDATA,
        process.env.LOCALAPPDATA,
        app.getPath('appData'),
        app.getPath('userData'),
        app.getPath('temp'),
      ].filter(Boolean).join(path.delimiter),
    },
  })

  mihomoProcess.stdout.on('data', (d) => console.log(`[mihomo]`, d.toString().trim()))
  mihomoProcess.stderr.on('data', (d) => console.error(`[mihomo-err]`, d.toString().trim()))
  mihomoProcess.on('exit', () => {
    console.log('[mihomo] exited')
    isProxyOn = false
    isDelayTestSession = false
    activeProxyName = ''
    updateTrayIcon()
    refreshTrayMenu()
    sendStatusSnapshot()
  })

  isProxyOn = !!enableSystemProxy
  isDelayTestSession = !enableSystemProxy
  if (enableSystemProxy) updateTrayIcon()
  const controllerReady = await waitForMihomoController()
  if (controllerReady) {
    await selectMihomoProxy(selectedProxyName)
    if (emitStatus && enableSystemProxy) {
      sendStatusSnapshot()
    }
  } else {
    console.error('[Mihomo] Controller did not become ready')
    if (!enableSystemProxy) {
      stopMihomo({ skipSystemProxy: true, emitStatus: false })
      return false
    }
  }

  if (enableSystemProxy) {
    setSystemProxy(true).catch(err => console.error('[System Proxy] Enable error:', err.message))
    console.log(`[System Proxy] Enabled on 127.0.0.1:${activeMixedPort}`)
    setTimeout(startTrafficStream, 800)
  }

  refreshTrayMenu()
  sendStatusSnapshot()

  return true
}

async function startDelayTestMihomo() {
  if (mihomoProcess && (isProxyOn || isDelayTestSession)) return true
  return startMihomo({ enableSystemProxy: false, emitStatus: false })
}

function stopMihomo(options = {}) {
  const { skipSystemProxy = false, emitStatus = true } = options
  stopTrafficStream()
  if (!skipSystemProxy) {
    setSystemProxy(false).catch(err => console.error('[System Proxy] Disable error:', err.message))
  }
  if (mihomoProcess) {
    try { mihomoProcess.kill('SIGTERM') } catch (_) {}
    mihomoProcess = null
  }
  isProxyOn = false
  isDelayTestSession = false
  activeProxyName = ''
  resetTrafficState()
  updateTrayIcon()
  refreshTrayMenu()
  if (emitStatus) {
    sendStatusSnapshot()
  }
}

// ─── v2board API Client ────────────────────────────────────

async function apiRequest(method, endpoint, body, authToken) {
  const axios = require('axios')
  const url = `${serverUrl}/api/v1${endpoint}`
  try {
    const headers = {}
    if (authToken) headers.Authorization = authToken
    if (body && method !== 'GET') headers['Content-Type'] = 'application/json'

    let resp
    if (method === 'GET') {
      resp = await axios.get(url, { headers, timeout: 15000 })
    } else if (method === 'POST') {
      resp = await axios.post(url, body, { headers, timeout: 15000 })
    } else {
      resp = await axios({ method, url, data: body, headers, timeout: 15000 })
    }
    return resp.data
  } catch (err) {
    const message = err.response?.data?.message || err.message
    console.error(`[API ${method} ${endpoint}]`, message)
    return err.response?.data || { message }
  }
}

async function fetchSubscription(authToken) {
  return apiRequest('GET', '/user/getSubscribe', null, authToken)
}

async function fetchUserInfo(authToken) {
  return apiRequest('GET', '/user/info', null, authToken)
}

async function fetchPlans(authToken) {
  return apiRequest('GET', '/user/plan/fetch', null, authToken)
}

async function fetchServers(authToken) {
  return apiRequest('GET', '/user/server/fetch', null, authToken)
}

async function fetchStat(authToken) {
  return apiRequest('GET', '/user/getStat', null, authToken)
}

async function fetchGuestConfig() {
  return apiRequest('GET', '/guest/comm/config')
}

async function fetchNotices() {
  return apiRequest('GET', '/user/notice/fetch', null, authData)
}

async function checkCoupon(code, planId) {
  return apiRequest('POST', '/user/coupon/check', {
    code,
    plan_id: planId,
  }, authData)
}

async function fetchPaymentMethods() {
  return apiRequest('GET', '/user/order/getPaymentMethod', null, authData)
}

async function createOrder({ plan_id, cycle, coupon_code, deposit_amount }) {
  const payload = {
    plan_id,
    planId: plan_id,
    cycle,
    period: cycle,
  }
  if (coupon_code) payload.coupon_code = coupon_code
  if (deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== '') {
    payload.deposit_amount = deposit_amount
  }
  return apiRequest('POST', '/user/order/save', payload, authData)
}

async function checkoutOrder({ trade_no, method, token }) {
  const payload = {
    trade_no,
    tradeNo: trade_no,
    method,
  }
  if (token !== undefined && token !== null && token !== '') payload.token = token
  return apiRequest('POST', '/user/order/checkout', payload, authData)
}

async function doLogin(email, password) {
  return apiRequest('POST', '/passport/auth/login', { email, password })
}

async function doRegister(email, password, emailCode, inviteCode) {
  return apiRequest('POST', '/passport/auth/register', {
    email, password, email_code: emailCode || '', invite_code: inviteCode || '',
  })
}

async function sendEmailVerify(email, isforget = false) {
  return apiRequest('POST', '/passport/comm/sendEmailVerify', {
    email,
    recaptcha_data: '',
    isforget: isforget ? '1' : '',
  })
}

async function doForgetPassword(email, password, emailCode) {
  return apiRequest('POST', '/passport/auth/forget', {
    email,
    password,
    email_code: emailCode || '',
  })
}

// ─── Tray ──────────────────────────────────────────────────

function createTray() {
  const runtimeConfig = getRuntimeConfig()
  const assetsPath = path.join(__dirname, 'assets')
  const onIcon = path.join(assetsPath,
    process.platform === 'darwin' ? 'iconOn@2x.png' : 'iconOn.ico')
  const offIcon = path.join(assetsPath,
    process.platform === 'darwin' ? 'iconOff@2x.png' : 'iconOff.ico')

  function getIcon() {
    return isProxyOn ? onIcon : offIcon
  }

  tray = new Tray(nativeImage.createFromPath(getIcon()))
  tray.setToolTip(runtimeConfig.tray_tooltip || 'v2Board Client')

  function updateMenu() {
    const menu = Menu.buildFromTemplate([
      {
        label: isProxyOn ? '🟢 代理已开启' : '🔴 代理已关闭',
        style: 'disabled',
      },
      { type: 'separator' },
      {
        label: isProxyOn ? '关闭代理' : '开启代理',
        click: () => {
          if (isProxyOn) stopMihomo()
          else startMihomo()
        },
      },
      { type: 'separator' },
      { label: '打开面板', click: () => win?.show() },
      { type: 'separator' },
      { label: '退出', click: () => { stopMihomo(); global.isQuit = true; app.quit() } },
    ])
    tray.setContextMenu(menu)
  }

  tray.on('click', () => {
    if (win) win.isVisible() ? win.hide() : win.show()
  })

  updateMenu()
  refreshTrayMenu = updateMenu
  return { updateMenu, getIcon }
}

function updateTrayIcon() {
  if (!tray) return
  const assetsPath = path.join(__dirname, 'assets')
  const iconPath = isProxyOn
    ? path.join(assetsPath, process.platform === 'darwin' ? 'iconOn@2x.png' : 'iconOn.ico')
    : path.join(assetsPath, process.platform === 'darwin' ? 'iconOff@2x.png' : 'iconOff.ico')
  const icon = nativeImage.createFromPath(iconPath)
  if (typeof tray.setImage === 'function') tray.setImage(icon)
  else if (typeof tray.setIcon === 'function') tray.setIcon(icon)
}

// ─── Browser Window ────────────────────────────────────────

function createWindow() {
  const runtimeConfig = getRuntimeConfig()
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 400,
    height: 620,
    show: false,
    resizable: false,
    frame: false,
    maximizable: false,
    title: runtimeConfig.window_title || 'v2Board · Mihomo',
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    webPreferences: {
      devTools: !app.isPackaged,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (process.platform === 'darwin' && typeof win.setWindowButtonVisibility === 'function') {
    win.setWindowButtonVisibility(false)
  }

  // Inject bridge script
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', sans-serif; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
    `).catch(() => {})
  })

  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`[Renderer ${level}] ${message} (${sourceId}:${line})`)
  })

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Window] Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
  })

  const server = express()
  server.use('/', express.static(path.join(__dirname, 'dist')))
  frontendServer = server.listen(0, '127.0.0.1', () => {
    win.loadURL(`http://127.0.0.1:${frontendServer.address().port}/index.html`)
  })

  win.once('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (!global.isQuit) { e.preventDefault(); app.hide() }
  })
}

// ─── IPC ───────────────────────────────────────────────────

function setupIPC() {
  // Auth
  ipcMain.handle('login', async (_, email, password) => {
    const result = await doLogin(email, password)
    if (result?.data?.auth_data) {
      subscribeToken = result.data.token
      authData = result.data.auth_data
      setConfig('v2board_token', subscribeToken)
      setConfig('v2board_auth', authData)
      sendStatusSnapshot()
      return { success: true, data: result.data }
    }
    return { success: false, error: result?.message || '登录失败' }
  })

  ipcMain.handle('register', async (_, email, password, emailCode, inviteCode) => {
    const result = await doRegister(email, password, emailCode, inviteCode)
    if (result?.data?.auth_data) {
      subscribeToken = result.data.token
      authData = result.data.auth_data
      setConfig('v2board_token', subscribeToken)
      setConfig('v2board_auth', authData)
      sendStatusSnapshot()
      return { success: true, data: result.data }
    }
    return { success: false, error: result?.message || '注册失败' }
  })

  // Data fetch
  ipcMain.handle('fetch-user-info', async () => fetchUserInfo(authData))
  ipcMain.handle('fetch-subscribe', async () => fetchSubscription(authData))
  ipcMain.handle('fetch-plans', async () => fetchPlans(authData))
  ipcMain.handle('fetch-servers', async () => fetchServers(authData))
  ipcMain.handle('reload-servers', async () => {
    const result = await fetchServers(authData)
    const reloaded = await reloadMihomoConfiguration()
    return {
      ...result,
      success: !!result?.data && reloaded,
      reloaded,
    }
  })
  ipcMain.handle('get-proxy-delay', async (_, name, url = DEFAULT_DELAY_TEST_URL, timeout = DEFAULT_LATENCY_TIMEOUT) => {
    return fetchMihomoProxyDelay(name, url, timeout)
  })
  ipcMain.handle('delay-group', async (_, groupName, url = DEFAULT_DELAY_TEST_URL, timeout = DEFAULT_LATENCY_TIMEOUT) => {
    return delayMihomoGroup(groupName, url, timeout)
  })
  ipcMain.handle('healthcheck-proxy-provider', async (_, providerName) => {
    return healthcheckMihomoProxyProvider(providerName)
  })
  ipcMain.handle('start-delay-test-session', async () => {
    if (isProxyOn || isDelayTestSession) {
      return { success: true, started: false }
    }
    const started = await startDelayTestMihomo()
    return { success: started, started }
  })
  ipcMain.handle('stop-delay-test-session', async () => {
    if (isDelayTestSession) {
      stopMihomo({ skipSystemProxy: true, emitStatus: false })
      return { success: true, stopped: true }
    }
    return { success: true, stopped: false }
  })
  ipcMain.handle('get-latency-config', async () => ({
    defaultLatencyTest: getConfig(LATENCY_TEST_URL_KEY, DEFAULT_DELAY_TEST_URL),
    defaultLatencyTimeout: Number(getConfig(LATENCY_TEST_TIMEOUT_KEY, DEFAULT_LATENCY_TIMEOUT)) || DEFAULT_LATENCY_TIMEOUT,
  }))
  ipcMain.handle('set-latency-config', async (_, payload = {}) => {
    const nextUrl = typeof payload.defaultLatencyTest === 'string' && payload.defaultLatencyTest.trim()
      ? payload.defaultLatencyTest.trim()
      : getConfig(LATENCY_TEST_URL_KEY, DEFAULT_DELAY_TEST_URL)
    const nextTimeoutValue = Number(payload.defaultLatencyTimeout)
    const nextTimeout = Number.isFinite(nextTimeoutValue) && nextTimeoutValue > 0
      ? Math.round(nextTimeoutValue)
      : (Number(getConfig(LATENCY_TEST_TIMEOUT_KEY, DEFAULT_LATENCY_TIMEOUT)) || DEFAULT_LATENCY_TIMEOUT)
    setConfig(LATENCY_TEST_URL_KEY, nextUrl)
    setConfig(LATENCY_TEST_TIMEOUT_KEY, nextTimeout)
    return { success: true, defaultLatencyTest: nextUrl, defaultLatencyTimeout: nextTimeout }
  })
  ipcMain.handle('fetch-stat', async () => fetchStat(authData))
  ipcMain.handle('fetch-guest-config', async () => fetchGuestConfig())
  ipcMain.handle('fetch-notices', async () => fetchNotices())
  ipcMain.handle('get-app-config', async () => getRuntimeConfig())
  ipcMain.handle('send-email-verify', async (_, email, isforget) => sendEmailVerify(email, isforget))
  ipcMain.handle('forget-password', async (_, email, password, emailCode) => doForgetPassword(email, password, emailCode))
  ipcMain.handle('check-coupon', async (_, code, planId) => checkCoupon(code, planId))
  ipcMain.handle('fetch-payment-methods', async () => fetchPaymentMethods())
  ipcMain.handle('create-order', async (_, payload) => createOrder(payload || {}))
  ipcMain.handle('checkout-order', async (_, payload) => checkoutOrder(payload || {}))
  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
      return { success: true }
    }
    return { success: false }
  })
  ipcMain.handle('copy-text', async (_, text) => {
    if (typeof text === 'string') {
      clipboard.writeText(text)
      return { success: true }
    }
    return { success: false }
  })

  // Proxy
  ipcMain.handle('toggle-proxy', async () => {
    if (isProxyOn) { stopMihomo(); return { on: false } }
    const ok = await startMihomo()
    sendStatusSnapshot()
    return { on: isProxyOn, selectedProxyName, activeProxyName, ok }
  })

  ipcMain.handle('set-selected-server', async (_, name) => {
    let switched = false
    if (typeof name === 'string' && name.trim()) {
      selectedProxyName = name.trim()
      setConfig('selectedProxyName', selectedProxyName)
      if (isProxyOn) {
        switched = await selectMihomoProxy(selectedProxyName)
      }
      sendStatusSnapshot()
    }
    return { success: true, selectedProxyName, activeProxyName, proxyOn: isProxyOn, switched }
  })

  // Config
  ipcMain.handle('set-server', async (_, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      serverUrl = url.replace(/\/+$/, '')
      setConfig('serverUrl', serverUrl)
    }
    return { success: true }
  })

  ipcMain.handle('get-status', async () => ({
    ...getStatusSnapshot(),
  }))

  ipcMain.handle('window-minimize', async () => {
    win?.minimize()
    return { success: true }
  })

  ipcMain.handle('window-toggle-maximize', async () => {
    if (!win) return { success: false, maximized: false }
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return { success: true, maximized: win.isMaximized() }
  })

  ipcMain.handle('window-is-maximized', async () => ({
    success: true,
    maximized: !!win?.isMaximized(),
  }))

  ipcMain.handle('window-hide', async () => {
    win?.hide()
    return { success: true }
  })

  ipcMain.handle('logout', async () => {
    subscribeToken = ''
    authData = ''
    setConfig('v2board_token', '')
    setConfig('v2board_auth', '')
    sendStatusSnapshot()
    return { success: true }
  })

  // Navigation
  ipcMain.on('show', () => win?.show())
  ipcMain.on('quit', () => { stopMihomo(); global.isQuit = true; app.quit() })
}

// ─── Init ──────────────────────────────────────────────────

function init() {
  const runtimeConfig = getRuntimeConfig()
  serverUrl = getConfig('serverUrl', runtimeConfig.backend_api_url || serverUrl)

  const savedToken = getConfig('v2board_token', '')
    if (savedToken) subscribeToken = savedToken
    const savedAuth = getConfig('v2board_auth', '')
    if (savedAuth) authData = savedAuth
    selectedProxyName = getConfig('selectedProxyName', '')

    createWindow()
    createTray()
    setupIPC()
    sendStatusSnapshot()
  }

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()
else {
  app.on('second-instance', () => {
    if (win) win.isVisible() ? win.hide() : win.show()
  })

  app.on('ready', () => {
    if (process.platform === 'darwin' && typeof app.dock?.show === 'function') app.dock.show()
    global.isQuit = false
    init()
  })

  app.on('window-all-closed', (e) => {
    e.preventDefault()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    global.isQuit = true
    stopMihomo()
  })
}
