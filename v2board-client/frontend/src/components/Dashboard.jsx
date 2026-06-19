import { useEffect, useRef, useState } from 'react'
import { getElectron } from '../utils/electron'
import {
  normalizeServerList,
  getPlanPeriods,
  normalizePaymentMethods,
  extractTradeNo,
} from '../utils/appHelpers'
import { PurchaseModal } from './PurchaseModal'
import { DashboardOverviewSection } from './DashboardOverviewSection'
import { DashboardPlansSection } from './DashboardPlansSection'
import { DashboardStatusPanel } from './DashboardStatusPanel'
import { DashboardTabs } from './DashboardTabs'
import { DashboardNoticeSection } from './DashboardNoticeSection'
import { OrderSection } from './OrderSection'
import { ServerList } from './ServerList'
import delayManager from '../services/delay'

export function Dashboard({ userInfo, onLogout }) {
  const [activeTab, setActiveTab] = useState('servers')
  const [proxyOn, setProxyOn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [proxyTargetOn, setProxyTargetOn] = useState(null)
  const [plans, setPlans] = useState([])
  const [notices, setNotices] = useState([])
  const [servers, setServers] = useState([])
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
  const [nodeFeedback, setNodeFeedback] = useState(null)
  const [updatingNodes, setUpdatingNodes] = useState(false)
  const [measuringDelays, setMeasuringDelays] = useState(false)
  const [serverLatencies, setServerLatencies] = useState({})
  const [delayGroupName, setDelayGroupName] = useState('')
  const nodeFeedbackTimer = useRef(null)

  const data = userInfo?.data

  useEffect(() => {
    const electron = getElectron()
    Promise.all([electron.getStatus?.(), electron.getLatencyConfig?.()])
      .then(([s, latencyCfg]) => {
        setProxyOn(s?.proxyOn || false)
        setSelectedServer(s?.selectedProxyName || '')
        setActiveServer(s?.activeProxyName || '')
        setDelayGroupName(s?.mainProxyGroup || '🚀 节点选择')
        if (s?.traffic) setTraffic(s.traffic)
        delayManager.configure({
          defaultUrl: latencyCfg?.defaultLatencyTest || s?.defaultLatencyTest,
          defaultTimeout: latencyCfg?.defaultLatencyTimeout || s?.defaultLatencyTimeout,
          defaultGroup: s?.mainProxyGroup || '🚀 节点选择',
        })
      })
      .catch((err) => console.error('[Dashboard] load status failed:', err?.message || err))
  }, [])

  useEffect(() => {
    delayManager.configure({
      defaultGroup: delayGroupName || '🚀 节点选择',
    })
  }, [delayGroupName])

  useEffect(() => {
    const electron = getElectron()
    const unsubscribe = electron.onStatusSnapshot?.((status) => {
      if (!status) return
      if (typeof status.proxyOn === 'boolean') setProxyOn(status.proxyOn)
      if (status.selectedProxyName !== undefined) setSelectedServer(status.selectedProxyName || '')
      if (status.activeProxyName !== undefined) setActiveServer(status.activeProxyName || '')
      if (status.traffic) setTraffic(status.traffic)
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!servers.length || !delayGroupName) return undefined
    const groupName = delayGroupName
    const nextLatencies = {}
    servers.forEach((server) => {
      if (!server?.name) return
      const cached = delayManager.getDelayUpdate(server.name, groupName)
      if (cached) {
        nextLatencies[server.name] = {
          ...cached,
          latency: cached.delay === 1e6 ? null : cached.delay,
          status: cached.delay === -2
            ? 'testing'
            : cached.delay === 0
              ? 'timeout'
              : cached.delay > 1e5
                ? 'error'
                : 'ok',
        }
      }
      delayManager.setListener(server.name, groupName, (update) => {
        setServerLatencies((prev) => ({
          ...prev,
          [server.name]: {
            ...update,
            latency: update.delay === 1e6 ? null : update.delay,
            status: update.delay === -2
              ? 'testing'
              : update.delay === 0
                ? 'timeout'
                : update.delay > 1e5
                  ? 'error'
                  : 'ok',
          },
        }))
      })
    })
    setServerLatencies(nextLatencies)
    return () => {
      servers.forEach((server) => {
        if (server?.name) delayManager.removeListener(server.name, groupName)
      })
    }
  }, [servers, delayGroupName])

  const handleToggle = async () => {
    setMsg('')
    const nextOn = !proxyOn
    setProxyTargetOn(nextOn)
    setProxyOn(nextOn)
    setLoading(true)
    try {
      const result = await getElectron().toggleProxy()
      setProxyOn(result?.on ?? nextOn)
      if (result?.selectedProxyName) setSelectedServer(result.selectedProxyName)
      setActiveServer(result?.activeProxyName || '')
    } catch {
      setProxyOn(!nextOn)
      setMsg('代理切换失败，请稍后重试')
    }
    setLoading(false)
    setProxyTargetOn(null)
  }

  const handleRefresh = async (action, setter) => {
    try {
      const res = await getElectron()[action]()
      if (action === 'reloadServers' && res?.success === false) {
        if (Array.isArray(res?.data)) setter(normalizeServerList(res.data))
        return false
      }
      if (res?.data) {
        const nextData = action === 'fetchServers' || action === 'reloadServers'
          ? normalizeServerList(res.data)
          : res.data
        setter(nextData)
        return true
      }
    } catch (err) {
      console.error(`[Dashboard] ${action} failed:`, err?.message || err)
    }
    return false
  }

  const startServerLatencyCheck = async (list) => {
    const normalized = normalizeServerList(list)
    if (!normalized.length) return null

    const groupName = delayGroupName || '🚀 节点选择'
    const timeout = delayManager.defaultTimeout || 10000
    const names = normalized.map((server) => server?.name).filter(Boolean)

    try {
      await delayManager.checkListDelay(names, groupName, timeout)
    } catch (err) {
      console.error('[Dashboard] delay check failed:', err?.message || err)
    }
    return groupName
  }

  const handleMeasureSingleServer = async (server) => {
    if (!server?.name) return
    try {
      await delayManager.checkDelay(server.name, delayGroupName || '🚀 节点选择', delayManager.defaultTimeout || 10000)
    } catch (err) {
      console.error('[Dashboard] measure single server failed:', err?.message || err)
    }
  }

  const handleMeasureDelays = async () => {
    setMeasuringDelays(true)
    try {
      await startServerLatencyCheck(servers)
    } finally {
      setMeasuringDelays(false)
    }
  }

  const handleUpdateServers = async () => {
    if (nodeFeedbackTimer.current) {
      clearTimeout(nodeFeedbackTimer.current)
      nodeFeedbackTimer.current = null
    }
    setNodeFeedback(null)
    setServers([])
    setServerLatencies({})
    delayManager.clearGroup(delayGroupName || '🚀 节点选择')
    setUpdatingNodes(true)
    const ok = await handleRefresh('reloadServers', setServers)
    setUpdatingNodes(false)
    if (ok) {
      setNodeFeedback({ type: 'success', text: '更新成功' })
      nodeFeedbackTimer.current = setTimeout(() => {
        setNodeFeedback(null)
        nodeFeedbackTimer.current = null
      }, 3000)
    } else {
      setNodeFeedback({ type: 'error', text: '获取失败' })
    }
  }

  useEffect(() => () => {
    if (nodeFeedbackTimer.current) clearTimeout(nodeFeedbackTimer.current)
  }, [])

  useEffect(() => {
    if (!data) return
    handleRefresh('fetchPlans', setPlans)
    handleRefresh('fetchNotices', setNotices)
    handleRefresh('fetchServers', setServers)
    handleRefresh('fetchSubscribe', setSubData)
  }, [])

  useEffect(() => {
    if (activeTab === 'plans') {
      handleRefresh('fetchPlans', setPlans)
    }
    if (activeTab === 'notices') {
      handleRefresh('fetchNotices', setNotices)
    }
    if (activeTab === 'servers') {
      handleRefresh('fetchServers', setServers)
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

  const subscribeTrafficUsed = (Number(subData?.u || 0) + Number(subData?.d || 0))
  const userTrafficUsed = (Number(data?.u || 0) + Number(data?.d || 0))
  const trafficUsed = subscribeTrafficUsed > 0 ? subscribeTrafficUsed : userTrafficUsed
  const trafficTotal = Number(subData?.transfer_enable || data?.transfer_enable || 0)
  const percent = trafficTotal > 0 ? Math.round((trafficUsed / trafficTotal) * 100) : 0
  const sessionTraffic = (traffic.uploadTotal || 0) + (traffic.downloadTotal || 0)
  const expiredAt = (() => {
    const value = data?.expired_at
    if (value === null || value === undefined || value === '' || value === '—' || value === '--') return '永久'
    const date = new Date(Number(value) * 1000)
    if (Number.isNaN(date.getTime())) return '永久'
    return date.toLocaleDateString('zh-CN')
  })()

  return (
    <div>
      <DashboardStatusPanel
        data={data}
        expiredAt={expiredAt}
        proxyOn={proxyOn}
        loading={loading}
        proxyTargetOn={proxyTargetOn}
        selectedServer={selectedServer}
        activeServer={activeServer}
        msg={msg}
        traffic={traffic}
        trafficTotal={trafficTotal}
        trafficUsed={trafficUsed}
        percent={percent}
        sessionTraffic={sessionTraffic}
        onLogout={onLogout}
        onToggle={handleToggle}
      />

      <DashboardTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <DashboardOverviewSection data={data} plans={plans} />
      )}

      {activeTab === 'notices' && (
        <DashboardNoticeSection notices={notices} />
      )}

      {activeTab === 'plans' && (
        <DashboardPlansSection
          plans={plans}
          onRefreshPlans={() => handleRefresh('fetchPlans', setPlans)}
          onOpenPurchase={openPurchase}
        />
      )}

      {activeTab === 'orders' && (
        <OrderSection isActive={activeTab === 'orders'} plans={plans} />
      )}

      {activeTab === 'servers' && (
        <ServerList
          servers={servers}
          selectedServer={selectedServer}
          serverLatencies={serverLatencies}
          onSelectServer={handleSelectServer}
          onRefreshServers={handleUpdateServers}
          onMeasureDelays={handleMeasureDelays}
          onMeasureServerDelay={handleMeasureSingleServer}
          updatingNodes={updatingNodes}
          measuringDelays={measuringDelays}
          nodeFeedback={nodeFeedback}
        />
      )}

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
    </div>
  )
}
