import { formatLatency, latencyColor } from '../utils/appHelpers'

export function ServerList({
  servers,
  selectedServer,
  serverLatencies,
  onSelectServer,
  onRefreshServers,
  onMeasureDelays,
  onMeasureServerDelay,
  updatingNodes,
  measuringDelays,
  nodeFeedback,
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`btn-small node-refresh-btn ${updatingNodes ? 'loading' : ''}`} onClick={onRefreshServers} disabled={updatingNodes}>
          {updatingNodes ? '⏳ 更新中' : '🔄 更新节点'}
        </button>
        <button className={`btn-small node-refresh-btn ${measuringDelays ? 'loading' : ''}`} onClick={onMeasureDelays} disabled={updatingNodes}>
          {measuringDelays ? '⏳ 测试中' : '⚡ 节点测试'}
        </button>
      </div>
      {nodeFeedback && (
        <div className={nodeFeedback.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginTop: -4, marginBottom: 8 }}>
          {nodeFeedback.text}
        </div>
      )}
      {servers.length > 0 ? (
        <div className="server-list">
          {servers.map((s, i) => {
            const latency = serverLatencies[s.name]
            const latencyText = latency ? formatLatency(latency) : '待测试'
            const latencyTone = latency ? latencyColor(latency) : '#8d93bd'

            return (
              <div
                key={s.id || `${s.name}-${i}`}
                className={`item-card selectable ${selectedServer === s.name ? 'selected' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => onSelectServer(s)}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="item-name">{s.name || `节点 ${i + 1}`}</div>
                </div>
                <div style={{ fontSize: 11, textAlign: 'right', marginLeft: 12, minWidth: 64 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    title="点击重新测试"
                    style={{ color: latencyTone, cursor: 'pointer' }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onMeasureServerDelay?.(s)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        onMeasureServerDelay?.(s)
                      }
                    }}
                  >
                    {latencyText}
                  </div>
                  <div style={{ color: '#8ea0ff', marginTop: 2 }}>
                    {selectedServer === s.name ? '已选' : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : <div className="empty">暂无节点</div>}
    </div>
  )
}
