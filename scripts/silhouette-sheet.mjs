/**
 * A local "look at it" tool, not a CI check — deliberately not wired into
 * `npm test`. This project's own convention keeps pixel rendering out of
 * automated CI (see `.github/workflows/deploy.yml`: only `npm test` and
 * `npm run build` run there, never `boot-check`) because a screenshot's
 * exact pixels drift across GPUs/drivers in a way a real test suite must
 * not depend on. What this catches instead is the class of bug the tests
 * already missed twice on this project — chimeric proportions, a sideways
 * stipe, a black lid seen from below (CLAUDE.md's Conventions) — by putting
 * every species' silhouette on one sheet a human (or Claude) can scan in one
 * look, instead of needing one deliberate screenshot per species to catch
 * the next one.
 *
 * Usage: node scripts/silhouette-sheet.mjs [outPng]
 */
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(process.argv[2] ?? 'scripts/.silhouette-sheet.png')
const VITE_PORT = 4600
const CDP_PORT = 9342

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p))

if (!CHROME) {
  console.log('silhouette-sheet: no Chrome found — skipping')
  process.exit(0)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForHttp(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await sleep(150)
  }
  throw new Error(`never came up: ${url}`)
}

const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--strictPort'],
  { cwd: ROOT },
)
let viteErr = ''
vite.stderr.on('data', (d) => (viteErr += d))

let chrome
try {
  await waitForHttp(`http://localhost:${VITE_PORT}/scripts/silhouette-sheet.html`)

  chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--window-size=1300,1800',
    `--remote-debugging-port=${CDP_PORT}`,
  ])

  await waitForHttp(`http://localhost:${CDP_PORT}/json/version`)
  const created = await fetch(
    `http://localhost:${CDP_PORT}/json/new?http://localhost:${VITE_PORT}/scripts/silhouette-sheet.html`,
    { method: 'PUT' },
  ).then((r) => r.json())
  const ws = new WebSocket(created.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const consoleErrors = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    }
  })
  const send = (method, params = {}) =>
    new Promise((r) => {
      const thisId = ++id
      pending.set(thisId, r)
      ws.send(JSON.stringify({ id: thisId, method, params }))
    })

  await new Promise((r) => {
    if (ws.readyState === 1) r()
    else ws.addEventListener('open', r, { once: true })
  })
  await send('Page.enable')
  await send('Runtime.enable')

  let ready = false
  for (let i = 0; i < 100; i++) {
    const title = await send('Runtime.evaluate', { expression: 'document.title' })
    if (title.result.result.value === 'SHEET_READY') {
      ready = true
      break
    }
    await sleep(200)
  }
  if (!ready) {
    console.error('silhouette-sheet: sheet never finished rendering.', JSON.stringify(consoleErrors))
    process.exitCode = 1
  } else {
    const rect = await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return JSON.stringify({width: r.width, height: r.height}) })()`,
    })
    const { width, height } = JSON.parse(rect.result.result.value)
    await send('Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 1, mobile: false,
    })
    await sleep(100)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(OUT, Buffer.from(shot.result.data, 'base64'))
    console.log('silhouette-sheet: saved', OUT)
    if (consoleErrors.length) console.error('silhouette-sheet: page errors:', JSON.stringify(consoleErrors))
  }
  ws.close()
} finally {
  chrome?.kill()
  vite.kill()
}
