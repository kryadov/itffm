// Real-time headless screenshot via CDP, no --virtual-time-budget.
// Usage: node shot-cdp.mjs <distDir> <outPng> [waitMs] [clickScript]
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, join, resolve } from 'node:path'

const DIST = resolve(process.argv[2])
const OUT = resolve(process.argv[3])
const WAIT_MS = Number(process.argv[4] ?? 1800)
// JS run inside the page after load, e.g. to click through the place picker.
const CLICK_SCRIPT =
  process.argv[5] ??
  `
  var poll = setInterval(() => {
    var demo = document.querySelector('#place-picker #place-demo')
    if (demo) { demo.click(); clearInterval(poll) }
  }, 100)
`

const PORT = 4501
const CDP_PORT = 9333
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' }

const server = createServer(async (req, res) => {
  let url = (req.url ?? '/').split('?')[0]
  if (url === '/') url = '/index.html'
  try {
    const body = await readFile(join(DIST, url))
    res.writeHead(200, { 'Content-Type': TYPES[extname(url)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p))

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForCdp() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/version`)
      if (res.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error('CDP never came up')
}

server.listen(PORT, async () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--window-size=1200,700',
    `--remote-debugging-port=${CDP_PORT}`,
  ])

  try {
    await waitForCdp()
    const created = await fetch(`http://localhost:${CDP_PORT}/json/new?http://localhost:${PORT}/index.html`, {
      method: 'PUT',
    }).then((r) => r.json())
    const ws = new WebSocket(created.webSocketDebuggerUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    })
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const thisId = ++id
        pending.set(thisId, resolve)
        ws.send(JSON.stringify({ id: thisId, method, params }))
      })

    await new Promise((r) => {
      if (ws.readyState === 1) r()
      else ws.addEventListener('open', r, { once: true })
    })

    await send('Page.enable')
    await send('Runtime.enable')
    // Real wall-clock wait: no virtual time, no frame-count trick — just let
    // the page run exactly as long as a real visitor's browser would need.
    await sleep(WAIT_MS / 2)
    await send('Runtime.evaluate', { expression: CLICK_SCRIPT })
    await sleep(WAIT_MS / 2)

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(OUT, Buffer.from(shot.result.data, 'base64'))
    console.log('saved', OUT)
    ws.close()
  } finally {
    chrome.kill()
    server.close()
  }
})
