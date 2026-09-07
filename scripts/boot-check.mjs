/**
 * Стартует ли собранное приложение на самом деле?
 *
 * Юнит-тесты никогда не загружают main.ts, а сборка может быть зелёной при
 * чёрном экране. Здесь готовый бандл поднимается в headless-Chrome, и проверка
 * падает, если сцена не создалась или модуль бросил исключение.
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
  console.error('boot-check: нет dist/ — сначала `npm run build`')
  process.exit(1)
}

const bundle = readdirSync(join(DIST, 'assets')).find((f) => /^index-.*\.js$/.test(f))
if (!bundle) {
  console.error('boot-check: в dist/assets нет index-бандла')
  process.exit(1)
}

const PAGE = `<!doctype html><html><body>
<div id="app"></div><div id="ui"></div>
<script>
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
  }, 2500)
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
  console.log('boot-check: Chrome не найден — пропускаю')
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
    const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? ''
    if (title === 'BOOTED') {
      console.log('boot-check: OK — приложение стартует')
      process.exit(0)
    }
    console.error('boot-check: ПРОВАЛ —', title || 'вердикта нет; страница не выполнилась')
    process.exit(1)
  })
})
