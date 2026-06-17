import { useState, useEffect } from 'react'

// ─── Electron IPC Bridge ───────────────────────────────────
function getElectron() {
  return window.electronAPI || window.__ELECTRON__ || {}
}

// ─── Utility ───────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatPlanTraffic(amount) {
  const value = Number(amount || 0)
  if (!value) return '0 GB'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`
}

function formatCurrencyCents(amount) {
  const value = Number(amount || 0) / 100
  return `¥${value.toFixed(2)}`
}

function formatLatency(value) {
  const delay = Number(value)
  if (!Number.isFinite(delay) || delay <= 0) return '超时'
  return `${Math.round(delay)} ms`
}

function latencyColor(value) {
  const delay = Number(value)
  if (!Number.isFinite(delay) || delay <= 0) return '#ff6b6b'
  if (delay < 200) return '#51cf66'
  if (delay < 500) return '#ffd43b'
  return '#ff922b'
}

function getPlanPrice(plan) {
  const candidates = [
    ['month_price', '月'],
    ['quarter_price', '季'],
    ['half_year_price', '半年'],
    ['year_price', '年'],
    ['two_year_price', '2年'],
    ['three_year_price', '3年'],
    ['onetime_price', '次'],
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

function getPlanNameById(plans, planId) {
  if (!planId) return '无'
  const match = Array.isArray(plans)
    ? plans.find((plan) => String(plan?.id) === String(planId))
    : null
  return match?.name || `计划ID ${planId}`
}

function getPlanDescription(plan) {
  return plan?.content || plan?.description || plan?.remark || ''
}

function getPlanPeriods(plan) {
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

function normalizePaymentMethods(payload) {
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

function extractTradeNo(payload) {
  return payload?.data?.trade_no
    || payload?.data?.tradeNo
    || payload?.trade_no
    || payload?.tradeNo
    || payload?.data
    || ''
}

function isLikelyUrl(text) {
  return typeof text === 'string' && /^https?:\/\//i.test(text)
}

function sanitizeHtml(html) {
  if (!html) return ''
  if (typeof document === 'undefined') return String(html)

  const allowedTags = new Set([
    'A', 'B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'SUB', 'SUP',
    'U', 'UL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
    'BLOCKQUOTE', 'CODE', 'PRE', 'HR',
  ])
  const allowedAttrs = new Set(['class', 'style', 'href', 'target', 'rel', 'colspan', 'rowspan'])

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

function PurchaseModal({
  plan,
  periods,
  periodKey,
  onPeriodChange,
  couponCode,
  onCouponCodeChange,
  paymentMethods,
  paymentMethodId,
  onPaymentMethodChange,
  loading,
  message,
  result,
  onClose,
  onConfirm,
  onOpenExternal,
  onCopyText,
}) {
  if (!plan) return null

  const checkoutValue = result?.checkoutValue || ''
  const checkoutType = result?.checkoutType
  const checkoutUrl = isLikelyUrl(checkoutValue) ? checkoutValue : ''

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <div className="modal-title">购买套餐</div>
            <div className="modal-sub">{plan.name}</div>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {!result ? (
          <>
            <div className="modal-section">
              <div className="label">订阅周期</div>
              <div className="period-grid">
                {periods.map((period) => (
                  <button
                    key={period.key}
                    type="button"
                    className={`period-chip ${periodKey === period.key ? 'active' : ''}`}
                    onClick={() => onPeriodChange(period.key)}
                  >
                    <span>{period.label}</span>
                    <span>¥{period.value.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-section">
              <div className="label">优惠码</div>
              <input
                className="input"
                placeholder="可选"
                value={couponCode}
                onChange={(e) => onCouponCodeChange(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>

            <div className="modal-section">
              <div className="label">支付方式</div>
              {paymentMethods.length > 0 ? (
                <div className="payment-list">
                  {paymentMethods.map((method) => (
                    <button
                      key={String(method.id)}
                      type="button"
                      className={`payment-item ${String(paymentMethodId) === String(method.id) ? 'active' : ''}`}
                      onClick={() => onPaymentMethodChange(method.id)}
                    >
                      <div className="payment-name">{method.name}</div>
                      {method.payment && <div className="payment-meta">{method.payment}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty" style={{ padding: '12px 0 0' }}>暂无可用支付方式</div>
              )}
            </div>
          </>
        ) : (
          <div className="modal-section">
            <div className="success-msg" style={{ marginTop: 0, marginBottom: 10 }}>订单已创建</div>
            <div className="order-box">
              <div className="order-row">
                <span>订单号</span>
                <span>{result.tradeNo}</span>
              </div>
              <div className="order-row">
                <span>支付类型</span>
                <span>{checkoutType === 0 ? '二维码' : '链接'}</span>
              </div>
            </div>
            {checkoutValue ? (
              <div className="order-output">{checkoutValue}</div>
            ) : (
              <div className="empty">订单已创建，暂无支付内容</div>
            )}
            <div className="auth-actions" style={{ marginTop: 10 }}>
              {checkoutUrl && (
                <button className="btn-secondary" onClick={() => onOpenExternal(checkoutUrl)}>
                  浏览器打开
                </button>
              )}
              {checkoutValue && (
                <button className="btn-secondary" onClick={() => onCopyText(checkoutValue)}>
                  复制内容
                </button>
              )}
            </div>
          </div>
        )}

        {message && <div className={message.type === 'success' ? 'success-msg' : 'error-msg'}>{message.text}</div>}

        <div className="auth-actions" style={{ marginTop: 12 }}>
          {!result ? (
            <button className="btn" onClick={onConfirm} disabled={loading || periods.length === 0}>
              {loading ? '处理中...' : '创建订单并结算'}
            </button>
          ) : (
            <button className="btn" onClick={onClose}>完成</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────
const css = `
* { margin: 0; padding: 0; box-sizing: border-box; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif; background: #0a0a1a; color: #e0e0e0; overflow: hidden; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

	.app { width: 400px; height: 100vh; min-height: 0; background: linear-gradient(180deg, #0f0c29 0%, #1a1a3e 50%, #24243e 100%); display: flex; flex-direction: column; overflow: hidden; }
.drag-bar { height: 28px; -webkit-app-region: drag; flex-shrink: 0; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 36px; -webkit-app-region: no-drag; flex-shrink: 0; }
.header-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); }
.close-btn { width: 24px; height: 24px; border: none; border-radius: 4px; background: rgba(255,255,255,0.06); color: #888; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; -webkit-app-region: no-drag; }
.close-btn:hover { background: rgba(255,107,107,0.2); color: #ff6b6b; }
	.content { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 16px; -webkit-app-region: no-drag; }

.card { background: rgba(255,255,255,0.04); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.06); }
.input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #e0e0e0; font-size: 13px; outline: none; transition: border-color 0.2s; }
.input { margin-bottom: 10px; }
.input:focus { border-color: rgba(102,126,234,0.5); }
.input::placeholder { color: rgba(255,255,255,0.25); }
.label { font-size: 11px; color: #777; margin-bottom: 6px; display: block; }
.btn { width: 100%; padding: 11px 0; border-radius: 10px; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s, transform 0.1s; margin-top: 6px; }
.btn:hover { opacity: 0.9; }
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { width: 100%; padding: 9px 0; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #aaa; font-size: 12px; cursor: pointer; margin-top: 10px; transition: all 0.2s; }
.btn-secondary:hover { border-color: rgba(255,255,255,0.2); color: #ddd; }
.btn-small { padding: 6px 14px; border-radius: 6px; border: none; background: rgba(102,126,234,0.2); color: #667eea; font-size: 12px; cursor: pointer; font-weight: 500; transition: background 0.2s; }
.btn-small { min-width: 82px; }
.btn-small:hover { background: rgba(102,126,234,0.3); }

.error-msg { color: #ff6b6b; font-size: 11px; margin-top: -4px; margin-bottom: 6px; }
.success-msg { color: #51cf66; font-size: 11px; margin-top: -4px; margin-bottom: 6px; }

/* Toggle */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; }
.toggle-label { font-size: 14px; font-weight: 600; color: #fff; }
.toggle-sub { font-size: 11px; color: #888; margin-top: 2px; }
.toggle-switch { width: 48px; height: 28px; border-radius: 14px; border: none; cursor: pointer; position: relative; transition: background 0.3s; }
.toggle-switch.on { background: linear-gradient(135deg, #667eea, #764ba2); }
.toggle-switch.off { background: rgba(255,255,255,0.1); }
.toggle-knob { width: 22px; height: 22px; border-radius: 11px; background: #fff; position: absolute; top: 3px; transition: left 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
.toggle-switch.on .toggle-knob { left: 23px; }
.toggle-switch.off .toggle-knob { left: 3px; }

/* Tabs */
.tabs { display: flex; gap: 3px; margin-bottom: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 3px; }
.tab { flex: 1; padding: 7px 0; border-radius: 6px; border: none; background: transparent; color: #666; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-align: center; }
.tab.active { background: rgba(102,126,234,0.25); color: #fff; }

/* Stats */
.stats-row { display: flex; justify-content: space-around; padding: 4px 0; }
.stat-item { text-align: center; }
.stat-value { font-size: 16px; font-weight: 700; }
.stat-label { font-size: 10px; color: #888; margin-top: 2px; }
.progress-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; margin-top: 8px; }
.progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

/* Item cards */
	.item-card { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.04); }
	.item-card.selectable { cursor: pointer; transition: border-color 0.2s, background 0.2s; }
	.item-card.selectable:hover { border-color: rgba(102,126,234,0.35); background: rgba(102,126,234,0.08); }
.item-card.selected { border-color: rgba(102,126,234,0.75); background: rgba(102,126,234,0.16); }
.item-name { font-size: 13px; font-weight: 600; color: #fff; }
.item-content { font-size: 11px; color: #aeb4d1; margin-top: 4px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.item-desc { font-size: 11px; color: #888; margin-top: 3px; }
.item-price { font-size: 15px; font-weight: 700; color: #667eea; margin-top: 4px; }
.item-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; }
.item-buy { width: auto; padding: 6px 14px; min-width: 74px; margin-top: 0; }

/* Purchase modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(6, 8, 20, 0.72); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 18px; }
.modal-panel { width: 100%; max-width: 360px; max-height: 88vh; overflow-y: auto; background: #18183a; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.modal-title { font-size: 15px; font-weight: 700; color: #fff; }
.modal-sub { font-size: 11px; color: #8d93bd; margin-top: 2px; }
.modal-section { margin-top: 12px; }
.period-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.period-chip { width: 100%; text-align: left; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #cfd3ef; font-size: 11px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.period-chip.active { border-color: rgba(102,126,234,0.7); background: rgba(102,126,234,0.16); color: #fff; }
.payment-list { display: grid; gap: 8px; }
.payment-item { width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #cfd3ef; cursor: pointer; }
.payment-item.active { border-color: rgba(102,126,234,0.7); background: rgba(102,126,234,0.16); }
.payment-name { font-size: 12px; font-weight: 600; color: #fff; }
.payment-meta { font-size: 10px; color: #8d93bd; margin-top: 2px; }
.order-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; }
.order-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: #cfd3ef; padding: 4px 0; word-break: break-all; }
.order-output { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: #aeb4d1; font-size: 10px; word-break: break-all; line-height: 1.5; }

/* Settings modal */
.settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.settings-panel { background: #1a1a3e; border-radius: 16px; padding: 20px; width: 340px; border: 1px solid rgba(255,255,255,0.1); }
.settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.settings-title { font-size: 14px; font-weight: 600; color: #fff; }

/* User bar */
.user-bar { display: flex; align-items: center; gap: 12px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0; }
.user-email { font-size: 13px; font-weight: 600; color: #fff; }
.user-meta { font-size: 10px; color: #888; margin-top: 1px; }

/* Empty state */
	.empty { text-align: center; padding: 24px 0; color: #666; font-size: 12px; }
	.logo-icon { font-size: 36px; text-align: center; margin-bottom: 6px; }
.page-title { text-align: center; font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.page-sub { text-align: center; font-size: 11px; color: #888; margin-bottom: 20px; }
	.auth-card { position: relative; overflow: hidden; border: 1px solid rgba(102,126,234,0.18); box-shadow: 0 14px 40px rgba(0,0,0,0.22); padding: 18px 16px 16px; }
	.auth-card::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%); }
	.auth-card > * { position: relative; z-index: 1; }
	.auth-card form > * + * { margin-top: 2px; }
	.auth-actions { display: flex; gap: 8px; margin-top: 8px; }
	.auth-actions .btn-secondary { margin-top: 0; }
	.auth-hint { font-size: 10px; color: #8890b8; line-height: 1.4; margin-top: 6px; }
	.auth-submit-wrap { margin-top: 12px; }
		.server-list { overflow: visible; padding-right: 2px; }
	.selected-node { font-size: 10px; color: #8ea0ff; margin-top: 2px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	`

function App() {
  return (
    <>
      <style>{css}</style>
      <AppContent />
    </>
  )
}

function AppContent() {
  const [userInfo, setUserInfo] = useState(null)
  const [appConfig, setAppConfig] = useState(null)
  
  useEffect(() => {
    const restoreSession = async () => {
      const status = await getElectron().getStatus?.()
      if (!status?.hasToken) {
        localStorage.removeItem('v2board_token')
        localStorage.removeItem('v2board_auth')
        localStorage.removeItem('v2board_user')
        return
      }

      const u = localStorage.getItem('v2board_user')
      if (u) setUserInfo(JSON.parse(u))
    }

    const loadConfig = async () => {
      try {
        const cfg = await getElectron().getAppConfig?.()
        if (cfg && typeof cfg === 'object') setAppConfig(cfg)
      } catch {}
    }

    restoreSession()
    loadConfig()
  }, [])

  const handleLoginSuccess = async (loginData) => {
    localStorage.setItem('v2board_token', loginData.token)
    localStorage.setItem('v2board_auth', loginData.auth_data)

    const electron = getElectron()
    const res = await electron.fetchUserInfo()
    if (res?.data) {
      setUserInfo(res)
      localStorage.setItem('v2board_user', JSON.stringify(res))
    }
  }

  const handleLogout = async () => {
    await getElectron().logout?.()
    localStorage.removeItem('v2board_token')
    localStorage.removeItem('v2board_auth')
    localStorage.removeItem('v2board_user')
    setUserInfo(null)
  }

  return (
    <div className="app">
      <div className="drag-bar" />
      <div className="header">
        <span className="header-title">
          {appConfig?.window_title || `${appConfig?.app_name || 'v2Board'} · ${appConfig?.client_name || 'Mihomo'}`}
        </span>
        <button className="close-btn" onClick={() => getElectron().quit?.()}>✕</button>
      </div>
      <div className="content">
        {!userInfo ? (
          <LoginPage appConfig={appConfig} onLoginSuccess={handleLoginSuccess} />
        ) : (
          <Dashboard userInfo={userInfo} appConfig={appConfig} onLogout={handleLogout} />
        )}
      </div>
    </div>
  )
}

// ─── Login Page ────────────────────────────────────────────
function LoginPage({ onLoginSuccess, appConfig }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [mode, setMode] = useState('login')
  const [guestConfig, setGuestConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingCode, setLoadingCode] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)
  const [msg, setMsg] = useState('')

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const emailVerifyEnabled = !!guestConfig?.is_email_verify
  const needEmailCode = isRegister || isForgot

  const loadGuestConfig = async () => {
    setLoadingConfig(true)
    try {
      const electron = getElectron()
      const res = await electron.fetchGuestConfig?.()
      if (res?.data) {
        setGuestConfig(res.data)
      } else {
        setGuestConfig({ is_email_verify: 0 })
      }
    } catch {
      setGuestConfig({ is_email_verify: 0 })
    }
    setLoadingConfig(false)
  }

  useEffect(() => {
    loadGuestConfig()
  }, [])

  useEffect(() => {
    if (codeCountdown <= 0) return
    const timer = setTimeout(() => setCodeCountdown((n) => Math.max(0, n - 1)), 1000)
    return () => clearTimeout(timer)
  }, [codeCountdown])

  useEffect(() => {
    setMsg('')
    setEmailCode('')
    setCodeCountdown(0)
    if (mode === 'register' && guestConfig === null && !loadingConfig) {
      loadGuestConfig()
    }
  }, [mode])

  const sendVerificationCode = async () => {
    if (!email) {
      setMsg('请先填写邮箱')
      return
    }
    setLoadingCode(true)
    setMsg('')
    try {
      const electron = getElectron()
      const res = await electron.sendEmailVerify?.(email, isForgot)
      if (res?.errors) {
        setMsg(res?.message || '验证码发送失败')
      } else {
        setMsg('验证码已发送，请查收邮箱')
        setCodeCountdown(60)
      }
    } catch (err) {
      setMsg('网络错误: ' + err.message)
    }
    setLoadingCode(false)
  }

  const isSuccessfulForgetResponse = (resp) => {
    if (!resp) return false
    if (resp.success === true) return true
    if (resp.success === false) return false
    if (resp.errors) return false
    if (resp.data !== undefined && resp.data !== null) return true
    const message = String(resp.message || resp.error || '')
    if (/成功|success|ok|done|已重置|修改成功/i.test(message)) return true
    if (/invalid|错误|失败|验证码|password|email/i.test(message)) return false
    return false
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      let result
      const electron = getElectron()
      if (isForgot) {
        if (!emailCode.trim()) {
          setMsg('请输入邮箱验证码')
          setLoading(false)
          return
        }
        result = await electron.forgetPassword?.(email, password, emailCode.trim())
        if (isSuccessfulForgetResponse(result)) {
          setMsg(result?.message || '修改成功，请返回登录')
          setPassword('')
          setEmailCode('')
        } else {
          setMsg(result?.message || result?.error || '找回密码失败')
        }
      } else if (isRegister) {
        if (emailVerifyEnabled && !emailCode.trim()) {
          setMsg('请输入邮箱验证码')
          setLoading(false)
          return
        }
        result = await electron.register(email, password, emailVerifyEnabled ? emailCode.trim() : '', inviteCode)
        if (result?.success) {
          await onLoginSuccess(result.data)
        } else {
          setMsg(result?.error || '操作失败')
        }
      } else {
        result = await electron.login(email, password)
        if (result?.success) {
          await onLoginSuccess(result.data)
        } else {
          setMsg(result?.error || '操作失败')
        }
      }
    } catch (err) {
      setMsg('网络错误: ' + err.message)
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="logo-icon">🌐</div>
      <div className="page-title">{appConfig?.page_title || `${appConfig?.app_name || 'v2Board'} 客户端`}</div>
      <div className="page-sub">
        {isForgot ? '通过邮箱验证码找回密码' : isRegister ? (loadingConfig ? '正在检查邮箱验证配置…' : emailVerifyEnabled ? '创建新账户，需要邮箱验证码' : '创建新账户') : '登录你的账户'}
      </div>

      <div className="card auth-card">
        <form onSubmit={handleSubmit}>
          <label className="label">邮箱</label>
          <input className="input" type="email" placeholder="your@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)} required />

          <label className="label">密码</label>
          <input className="input" type="password" placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} required />

          {needEmailCode && (
            <>
              <label className="label">邮箱验证码</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  style={{ flex: 1, marginBottom: 0 }}
                  placeholder="请输入验证码"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-small"
                  onClick={sendVerificationCode}
                  disabled={loadingCode || codeCountdown > 0 || !email || (isRegister && loadingConfig)}
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {loadingCode ? '发送中...' : codeCountdown > 0 ? `${codeCountdown}s` : '发送验证码'}
                </button>
              </div>
              <div className="auth-hint">
                {isForgot ? '验证码将发送到你的邮箱，用于重置密码。' : emailVerifyEnabled ? '后端已开启邮箱验证，注册时必须先发送验证码。' : '后端未开启邮箱验证，注册不需要验证码。'}
              </div>
            </>
          )}

          {isRegister && (
            <>
              <label className="label">邀请码（可选）</label>
              <input className="input" placeholder="邀请码" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)} />
            </>
          )}

          {msg && <div className={msg.includes('成功') ? 'success-msg' : 'error-msg'}>{msg}</div>}

          <div className="auth-submit-wrap">
            <button type="submit" className="btn" disabled={loading || (isRegister && loadingConfig)}>
            {loading ? '处理中...' : (isForgot ? '找回密码' : isRegister ? '注册' : '登录')}
            </button>
          </div>
        </form>

        <button className="btn-secondary" onClick={() => { setMode(isRegister ? 'login' : 'register'); setMsg('') }}>
          {isRegister ? '已有账户？返回登录' : '没有账户？注册'}
        </button>

        <div className="auth-actions">
          {!isForgot && (
            <button className="btn-secondary" onClick={() => { setMode('forgot'); setMsg('') }}>
              忘记密码？
            </button>
          )}
          {isForgot && (
            <button className="btn-secondary" onClick={() => { setMode('login'); setMsg('') }}>
              返回登录
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────
function Dashboard({ userInfo, onLogout, appConfig }) {
  const delayTestUrl = ['https://cp.cloudflare.com/generate_204', 'https://www.google.com/generate_204', 'http://www.gstatic.com/generate_204']
  const delayTestTimeout = 10000
  const [activeTab, setActiveTab] = useState('overview')
  const [proxyOn, setProxyOn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState([])
		  const [servers, setServers] = useState([])
		  const [serverDelays, setServerDelays] = useState({})
		  const [testingDelays, setTestingDelays] = useState(false)
		  const [selectedServer, setSelectedServer] = useState('')
		  const [activeServer, setActiveServer] = useState('')
		  const [traffic, setTraffic] = useState({ up: 0, down: 0, uploadTotal: 0, downloadTotal: 0 })
		  const [subData, setSubData] = useState(null)
  const [purchasePlan, setPurchasePlan] = useState(null)
  const [purchasePeriods, setPurchasePeriods] = useState([])
  const [purchasePeriod, setPurchasePeriod] = useState('')
  const [purchaseCoupon, setPurchaseCoupon] = useState('')
  const [paymentMethods, setPaymentMethods] = useState([])
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [purchaseMessage, setPurchaseMessage] = useState(null)
  const [purchaseResult, setPurchaseResult] = useState(null)
	  const [msg, setMsg] = useState('')

  const data = userInfo?.data

	  useEffect(() => {
	    const electron = getElectron()
		    electron.getStatus().then((s) => {
		      setProxyOn(s?.proxyOn || false)
		      setSelectedServer(s?.selectedProxyName || '')
		      setActiveServer(s?.activeProxyName || '')
		      if (s?.traffic) setTraffic(s.traffic)
		    })
		  }, [])

	  useEffect(() => {
	    const electron = getElectron()
	    electron.onProxyStatus?.((status) => {
	      if (status) {
	        setProxyOn(status.on || false)
	        if (status.selectedProxyName) setSelectedServer(status.selectedProxyName)
	        setActiveServer(status.activeProxyName || '')
	      }
	    })
	  }, [])

	  useEffect(() => {
	    const electron = getElectron()
	    electron.onTraffic?.((nextTraffic) => {
	      if (nextTraffic) setTraffic(nextTraffic)
	    })
	  }, [])

	  useEffect(() => {
	    const electron = getElectron()
	    electron.onServerDelayUpdate?.((payload) => {
	      if (!payload?.name) return
	      setServerDelays((prev) => ({ ...prev, [payload.name]: payload.delay }))
	    })
	  }, [])

	  const handleToggle = async () => {
	    setMsg('')
	    setLoading(true)
	    try {
	      const electron = getElectron()
	      const result = await electron.toggleProxy()
	      setProxyOn(result?.on || false)
	      if (result?.selectedProxyName) setSelectedServer(result.selectedProxyName)
	      setActiveServer(result?.activeProxyName || '')
	    } catch {}
	    setLoading(false)
	  }

	  const handleRefresh = async (action, setter) => {
	    try {
	      const electron = getElectron()
	      const isServerAction = action === 'fetchServers' || action === 'reloadServers'
	      if (isServerAction) setServerDelays({})
	      const res = await electron[action]()
	      if (res?.data) {
	        setter(res.data)
	        if (isServerAction) {
	          const names = Array.isArray(res.data) ? res.data.map(s => s?.name).filter(Boolean) : []
	          if (names.length && !names.includes(selectedServer)) {
	            const first = names[0] || ''
	            if (first) {
	              setSelectedServer(first)
	              await electron.setSelectedServer?.(first)
	            }
	          }
	          if (names.length) {
	            const delays = await electron.fetchServerDelays?.(names, delayTestUrl, delayTestTimeout, true)
	            if (delays && typeof delays === 'object') setServerDelays(delays)
	          } else {
	            setServerDelays({})
	          }
	        }
	      }
	    } catch {}
	  }

	  useEffect(() => {
	    if (!data) return
	    handleRefresh('fetchPlans', setPlans)
	    handleRefresh('fetchServers', setServers)
	  }, [])

	  useEffect(() => {
	    if (activeTab === 'plans') {
	      handleRefresh('fetchPlans', setPlans)
	    }
	    if (activeTab === 'servers') {
	      handleRefresh('fetchServers', setServers)
	    }
	    if (activeTab === 'subscribe') {
	      handleRefresh('fetchSubscribe', setSubData)
	    }
	  }, [activeTab])

	  const handleSelectServer = async (server) => {
	    if (!server?.name) return
	    setMsg('')
	    setSelectedServer(server.name)
	    const result = await getElectron().setSelectedServer?.(server.name)
	    if (result?.proxyOn !== undefined) setProxyOn(result.proxyOn)
	    setActiveServer(result?.activeProxyName || '')
	    if (result?.proxyOn && result?.switched === false) setMsg('节点已保存，但 Mihomo 暂时没有切换成功，请重新开启代理')
	    try {
	      const electron = getElectron()
	      const delays = await electron.fetchServerDelays?.([server.name], delayTestUrl, delayTestTimeout, false)
	      if (delays && typeof delays === 'object') {
	        setServerDelays((prev) => ({ ...prev, ...delays }))
	      }
	    } catch {}
	  }

	  const handleTestDelays = async () => {
	    const names = Array.isArray(servers) ? servers.map((s) => s?.name).filter(Boolean) : []
	    if (!names.length) return
	    setMsg('')
	    setTestingDelays(true)
	    try {
	      const electron = getElectron()
	      const delays = await electron.fetchServerDelays?.(names, delayTestUrl, delayTestTimeout, true)
	      if (delays && typeof delays === 'object') {
	        setServerDelays(delays)
	      }
	    } catch {}
	    setTestingDelays(false)
	  }

  const openPurchase = async (plan) => {
    const periods = getPlanPeriods(plan)
    setPurchasePlan(plan)
    setPurchasePeriods(periods)
    setPurchasePeriod(periods[0]?.key || '')
    setPurchaseCoupon('')
    setPaymentMethods([])
    setPaymentMethodId('')
    setPurchaseLoading(false)
    setPurchaseMessage(null)
    setPurchaseResult(null)
    try {
      const res = await getElectron().fetchPaymentMethods?.()
      const methods = normalizePaymentMethods(res)
      setPaymentMethods(methods)
      setPaymentMethodId(methods[0]?.id ?? '')
    } catch {
      setPaymentMethods([])
    }
  }

  const closePurchase = () => {
    setPurchasePlan(null)
    setPurchasePeriods([])
    setPurchasePeriod('')
    setPurchaseCoupon('')
    setPaymentMethods([])
    setPaymentMethodId('')
    setPurchaseLoading(false)
    setPurchaseMessage(null)
    setPurchaseResult(null)
  }

  const confirmPurchase = async () => {
    if (!purchasePlan || !purchasePeriod) {
      setPurchaseMessage({ type: 'error', text: '请选择可购买的订阅周期' })
      return
    }

    setPurchaseLoading(true)
    setPurchaseMessage(null)

    try {
      const electron = getElectron()
      const coupon = purchaseCoupon.trim()
      if (coupon) {
        const couponRes = await electron.checkCoupon?.(coupon, purchasePlan.id)
        if (couponRes?.success === false || couponRes?.message || couponRes?.error) {
          throw new Error(couponRes?.message || couponRes?.error || '优惠码校验失败')
        }
      }

      const orderRes = await electron.createOrder?.({
        plan_id: purchasePlan.id,
        cycle: purchasePeriod,
        coupon_code: coupon,
      })
      const tradeNo = extractTradeNo(orderRes)
      if (!tradeNo) {
        throw new Error(orderRes?.message || orderRes?.error || '创建订单失败')
      }

      const methodId = paymentMethodId || paymentMethods[0]?.id
      if (!methodId) {
        setPurchaseResult({ tradeNo, checkoutType: null, checkoutValue: '' })
        setPurchaseMessage({ type: 'success', text: '订单已创建，暂无可用支付方式' })
        return
      }

      const checkoutRes = await electron.checkoutOrder?.({
        trade_no: tradeNo,
        method: Number(methodId),
      })
      const checkoutType = Number(checkoutRes?.type ?? (isLikelyUrl(checkoutRes?.data) ? 1 : 0))
      const checkoutValue = checkoutRes?.data?.data || checkoutRes?.data || ''
      setPurchaseResult({ tradeNo, checkoutType, checkoutValue })

      if (isLikelyUrl(checkoutValue)) {
        await electron.openExternal?.(checkoutValue)
      }

      setPurchaseMessage({ type: 'success', text: '订单已创建，请完成支付' })
    } catch (err) {
      setPurchaseMessage({ type: 'error', text: err.message || '购买失败' })
    }

    setPurchaseLoading(false)
  }

	  const trafficUsed = data ? (data.u || 0) + (data.d || 0) : 0
	  const trafficTotal = data ? (data.transfer_enable || 0) : 0
	  const percent = trafficTotal > 0 ? Math.round((trafficUsed / trafficTotal) * 100) : 0
	  const sessionTraffic = (traffic.uploadTotal || 0) + (traffic.downloadTotal || 0)
	  const expiredAt = (() => {
	    const value = data?.expired_at
	    if (value === null || value === undefined || value === '' || value === '—' || value === '--') return '永久'
	    const date = new Date(Number(value) * 1000)
	    if (Number.isNaN(date.getTime())) return '永久'
	    return date.toLocaleDateString('zh-CN')
	  })()

  const tabs = [
    { key: 'overview', label: '概览' },
    { key: 'plans', label: '套餐' },
    { key: 'servers', label: '节点' },
    { key: 'subscribe', label: '订阅' },
  ]

  return (
    <div>
      {/* User Bar */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="user-bar">
          <div className="avatar">{(data?.email || 'U')[0]?.toUpperCase() || '?'}</div>
          <div style={{ flex: 1 }}>
            <div className="user-email">{data?.email || '用户'}</div>
            <div className="user-meta">
              {data?.plan_id ? '📦 付费用户' : '🆓 免费用户'} · 到期: {expiredAt}
            </div>
          </div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', margin: 0, fontSize: 11 }} onClick={onLogout}>退出</button>
        </div>
      </div>

      {/* Proxy Toggle */}
      <div className="card toggle-row">
	          <div>
	            <div className="toggle-label">{proxyOn ? '🟢 代理已开启' : '🔴 代理已关闭'}</div>
	            <div className="toggle-sub">{proxyOn ? 'mihomo 内核运行中' : '点击开关启动'}</div>
	            {selectedServer && <div className="selected-node">当前选择: {selectedServer}</div>}
	            {proxyOn && activeServer && <div className="selected-node">实际生效: {activeServer}</div>}
	          </div>
        <button className={`toggle-switch ${proxyOn ? 'on' : 'off'}`} onClick={handleToggle} disabled={loading}>
          <div className="toggle-knob" />
        </button>
      </div>
      {msg && <div className="error-msg" style={{ marginTop: -6, marginBottom: 8 }}>{msg}</div>}

      {/* Traffic */}
      {data && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 8 }}>📊 流量</div>
          <div className="stats-row">
	            <div className="stat-item">
	              <div className="stat-value" style={{ color: '#ff6b6b' }}>{formatBytes(traffic.up || 0)}/s</div>
	              <div className="stat-label">↑ 实时上传</div>
	              <div className="stat-label">本次 {formatBytes(traffic.uploadTotal || 0)}</div>
	            </div>
	            <div className="stat-item">
	              <div className="stat-value" style={{ color: '#51cf66' }}>{formatBytes(traffic.down || 0)}/s</div>
	              <div className="stat-label">↓ 实时下载</div>
	              <div className="stat-label">本次 {formatBytes(traffic.downloadTotal || 0)}</div>
	            </div>
            <div className="stat-item">
              <div className="stat-value" style={{ color: '#667eea' }}>{formatBytes(trafficTotal)}</div>
              <div className="stat-label">总量</div>
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${Math.min(percent, 100)}%`,
              background: percent > 90 ? '#ff6b6b' : 'linear-gradient(90deg, #667eea, #764ba2)',
            }} />
          </div>
	          <div style={{ fontSize: 11, color: '#888', marginTop: 6, textAlign: 'center' }}>
	            套餐已用 {percent}% · 本次代理 {formatBytes(sessionTraffic)}
	          </div>
	        </div>
	      )}

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="card">
          {data && (
            <div style={{ fontSize: 12, color: '#aaa' }}>
              {[
                ['设备限制', data.device_limit ?? '不限'],
                ['账户余额', formatCurrencyCents(data.balance)],
                ['佣金余额', formatCurrencyCents(data.commission_balance)],
                ['当前套餐', getPlanNameById(plans, data.plan_id)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#888' }}>{k}</span><span style={{ color: '#ccc' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Plans */}
      {activeTab === 'plans' && (
        <div className="card">
          <button className="btn-small" style={{ marginBottom: 12 }} onClick={() => handleRefresh('fetchPlans', setPlans)}>🔄 刷新</button>
          {plans.length > 0 ? plans.map((p, i) => (
            <div key={i} className="item-card">
              <div className="item-name">{p.name}</div>
              {getPlanDescription(p) && (
                <div className="item-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(getPlanDescription(p)) }} />
              )}
              <div className="item-actions">
                <div>
                  <div className="item-price">
                    {(() => {
                      const price = getPlanPrice(p)
                      return price.value !== null
                        ? <>¥{price.value.toFixed(2)} <span style={{ fontSize: 11, color: '#888' }}>/{price.label}</span></>
                        : <span style={{ color: '#888', fontSize: 12 }}>暂无价格</span>
                    })()}
                  </div>
                  <div className="item-desc">{formatPlanTraffic(p.transfer_enable)}</div>
                </div>
                <button
                  className="btn-small item-buy"
                  onClick={() => openPurchase(p)}
                  disabled={getPlanPeriods(p).length === 0}
                >
                  购买
                </button>
              </div>
            </div>
          )) : <div className="empty">暂无套餐</div>}
        </div>
      )}

      {/* Tab: Servers */}
	      {activeTab === 'servers' && (
	        <div className="card">
	          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
	            <button className="btn-small" onClick={() => handleRefresh('reloadServers', setServers)}>🔄 刷新</button>
	            <button className="btn-small" onClick={handleTestDelays} disabled={testingDelays || servers.length === 0}>
	              {testingDelays ? '⏳ 测速中' : '⚡ 手动测速'}
	            </button>
	          </div>
	          {servers.length > 0 ? (
	            <div className="server-list">
	              {servers.map((s, i) => (
	                <div
	                  key={s.id || `${s.name}-${i}`}
	                  className={`item-card selectable ${selectedServer === s.name ? 'selected' : ''}`}
	                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
	                  onClick={() => handleSelectServer(s)}
	                >
	                  <div style={{ minWidth: 0 }}>
	                    <div className="item-name">{s.name || `节点 ${i + 1}`}</div>
	                  </div>
	                  <div style={{ fontSize: 11, textAlign: 'right', marginLeft: 8, color: selectedServer === s.name ? '#8ea0ff' : latencyColor(serverDelays[s.name]) }}>
	                    <div>{selectedServer === s.name ? '已选' : formatLatency(serverDelays[s.name])}</div>
	                    {selectedServer === s.name && serverDelays[s.name] !== undefined && (
	                      <div style={{ fontSize: 10, marginTop: 1, color: latencyColor(serverDelays[s.name]) }}>
	                        {formatLatency(serverDelays[s.name])}
	                      </div>
	                    )}
	                  </div>
	                </div>
	              ))}
	            </div>
	          ) : <div className="empty">暂无节点</div>}
	        </div>
	      )}

      {/* Tab: Subscribe */}
      {activeTab === 'subscribe' && (
        <div className="card">
          <button className="btn-small" style={{ marginBottom: 12 }} onClick={() => handleRefresh('fetchSubscribe', setSubData)}>🔄 刷新</button>
          {subData?.subscribe_url ? (
            <div>
              <label className="label">订阅链接</label>
              <div style={{
                fontSize: 10, color: '#667eea', wordBreak: 'break-all',
                background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6,
                fontFamily: 'monospace', lineHeight: 1.5,
              }}>{subData.subscribe_url}</div>
            </div>
          ) : <div className="empty">暂无订阅</div>}
        </div>
      )}

      {purchasePlan && (
        <PurchaseModal
          plan={purchasePlan}
          periods={purchasePeriods}
          periodKey={purchasePeriod}
          onPeriodChange={setPurchasePeriod}
          couponCode={purchaseCoupon}
          onCouponCodeChange={setPurchaseCoupon}
          paymentMethods={paymentMethods}
          paymentMethodId={paymentMethodId}
          onPaymentMethodChange={setPaymentMethodId}
          loading={purchaseLoading}
          message={purchaseMessage}
          result={purchaseResult}
          onClose={closePurchase}
          onConfirm={confirmPurchase}
          onOpenExternal={(url) => getElectron().openExternal?.(url)}
          onCopyText={(text) => getElectron().copyText?.(text)}
        />
      )}
    </div>
  )
}

export default App
