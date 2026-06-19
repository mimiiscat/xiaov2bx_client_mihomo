const appConfig = require('./app.config.json')
const { getArchDir } = require('./src/platform')

function getTargetArchDir() {
  if (process.env.TARGET_ARCH_DIR) return process.env.TARGET_ARCH_DIR
  if (process.env.TARGET === 'win32') return 'win32-x64'
  return getArchDir()
}

module.exports = {
  appId: appConfig.app_id,
  productName: appConfig.product_name,
  copyright: 'Copyright © 2025',
  directories: {
    output: 'dist-electron',
  },
  extraMetadata: {
    version: appConfig.app_version,
    productName: appConfig.product_name,
  },
  extraResources: [
    {
      from: `libs/${getTargetArchDir()}`,
      to: `libs/${getTargetArchDir()}`,
    },
    {
      from: 'libs/geo',
      to: 'libs/geo',
    },
  ],
  files: [
    'src/**/*',
    'package.json',
    'app.config.json',
  ],
  mac: {
    icon: 'res/icon.icns',
    category: 'public.category.internet',
  },
  dmg: {
    contents: [
      { x: 410, y: 150, type: 'link', path: '/Applications' },
      { x: 130, y: 150, type: 'file' },
    ],
  },
  win: {
    icon: 'res/icon.ico',
    target: ['nsis'],
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
}
