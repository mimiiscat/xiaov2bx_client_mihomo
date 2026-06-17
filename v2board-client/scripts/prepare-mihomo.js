#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const zlib = require('zlib')

const ROOT_DIR = path.resolve(__dirname, '..')
const LIBS_DIR = path.join(ROOT_DIR, 'libs')
const MIHOMO_VERSION = 'v1.19.27'

const TARGETS = [
  {
    dir: 'darwin-arm64',
    asset: `mihomo-darwin-arm64-${MIHOMO_VERSION}.gz`,
    output: 'mihomo-darwin-arm64',
  },
  {
    dir: 'darwin-x64',
    asset: `mihomo-darwin-amd64-${MIHOMO_VERSION}.gz`,
    output: 'mihomo-darwin-amd64',
  },
  {
    dir: 'win32-x64',
    asset: `mihomo-windows-amd64-${MIHOMO_VERSION}.zip`,
    output: 'mihomo-windows-amd64.exe',
  },
]

async function downloadBuffer(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'v2board-client' },
  })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText})`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function prepareTarget(target) {
  const targetDir = path.join(LIBS_DIR, target.dir)
  const outputPath = path.join(targetDir, target.output)
  if (fs.existsSync(outputPath)) {
    console.log(`✓ mihomo already exists: ${path.relative(ROOT_DIR, outputPath)}`)
    return
  }

  fs.mkdirSync(targetDir, { recursive: true })
  const url = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/${target.asset}`
  console.log(`Downloading ${target.asset} ...`)
  const archiveBuffer = await downloadBuffer(url)

  if (target.asset.endsWith('.gz')) {
    const rawBuffer = zlib.gunzipSync(archiveBuffer)
    fs.writeFileSync(outputPath, rawBuffer)
    if (process.platform !== 'win32') {
      fs.chmodSync(outputPath, 0o755)
    }
  } else if (target.asset.endsWith('.zip')) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihomo-'))
    const archivePath = path.join(tempDir, target.asset)
    fs.writeFileSync(archivePath, archiveBuffer)

    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`,
      ], { stdio: 'inherit' })
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', tempDir], { stdio: 'inherit' })
    }

    const discovered = findFileRecursive(tempDir, target.output) || findFirstExecutable(tempDir)
    if (!discovered) {
      throw new Error(`Unable to find extracted mihomo binary for ${target.output}`)
    }
    fs.copyFileSync(discovered, outputPath)
    if (process.platform !== 'win32') {
      fs.chmodSync(outputPath, 0o755)
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  } else {
    throw new Error(`Unsupported archive type: ${target.asset}`)
  }
  console.log(`✓ wrote ${path.relative(ROOT_DIR, outputPath)}`)
}

function findFileRecursive(rootDir, fileName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const currentPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFileRecursive(currentPath, fileName)
      if (nested) return nested
      continue
    }
    if (entry.isFile() && entry.name === fileName) return currentPath
  }
  return null
}

function findFirstExecutable(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const currentPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFirstExecutable(currentPath)
      if (nested) return nested
      continue
    }
    if (entry.isFile() && (entry.name.endsWith('.exe') || !entry.name.includes('.'))) {
      return currentPath
    }
  }
  return null
}

async function main() {
  try {
    for (const target of TARGETS) {
      await prepareTarget(target)
    }
  } catch (err) {
    console.error('[prepare-mihomo] Failed:', err.message)
    process.exitCode = 1
  }
}

if (require.main === module) {
  main()
}

module.exports = { main }
