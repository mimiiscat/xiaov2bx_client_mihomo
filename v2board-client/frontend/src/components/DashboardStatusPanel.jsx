import { formatBytes } from '../utils/appHelpers'

export function DashboardStatusPanel({
  data,
  expiredAt,
  proxyOn,
  loading,
  proxyTargetOn,
  selectedServer,
  activeServer,
  msg,
  traffic,
  trafficTotal,
  trafficUsed,
  percent,
  sessionTraffic,
  onLogout,
  onToggle,
}) {
  const email = data?.email || '用户'
  const avatar = (email[0] || 'U').toUpperCase()

  return (
    <>
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="user-bar">
          <div className="avatar">{avatar}</div>
          <div style={{ flex: 1 }}>
            <div className="user-email">{email}</div>
            <div className="user-meta">
              {data?.plan_id ? '📦 付费用户' : '🆓 免费用户'} · 到期: {expiredAt}
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ width: 'auto', padding: '4px 10px', margin: 0, fontSize: 11 }}
            onClick={onLogout}
          >
            退出
          </button>
        </div>
      </div>

      <div className="card toggle-row">
        <div>
          <div className="toggle-label">
            {loading
              ? (proxyTargetOn ? '🟡 代理启动中' : '🟡 代理关闭中')
              : (proxyOn ? '🟢 代理已开启' : '🔴 代理已关闭')}
          </div>
          <div className="toggle-sub">
            {loading
              ? (proxyTargetOn ? '正在启动…' : '正在关闭…')
              : (proxyOn ? '内核运行中' : '点击开关启动')}
          </div>
          {selectedServer && <div className="selected-node">当前节点: {selectedServer}</div>}
        </div>
        <button
          className={`toggle-switch ${proxyOn ? 'on' : 'off'} ${loading ? 'pending' : ''}`}
          onClick={onToggle}
          disabled={loading}
        >
          <div className="toggle-knob" />
        </button>
      </div>

      {msg && <div className="error-msg" style={{ marginTop: -6, marginBottom: 8 }}>{msg}</div>}

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
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(percent, 100)}%`,
                background: percent > 90 ? '#ff6b6b' : 'linear-gradient(90deg, #667eea, #764ba2)',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6, textAlign: 'center' }}>
            已用 {formatBytes(trafficUsed)} / {formatBytes(trafficTotal)} · 套餐已用 {percent}% · 本次代理 {formatBytes(sessionTraffic)}
          </div>
        </div>
      )}
    </>
  )
}
