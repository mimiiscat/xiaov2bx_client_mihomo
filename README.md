# v2board-suite

本仓库将两个项目打包在一起：

- **`v2board-api`** — v2Board API 文档站点，基于 [Docsify](https://docsify.js.org) 构建，可直接部署到 GitHub Pages
- **`v2board-client`** — 基于 Electron 33 + React 18 + [mihomo](https://github.com/MetaCubeX/mihomo) 内核的跨平台桌面代理客户端

---

## 项目结构

```
xiaov2bx_client_mihomo/
│
├── v2board-api/                          # 📘 API 文档站点（Docsify）
│   ├── index.html                        #    Docsify 入口 HTML，加载侧边栏/导航/搜索插件
│   ├── _navbar.md                        #    Docsify 顶部导航栏定义
│   ├── _sidebar.md                       #    Docsify 左侧侧边栏目录索引
│   ├── README.md                         #    文档站点说明（接口速查表）
│   ├── .nojekyll                         #    告知 GitHub Pages 跳过 Jekyll 处理
│   │
│   ├── assets/                           #    🎨 静态资源
│   │   └── custom.css                    #        自定义覆盖样式
│   │
│   ├── vendor/                           #    📦 Docsify 运行时依赖
│   │   ├── docsify.min.js                #        Docsify 核心框架（Markdown → SPA）
│   │   ├── search.min.js                 #        全文搜索插件
│   │   ├── theme.css                     #        默认主题样式
│   │   └── github-markdown.css           #        GitHub 风格 Markdown 渲染样式
│   │
│   ├── ─────────── 用户端 API 文档 ───────────
│   │
│   ├── passport.md                       #    登录 · 注册 · 忘记密码 · Token 登录 · 邮箱验证
│   ├── user.md                           #    用户信息 · 修改密码 · 订阅获取 · 流量统计 ·
│   │                                     #    工单 · 知识库 · 服务器列表 · 礼金卡兑换 · Telegram 绑定
│   ├── plan.md                           #    套餐列表查询
│   ├── order.md                          #    订单创建 · 列表 · 详情 · 取消 · 支付方式 · 结账
│   ├── invite.md                         #    邀请码列表 · 详情 · 生成
│   ├── notice.md                         #    系统公告列表
│   ├── ticket.md                         #    工单创建 · 回复 · 关闭 · 撤回
│   ├── guest.md                          #    访客接口：站点配置 · 支付回调通知 · Telegram Webhook
│   ├── client.md                         #    客户端订阅接口（/client/subscribe）
│   │
│   ├── ─────────── 管理端 API 文档 ───────────
│   │
│   ├── admin-config.md                   #    系统配置（站点名、邮件、支付、注册开关等）
│   ├── admin-user.md                     #    用户管理（列表 · 详情 · 封禁 · 充值 · 重置流量等）
│   ├── admin-plan.md                     #    套餐管理（CRUD · 排序 · 上下架）
│   ├── admin-server.md                   #    节点/服务器管理（CRUD · 分组 · 排序 · 下架）
│   ├── admin-order.md                    #    订单管理（列表 · 详情 · 退款 · 手动分配）
│   ├── admin-payment.md                  #    支付方式管理
│   ├── admin-coupon.md                   #    优惠券管理（生成 · 列表 · 删除 · 启用/禁用）
│   ├── admin-giftcard.md                 #    礼品卡管理（生成 · 列表 · 删除）
│   ├── admin-notice.md                   #    公告管理（CRUD · 显示/隐藏）
│   ├── admin-knowledge.md                #    知识库管理（分类 · 文章 CRUD · 排序）
│   ├── admin-ticket.md                   #    工单管理（列表 · 回复 · 关闭）
│   ├── admin-stat.md                     #    数据统计（收入 · 用户排名 · 节点排名 · 订单统计）
│   ├── admin-system.md                   #    系统状态（队列 · 日志 · 系统负载）
│   ├── admin-theme.md                    #    主题配置（获取/保存主题设置）
│   ├── staff.md                          #    员工/子账号管理
│   └── node-backend.md                   #    节点后端交互：订阅下发 · 上报流量/在线用户 · 心跳
│
├── v2board-client/                       # 🖥️ Electron 桌面客户端
│   ├── package.json                      #    项目元信息（v1.0.2） · npm 脚本 · Electron/axios/express 依赖
│   ├── app.config.json                   #    ⭐ 运行时配置（应用名称 · 版本号 · OSS 远程配置地址）
│   ├── electron-builder.config.js        #    electron-builder 打包配置（图标 · DMG/NSIS · 资源包含）
│   ├── build.sh                          #    macOS/Linux 构建入口脚本
│   ├── build.cmd                         #    Windows 构建入口脚本
│   │
│   ├── src/                              #    ⚙️ Electron 主进程
│   │   ├── main.js                       #        核心入口文件，职责包括：
│   │   │                                 #          · BrowserWindow 窗口创建与管理
│   │   │                                 #          · 系统托盘（Tray）图标与右键菜单
│   │   │                                 #          · mihomo 内核进程的启动/停止/重启
│   │   │                                 #          · 本地 Express 服务器（供前端 API 代理调用）
│   │   │                                 #          · OSS 远程配置拉取 · 缓存 · 版本比较 · 更新提示
│   │   │                                 #          · 代理开关控制 · 系统代理设置
│   │   │                                 #          · mihomo API 交互（节点切换 · 延迟测试 · 流量监控）
│   │   │                                 #          · 登录/注册/订阅/订单等 API 转发到后端
│   │   │                                 #          · 剪贴板/外部链接/窗口控制等系统能力
│   │   │
│   │   ├── preload.js                    #        contextBridge 预加载脚本，向渲染进程暴露安全的 IPC API：
│   │   │                                 #          login · register · fetchUserInfo · fetchSubscribe
│   │   │                                 #          fetchPlans · fetchServers · reloadServers
│   │   │                                 #          toggleProxy · setSelectedServer · getStatus
│   │   │                                 #          getProxyDelay · delayGroup · healthcheckProxyProvider
│   │   │                                 #          createOrder · checkoutOrder · checkCoupon
│   │   │                                 #          window-minimize · window-toggle-maximize · window-hide
│   │   │                                 #          openExternal（用系统浏览器打开链接）
│   │   │
│   │   ├── platform.js                   #        平台检测工具：
│   │   │                                 #          · getArchDir() — 返回当前平台架构目录名（darwin-arm64 / darwin-x64 / win32-x64）
│   │   │                                 #          · getMihomoBinaryCandidates() — 按平台返回 mihomo 可执行文件名候选列表
│   │   │                                 #          · normalizeTargetPlatform() — 统一平台名格式
│   │   │
│   │   └── assets/                       #        🎨 托盘图标资源
│   │       ├── iconOn.ico                #            Windows 托盘图标 — 代理开启状态
│   │       ├── iconOn.png / iconOn@2x.png #           macOS 托盘图标 — 代理开启状态（1x / 2x）
│   │       ├── iconOff.ico               #            Windows 托盘图标 — 代理关闭状态
│   │       └── iconOff.png / iconOff@2x.png #         macOS 托盘图标 — 代理关闭状态（1x / 2x）
│   │
│   ├── frontend/                         #    🎨 React 前端（Vite 5 构建，独立 npm 子项目）
│   │   ├── index.html                    #        HTML 入口文件，挂载 #root
│   │   ├── vite.config.js                #        Vite 构建配置：
│   │   │                                 #          · 开发服务器端口 9000
│   │   │                                 #          · 构建输出目录 ../src/dist（供 Electron 加载）
│   │   │                                 #          · base: './'（支持 file:// 协议加载）
│   │   ├── package.json                  #        前端依赖（React 18 · Vite 5 · @vitejs/plugin-react）
│   │   │
│   │   └── src/
│   │       ├── main.jsx                  #        React 18 createRoot 挂载入口
│   │       ├── App.jsx                   #        根组件：负责认证状态管理 · 应用配置加载 ·
│   │       │                             #        OSS 版本更新信息 · 会话恢复 · 窗口最大化状态同步
│   │       ├── styles.css                #        全局样式表（暗色主题 · 卡片布局 · 按钮 · 表单 · 动画）
│   │       │
│   │       ├── components/               #        🧩 UI 组件
│   │       │   ├── AuthPage.jsx          #            登录/注册/忘记密码页面：
│   │       │   │                         #              · 支持邮箱验证码注册
│   │       │   │                         #              · 从 OSS 读取站点配置（是否开启注册/邮箱验证）
│   │       │   │                         #              · 倒计时防重复发送
│   │       │   │
│   │       │   ├── Dashboard.jsx         #            主面板（登录后的主页）：
│   │       │   │                         #              · 管理 tabs 切换（节点/套餐/订单/公告）
│   │       │   │                         #              · 代理开关状态管理
│   │       │   │                         #              · 节点列表 + 延迟数据 + 刷新/测速
│   │       │   │                         #              · 套餐购买流程（选套餐 → 选周期 → 优惠券 → 支付）
│   │       │   │                         #              · 实时流量统计轮询
│   │       │   │                         #              · 节点切换反馈提示
│   │       │   │
│   │       │   ├── DashboardTabs.jsx     #            Tab 导航栏（节点 · 套餐 · 订单 · 公告）
│   │       │   │
│   │       │   ├── DashboardStatusPanel.jsx  #        顶部状态栏：
│   │       │   │                         #              · 用户邮箱显示
│   │       │   │                         #              · 代理开关按钮（带动画状态指示）
│   │       │   │                         #              · 当前选中节点 / 活跃节点显示
│   │       │   │                         #              · 上传/下载 实时速率 + 累计流量
│   │       │   │                         #              · 流量使用百分比进度条
│   │       │   │                         #              · 套餐到期时间
│   │       │   │                         #              · 退出登录按钮
│   │       │   │
│   │       │   ├── DashboardOverviewSection.jsx #    账户概览卡片：
│   │       │   │                         #              · 设备限制 · 账户余额 · 佣金余额 · 当前套餐
│   │       │   │
│   │       │   ├── DashboardPlansSection.jsx    #    套餐列表区：
│   │       │   │                         #              · 套餐卡片展示（名称 · 价格 · 流量 · 周期）
│   │       │   │                         #              · HTML 描述 sanitize 安全渲染
│   │       │   │                         #              · 购买按钮 → 触发 PurchaseModal
│   │       │   │
│   │       │   ├── DashboardNoticeSection.jsx   #    公告列表区（支持 HTML 内容渲染）
│   │       │   │
│   │       │   ├── OrderSection.jsx      #            订单历史列表：
│   │       │   │                         #              · 订单号 · 金额 · 状态 · 时间
│   │       │   │                         #              · 支付按钮（调用系统浏览器打开支付链接）
│   │       │   │
│   │       │   ├── PurchaseModal.jsx     #            购买弹窗：
│   │       │   │                         #              · 周期选择（月付/季付/年付等）
│   │       │   │                         #              · 优惠券输入 + 校验
│   │       │   │                         #              · 支付方式选择
│   │       │   │                         #              · 确认下单 → 返回支付链接 → 点击浏览器打开
│   │       │   │
│   │       │   └── ServerList.jsx        #            节点/服务器列表：
│   │       │                             #              · 节点名称 · 类型标签 · 延迟数值（颜色编码）
│   │       │                             #              · 点击切换节点 · 当前选中高亮
│   │       │                             #              · 🔄 更新节点（重新拉取订阅配置）
│   │       │                             #              · ⚡ 批量测速（所有节点延迟测试）
│   │       │                             #              · 单个节点测速按钮
│   │       │
│   │       ├── services/
│   │       │   └── delay.js              #            🕐 延迟管理服务 DelayManager：
│   │       │                             #              · 调用 mihomo API 测试节点延迟
│   │       │                             #              · 内存缓存（30分钟 TTL）
│   │       │                             #              · 防抖批量更新机制
│   │       │                             #              · 会话生命周期管理（开启/关闭延迟测试会话）
│   │       │                             #              · 默认测试 URL: cp.cloudflare.com/generate_204
│   │       │
│   │       └── utils/
│   │           ├── electron.js           #            Electron IPC 桥接访问器：
│   │           │                         #              从 window.electronAPI 获取主进程暴露的所有 API
│   │           │
│   │           └── appHelpers.js         #            工具函数集：
│   │                                     #              · formatBytes — 字节转可读单位（B/KB/MB/GB/TB）
│   │                                     #              · formatPlanTraffic — 套餐流量格式化（GB）
│   │                                     #              · formatCurrencyCents — 分转元（¥ 显示）
│   │                                     #              · formatLatency — 延迟值格式化（ms/超时/测试中）
│   │                                     #              · latencyColor — 延迟对应颜色（绿/黄/红）
│   │                                     #              · 服务器列表标准化 · 套餐周期提取 · 支付方式处理
│   │
│   ├── libs/                             #    📦 运行时资源（打包时随应用一起分发）
│   │   ├── darwin-arm64/                 #        macOS Apple Silicon (M1/M2/M3) mihomo 内核二进制
│   │   │   └── mihomo-darwin-arm64       #            mihomo 可执行文件（v1.19.27）
│   │   │
│   │   ├── darwin-x64/                   #        macOS Intel 架构（构建时从 GitHub Release 下载）
│   │   │
│   │   ├── win32-x64/                    #        Windows x64 架构（构建时从 GitHub Release 下载）
│   │   │
│   │   ├── geo/                          #        🌍 GeoIP / GeoSite 数据库
│   │   │   ├── geoip.db                  #            IP 地理位置数据库（国内/国外 IP 判断）
│   │   │   └── geosite.db               #            网站分类数据库（分流规则依据）
│   │   │
│   │   └── config/                       #        ⚙️ mihomo 初始配置
│   │       └── config.json               #            日志级别 · API 基础配置 · 余额计算方式
│   │
│   ├── res/                              #    🎨 应用图标（打包用）
│   │   ├── icon.icns                     #        macOS 应用图标
│   │   ├── icon.ico                      #        Windows 应用图标
│   │   └── icon.png                      #        通用图标（Linux / 其他）
│   │
│   └── scripts/                          #    🔧 构建辅助脚本
│       ├── build.js                      #        统一构建入口：
│       │                                 #          · 根据当前平台/传入参数确定构建目标
│       │                                 #          · 步骤：构建前端 → 下载 mihomo 内核 → electron-builder 打包
│       │                                 #          · 支持 platform+arch 显式指定
│       │
│       ├── prepare-mihomo.js             #        mihomo 内核下载脚本：
│       │                                 #          · 从 GitHub Release 下载对应平台的 mihomo 二进制
│       │                                 #          · 解压 .gz / .zip 到对应架构目录
│       │                                 #          · 设置可执行权限（macOS/Linux chmod +x）
│       │                                 #          · 版本固定为 v1.19.27
│       │
│       └── run-electron.js               #        开发模式 Electron 启动器：
│                                         #          · 使用本地安装的 electron 二进制启动主进程
│                                         #          · 透传命令行参数
│                                         #          · 清理 ELECTRON_RUN_AS_NODE 环境变量
│
├── .gitignore                            # Git 忽略规则（node_modules · dist-electron · build 产物等）
└── README.md                             # 本文件
```

---

## 客户端配置

桌面客户端的运行时配置在 `v2board-client/app.config.json`：

```json
{
  "app_name": "Netch加速",              // 应用显示名称
  "client_name": "Netch加速",           // 客户端标识
  "app_version": "1.0.2",               // 当前版本号
  "app_id": "com.v2board.client",       // 应用唯一 ID（macOS bundle / Windows 注册表）
  "product_name": "Netch加速",          // 产品名（安装目录名）
  "window_title": "Netch加速",          // 窗口标题
  "page_title": "Netch加速 客户端",      // 页面标题
  "tray_tooltip": "Netch加速 Client",   // 托盘图标悬停提示
  "remote_config_url": "https://..."    // OSS 远程配置 JSON 地址
}
```

### OSS 远程配置机制

客户端启动时会从 `remote_config_url` 拉取 JSON 配置，该 JSON 下发以下信息：

- `backend_api_url` — 后端 API 地址（所有登录/注册/节点列表/订阅请求的 base URL）
- `version` / `windows_version` / `macos_version` — 最新版本号（按平台区分）
- `download_url` / `windows_download_url` / `macos_download_url` — 安装包下载地址（按平台区分）

当远程版本 > 本地版本时，界面顶部会出现更新提示。拉取成功后会缓存到本地用户目录，退出时自动清除缓存。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + Vite 5 |
| 代理内核 | mihomo v1.19.27 (MetaCubeX) |
| API 文档 | Docsify（Markdown → SPA） |
| HTTP 客户端 | axios |
| 本地服务 | Express |
| 构建工具 | electron-builder |
| 配置解析 | js-yaml |

---

## 平台支持

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | Apple Silicon (arm64) | ✅ 已内置内核 |
| macOS | Intel (x64) | ✅ 构建时下载 |
| Windows | x64 | ✅ 构建时下载 |

---

## 核心功能

- **v2Board 账户管理** — 登录、注册（支持邮箱验证码）、忘记密码、用户信息、套餐到期提醒
- **订阅管理** — 自动拉取订阅节点，支持多协议（SS/Trojan/VMess 等）
- **mihomo 内核** — 高性能代理内核，支持 TUN 模式、系统代理设置
- **智能路由** — GeoIP/GeoSite 分流，国内直连、海外自动选择最优节点
- **流量统计** — 实时显示上传/下载速率、累计流量、使用百分比
- **节点延迟管理** — 基于 mihomo API 的节点延迟测试、批量测速、30分钟缓存
- **套餐购买** — 套餐选择 → 周期 → 优惠券 → 支付 → 浏览器完成支付
- **OSS 下发** — 启动后从 OSS JSON 读取后端地址和版本，统一管理多客户端
- **系统托盘** — 最小化到托盘，右键菜单快速开关代理
- **暗色主题** — 深色 UI 界面
- **自动更新** — 版本比较 + 更新提示 + 下载链接

---

## 快速开始

### 前置条件

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
# 进入客户端目录
cd v2board-client

# 安装所有依赖（自动安装前端依赖）
npm install

# 开发模式（启动 Vite dev server + Electron）
npm run dev

# 构建（根据当前平台自动打包）
npm run build

# macOS（指定架构）
node scripts/build.js mac arm64   # Apple Silicon
node scripts/build.js mac x64     # Intel

# Windows
node scripts/build.js win
# 或直接运行
build.cmd
```

---

## 许可证

MIT
