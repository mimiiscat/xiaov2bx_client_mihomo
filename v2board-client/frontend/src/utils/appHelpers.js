export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatPlanTraffic(amount) {
  const value = Number(amount || 0)
  if (!value) return '0 GB'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`
}

export function formatCurrencyCents(amount) {
  const value = Number(amount || 0) / 100
  return `¥${value.toFixed(2)}`
}

export function formatLatency(value) {
  if (value && typeof value === 'object') {
    const rawDelay = value.delay !== undefined ? value.delay : value.latency
    const delay = Number(rawDelay)
    if (value.status === 'testing' || delay === -2) return '测试中'
    if (value.status === 'timeout' || delay === 0 || (delay >= 10000 && delay <= 100000)) return '超时'
    if (value.status === 'error' || delay > 100000) return '超时'
    if (Number.isFinite(delay) && delay > 0) return `${Math.round(delay)} ms`
    return ''
  }
  if (value === null) return '待测试'
  const delay = Number(value)
  if (delay === -2) return '测试中'
  if (delay === 0 || (delay >= 10000 && delay <= 100000)) return '超时'
  if (delay > 100000) return '超时'
  if (!Number.isFinite(delay) || delay <= 0) return '待测试'
  return `${Math.round(delay)} ms`
}

export function latencyColor(value) {
  if (value && typeof value === 'object') {
    const rawDelay = value.delay !== undefined ? value.delay : value.latency
    const delay = Number(rawDelay)
    if (value.status === 'testing' || delay === -2) return '#8ea0ff'
    if (value.status === 'error' || delay > 100000) return '#ff6b6b'
    if (value.status === 'timeout' || delay === 0 || delay >= 10000) return '#ff6b6b'
    if (!Number.isFinite(delay) || delay <= 0) return '#8d93bd'
    if (delay >= 400) return '#ff922b'
    if (delay >= 250) return '#667eea'
    return '#51cf66'
  }
  if (value === null) return '#8d93bd'
  const delay = Number(value)
  if (delay === -2) return '#8ea0ff'
  if (delay > 100000) return '#ff6b6b'
  if (delay === 0 || delay >= 10000) return '#ff6b6b'
  if (!Number.isFinite(delay) || delay <= 0) return '#8d93bd'
  if (delay >= 400) return '#ff922b'
  if (delay >= 250) return '#667eea'
  return '#51cf66'
}

export function getPlanPrice(plan) {
  const candidates = [
    ['month_price', '月'],
    ['quarter_price', '季'],
    ['half_year_price', '半年'],
    ['year_price', '年'],
    ['two_year_price', '2年'],
    ['three_year_price', '3年'],
    ['onetime_price', '一次性'],
    ['reset_price', '重置'],
  ]

  for (const [key, label] of candidates) {
    const value = plan?.[key]
    if (value !== null && value !== undefined && value !== '' && Number(value) > 0) {
      return { value: Number(value) / 100, label }
    }
  }

  return { value: null, label: '月' }
}

export function getPlanNameById(plans, planId) {
  if (!planId) return '无'
  const match = Array.isArray(plans)
    ? plans.find((plan) => String(plan?.id) === String(planId))
    : null
  return match?.name || `计划ID ${planId}`
}

export function getPlanDescription(plan) {
  return plan?.content || plan?.description || plan?.remark || ''
}

export function getNormalizedServerType(server) {
  const rawType = String(server?.type || server?.protocol || '').trim().toLowerCase()
  const version = Number(server?.version || server?.protocol_version || 0)
  if (rawType === 'hysteria2' || rawType === 'hy2') return 'hysteria2'
  if (rawType === 'hysteria' && version === 2) return 'hysteria2'
  return rawType
}

export function isHysteria2Server(server) {
  return getNormalizedServerType(server) === 'hysteria2'
}

export function normalizeServerList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Map()
  const signature = (server) => JSON.stringify([
    String(server?.name || '').trim(),
    String(server?.host || server?.server || '').trim(),
    String(server?.port || server?.server_port || '').trim(),
    getNormalizedServerType(server),
    String(server?.network || '').trim(),
    String(server?.uuid || '').trim(),
    String(server?.flow || '').trim(),
    String(server?.sort || '').trim(),
  ])
  for (const server of list) {
    const key = signature(server)
    if (!key || key === '["","","","","","","",""]') continue
    seen.set(key, server)
  }
  return Array.from(seen.values())
}

export function getServerLatencyKey(server) {
  return JSON.stringify([
    String(server?.name || '').trim(),
    String(server?.host || server?.server || '').trim(),
    String(server?.port || server?.server_port || '').trim(),
    getNormalizedServerType(server),
  ])
}

export function collectHostCandidates(server) {
  const hosts = [
    server?.host,
    server?.server,
    server?.server_name,
    server?.tls_settings?.server_name,
    server?.tlsSettings?.serverName,
    server?.host_name,
    server?.address,
  ]
  return Array.from(new Set(hosts.map((value) => String(value || '').trim()).filter(Boolean)))
}

export function getServerLatencyTargets(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((server) => {
      const key = getServerLatencyKey(server)
      const port = Number(server?.server_port || server?.port || 0)
      const hosts = collectHostCandidates(server)
      const candidates = []

      if (hosts.length && port) {
        for (const host of hosts) {
          candidates.push({ host, port })
        }
      }

      if (isHysteria2Server(server)) {
        const fallbackPorts = [port, 443, 8443, 80].filter((value) => Number(value) > 0)
        for (const host of hosts) {
          for (const fallbackPort of fallbackPorts) {
            candidates.push({ host, port: Number(fallbackPort) })
          }
        }
      }

      const uniqueCandidates = candidates.filter((candidate, index, arr) => {
        const sig = `${candidate.host}:${candidate.port}`
        return arr.findIndex((item) => `${item.host}:${item.port}` === sig) === index
      })

      return { key, candidates: uniqueCandidates }
    })
    .filter((item) => item.key && item.candidates.length)
}

export function getLoginSiteName(appConfig, guestConfig) {
  return (
    guestConfig?.app_name ||
    appConfig?.site_name ||
    appConfig?.app_name ||
    appConfig?.product_name ||
    'v2Board'
  )
}

export function getLoginSiteDescription(appConfig, guestConfig) {
  return (
    guestConfig?.app_description ||
    appConfig?.app_description ||
    appConfig?.page_title ||
    ''
  )
}

export function getPlanPeriods(plan) {
  const periods = [
    ['month_price', '月付'],
    ['quarter_price', '季付'],
    ['half_year_price', '半年'],
    ['year_price', '年付'],
    ['two_year_price', '两年'],
    ['three_year_price', '三年'],
    ['onetime_price', '一次性'],
    ['reset_price', '重置'],
  ]

  return periods
    .map(([key, label]) => {
      const value = Number(plan?.[key] || 0)
      return value > 0 ? { key, label, value: value / 100 } : null
    })
    .filter(Boolean)
}

export function normalizePaymentMethods(payload) {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  return list.map((item, index) => {
    if (typeof item === 'string') {
      return { id: index + 1, name: item, payment: item }
    }
    const rawId = item?.id ?? item?.payment_id ?? item?.method_id ?? null
    const numericId = Number(rawId)
    return {
      id: Number.isFinite(numericId) && numericId > 0 ? numericId : index + 1,
      rawId: rawId ?? item?.payment ?? item?.name ?? index + 1,
      name: item?.name || item?.payment || `支付方式 ${index + 1}`,
      payment: item?.payment || item?.name || '',
    }
  })
}

export function extractTradeNo(payload) {
  return payload?.data?.trade_no
    || payload?.data?.tradeNo
    || payload?.trade_no
    || payload?.tradeNo
    || payload?.data
    || ''
}

export function isLikelyUrl(text) {
  return typeof text === 'string' && /^https?:\/\//i.test(text)
}


export function sanitizeHtml(html) {
  if (!html) return ''
  if (typeof document === 'undefined') return String(html)

  const allowedTags = new Set([
    'A', 'B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'SUB', 'SUP',
    'U', 'UL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
    'BLOCKQUOTE', 'CODE', 'PRE', 'HR',
  ])
  const allowedAttrs = new Set(['class', 'style', 'href', 'target', 'rel', 'colspan', 'rowspan'])
  const allowedStyleProps = new Set([
    'color',
    'font-weight',
    'font-style',
    'font-size',
    'text-align',
    'text-decoration',
    'line-height',
    'letter-spacing',
    'white-space',
  ])

  const sanitizeStyle = (value) => {
    if (!value) return ''
    return String(value)
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .map((rule) => {
        const idx = rule.indexOf(':')
        if (idx === -1) return ''
        const property = rule.slice(0, idx).trim().toLowerCase()
        const rawValue = rule.slice(idx + 1).trim()
        if (!allowedStyleProps.has(property)) return ''
        if (!rawValue) return ''
        return `${property}: ${rawValue}`
      })
      .filter(Boolean)
      .join('; ')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(String(html), 'text/html')

  const walk = (node) => {
    const children = Array.from(node.children || [])
    for (const child of children) {
      const tag = child.tagName?.toUpperCase?.() || ''
      if (!allowedTags.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes || []))
        continue
      }

      Array.from(child.attributes || []).forEach((attr) => {
        const name = attr.name.toLowerCase()
        const value = attr.value || ''
        const isEvent = name.startsWith('on')
        if (isEvent || !allowedAttrs.has(name)) {
          child.removeAttribute(attr.name)
          return
        }
        if (name === 'style') {
          const normalizedStyle = sanitizeStyle(value)
          if (normalizedStyle) child.setAttribute('style', normalizedStyle)
          else child.removeAttribute(attr.name)
          return
        }
        if (name === 'href') {
          if (!/^(https?:|mailto:|#)/i.test(value)) child.removeAttribute(attr.name)
          else {
            child.setAttribute('rel', 'noreferrer noopener')
            child.setAttribute('target', '_blank')
          }
        }
      })

      walk(child)
    }
  }

  walk(doc.body)
  return doc.body.innerHTML
}
