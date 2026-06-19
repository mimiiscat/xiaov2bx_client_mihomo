import { useEffect, useState } from 'react'
import './styles.css'
import { getElectron } from './utils/electron'
import { AuthPage } from './components/AuthPage'
import { Dashboard } from './components/Dashboard'

function App() {
  const [userInfo, setUserInfo] = useState(null)
  const [appConfig, setAppConfig] = useState(null)
  const [windowMaximized, setWindowMaximized] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await getElectron().getAppConfig?.()
        if (cfg && typeof cfg === 'object') setAppConfig(cfg)
      } catch (err) {
        console.error('[App] loadConfig failed:', err?.message || err)
      }
    }

    const restoreSession = async () => {
      try {
        const status = await getElectron().getStatus?.()
        if (!status?.hasToken) {
          setUserInfo(null)
          return
        }
        const res = await getElectron().fetchUserInfo?.()
        if (res?.data) setUserInfo(res)
      } catch {
        console.error('[App] restoreSession failed')
        setUserInfo(null)
      }
    }

    loadConfig()
    restoreSession()

    const syncWindowState = async () => {
      try {
        const status = await getElectron().isWindowMaximized?.()
        setWindowMaximized(!!status?.maximized)
      } catch (err) {
        console.error('[App] window state sync failed:', err?.message || err)
      }
    }

    syncWindowState()
  }, [])

  useEffect(() => {
    const onResize = async () => {
      try {
        const status = await getElectron().isWindowMaximized?.()
        setWindowMaximized(!!status?.maximized)
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleLoginSuccess = async () => {
    const res = await getElectron().fetchUserInfo?.()
    if (res?.data) {
      setUserInfo(res)
    }
  }

  const handleLogout = async () => {
    await getElectron().logout?.()
    setUserInfo(null)
  }

  const handleMinimize = () => {
    getElectron().minimizeWindow?.()
  }

  const handleToggleMaximize = async () => {
    try {
      const res = await getElectron().toggleMaximizeWindow?.()
      if (typeof res?.maximized === 'boolean') setWindowMaximized(res.maximized)
      else setWindowMaximized((value) => !value)
    } catch (err) {
      console.error('[App] toggle maximize failed:', err?.message || err)
    }
  }

  const handleClose = () => {
    getElectron().hideWindow?.()
  }

  return (
    <div className="app">
      <div className="window-header">
        <div className="window-controls" aria-label="Window controls">
          <button className="window-control window-control-close" onClick={handleClose} aria-label="关闭窗口" />
          <button className="window-control window-control-minimize" onClick={handleMinimize} aria-label="最小化窗口" />
          <button
            className={`window-control window-control-maximize ${windowMaximized ? 'is-maximized' : ''}`}
            onClick={handleToggleMaximize}
            aria-label={windowMaximized ? '还原窗口' : '最大化窗口'}
          />
        </div>
        <div className="window-title">
          {appConfig?.window_title || `${appConfig?.app_name || 'v2Board'} · ${appConfig?.client_name || 'Mihomo'}`}
        </div>
      </div>
      <div className="content">
        {!userInfo ? (
          <AuthPage appConfig={appConfig} onLoginSuccess={handleLoginSuccess} />
        ) : (
          <Dashboard userInfo={userInfo} appConfig={appConfig} onLogout={handleLogout} />
        )}
      </div>
    </div>
  )
}

export default App
