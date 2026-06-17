// Electron IPC bridge for renderer process
// When running in Electron, these map to the main process handlers
window.electronAPI = {
  login: (email, password) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.login(email, password)
    return Promise.resolve({ success: false, error: 'Not in Electron' })
  },
  register: (email, password, emailCode, inviteCode) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.register(email, password, emailCode, inviteCode)
    return Promise.resolve({ success: false, error: 'Not in Electron' })
  },
  fetchUserInfo: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchUserInfo()
    return Promise.resolve(null)
  },
  fetchSubscribe: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchSubscribe()
    return Promise.resolve(null)
  },
  fetchPlans: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchPlans()
    return Promise.resolve(null)
  },
  fetchServers: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchServers()
    return Promise.resolve(null)
  },
  fetchServerDelays: (names, testUrl, timeout, activateBeforeTest = false) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchServerDelays(names, testUrl, timeout, activateBeforeTest)
    return Promise.resolve({})
  },
  fetchStat: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchStat()
    return Promise.resolve(null)
  },
  fetchGuestConfig: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchGuestConfig()
    return Promise.resolve(null)
  },
  getAppConfig: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.getAppConfig()
    return Promise.resolve({})
  },
  toggleProxy: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.toggleProxy()
    return Promise.resolve({ on: false })
  },
  setSelectedServer: (name) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.setSelectedServer(name)
    return Promise.resolve({ success: false })
  },
  setServer: (url) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.setServer(url)
    return Promise.resolve({ success: false })
  },
  checkCoupon: (code, planId) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.checkCoupon(code, planId)
    return Promise.resolve({ success: false })
  },
  fetchPaymentMethods: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.fetchPaymentMethods()
    return Promise.resolve({ data: [] })
  },
  createOrder: (payload) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.createOrder(payload)
    return Promise.resolve({ success: false })
  },
  checkoutOrder: (payload) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.checkoutOrder(payload)
    return Promise.resolve({ success: false })
  },
  openExternal: (url) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.openExternal(url)
    return Promise.resolve({ success: false })
  },
  copyText: (text) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.copyText(text)
    return Promise.resolve({ success: false })
  },
  sendEmailVerify: (email, isforget) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.sendEmailVerify(email, isforget)
    return Promise.resolve({ success: false })
  },
  forgetPassword: (email, password, emailCode) => {
    if (window.__ELECTRON__) return window.__ELECTRON__.forgetPassword(email, password, emailCode)
    return Promise.resolve({ success: false })
  },
  getStatus: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.getStatus()
    return Promise.resolve({ proxyOn: false })
  },
  onProxyStatus: (cb) => {
    if (window.__ELECTRON__) {
      window.__ELECTRON__.onProxyStatus(cb)
    }
  },
  onTraffic: (cb) => {
    if (window.__ELECTRON__) {
      window.__ELECTRON__.onTraffic(cb)
    }
  },
  logout: () => {
    if (window.__ELECTRON__) return window.__ELECTRON__.logout()
    return Promise.resolve({ success: true })
  },
  quit: () => {
    if (window.__ELECTRON__) window.__ELECTRON__.quit()
  },
}
