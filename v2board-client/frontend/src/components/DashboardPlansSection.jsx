import {
  formatPlanTraffic,
  getPlanDescription,
  getPlanPeriods,
  getPlanPrice,
  sanitizeHtml,
} from '../utils/appHelpers'

export function DashboardPlansSection({ plans, onRefreshPlans, onOpenPurchase }) {
  return (
    <div className="card plans-card">
      <div className="plans-toolbar">
        <div className="plans-toolbar__title">套餐列表</div>
        <button className="btn-small" onClick={onRefreshPlans}>🔄 刷新</button>
      </div>
      {plans.length > 0 ? plans.map((plan, index) => {
        const periods = getPlanPeriods(plan)
        const price = getPlanPrice(plan)
        const description = getPlanDescription(plan)

        return (
          <div key={index} className="item-card plan-card">
            <div className="plan-card__top">
              <div className="plan-card__head">
                <div className="item-name">{plan.name}</div>
                <div className="plan-card__tags">
                  <span className="plan-pill">{formatPlanTraffic(plan.transfer_enable)}</span>
                  <span className="plan-pill plan-pill--soft">
                    {periods.length > 0 ? `${periods.length} 个周期` : '无周期'}
                  </span>
                </div>
              </div>
              <div className="plan-card__price">
                {price.value !== null
                  ? <>
                      <span className="plan-card__price-value">¥{price.value.toFixed(2)}</span>
                      <span className="plan-card__price-unit">/{price.label}</span>
                    </>
                  : <span className="plan-card__price-empty">暂无价格</span>}
              </div>
            </div>
            {description && (
              <div className="item-content plan-card__content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }} />
            )}
            <div className="item-actions plan-card__actions">
              <div className="plan-card__meta">
                <span className="item-desc">{formatPlanTraffic(plan.transfer_enable)} 流量</span>
              </div>
              <button className="btn-small item-buy" onClick={() => onOpenPurchase(plan)} disabled={periods.length === 0}>购买</button>
            </div>
          </div>
        )
      }) : <div className="empty">暂无套餐</div>}
    </div>
  )
}
