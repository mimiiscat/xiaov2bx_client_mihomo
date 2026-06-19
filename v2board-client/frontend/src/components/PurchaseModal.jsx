import { useEffect } from 'react'
import { isLikelyUrl } from '../utils/appHelpers'

export function PurchaseModal({
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
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!plan) return null

  const checkoutValue = result?.checkoutValue || ''
  const checkoutType = result?.checkoutType
  const checkoutUrl = isLikelyUrl(checkoutValue) ? checkoutValue : ''

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">购买套餐</div>
            <div className="modal-sub">{plan.name}</div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            aria-label="关闭弹窗"
          >
            ×
          </button>
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
