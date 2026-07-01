import { useEffect, useMemo, useState } from 'react'
import { formatCurrencyCents, getPlanNameById } from '../utils/appHelpers'
import { getElectron } from '../utils/electron'

function normalizeArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function formatTime(value) {
  if (value === null || value === undefined || value === '' || value === '--' || value === '—') return '未知'
  const numeric = Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function getOrderTradeNo(order) {
  return String(order?.trade_no ?? order?.tradeNo ?? order?.callback_no ?? order?.callbackNo ?? order?.id ?? '').trim()
}

function getOrderKey(order, index) {
  return getOrderTradeNo(order) || `${index}`
}

function getOrderPlanName(order, plans) {
  if (order?.plan && typeof order.plan === 'object') {
    return order.plan.name || order.plan.title || order.plan.subject || '未命名套餐'
  }
  const planId = order?.plan_id ?? order?.planId ?? order?.planID ?? ''
  if (planId) {
    return getPlanNameById(plans, planId)
  }
  return order?.subject || order?.title || order?.name || '未命名订单'
}

function isOrderPaid(order) {
  if (!order) return false
  if (order?.paid_at || order?.paidAt) return true
  if (Number(order?.status) === 3) return true
  const statusText = String(order?.status_text || order?.status_label || order?.status_name || '').trim()
  return /已支付|paid|complete|completed|success/i.test(statusText)
}

function isOrderCancelled(order) {
  if (!order) return false
  if (order?.is_cancelled === true || order?.cancelled === true || order?.closed === true) return true
  const statusText = String(order?.status_text || order?.status_label || order?.status_name || '').trim()
  return /已取消|取消|closed|close|cancel/i.test(statusText)
}

function getOrderStatus(order) {
  const statusText = String(order?.status_text || order?.status_label || order?.status_name || '').trim()
  if (statusText) {
    return {
      label: statusText,
      tone: isOrderCancelled(order) ? 'closed' : isOrderPaid(order) ? 'paid' : 'pending',
    }
  }
  if (isOrderCancelled(order)) {
    return { label: '已取消', tone: 'closed' }
  }
  if (isOrderPaid(order)) {
    return { label: '已支付', tone: 'paid' }
  }
  if (Number(order?.status) === 2) {
    return { label: '待支付', tone: 'pending' }
  }
  if (Number(order?.status) === 1) {
    return { label: '待处理', tone: 'pending' }
  }
  return { label: order?.status !== undefined && order?.status !== null ? `状态 ${order.status}` : '未知', tone: 'pending' }
}

const PERIOD_LABELS = {
  month_price: '月付',
  quarter_price: '季付',
  half_year_price: '半年',
  year_price: '年付',
  two_year_price: '两年',
  three_year_price: '三年',
  onetime_price: '一次性',
  reset_price: '重置',
}

function formatPeriod(period) {
  return PERIOD_LABELS[period] || period || '未知'
}

function getOrderAmount(order) {
  if (order?.total_amount !== undefined && order?.total_amount !== null && order?.total_amount !== '') {
    return formatCurrencyCents(order.total_amount)
  }
  if (order?.amount !== undefined && order?.amount !== null && order?.amount !== '') {
    return formatCurrencyCents(order.amount)
  }
  return '¥0.00'
}

export function OrderSection({ isActive, plans = [] }) {
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return orders[0] || null
    return orders.find((order, index) => getOrderKey(order, index) === selectedOrderId) || orders[0] || null
  }, [orders, selectedOrderId])

  const refreshOrders = async (silent = false) => {
    if (!silent) setLoading(true)
    setFeedback(null)
    try {
      const res = await getElectron().fetchOrders?.()
      const list = normalizeArray(res)
      setOrders(list)
      if (!selectedOrderId && list.length > 0) {
        setSelectedOrderId(getOrderKey(list[0], 0))
      }
      return list
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || '订单记录加载失败' })
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!isActive) return
    refreshOrders()
  }, [isActive])

  useEffect(() => {
    if (orders.length === 0) return
    if (selectedOrderId) return
    setSelectedOrderId(getOrderKey(orders[0], 0))
  }, [orders, selectedOrderId])

  return (
    <div className="card order-shell">
      <div className="section-toolbar">
        <div className="section-title">订单记录</div>
        <div className="order-toolbar">
          <span className="order-count">{loading ? '加载中' : `${orders.length} 条`}</span>
          <button className="btn-small" onClick={() => refreshOrders()}>🔄 刷新</button>
        </div>
      </div>

      {feedback && (
        <div className={`order-feedback order-feedback--${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {orders.length > 0 ? (
        <div className="order-list">
          {orders.map((order, index) => {
            const key = getOrderKey(order, index)
            const status = getOrderStatus(order)
            const isSelected = selectedOrderId ? selectedOrderId === key : index === 0
            const planName = getOrderPlanName(order, plans)
            return (
              <button
                key={key}
                type="button"
                className={`order-item ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedOrderId(key)}
              >
                <div className="order-item__head">
                  <div className="order-item__title">{planName}</div>
                  <span className={`order-status order-status--${status.tone}`}>{status.label}</span>
                </div>
                <div className="order-item__meta">
                  <span>订单号 {getOrderTradeNo(order) || '未知'}</span>
                  <span>{getOrderAmount(order)}</span>
                  {order?.period ? <span>{formatPeriod(order.period)}</span> : null}
                </div>
                <div className="order-item__time">
                  {formatTime(order?.created_at || order?.createdAt)}{order?.paid_at ? ` · 支付于 ${formatTime(order.paid_at || order.paidAt)}` : ''}
                </div>
                {isSelected && (
                  <div className="order-detail">
                    <div className="order-detail__row">
                      <span>套餐</span>
                      <strong>{planName}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>订单号</span>
                      <strong>{getOrderTradeNo(order) || '未知'}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>价格</span>
                      <strong>{getOrderAmount(order)}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>周期</span>
                      <strong>{formatPeriod(order?.period)}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>支付方式</span>
                      <strong>{order?.payment_id ?? order?.paymentId ?? '未知'}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>创建时间</span>
                      <strong>{formatTime(order?.created_at || order?.createdAt)}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>支付时间</span>
                      <strong>{formatTime(order?.paid_at || order?.paidAt)}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>更新时间</span>
                      <strong>{formatTime(order?.updated_at || order?.updatedAt)}</strong>
                    </div>
                    <div className="order-detail__row">
                      <span>原始状态</span>
                      <strong>{order?.status ?? '未知'}</strong>
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="empty">暂无订单记录</div>
      )}

      {selectedOrder && orders.length > 0 && (
        <div className="order-selected">
          <div className="section-title">当前订单</div>
          <div className="order-selected__title">{getOrderPlanName(selectedOrder, plans)}</div>
          <div className="order-selected__meta">
            <span>编号 {getOrderTradeNo(selectedOrder) || '未知'}</span>
            <span>状态 {getOrderStatus(selectedOrder).label}</span>
            <span>金额 {getOrderAmount(selectedOrder)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
