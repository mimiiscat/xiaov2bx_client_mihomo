const { contextBridge, ipcRenderer } = require('electron')

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args)
}

function subscribe(channel, cb) {
  if (typeof cb !== 'function') return () => {}
  const handler = (_, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    try {
      ipcRenderer.removeListener(channel, handler)
    } catch {}
  }
}

const bridge = {
  login: (email, password) => invoke('login', email, password),
  register: (email, password, emailCode, inviteCode) => invoke('register', email, password, emailCode, inviteCode),
  fetchUserInfo: () => invoke('fetch-user-info'),
  fetchSubscribe: () => invoke('fetch-subscribe'),
  fetchPlans: () => invoke('fetch-plans'),
  fetchServers: () => invoke('fetch-servers'),
  reloadServers: () => invoke('reload-servers'),
  fetchStat: () => invoke('fetch-stat'),
  fetchGuestConfig: () => invoke('fetch-guest-config'),
  getAppConfig: () => invoke('get-app-config'),
  toggleProxy: () => invoke('toggle-proxy'),
  setSelectedServer: (name) => invoke('set-selected-server', name),
  setServer: (url) => invoke('set-server', url),
  getStatus: () => invoke('get-status'),
  checkCoupon: (code, planId) => invoke('check-coupon', code, planId),
  fetchPaymentMethods: () => invoke('fetch-payment-methods'),
  createOrder: (payload) => invoke('create-order', payload),
  checkoutOrder: (payload) => invoke('checkout-order', payload),
  getProxyDelay: (name, url, timeout) => invoke('get-proxy-delay', name, url, timeout),
  delayGroup: (groupName, url, timeout) => invoke('delay-group', groupName, url, timeout),
  healthcheckProxyProvider: (providerName) => invoke('healthcheck-proxy-provider', providerName),
  startDelayTestSession: () => invoke('start-delay-test-session'),
  stopDelayTestSession: () => invoke('stop-delay-test-session'),
  getLatencyConfig: () => invoke('get-latency-config'),
  setLatencyConfig: (payload) => invoke('set-latency-config', payload),
  openExternal: (url) => invoke('open-external', url),
  copyText: (text) => invoke('copy-text', text),
  sendEmailVerify: (email, isforget) => invoke('send-email-verify', email, isforget),
  forgetPassword: (email, password, emailCode) => invoke('forget-password', email, password, emailCode),
  onStatusSnapshot: (cb) => subscribe('status-snapshot', cb),
  logout: () => invoke('logout'),
  quit: () => ipcRenderer.send('quit'),
}

contextBridge.exposeInMainWorld('electronAPI', bridge)
contextBridge.exposeInMainWorld('__ELECTRON__', bridge)
