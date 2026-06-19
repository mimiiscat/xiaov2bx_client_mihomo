export function DashboardTabs({ activeTab, onChange }) {
  const tabs = [
    { key: 'servers', label: '节点' },
    { key: 'plans', label: '套餐' },
    { key: 'orders', label: '订单' },
    { key: 'overview', label: '概览' },
    { key: 'notices', label: '公告' },
  ]

  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
