#!/usr/bin/env node

const { spawn } = require('child_process')
const electronPath = require('electron')

const args = process.argv.slice(2)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env,
  windowsHide: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error('[run-electron] Failed:', err.message)
  process.exit(1)
})
