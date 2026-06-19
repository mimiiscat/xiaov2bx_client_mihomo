#!/usr/bin/env node

const path = require('path')
const { spawnSync } = require('child_process')
const { main: prepareMihomo } = require('./prepare-mihomo')
const { getArchDir, normalizeTargetPlatform } = require('../src/platform')

const ROOT_DIR = path.resolve(__dirname, '..')

function run(command, args, env = {}) {
  const isWindows = process.platform === 'win32'
  const execCommand = isWindows && (command === 'npm.cmd' || command === 'npx.cmd')
    ? 'cmd.exe'
    : command
  const execArgs = isWindows && (command === 'npm.cmd' || command === 'npx.cmd')
    ? ['/d', '/s', '/c', [command, ...args].map((part) => {
        const value = String(part)
        return /\s|"/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
      }).join(' ')]
    : args

  const result = spawnSync(execCommand, execArgs, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function normalizeTarget(target) {
  const value = normalizeTargetPlatform(target)
  if (value === 'win32') return 'win'
  if (value === 'darwin') return 'mac'
  if (process.platform === 'win32') return 'win'
  return 'mac'
}

function normalizeArch(target, arch) {
  const value = String(arch || '').toLowerCase()
  if (value === 'arm64' || value === 'aarch64') return 'arm64'
  if (value === 'x64' || value === 'amd64') return 'x64'
  if (target === 'win') return 'x64'
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

async function main() {
  const target = normalizeTarget(process.argv[2])
  const arch = normalizeArch(target, process.argv[3])
  const targetArchDir = target === 'win'
    ? getArchDir('win32', 'x64')
    : getArchDir('darwin', arch)

  await prepareMihomo()
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:frontend'])

  const electronArgs = ['electron-builder', '--config', 'electron-builder.config.js']
  if (target === 'win') {
    electronArgs.push('--win', '--x64')
  } else {
    electronArgs.push('--mac', arch === 'arm64' ? '--arm64' : '--x64')
  }

  run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    electronArgs,
    {
      TARGET: target === 'win' ? 'win32' : 'darwin',
      TARGET_ARCH_DIR: targetArchDir,
    },
  )
}

main().catch((err) => {
  console.error('[build] Failed:', err.message)
  process.exitCode = 1
})
