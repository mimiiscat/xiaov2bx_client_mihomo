function normalizeTargetPlatform(value = process.platform) {
  const platform = String(value || '').toLowerCase()
  if (platform === 'mac' || platform === 'darwin' || platform === 'osx') return 'darwin'
  if (platform === 'win' || platform === 'win32' || platform === 'windows') return 'win32'
  return platform || process.platform
}

function getArchDir(platform = process.platform, arch = process.arch) {
  const normalizedPlatform = normalizeTargetPlatform(platform)
  const normalizedArch = String(arch || '').toLowerCase()

  if (normalizedPlatform === 'darwin') {
    return normalizedArch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  }

  if (normalizedPlatform === 'win32') {
    return 'win32-x64'
  }

  return normalizedPlatform
}

function getMihomoBinaryCandidates(platform = process.platform) {
  const normalizedPlatform = normalizeTargetPlatform(platform)

  const shared = ['mihomo']
  if (normalizedPlatform === 'darwin') {
    return [
      ...shared,
      'mihomo-darwin-arm64',
      'mihomo-darwin-amd64',
      'mihomo-darwin-arm64-compatible',
      'mihomo-darwin-amd64-compatible',
    ]
  }

  if (normalizedPlatform === 'win32') {
    return [
      ...shared,
      'mihomo-windows-amd64.exe',
      'mihomo-windows-amd64-compatible',
      'mihomo-windows-amd64-compatible.exe',
      'mihomo.exe',
    ]
  }

  return shared
}

module.exports = {
  getArchDir,
  getMihomoBinaryCandidates,
  normalizeTargetPlatform,
}
