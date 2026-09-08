/**
 * Does the built app actually start?
 *
 * Unit tests never load main.ts, and a build can be green while the screen is
 * black. Here the real bundle is served to a headless Chrome, and the check
 * fails if the scene was never created or the module threw.
 *
 * Usage: npm run build && npm run boot-check
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, join } from 'node:path'

const DIST = 'dist'
const PORT = 4321
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.yaml': 'text/yaml; charset=utf-8',
}

if (!existsSync(DIST)) {
  console.error('boot-check: no dist/ — run `npm run build` first')
  process.exit(1)
}

const bundle = readdirSync(join(DIST, 'assets')).find((f) => /^index-.*\.js$/.test(f))
if (!bundle) {
  console.error('boot-check: no index bundle in dist/assets')
  process.exit(1)
}

const PAGE = `<!doctype html><html><body>
<div id="app"></div><div id="ui"></div>
<script>
  // Tell the app it is under boot-check: it renders one frame and stops, so
  // the headless run's virtual-time budget can settle and --dump-dom returns.
  window.__BOOTCHECK = 1
  window.__err = ''
  addEventListener('error', (e) => { window.__err = String(e.message || e.error) })
  addEventListener('unhandledrejection', (e) => { window.__err = String(e.reason) })
</script>
<script type="module" src="./assets/${bundle}"></script>
<script>
  setTimeout(() => {
    var canvas = document.querySelector('#app canvas')
    document.title = canvas && window.__READY
      ? 'BOOTED'
      : 'DEAD canvas=' + !!canvas + ' ready=' + !!window.__READY + ' err=' + window.__err
  }, 4000)
</script></body></html>`

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/boot.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(PAGE)
  }
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
  '/usr/bin/chromium',
].find((p) => existsSync(p))

if (!CHROME) {
  console.log('boot-check: no Chrome found — skipping')
  process.exit(0)
}

server.listen(PORT, () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--virtual-time-budget=9000',
    '--dump-dom',
    `http://localhost:${PORT}/boot.html`,
  ])
  let dom = ''
  chrome.stdout.on('data', (d) => (dom += d))
  chrome.on('close', () => {
    server.close()
    // Read the title, not the body: the page's own source contains the words.
    const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? ''
    if (title === 'BOOTED') {
      console.log('boot-check: OK — the app starts')
      process.exit(0)
    }
    console.error('boot-check: FAILED —', title || 'no verdict; the page never ran')
    process.exit(1)
  })
})
