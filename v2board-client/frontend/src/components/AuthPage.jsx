import { useEffect, useState } from 'react'
import { getElectron } from '../utils/electron'
import { getLoginSiteName, getLoginSiteDescription } from '../utils/appHelpers'

export function AuthPage({ appConfig, onLoginSuccess }) {
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
  const siteName = getLoginSiteName(appConfig, guestConfig)
  const siteDescription = getLoginSiteDescription(appConfig, guestConfig)

  const loadGuestConfig = async () => {
    setLoadingConfig(true)
    try {
      const res = await getElectron().fetchGuestConfig?.()
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
      const res = await getElectron().sendEmailVerify?.(email, isForgot)
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
      if (isForgot) {
        if (!emailCode.trim()) {
          setMsg('请输入邮箱验证码')
          setLoading(false)
          return
        }
        result = await getElectron().forgetPassword?.(email, password, emailCode.trim())
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
        result = await getElectron().register(email, password, emailVerifyEnabled ? emailCode.trim() : '', inviteCode)
        if (result?.success) {
          await onLoginSuccess(result.data)
        } else {
          setMsg(result?.error || '操作失败')
        }
      } else {
        result = await getElectron().login(email, password)
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
      <div className="page-title">{siteName}</div>
      <div className="page-sub">
        {siteDescription || (isForgot ? '通过邮箱验证码找回密码' : isRegister ? (loadingConfig ? '正在检查邮箱验证配置…' : emailVerifyEnabled ? '创建新账户，需要邮箱验证码' : '创建新账户') : '登录你的账户')}
      </div>

      <div className="card auth-card">
        <form onSubmit={handleSubmit}>
          <label className="label">邮箱</label>
          <input className="input" type="email" placeholder="请输入邮箱" value={email}
            onChange={(e) => setEmail(e.target.value)} />

          <label className="label">密码</label>
          <input className="input" type="password" placeholder="请输入密码" value={password}
            onChange={(e) => setPassword(e.target.value)} />

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
