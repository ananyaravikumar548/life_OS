import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const commands = [
  [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), [path.join(root, 'server', 'index.ts')]],
  [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), []],
]
const children = commands.map(([script, args]) => spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', env: process.env }))
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}
for (const child of children) {
  child.on('error', (error) => { console.error(error.message); stop(1) })
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1) })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
