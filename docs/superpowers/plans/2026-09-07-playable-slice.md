# План 1: играбельный срез

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Статус: выполнен.** Все 17 задач сделаны, выпущено как `v0.2.0`, живёт на
https://kryadov.github.io/itffm/ . Отклонения от плана, найденные осмотром
глазами, описаны в разделе 0 спеки и в сообщениях коммитов. Следующий план —
`2026-09-08-real-geography.md`.

**Goal:** Довести пустой репозиторий до играбельной сборки на GitHub Pages: игрок ходит от первого лица по процедурному лесу, находит грибы, выросшие по экологическим правилам, рассматривает их в руках и собирает в личную энциклопедию.

**Architecture:** Чистые тестируемые модули (`util`, `mushroom`, `species`, `ecology`, `terrain`) не знают ни о сцене, ни о сети; `world`, `game` и `ui` собирают из них рантайм. Грибы — процедурные меши из параметров вида, лес — процедурный (реальные OSM+DEM данные придут во втором плане и заменят только `world/terrain`, не тронув остальное).

**Tech Stack:** TypeScript 5.6, Vite 5.4, Three.js 0.169, Vitest 2.1, yaml 2.5, Node 22. Без бэкенда, без фреймворков UI.

**Spec:** `docs/superpowers/specs/2026-09-07-mushroom-game-design.md`

## Global Constraints

- Node 22, npm. Зависимости рантайма только `three` и `yaml` — больше ничего не добавлять без отдельного решения.
- `tsconfig`: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noEmit: true`.
- `vite.config.ts` — `base: './'` (Pages отдаёт проект по пути `/<repo>/`, относительная база обязательна).
- Тесты лежат в `test/`, зеркаля структуру `src/`. Имя файла — `*.test.ts`.
- **Язык:** весь код — на английском: идентификаторы, комментарии, сообщения об
  ошибках, названия тестов. Документы, спеки и сообщения коммитов — на русском.
  Строки, видимые игроку, — данные, и живут в `src/i18n/` на обоих языках.
  Примеры кода ниже по тексту плана написаны с русскими комментариями; при
  реализации они переводятся на английский.
- Любая генерация (грибы, деревья, спавн, рельеф) **детерминирована по seed**: один seed — одна и та же геометрия и раскладка. Это проверяется тестом в каждой задаче, где есть генерация. Никаких вызовов `Math.random` в `src/` — только `mulberry32` из `util/rng`.
- Единицы сцены — метры. Данные вида хранят миллиметры; перевод только в `mushroom/build.ts`.
- Модули `util`, `species`, `mushroom`, `ecology`, `terrain` не импортируют ничего из `game`, `ui`, `world` и не обращаются к сети.
- Языки интерфейса: RU и EN. Ни одной русской или английской строки, видимой игроку, не хардкодить вне `src/i18n/` (вводится в задаче 17; до неё UI-строк почти нет, и они переносятся туда же).
- Коммит после каждой задачи. Сообщения на русском, префиксы `feat:`, `test:`, `chore:`, `docs:`, `fix:`.
- Каждый коммит завершается строками:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015tkvaDV65oXPfhv7rAh47Y
  ```
- **Дисклеймер:** игра не является средством определения грибов в реальной жизни. Появляется при первом запуске и постоянно в энциклопедии (задача 17).

## Карта файлов

| Файл | Ответственность |
|---|---|
| `src/util/rng.ts` | Детерминированный PRNG, хэш строки, выбор из диапазона |
| `src/util/noise.ts` | Фрактальный 2D-шум для рельефа и разброса |
| `src/mushroom/profile.ts` | Форма шляпки: сечение для тела вращения |
| `src/mushroom/build.ts` | Морфология + seed → `THREE.Group` |
| `src/species/schema.ts` | Типы вида и валидация |
| `src/species/load.ts` | Загрузка `data/species/*.yaml` в память |
| `src/terrain/provider.ts` | Интерфейс `ElevationProvider` |
| `src/terrain/procedural.ts` | Процедурный рельеф по seed |
| `src/world/ground.ts` | Меш земли из провайдера высот |
| `src/world/trees.ts` | Инстансированные деревья, породы по региону |
| `src/ecology/sites.ts` | Точки-кандидаты с биомом, хозяином, влажностью |
| `src/ecology/spawn.ts` | Отбор вида для точки → раскладка грибов |
| `src/game/player.ts` | Чистая математика движения игрока |
| `src/game/controls.ts` | Клавиатура, мышь, pointer lock → `Input` |
| `src/game/pick.ts` | Прицел, подбор, корзина |
| `src/game/scene.ts` | Сборка сцены, свет, цикл кадров |
| `src/ui/hud.ts` | Прицел, подсказка, счётчик корзины |
| `src/ui/inspect.ts` | Режим осмотра гриба |
| `src/ui/encyclopedia.ts` | Сетка видов и карточка |
| `src/save/store.ts` | IndexedDB: открытые виды, находки, настройки |
| `src/i18n/i18n.ts` | Строки RU/EN |
| `src/main.ts` | Точка входа |
| `data/species/*.yaml` | Источник правды по видам |
| `scripts/boot-check.mjs` | Сборка стартует в headless-браузере |

---

### Task 1: Каркас проекта, детерминированный RNG и публикация на Pages

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.github/workflows/deploy.yml`, `.github/workflows/release.yml`, `scripts/boot-check.mjs`, `public/favicon.svg`, `src/main.ts`, `src/util/rng.ts`
- Test: `test/util/rng.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `mulberry32(seed: number): () => number`, `hashString(s: string): number`, `randRange(rng: () => number, range: [number, number]): number`, `pickWeighted<T>(rng: () => number, items: T[], weight: (t: T) => number): T`

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "itffm",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "boot-check": "node scripts/boot-check.mjs"
  },
  "dependencies": {
    "three": "^0.169.0",
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "@types/three": "^0.169.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Затем: `npm install`

- [ ] **Step 2: Создать `tsconfig.json` и `vite.config.ts`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"],
    "lib": ["ES2021", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "test"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  // Pages отдаёт проект по пути /<repo>/, поэтому база относительная.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: { globals: true, environment: 'node' },
})
```

- [ ] **Step 3: Написать падающий тест на RNG**

`test/util/rng.test.ts`:

```ts
import { mulberry32, hashString, randRange, pickWeighted } from '../../src/util/rng'

describe('mulberry32', () => {
  it('один seed даёт одну и ту же последовательность', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('разные seed расходятся', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })

  it('значения лежат в [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashString', () => {
  it('стабилен для одной строки', () => {
    expect(hashString('betula')).toBe(hashString('betula'))
  })

  it('различает строки', () => {
    expect(hashString('betula')).not.toBe(hashString('picea'))
  })
})

describe('randRange', () => {
  it('не выходит за границы', () => {
    const r = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const v = randRange(r, [80, 200])
      expect(v).toBeGreaterThanOrEqual(80)
      expect(v).toBeLessThanOrEqual(200)
    }
  })
})

describe('pickWeighted', () => {
  it('никогда не выбирает вариант с нулевым весом', () => {
    const r = mulberry32(11)
    const items = ['да', 'нет']
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(r, items, (t) => (t === 'да' ? 1 : 0))).toBe('да')
    }
  })

  it('возвращает undefined, когда все веса нулевые', () => {
    expect(pickWeighted(mulberry32(1), ['a', 'b'], () => 0)).toBeUndefined()
  })
})
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../../src/util/rng"`

- [ ] **Step 5: Реализовать `src/util/rng.ts`**

```ts
/**
 * Детерминированный PRNG (mulberry32). Всё, что генерируется в игре — грибы,
 * деревья, рельеф, раскладка — идёт отсюда, а не из Math.random: одинаковый
 * seed обязан давать одинаковый лес в любом браузере и после перезагрузки.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a. Нужен, чтобы получать seed из строк: id вида, названия места. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function randRange(rng: () => number, [min, max]: [number, number]): number {
  return min + rng() * (max - min)
}

/** Взвешенный выбор. undefined, если суммарный вес равен нулю. */
export function pickWeighted<T>(
  rng: () => number,
  items: readonly T[],
  weight: (item: T) => number,
): T | undefined {
  let total = 0
  for (const it of items) total += Math.max(0, weight(it))
  if (total <= 0) return undefined
  let r = rng() * total
  for (const it of items) {
    r -= Math.max(0, weight(it))
    if (r <= 0) return it
  }
  return items[items.length - 1]
}
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS, 7 тестов

- [ ] **Step 7: Создать `index.html`, `public/favicon.svg` и `src/main.ts`**

`index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <title>itffm</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #10140f; }
      #app { position: fixed; inset: 0; }
      #ui { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; color: #eee; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M16 4C9 4 4 10 4 15c0 2 2 3 4 3h16c2 0 4-1 4-3 0-5-5-11-12-11z" fill="#c0392b"/>
  <circle cx="11" cy="12" r="2" fill="#fdf6e3"/><circle cx="20" cy="10" r="2" fill="#fdf6e3"/>
  <path d="M13 18h6l-1 9a2 2 0 0 1-4 0z" fill="#f0e6d2"/>
</svg>
```

`src/main.ts`:

```ts
import * as THREE from 'three'

declare global {
  // boot-check ждёт этот флаг: он выставляется только если модуль дошёл до конца.
  interface Window { __READY?: boolean }
}

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x8fb08a)
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 500)
camera.position.set(0, 0.4, 0.6)
camera.lookAt(0, 0.15, 0)

scene.add(new THREE.HemisphereLight(0xcfe3d0, 0x3b3327, 2))

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))

window.__READY = true
```

- [ ] **Step 8: Создать `scripts/boot-check.mjs`**

```js
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
```

- [ ] **Step 9: Проверить сборку и boot-check**

Run: `npm run build && npm run boot-check`
Expected: сборка без ошибок, затем `boot-check: OK — приложение стартует`

- [ ] **Step 10: Создать `.github/workflows/deploy.yml` и `release.yml`**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

# Собирает и публикует приложение на GitHub Pages при каждом пуше в main.
# Разовая настройка: Settings → Pages → Source: "GitHub Actions".
on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

`.github/workflows/release.yml`:

```yaml
name: Release

# Релиз при пуше тега версии: git tag v0.2.0 && git push --tags
on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: softprops/action-gh-release@v3
        with:
          generate_release_notes: true
```

- [ ] **Step 11: Закоммитить**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html public src test scripts .github
git commit -m "chore: каркас проекта, детерминированный RNG, публикация на Pages"
```

- [ ] **Step 12: Завести ветку main и включить Pages**

Репозиторий сейчас на `master`, а workflow слушает `main`.

```bash
git branch -M main
git push -u origin main
```

Затем разово в GitHub: **Settings → Pages → Source: GitHub Actions**. После первого зелёного прогона сайт живёт по адресу `https://<user>.github.io/itffm/` и показывает пустую зелёную сцену. Дальше каждая задача видна там же.

---

### Task 2: Профиль шляпки

**Files:**
- Create: `src/mushroom/profile.ts`
- Test: `test/mushroom/profile.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `type CapShape`, `interface ProfilePoint { r: number; y: number }`, `capSurface(shape: CapShape, segments: number): ProfilePoint[]`, `capCrossSection(shape: CapShape, ageShape: CapShape, age: number, capRadius: number, stipeRadius: number, segments?: number): ProfilePoint[]`

Форма шляпки задаётся нормированной функцией высоты `y(u)`, где `u` идёт от 0 в центре до 1 на краю, а `y` — доля радиуса. Молодой и зрелый профили интерполируются по `age`. `capCrossSection` замыкает контур: верхняя поверхность, затем низ обратно к ножке — одно тело вращения даёт цельную шляпку.

- [ ] **Step 1: Написать падающий тест**

`test/mushroom/profile.test.ts`:

```ts
import { capSurface, capCrossSection } from '../../src/mushroom/profile'

describe('capSurface', () => {
  it('возвращает запрошенное число точек, от центра к краю', () => {
    const p = capSurface('convex', 16)
    expect(p).toHaveLength(17)
    expect(p[0].r).toBe(0)
    expect(p[16].r).toBeCloseTo(1)
  })

  it('у выпуклой шляпки центр выше края', () => {
    const p = capSurface('convex', 16)
    expect(p[0].y).toBeGreaterThan(p[16].y)
  })

  it('у воронковидной шляпки центр ниже края', () => {
    const p = capSurface('funnel', 16)
    expect(p[0].y).toBeLessThan(p[16].y)
  })

  it('коническая выше выпуклой в центре', () => {
    expect(capSurface('conical', 16)[0].y).toBeGreaterThan(capSurface('convex', 16)[0].y)
  })

  it('плоская почти плоская', () => {
    const p = capSurface('flat', 16)
    expect(Math.abs(p[0].y - p[16].y)).toBeLessThan(0.2)
  })
})

describe('capCrossSection', () => {
  it('замкнут: начинается и заканчивается на оси или у ножки', () => {
    const s = capCrossSection('convex', 'flat', 0.5, 0.05, 0.008)
    expect(s[0].r).toBe(0)
    expect(s[s.length - 1].r).toBeCloseTo(0.008)
  })

  it('нижняя поверхность лежит не выше верхней', () => {
    const s = capCrossSection('convex', 'flat', 0.5, 0.05, 0.008)
    const top = s.filter((p) => p.r <= 0.05)
    expect(Math.min(...top.map((p) => p.y))).toBeLessThan(Math.max(...top.map((p) => p.y)))
  })

  it('масштабируется радиусом шляпки', () => {
    const small = capCrossSection('convex', 'flat', 0, 0.02, 0.004)
    const big = capCrossSection('convex', 'flat', 0, 0.08, 0.004)
    expect(Math.max(...big.map((p) => p.r))).toBeGreaterThan(Math.max(...small.map((p) => p.r)))
  })

  it('возраст меняет форму', () => {
    const young = capCrossSection('hemispherical', 'flat', 0, 0.05, 0.008)
    const old = capCrossSection('hemispherical', 'flat', 1, 0.05, 0.008)
    expect(Math.max(...young.map((p) => p.y))).toBeGreaterThan(Math.max(...old.map((p) => p.y)))
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/mushroom/profile.ts`**

```ts
export type CapShape =
  | 'hemispherical' | 'convex' | 'flat' | 'depressed'
  | 'funnel' | 'conical' | 'ovoid'

export interface ProfilePoint {
  /** Радиус в долях радиуса шляпки (в capSurface) или в метрах (в capCrossSection). */
  r: number
  /** Высота там же. */
  y: number
}

/**
 * Высота верхней поверхности шляпки в долях радиуса, u = 0 в центре, 1 на краю.
 * Формы подобраны так, чтобы читались силуэтом: именно по силуэту грибник
 * узнаёт гриб за десять шагов, а не по цвету пластинок.
 */
const HEIGHT: Record<CapShape, (u: number) => number> = {
  hemispherical: (u) => Math.sqrt(Math.max(0, 1 - u * u)),
  ovoid: (u) => 1.35 * Math.sqrt(Math.max(0, 1 - u * u)),
  conical: (u) => 1.1 * (1 - u),
  convex: (u) => 0.55 * Math.pow(Math.max(0, 1 - u * u), 0.7),
  flat: (u) => 0.12 * (1 - u * u),
  depressed: (u) => 0.14 * (1 - u * u) - 0.3 * Math.exp(-(u * u) / 0.06),
  funnel: (u) => 0.75 * u * u - 0.45,
}

export function capSurface(shape: CapShape, segments: number): ProfilePoint[] {
  const f = HEIGHT[shape]
  const pts: ProfilePoint[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    pts.push({ r: u, y: f(u) })
  }
  return pts
}

/**
 * Замкнутое сечение шляпки в метрах: сверху от центра к краю, затем снизу
 * обратно к ножке. Одно тело вращения по нему даёт цельную шляпку с изнанкой.
 *
 * @param age 0 — молодая форма, 1 — зрелая; между ними линейная интерполяция
 */
export function capCrossSection(
  shape: CapShape,
  ageShape: CapShape,
  age: number,
  capRadius: number,
  stipeRadius: number,
  segments = 24,
): ProfilePoint[] {
  const t = Math.min(1, Math.max(0, age))
  const young = capSurface(shape, segments)
  const mature = capSurface(ageShape, segments)
  const thickness = 0.12

  const top: ProfilePoint[] = young.map((p, i) => ({
    r: p.r * capRadius,
    y: (p.y * (1 - t) + mature[i].y * t) * capRadius,
  }))

  // Изнанка: та же кривая, опущенная на толщину мякоти, обрезанная у ножки.
  const bottom: ProfilePoint[] = []
  for (let i = top.length - 1; i >= 0; i--) {
    const r = top[i].r
    if (r < stipeRadius) break
    bottom.push({ r, y: top[i].y - thickness * capRadius })
  }
  bottom.push({ r: stipeRadius, y: top[0].y - thickness * capRadius })

  return [...top, ...bottom]
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/mushroom/profile.ts test/mushroom/profile.test.ts
git commit -m "feat: профиль шляпки для тела вращения"
```

---

### Task 3: Схема вида и валидация

**Files:**
- Create: `src/species/schema.ts`
- Test: `test/species/schema.test.ts`

**Interfaces:**
- Consumes: `CapShape` из `src/mushroom/profile.ts`
- Produces: типы `Edibility`, `HymeniumType`, `Attachment`, `RingType`, `VolvaType`, `Surface`, `Substrate`, `Biome`, `TreeGenus`, `Gregarious`, `Frequency`, `Morphology`, `Ecology`, `MediaRef`, `Species`; функция `validateSpecies(raw: unknown, path: string): Species`

Схема пишется руками, без библиотек валидации: зависимостей в проекте всего две, и ради десятка проверок третья не нужна. Ошибка должна называть файл и поле — этот тест будет ловить опечатки в данных ещё год.

- [ ] **Step 1: Написать падающий тест**

`test/species/schema.test.ts`:

```ts
import { validateSpecies } from '../../src/species/schema'

const valid = {
  id: 'amanita-muscaria',
  gbifKey: 2526057,
  name: { la: 'Amanita muscaria', ru: 'Мухомор красный', en: 'Fly agaric' },
  edibility: 'poisonous',
  lookalikes: [],
  morphology: {
    cap: { shape: 'convex', ageShape: 'flat', diameter: [80, 200], color: '#d0201a', surface: 'warty', surfaceColor: '#fffdf0' },
    hymenium: { type: 'gills', attachment: 'free', color: '#fffdf0' },
    stipe: { height: [80, 200], width: [10, 20], color: '#fffdf0', ring: 'pendant', volva: 'bulbous-rings' },
    flesh: { color: '#fffdf0', bruising: 'none' },
    latex: 'none',
  },
  ecology: {
    mycorrhizal: ['betula', 'picea', 'pinus'],
    substrate: 'soil',
    biomes: ['forest-mixed', 'forest-coniferous'],
    season: [7, 8, 9, 10],
    moisture: [0.3, 0.8],
    gregarious: 'scattered',
    frequency: 'common',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

describe('validateSpecies', () => {
  it('пропускает корректный вид', () => {
    expect(validateSpecies(valid, 'amanita-muscaria.yaml').id).toBe('amanita-muscaria')
  })

  it('ругается на неизвестную съедобность и называет файл', () => {
    const bad = { ...valid, edibility: 'вкусный' }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/x\.yaml.*edibility/s)
  })

  it('ругается на месяц вне 1..12', () => {
    const bad = { ...valid, ecology: { ...valid.ecology, season: [7, 13] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/season/)
  })

  it('ругается на цвет не в hex', () => {
    const bad = { ...valid, morphology: { ...valid.morphology, flesh: { color: 'белый', bruising: 'none' } } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/color/)
  })

  it('ругается на неизвестную породу-хозяина', () => {
    const bad = { ...valid, ecology: { ...valid.ecology, mycorrhizal: ['баобаб'] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/mycorrhizal/)
  })

  it('ругается на перевёрнутый диапазон', () => {
    const bad = { ...valid, morphology: { ...valid.morphology, cap: { ...valid.morphology.cap, diameter: [200, 80] } } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/diameter/)
  })

  it('требует оба языка в тексте', () => {
    const bad = { ...valid, text: { ru: 'Есть.' } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/text\.en/)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/species/schema.ts`**

```ts
import type { CapShape } from '../mushroom/profile'

export const CAP_SHAPES = ['hemispherical', 'convex', 'flat', 'depressed', 'funnel', 'conical', 'ovoid'] as const
export const EDIBILITY = ['edible', 'conditional', 'inedible', 'poisonous', 'deadly'] as const
export const HYMENIUM = ['gills', 'pores', 'teeth', 'smooth', 'maze'] as const
export const ATTACHMENT = ['free', 'adnate', 'adnexed', 'decurrent'] as const
export const SURFACE = ['smooth', 'warty', 'scaly', 'fibrous', 'viscid', 'velvety'] as const
export const RING = ['none', 'pendant', 'ascending', 'fugacious'] as const
export const VOLVA = ['none', 'sheathing', 'bulbous-rings', 'marginate'] as const
export const BRUISING = ['none', 'blue', 'red', 'brown', 'black'] as const
export const LATEX = ['none', 'white', 'orange', 'red'] as const
export const SUBSTRATE = ['soil', 'litter', 'deadwood', 'livewood', 'dung', 'moss', 'sand', 'burnt'] as const
export const BIOMES = [
  'forest-broadleaved', 'forest-coniferous', 'forest-mixed', 'meadow-scrub',
  'dunes-coast', 'wetland', 'cave-adit', 'park-urban', 'alpine',
] as const
export const TREE_GENERA = [
  'betula', 'picea', 'pinus', 'quercus', 'populus', 'salix',
  'alnus', 'fagus', 'tilia', 'acer', 'carpinus', 'larix', 'abies',
] as const
export const GREGARIOUS = ['solitary', 'scattered', 'clustered', 'troops', 'rings'] as const
export const FREQUENCY = ['common', 'occasional', 'rare'] as const

export type Edibility = (typeof EDIBILITY)[number]
export type HymeniumType = (typeof HYMENIUM)[number]
export type Attachment = (typeof ATTACHMENT)[number]
export type Surface = (typeof SURFACE)[number]
export type RingType = (typeof RING)[number]
export type VolvaType = (typeof VOLVA)[number]
export type Substrate = (typeof SUBSTRATE)[number]
export type Biome = (typeof BIOMES)[number]
export type TreeGenus = (typeof TREE_GENERA)[number]
export type Gregarious = (typeof GREGARIOUS)[number]
export type Frequency = (typeof FREQUENCY)[number]
export type Range = [number, number]

export interface Morphology {
  cap: { shape: CapShape; ageShape: CapShape; diameter: Range; color: string; surface: Surface; surfaceColor: string }
  hymenium: { type: HymeniumType; attachment: Attachment; color: string }
  stipe: { height: Range; width: Range; color: string; ring: RingType; volva: VolvaType }
  flesh: { color: string; bruising: (typeof BRUISING)[number] }
  latex: (typeof LATEX)[number]
}

export interface Ecology {
  mycorrhizal: TreeGenus[]
  substrate: Substrate
  biomes: Biome[]
  season: number[]
  moisture: Range
  gregarious: Gregarious
  frequency: Frequency
}

export interface MediaRef {
  src: string
  license: string
  author: string
  source: string
}

export interface Species {
  id: string
  gbifKey: number
  name: { la: string; ru: string; en: string }
  edibility: Edibility
  lookalikes: string[]
  morphology: Morphology
  ecology: Ecology
  media: MediaRef[]
  text: { ru: string; en: string }
}

class SpeciesError extends Error {
  constructor(file: string, field: string, why: string) {
    super(`${file}: поле ${field} — ${why}`)
  }
}

function get(obj: unknown, field: string, file: string, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) throw new SpeciesError(file, path, 'ожидался объект')
  const v = (obj as Record<string, unknown>)[field]
  if (v === undefined) throw new SpeciesError(file, `${path}${path ? '.' : ''}${field}`, 'отсутствует')
  return v
}

function str(obj: unknown, field: string, file: string, path: string): string {
  const v = get(obj, field, file, path)
  if (typeof v !== 'string' || v.length === 0) {
    throw new SpeciesError(file, `${path}${path ? '.' : ''}${field}`, 'ожидалась непустая строка')
  }
  return v
}

function oneOf<T extends string>(obj: unknown, field: string, allowed: readonly T[], file: string, path: string): T {
  const v = str(obj, field, file, path)
  if (!(allowed as readonly string[]).includes(v)) {
    throw new SpeciesError(file, `${path}${path ? '.' : ''}${field}`, `«${v}» — допустимо: ${allowed.join(', ')}`)
  }
  return v as T
}

function color(obj: unknown, field: string, file: string, path: string): string {
  const v = str(obj, field, file, path)
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    throw new SpeciesError(file, `${path}${path ? '.' : ''}${field}`, `«${v}» — ожидался hex вида #rrggbb`)
  }
  return v
}

function range(obj: unknown, field: string, file: string, path: string): Range {
  const v = get(obj, field, file, path)
  const full = `${path}${path ? '.' : ''}${field}`
  if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number')) {
    throw new SpeciesError(file, full, 'ожидались два числа [min, max]')
  }
  if (v[0] > v[1]) throw new SpeciesError(file, full, `диапазон перевёрнут: ${v[0]} > ${v[1]}`)
  return [v[0], v[1]]
}

function listOf<T extends string>(obj: unknown, field: string, allowed: readonly T[], file: string, path: string): T[] {
  const v = get(obj, field, file, path)
  const full = `${path}${path ? '.' : ''}${field}`
  if (!Array.isArray(v)) throw new SpeciesError(file, full, 'ожидался список')
  for (const item of v) {
    if (typeof item !== 'string' || !(allowed as readonly string[]).includes(item)) {
      throw new SpeciesError(file, full, `«${String(item)}» — допустимо: ${allowed.join(', ')}`)
    }
  }
  return v as T[]
}

/** Разбирает и проверяет один вид. Бросает SpeciesError с именем файла и поля. */
export function validateSpecies(raw: unknown, file: string): Species {
  const id = str(raw, 'id', file, '')
  if (!/^[a-z0-9-]+$/.test(id)) throw new SpeciesError(file, 'id', 'только строчные латинские буквы, цифры и дефис')

  const gbifKey = get(raw, 'gbifKey', file, '')
  if (typeof gbifKey !== 'number' || !Number.isInteger(gbifKey)) {
    throw new SpeciesError(file, 'gbifKey', 'ожидалось целое число')
  }

  const nameObj = get(raw, 'name', file, '')
  const name = {
    la: str(nameObj, 'la', file, 'name'),
    ru: str(nameObj, 'ru', file, 'name'),
    en: str(nameObj, 'en', file, 'name'),
  }

  const mo = get(raw, 'morphology', file, '')
  const capObj = get(mo, 'cap', file, 'morphology')
  const hyObj = get(mo, 'hymenium', file, 'morphology')
  const stObj = get(mo, 'stipe', file, 'morphology')
  const flObj = get(mo, 'flesh', file, 'morphology')

  const morphology: Morphology = {
    cap: {
      shape: oneOf(capObj, 'shape', CAP_SHAPES, file, 'morphology.cap'),
      ageShape: oneOf(capObj, 'ageShape', CAP_SHAPES, file, 'morphology.cap'),
      diameter: range(capObj, 'diameter', file, 'morphology.cap'),
      color: color(capObj, 'color', file, 'morphology.cap'),
      surface: oneOf(capObj, 'surface', SURFACE, file, 'morphology.cap'),
      surfaceColor: color(capObj, 'surfaceColor', file, 'morphology.cap'),
    },
    hymenium: {
      type: oneOf(hyObj, 'type', HYMENIUM, file, 'morphology.hymenium'),
      attachment: oneOf(hyObj, 'attachment', ATTACHMENT, file, 'morphology.hymenium'),
      color: color(hyObj, 'color', file, 'morphology.hymenium'),
    },
    stipe: {
      height: range(stObj, 'height', file, 'morphology.stipe'),
      width: range(stObj, 'width', file, 'morphology.stipe'),
      color: color(stObj, 'color', file, 'morphology.stipe'),
      ring: oneOf(stObj, 'ring', RING, file, 'morphology.stipe'),
      volva: oneOf(stObj, 'volva', VOLVA, file, 'morphology.stipe'),
    },
    flesh: {
      color: color(flObj, 'color', file, 'morphology.flesh'),
      bruising: oneOf(flObj, 'bruising', BRUISING, file, 'morphology.flesh'),
    },
    latex: oneOf(mo, 'latex', LATEX, file, 'morphology'),
  }

  const ec = get(raw, 'ecology', file, '')
  const season = get(ec, 'season', file, 'ecology')
  if (!Array.isArray(season) || season.length === 0 || season.some((m) => typeof m !== 'number' || m < 1 || m > 12)) {
    throw new SpeciesError(file, 'ecology.season', 'ожидался непустой список месяцев 1..12')
  }
  const moisture = range(ec, 'moisture', file, 'ecology')
  if (moisture[0] < 0 || moisture[1] > 1) throw new SpeciesError(file, 'ecology.moisture', 'значения вне 0..1')

  const ecology: Ecology = {
    mycorrhizal: listOf(ec, 'mycorrhizal', TREE_GENERA, file, 'ecology'),
    substrate: oneOf(ec, 'substrate', SUBSTRATE, file, 'ecology'),
    biomes: listOf(ec, 'biomes', BIOMES, file, 'ecology'),
    season: season as number[],
    moisture,
    gregarious: oneOf(ec, 'gregarious', GREGARIOUS, file, 'ecology'),
    frequency: oneOf(ec, 'frequency', FREQUENCY, file, 'ecology'),
  }
  if (ecology.biomes.length === 0) throw new SpeciesError(file, 'ecology.biomes', 'нужен хотя бы один биом')

  const lookalikesRaw = get(raw, 'lookalikes', file, '')
  if (!Array.isArray(lookalikesRaw) || lookalikesRaw.some((s) => typeof s !== 'string')) {
    throw new SpeciesError(file, 'lookalikes', 'ожидался список идентификаторов')
  }

  const mediaRaw = get(raw, 'media', file, '')
  if (!Array.isArray(mediaRaw)) throw new SpeciesError(file, 'media', 'ожидался список')
  const media: MediaRef[] = mediaRaw.map((m, i) => ({
    src: str(m, 'src', file, `media[${i}]`),
    license: str(m, 'license', file, `media[${i}]`),
    author: str(m, 'author', file, `media[${i}]`),
    source: str(m, 'source', file, `media[${i}]`),
  }))

  const textObj = get(raw, 'text', file, '')
  const text = { ru: str(textObj, 'ru', file, 'text'), en: str(textObj, 'en', file, 'text') }

  return {
    id,
    gbifKey,
    name,
    edibility: oneOf(raw, 'edibility', EDIBILITY, file, ''),
    lookalikes: lookalikesRaw as string[],
    morphology,
    ecology,
    media,
    text,
  }
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/species/schema.ts test/species/schema.test.ts
git commit -m "feat: схема вида и валидация с внятными ошибками"
```

---

### Task 4: Первые три вида и их загрузка

**Files:**
- Create: `data/species/amanita-muscaria.yaml`, `data/species/boletus-edulis.yaml`, `data/species/pleurotus-ostreatus.yaml`, `src/species/load.ts`
- Test: `test/species/load.test.ts`

**Interfaces:**
- Consumes: `validateSpecies`, `Species` из `src/species/schema.ts`
- Produces: `loadSpecies(): Species[]`, `speciesById(id: string): Species | undefined`

Три вида выбраны нарочно: мухомор (кольцо, вольва, бородавки — проверяет все навесные части), белый (трубчатый гименофор, толстая ножка) и вешенка (растёт на древесине, ножка сбоку или почти отсутствует). Если генератор справится с этой тройкой, он справится с большинством.

- [ ] **Step 1: Написать падающий тест**

`test/species/load.test.ts`:

```ts
import { loadSpecies, speciesById } from '../../src/species/load'

describe('loadSpecies', () => {
  const all = loadSpecies()

  it('находит все YAML в data/species', () => {
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('все виды проходят валидацию', () => {
    for (const s of all) expect(s.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('идентификаторы уникальны', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })

  it('ключи GBIF уникальны', () => {
    expect(new Set(all.map((s) => s.gbifKey)).size).toBe(all.length)
  })

  it('все lookalikes ссылаются на существующие виды', () => {
    const ids = new Set(all.map((s) => s.id))
    for (const s of all) {
      for (const l of s.lookalikes) {
        expect(ids.has(l), `${s.id} ссылается на несуществующий ${l}`).toBe(true)
      }
    }
  })

  it('вид не назван двойником самого себя', () => {
    for (const s of all) expect(s.lookalikes).not.toContain(s.id)
  })
})

describe('speciesById', () => {
  it('находит мухомор', () => {
    expect(speciesById('amanita-muscaria')?.name.la).toBe('Amanita muscaria')
  })

  it('возвращает undefined для неизвестного', () => {
    expect(speciesById('нет-такого')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Создать три файла данных**

`data/species/amanita-muscaria.yaml`:

```yaml
id: amanita-muscaria
gbifKey: 2526057
name:
  la: Amanita muscaria
  ru: Мухомор красный
  en: Fly agaric
edibility: poisonous
lookalikes: []
morphology:
  cap:
    shape: hemispherical
    ageShape: flat
    diameter: [80, 200]
    color: "#d0201a"
    surface: warty
    surfaceColor: "#fffdf0"
  hymenium:
    type: gills
    attachment: free
    color: "#fffdf0"
  stipe:
    height: [80, 200]
    width: [10, 25]
    color: "#fffdf0"
    ring: pendant
    volva: bulbous-rings
  flesh:
    color: "#fffdf0"
    bruising: none
  latex: none
ecology:
  mycorrhizal: [betula, picea, pinus]
  substrate: soil
  biomes: [forest-mixed, forest-coniferous, forest-broadleaved]
  season: [7, 8, 9, 10]
  moisture: [0.3, 0.8]
  gregarious: scattered
  frequency: common
media: []
text:
  ru: >-
    Ярко-красная шляпка в белых хлопьях, белое кольцо на ножке и вздутое
    основание с поясками вольвы. Ядовит. Растёт с берёзой и елью, часто
    рядом с ним попадаются подберёзовики и белые — те же деревья, тот же тип
    почвы.
  en: >-
    A bright red cap with white warts, a white pendant ring and a swollen base
    ringed with volval remnants. Poisonous. Grows with birch and spruce — the
    same partners as many prized boletes, so it is a useful signpost.
```

`data/species/boletus-edulis.yaml`:

```yaml
id: boletus-edulis
gbifKey: 5327573
name:
  la: Boletus edulis
  ru: Белый гриб
  en: Penny bun
edibility: edible
lookalikes: []
morphology:
  cap:
    shape: hemispherical
    ageShape: convex
    diameter: [70, 250]
    color: "#8b5a2b"
    surface: smooth
    surfaceColor: "#8b5a2b"
  hymenium:
    type: pores
    attachment: adnate
    color: "#f2ead6"
  stipe:
    height: [60, 200]
    width: [25, 70]
    color: "#e8dcc0"
    ring: none
    volva: none
  flesh:
    color: "#fffdf0"
    bruising: none
  latex: none
ecology:
  mycorrhizal: [picea, pinus, betula, quercus, fagus]
  substrate: soil
  biomes: [forest-coniferous, forest-mixed, forest-broadleaved]
  season: [6, 7, 8, 9, 10]
  moisture: [0.35, 0.75]
  gregarious: scattered
  frequency: occasional
media: []
text:
  ru: >-
    Плотная бурая шляпка, толстая бочонковидная ножка со светлой сеточкой,
    белый трубчатый слой, не синеющий на срезе. Съедобен и безоговорочно хорош.
    Ищут в мшистых ельниках и по краю сосняков, чаще на приподнятых сухих
    местах, а не в мокрых низинах.
  en: >-
    A firm brown cap, a thick barrel-shaped stipe with a pale net, and white
    tubes that do not blue when cut. Edible and prized. Look on mossy ground in
    spruce and pine woods, on the drier rises rather than the wet hollows.
```

`data/species/pleurotus-ostreatus.yaml`:

```yaml
id: pleurotus-ostreatus
gbifKey: 5247092
name:
  la: Pleurotus ostreatus
  ru: Вешенка обыкновенная
  en: Oyster mushroom
edibility: edible
lookalikes: []
morphology:
  cap:
    shape: convex
    ageShape: depressed
    diameter: [50, 150]
    color: "#8c8578"
    surface: smooth
    surfaceColor: "#8c8578"
  hymenium:
    type: gills
    attachment: decurrent
    color: "#f5f0e6"
  stipe:
    height: [10, 30]
    width: [10, 25]
    color: "#f0ebe0"
    ring: none
    volva: none
  flesh:
    color: "#fffdf0"
    bruising: none
  latex: none
ecology:
  mycorrhizal: []
  substrate: deadwood
  biomes: [forest-broadleaved, forest-mixed, park-urban, cave-adit]
  season: [9, 10, 11, 12, 1, 2, 3, 4]
  moisture: [0.4, 0.9]
  gregarious: clustered
  frequency: common
media: []
text:
  ru: >-
    Растёт черепитчатыми пучками на мёртвой лиственной древесине — пнях,
    валеже, старых тополях. Ножка короткая и сдвинута вбок, пластинки далеко
    сбегают на неё. Съедобна. Не микоризный гриб: искать надо не под деревом,
    а на дереве, и поздней осенью, когда всё остальное уже отошло.
  en: >-
    Grows in overlapping clusters on dead hardwood — stumps, fallen trunks, old
    poplars. The short stipe sits off to one side and the gills run far down it.
    Edible. Not mycorrhizal: look on the wood, not under the tree, and late in
    the year when little else is left.
```

- [ ] **Step 4: Реализовать `src/species/load.ts`**

```ts
import { parse } from 'yaml'
import { validateSpecies, type Species } from './schema'

// Vite инлайнит содержимое всех YAML на этапе сборки — сети в рантайме нет.
// Vitest понимает import.meta.glob так же, поэтому тесты читают ровно те же данные.
const files = import.meta.glob('/data/species/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

let cache: Species[] | null = null

/** Все виды из data/species, отсортированные по латинскому названию. */
export function loadSpecies(): Species[] {
  if (cache) return cache
  const out: Species[] = []
  for (const [path, raw] of Object.entries(files)) {
    const file = path.split('/').pop() ?? path
    out.push(validateSpecies(parse(raw), file))
  }
  out.sort((a, b) => a.name.la.localeCompare(b.name.la))
  cache = out
  return out
}

export function speciesById(id: string): Species | undefined {
  return loadSpecies().find((s) => s.id === id)
}
```

- [ ] **Step 5: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Закоммитить**

```bash
git add data src/species/load.ts test/species/load.test.ts
git commit -m "feat: первые три вида и загрузка базы из YAML"
```

---

### Task 5: Сборка меша гриба

**Files:**
- Create: `src/mushroom/build.ts`
- Test: `test/mushroom/build.test.ts`

**Interfaces:**
- Consumes: `capCrossSection` из `profile.ts`, `mulberry32`/`randRange` из `util/rng`, `Morphology` из `species/schema`
- Produces: `buildMushroom(m: Morphology, seed: number, age: number): THREE.Group` — группа с именованными детьми `cap`, `hymenium`, `stipe`, `ring`, `volva`; группа стоит основанием в начале координат, единицы — метры

- [ ] **Step 1: Написать падающий тест**

`test/mushroom/build.test.ts`:

```ts
import * as THREE from 'three'
import { buildMushroom } from '../../src/mushroom/build'
import { loadSpecies, speciesById } from '../../src/species/load'

const amanita = speciesById('amanita-muscaria')!.morphology
const oyster = speciesById('pleurotus-ostreatus')!.morphology

function capPositions(g: THREE.Group): Float32Array {
  const cap = g.getObjectByName('cap') as THREE.Mesh
  return cap.geometry.getAttribute('position').array as Float32Array
}

describe('buildMushroom', () => {
  it('один seed даёт ту же геометрию', () => {
    expect(Array.from(capPositions(buildMushroom(amanita, 123, 0.5))))
      .toEqual(Array.from(capPositions(buildMushroom(amanita, 123, 0.5))))
  })

  it('разные seed дают разные экземпляры', () => {
    expect(Array.from(capPositions(buildMushroom(amanita, 1, 0.5))))
      .not.toEqual(Array.from(capPositions(buildMushroom(amanita, 2, 0.5))))
  })

  it('у мухомора есть кольцо и вольва', () => {
    const g = buildMushroom(amanita, 5, 0.5)
    expect(g.getObjectByName('ring')).toBeDefined()
    expect(g.getObjectByName('volva')).toBeDefined()
  })

  it('у вешенки нет ни кольца, ни вольвы', () => {
    const g = buildMushroom(oyster, 5, 0.5)
    expect(g.getObjectByName('ring')).toBeUndefined()
    expect(g.getObjectByName('volva')).toBeUndefined()
  })

  it('шляпка, ножка и гименофор есть всегда', () => {
    const g = buildMushroom(amanita, 5, 0.5)
    for (const n of ['cap', 'stipe', 'hymenium']) expect(g.getObjectByName(n)).toBeDefined()
  })

  it('стоит на земле и не уходит вниз', () => {
    const box = new THREE.Box3().setFromObject(buildMushroom(amanita, 9, 0.5))
    expect(box.min.y).toBeGreaterThan(-0.02)
  })

  it('габариты правдоподобны: не выше 30 см и не ниже 1 см', () => {
    const box = new THREE.Box3().setFromObject(buildMushroom(amanita, 9, 1))
    const h = box.max.y - box.min.y
    expect(h).toBeGreaterThan(0.01)
    expect(h).toBeLessThan(0.3)
  })

  it('каждый вид в базе собирается без исключений и с непустой геометрией', () => {
    for (const s of loadSpecies()) {
      const g = buildMushroom(s.morphology, 1, 0.5)
      const box = new THREE.Box3().setFromObject(g)
      expect(box.isEmpty(), `${s.id} дал пустую геометрию`).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/mushroom/build.ts`**

```ts
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { capCrossSection } from './profile'
import { mulberry32, randRange } from '../util/rng'
import type { Morphology } from '../species/schema'

/** Данные вида в миллиметрах, сцена в метрах. Перевод живёт только здесь. */
const MM = 0.001

/**
 * Гриб из параметров вида. Чистая функция: при одном seed геометрия одинакова
 * в любом браузере, поэтому лес одинаков у всех и переживает перезагрузку.
 *
 * @param age 0 — молодой, 1 — зрелый: меняет форму шляпки и раскрытие
 */
export function buildMushroom(m: Morphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const capR = (randRange(rng, m.cap.diameter) * MM) / 2
  const stipeH = randRange(rng, m.stipe.height) * MM
  const stipeR = (randRange(rng, m.stipe.width) * MM) / 2

  group.add(buildStipe(m, stipeH, stipeR))
  group.add(buildCap(m, age, capR, stipeR, stipeH))
  group.add(buildHymenium(m, capR, stipeR, stipeH))
  if (m.stipe.ring !== 'none') group.add(buildRing(m, stipeR, stipeH))
  if (m.stipe.volva !== 'none') group.add(buildVolva(m, stipeR))
  if (m.cap.surface === 'warty' || m.cap.surface === 'scaly') {
    group.add(buildWarts(m, rng, capR, stipeH, age))
  }

  // Лёгкий наклон: идеально вертикальный гриб выглядит как декорация.
  group.rotation.z = (rng() - 0.5) * 0.18
  group.rotation.x = (rng() - 0.5) * 0.18
  return group
}

function buildStipe(m: Morphology, h: number, r: number): THREE.Mesh {
  // Верх чуть уже низа: так ножка читается как живая, а не как труба.
  const geo = new THREE.CylinderGeometry(r * 0.85, r, h, 16, 1)
  geo.translate(0, h / 2, 0)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.9 }))
  mesh.name = 'stipe'
  return mesh
}

function buildCap(m: Morphology, age: number, capR: number, stipeR: number, stipeH: number): THREE.Mesh {
  const section = capCrossSection(m.cap.shape, m.cap.ageShape, age, capR, stipeR)
  const geo = new THREE.LatheGeometry(section.map((p) => new THREE.Vector2(p.r, p.y)), 32)
  geo.translate(0, stipeH, 0)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: m.cap.color, roughness: 0.75, side: THREE.DoubleSide }),
  )
  mesh.name = 'cap'
  return mesh
}

/**
 * Изнанка шляпки — то, ради чего игрок приседает и переворачивает гриб.
 * Пластинки строятся как настоящие радиальные лезвия, а не как текстура:
 * их видно под любым углом, и по ним отличают мухомор от белого.
 */
function buildHymenium(m: Morphology, capR: number, stipeR: number, stipeH: number): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({
    color: m.hymenium.color,
    roughness: 1,
    side: THREE.DoubleSide,
  })
  const y = stipeH - capR * 0.1

  if (m.hymenium.type === 'gills') {
    const blades: THREE.BufferGeometry[] = []
    const count = 48
    const inner = m.hymenium.attachment === 'free' ? stipeR * 1.6 : stipeR
    const width = Math.max(0.001, capR * 0.92 - inner)
    const drop = m.hymenium.attachment === 'decurrent' ? capR * 0.18 : capR * 0.1
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const geo = new THREE.PlaneGeometry(width, drop)
      geo.translate(inner + width / 2, 0, 0)
      geo.rotateY(-a)
      blades.push(geo)
    }
    const mesh = new THREE.Mesh(mergeGeometries(blades), mat)
    mesh.name = 'hymenium'
    mesh.position.y = y
    return mesh
  }

  // Трубочки, шипы и гладкий гименофор: диск снизу шляпки. Различие несёт
  // цвет и материал — на расстоянии вытянутой руки этого достаточно.
  const geo = new THREE.CircleGeometry(capR * 0.94, 32)
  geo.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'hymenium'
  mesh.position.y = y
  return mesh
}

function buildRing(m: Morphology, stipeR: number, stipeH: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(stipeR * 1.45, stipeR * 0.3, 8, 20)
  geo.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.95 }))
  mesh.name = 'ring'
  mesh.position.y = stipeH * (m.stipe.ring === 'ascending' ? 0.45 : 0.75)
  return mesh
}

function buildVolva(m: Morphology, stipeR: number): THREE.Mesh {
  const r = stipeR * 1.9
  const geo =
    m.stipe.volva === 'sheathing'
      ? new THREE.CylinderGeometry(r * 0.8, r, r * 2.2, 14, 1, true)
      : new THREE.SphereGeometry(r, 14, 10)
  geo.scale(1, 0.7, 1)
  geo.translate(0, r * 0.55, 0)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.95, side: THREE.DoubleSide }),
  )
  mesh.name = 'volva'
  return mesh
}

/** Хлопья и чешуйки на шляпке — то, по чему мухомор узнают издалека. */
function buildWarts(
  m: Morphology,
  rng: () => number,
  capR: number,
  stipeH: number,
  age: number,
): THREE.InstancedMesh {
  const count = 26
  const size = capR * 0.09
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(size, 6, 5),
    new THREE.MeshStandardMaterial({ color: m.cap.surfaceColor, roughness: 1 }),
    count,
  )
  mesh.name = 'warts'
  const dummy = new THREE.Object3D()
  const section = capCrossSection(m.cap.shape, m.cap.ageShape, age, capR, capR * 0.1)
  for (let i = 0; i < count; i++) {
    const u = Math.sqrt(rng()) * 0.9
    const a = rng() * Math.PI * 2
    const idx = Math.min(section.length - 1, Math.floor(u * 24))
    dummy.position.set(Math.cos(a) * u * capR, stipeH + section[idx].y, Math.sin(a) * u * capR)
    dummy.scale.setScalar(0.6 + rng() * 0.7)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  return mesh
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/mushroom/build.ts test/mushroom/build.test.ts
git commit -m "feat: процедурная сборка меша гриба из морфологии"
```

---

### Task 6: Галерея — первое, что видно глазами

**Files:**
- Modify: `src/main.ts`
- Create: `src/ui/orbit.ts`

**Interfaces:**
- Consumes: `buildMushroom`, `loadSpecies`
- Produces: `attachOrbit(camera: THREE.PerspectiveCamera, dom: HTMLElement, target: THREE.Vector3, radius: number): () => void` — возвращает функцию отписки

Автотестов на рендер нет; проверка ручная и через `boot-check`. Это первая задача, после которой на Pages появляется что-то настоящее.

- [ ] **Step 1: Создать `src/ui/orbit.ts`**

```ts
import * as THREE from 'three'

/**
 * Простая орбита вокруг точки: перетаскивание вращает, колесо приближает.
 * Своя, а не OrbitControls из примеров — нужно ровно это, и без зависимости
 * от examples-сборки, которая тянет лишнее.
 */
export function attachOrbit(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  target: THREE.Vector3,
  radius: number,
): () => void {
  let theta = 0
  let phi = 1.1
  let r = radius
  let dragging = false

  const apply = () => {
    camera.position.set(
      target.x + r * Math.sin(phi) * Math.sin(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.cos(theta),
    )
    camera.lookAt(target)
  }

  const down = () => { dragging = true }
  const up = () => { dragging = false }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    theta -= e.movementX * 0.006
    phi = Math.min(Math.PI - 0.15, Math.max(0.15, phi - e.movementY * 0.006))
    apply()
  }
  const wheel = (e: WheelEvent) => {
    r = Math.min(radius * 4, Math.max(radius * 0.25, r * (1 + Math.sign(e.deltaY) * 0.12)))
    apply()
  }

  dom.addEventListener('pointerdown', down)
  addEventListener('pointerup', up)
  addEventListener('pointermove', move)
  dom.addEventListener('wheel', wheel, { passive: true })
  apply()

  return () => {
    dom.removeEventListener('pointerdown', down)
    removeEventListener('pointerup', up)
    removeEventListener('pointermove', move)
    dom.removeEventListener('wheel', wheel)
  }
}
```

- [ ] **Step 2: Переписать `src/main.ts` под галерею**

Заменить содержимое после создания сцены: вместо пустой сцены выложить все виды в ряд.

```ts
import * as THREE from 'three'
import { loadSpecies } from './species/load'
import { buildMushroom } from './mushroom/build'
import { attachOrbit } from './ui/orbit'

declare global {
  interface Window { __READY?: boolean }
}

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9db89a)
scene.add(new THREE.HemisphereLight(0xdfeede, 0x3b3327, 2.2))
const sun = new THREE.DirectionalLight(0xfff3d6, 1.6)
sun.position.set(1, 2, 1)
scene.add(sun)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 1 }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const species = loadSpecies()
const STEP = 0.35
species.forEach((s, i) => {
  const g = buildMushroom(s.morphology, i + 1, 0.6)
  g.position.x = (i - (species.length - 1) / 2) * STEP
  scene.add(g)
})

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100)
attachOrbit(camera, renderer.domElement, new THREE.Vector3(0, 0.08, 0), 0.9)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))

window.__READY = true
```

- [ ] **Step 3: Посмотреть глазами**

Run: `npm run dev`

Ожидается: три гриба на земле, мышью вращаются, колесом приближаются. Мухомор — красный в белых хлопьях, с кольцом и вздутым основанием. Белый — бурый, толстая ножка, снизу светлый диск пор. Вешенка — серая, почти без ножки.

**Это точка честной оценки риска из спеки.** Если силуэты не узнаются, дальше идти нельзя: надо править `profile.ts` и `build.ts`, пока тройка не станет различима с первого взгляда. Всё остальное в плане опирается на то, что генератор убедителен.

- [ ] **Step 4: Проверить сборку**

Run: `npm run build && npm run boot-check`
Expected: `boot-check: OK`

- [ ] **Step 5: Закоммитить и запушить**

```bash
git add src/main.ts src/ui/orbit.ts
git commit -m "feat: галерея видов — первый видимый результат"
git push
```

После зелёного прогона Pages показывает галерею. Дальше каждый пуш виден там же.

---

### Task 7: Рельеф и земля

**Files:**
- Create: `src/terrain/provider.ts`, `src/util/noise.ts`, `src/terrain/procedural.ts`, `src/world/ground.ts`
- Test: `test/util/noise.test.ts`, `test/terrain/procedural.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `hashString`
- Produces: `interface ElevationProvider { heightAt(x: number, z: number): number }`, `fbm2(x: number, z: number, seed: number, octaves?: number): number` (возвращает −1..1), `proceduralTerrain(seed: number, amplitude?: number): ElevationProvider`, `buildGround(provider: ElevationProvider, halfSize: number, segments: number): THREE.Mesh`

`ElevationProvider` — тот самый интерфейс, который во втором плане подменится на реальный DEM, не тронув ничего вокруг.

- [ ] **Step 1: Написать падающие тесты**

`test/util/noise.test.ts`:

```ts
import { fbm2 } from '../../src/util/noise'

describe('fbm2', () => {
  it('детерминирован', () => {
    expect(fbm2(1.5, -2.25, 7)).toBe(fbm2(1.5, -2.25, 7))
  })

  it('разные seed дают разные поля', () => {
    expect(fbm2(1.5, -2.25, 7)).not.toBe(fbm2(1.5, -2.25, 8))
  })

  it('лежит в [-1, 1]', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 0.37, i * -0.71, 3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('непрерывен: близкие точки дают близкие значения', () => {
    const a = fbm2(10, 10, 5)
    const b = fbm2(10.001, 10, 5)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })
})
```

`test/terrain/procedural.test.ts`:

```ts
import { proceduralTerrain } from '../../src/terrain/procedural'

describe('proceduralTerrain', () => {
  it('детерминирован по seed', () => {
    expect(proceduralTerrain(42).heightAt(3, -4)).toBe(proceduralTerrain(42).heightAt(3, -4))
  })

  it('разные seed дают разный рельеф', () => {
    expect(proceduralTerrain(1).heightAt(3, -4)).not.toBe(proceduralTerrain(2).heightAt(3, -4))
  })

  it('не уходит за амплитуду', () => {
    const t = proceduralTerrain(9, 6)
    for (let i = 0; i < 300; i++) {
      expect(Math.abs(t.heightAt(i * 1.7, i * -2.3))).toBeLessThanOrEqual(6)
    }
  })

  it('рельеф не плоский', () => {
    const t = proceduralTerrain(4)
    const hs = Array.from({ length: 50 }, (_, i) => t.heightAt(i * 3, 0))
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.3)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `npm test`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Реализовать шум и провайдер**

`src/terrain/provider.ts`:

```ts
/**
 * Источник высот сцены. Сейчас процедурный, во втором плане — реальный DEM.
 * Всё, что стоит на земле — игрок, деревья, грибы — знает только этот интерфейс.
 */
export interface ElevationProvider {
  /** Высота в метрах в локальных координатах (x на восток, z на юг). */
  heightAt(x: number, z: number): number
}
```

`src/util/noise.ts`:

```ts
import { hashString } from './rng'

/** Градиентный шум на целочисленной решётке: хэш узла → псевдослучайный угол. */
function gradient(ix: number, iz: number, seed: number): [number, number] {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2654435761) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  const a = ((h ^ (h >>> 16)) >>> 0) * (Math.PI * 2 / 4294967296)
  return [Math.cos(a), Math.sin(a)]
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function perlin2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const u = fade(fx)
  const v = fade(fz)

  const dot = (ix: number, iz: number, dx: number, dz: number) => {
    const [gx, gz] = gradient(ix, iz, seed)
    return gx * dx + gz * dz
  }

  const n00 = dot(x0, z0, fx, fz)
  const n10 = dot(x0 + 1, z0, fx - 1, fz)
  const n01 = dot(x0, z0 + 1, fx, fz - 1)
  const n11 = dot(x0 + 1, z0 + 1, fx - 1, fz - 1)

  const a = n00 + u * (n10 - n00)
  const b = n01 + u * (n11 - n01)
  return a + v * (b - a)
}

/**
 * Фрактальный шум: несколько октав Перлина. Результат нормирован в [-1, 1].
 * Крупные октавы дают форму холма, мелкие — те самые ложбинки, в которых
 * держится влага и растут грибы.
 */
export function fbm2(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += perlin2(x * freq, z * freq, seed + o * 101) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  const v = sum / norm
  return Math.max(-1, Math.min(1, v))
}

/** Тот же шум, но из строкового ключа — удобно для «сида места». */
export function fbmFromKey(x: number, z: number, key: string, octaves = 4): number {
  return fbm2(x, z, hashString(key) % 100000, octaves)
}
```

`src/terrain/procedural.ts`:

```ts
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from './provider'

/** Масштаб крупной формы: холмы примерно такого размера в метрах. */
const HILL_SCALE = 90
/** Масштаб микрорельефа: кочки и ложбинки, в которых и прячутся грибы. */
const DETAIL_SCALE = 7

/**
 * Процедурный рельеф: пологие холмы плюс микрорельеф.
 *
 * Микрорельеф здесь не украшение. Влажность точки считается из вогнутости
 * поверхности, а влажность решает, что вырастет — так что без мелкой октавы
 * лес получился бы экологически однородным.
 */
export function proceduralTerrain(seed: number, amplitude = 12): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      const hills = fbm2(x / HILL_SCALE, z / HILL_SCALE, seed, 4)
      const detail = fbm2(x / DETAIL_SCALE, z / DETAIL_SCALE, seed + 7919, 3)
      return Math.max(-amplitude, Math.min(amplitude, hills * amplitude * 0.85 + detail * amplitude * 0.06))
    },
  }
}
```

- [ ] **Step 4: Запустить и убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Реализовать `src/world/ground.ts`**

```ts
import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Меш земли по провайдеру высот. Квадрат [-halfSize, halfSize]²,
 * `segments` делений по стороне.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  segments: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, provider.heightAt(pos.getX(i), pos.getZ(i)))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x4d5b39, roughness: 1 }),
  )
  mesh.name = 'ground'
  return mesh
}
```

- [ ] **Step 6: Закоммитить**

```bash
git add src/terrain src/util/noise.ts src/world/ground.ts test/util/noise.test.ts test/terrain/procedural.test.ts
git commit -m "feat: процедурный рельеф, провайдер высот и меш земли"
```

---

### Task 8: Деревья

**Files:**
- Create: `src/world/trees.ts`
- Test: `test/world/trees.test.ts`

**Interfaces:**
- Consumes: `ElevationProvider`, `mulberry32`, `fbm2`, `TreeGenus` из `species/schema`
- Produces: `interface Tree { x: number; z: number; y: number; genus: TreeGenus; radius: number; height: number }`, `placeTrees(provider: ElevationProvider, halfSize: number, seed: number, mix: TreeGenus[], density?: number): Tree[]`, `buildTreeMeshes(trees: Tree[]): THREE.Group`

Порода дерева — не украшение: именно она решает, что вырастет рядом. Поэтому `placeTrees` возвращает данные, а меши строятся отдельно — так спавн грибов может работать с деревьями, ничего не зная о рендере.

- [ ] **Step 1: Написать падающий тест**

`test/world/trees.test.ts`:

```ts
import { placeTrees } from '../../src/world/trees'
import { proceduralTerrain } from '../../src/terrain/procedural'

const terrain = proceduralTerrain(5)

describe('placeTrees', () => {
  it('детерминирован по seed', () => {
    expect(placeTrees(terrain, 60, 3, ['betula', 'picea'])).toEqual(
      placeTrees(terrain, 60, 3, ['betula', 'picea']),
    )
  })

  it('разные seed дают разный лес', () => {
    const a = placeTrees(terrain, 60, 1, ['betula'])
    const b = placeTrees(terrain, 60, 2, ['betula'])
    expect(a[0]?.x).not.toBe(b[0]?.x)
  })

  it('все деревья внутри участка', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula', 'picea'])) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(60)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(60)
    }
  })

  it('использует только породы из набора', () => {
    const mix = ['betula', 'picea'] as const
    for (const t of placeTrees(terrain, 60, 3, [...mix])) {
      expect(mix).toContain(t.genus)
    }
  })

  it('деревья стоят на земле', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula'])) {
      expect(t.y).toBeCloseTo(terrain.heightAt(t.x, t.z), 5)
    }
  })

  it('лес не пустой и не бесконечный', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])
    expect(trees.length).toBeGreaterThan(20)
    expect(trees.length).toBeLessThan(3000)
  })

  it('деревья не растут друг в друге', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula'])
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const d = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z)
        expect(d).toBeGreaterThan(1.5)
      }
    }
  })

  it('плотность влияет на количество', () => {
    const sparse = placeTrees(terrain, 60, 3, ['betula'], 0.02)
    const dense = placeTrees(terrain, 60, 3, ['betula'], 0.12)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/world/trees.ts`**

```ts
import * as THREE from 'three'
import { mulberry32, pickWeighted } from '../util/rng'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'
import type { TreeGenus } from '../species/schema'

export interface Tree {
  x: number
  z: number
  /** Высота земли под деревом. */
  y: number
  genus: TreeGenus
  /** Радиус ствола у основания, м — по нему считаются столкновения. */
  radius: number
  height: number
}

const MIN_GAP = 1.6

interface GenusLook {
  trunk: number
  crown: number
  height: [number, number]
  crownColor: number
  trunkColor: number
  conifer: boolean
}

/** Породы, которые нам нужны в первом плане. Остальные добавятся с биомами. */
const LOOK: Partial<Record<TreeGenus, GenusLook>> = {
  betula: { trunk: 0.16, crown: 2.2, height: [14, 22], crownColor: 0x74963f, trunkColor: 0xe8e4d8, conifer: false },
  picea: { trunk: 0.22, crown: 2.0, height: [16, 28], crownColor: 0x2f4a33, trunkColor: 0x4a3b2c, conifer: true },
  pinus: { trunk: 0.26, crown: 2.6, height: [18, 30], crownColor: 0x44603a, trunkColor: 0x8a5a3b, conifer: true },
  quercus: { trunk: 0.34, crown: 3.4, height: [15, 24], crownColor: 0x556b2f, trunkColor: 0x5a4632, conifer: false },
  populus: { trunk: 0.24, crown: 2.4, height: [16, 26], crownColor: 0x7a9a4a, trunkColor: 0x6b6154, conifer: false },
}

const DEFAULT_LOOK: GenusLook = LOOK.betula!

/**
 * Расстановка деревьев по участку.
 *
 * Породы кладутся не равномерно, а пятнами: шум с большим масштабом решает,
 * где сейчас ельник, а где берёзовая опушка. Это важно не для красоты, а для
 * геймплея — грибник ищет не «лес вообще», а конкретный угол леса, и такие
 * пятна дают ему то, что можно запомнить и найти снова.
 *
 * @param density деревьев на квадратный метр до отсева по расстоянию
 */
export function placeTrees(
  provider: ElevationProvider,
  halfSize: number,
  seed: number,
  mix: TreeGenus[],
  density = 0.06,
): Tree[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const attempts = Math.floor(area * density)
  const trees: Tree[] = []

  // Сетка для отсева слишком близких: без неё проверка стала бы квадратичной.
  const cell = MIN_GAP
  const grid = new Map<string, Tree[]>()
  const key = (x: number, z: number) => `${Math.floor(x / cell)}:${Math.floor(z / cell)}`

  for (let i = 0; i < attempts; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize

    let tooClose = false
    const gx = Math.floor(x / cell)
    const gz = Math.floor(z / cell)
    for (let dx = -1; dx <= 1 && !tooClose; dx++) {
      for (let dz = -1; dz <= 1 && !tooClose; dz++) {
        for (const t of grid.get(`${gx + dx}:${gz + dz}`) ?? []) {
          if (Math.hypot(t.x - x, t.z - z) <= MIN_GAP) tooClose = true
        }
      }
    }
    if (tooClose) continue

    // Пятна пород: каждой породе своё поле шума, побеждает наибольшее.
    const genus =
      pickWeighted(rng, mix, (g) => {
        const field = fbm2(x / 45, z / 45, seed + g.length * 7717, 2)
        return Math.max(0.05, field + 1)
      }) ?? mix[0]

    const look = LOOK[genus] ?? DEFAULT_LOOK
    const tree: Tree = {
      x,
      z,
      y: provider.heightAt(x, z),
      genus,
      radius: look.trunk,
      height: look.height[0] + rng() * (look.height[1] - look.height[0]),
    }
    trees.push(tree)
    const k = key(x, z)
    const bucket = grid.get(k)
    if (bucket) bucket.push(tree)
    else grid.set(k, [tree])
  }

  return trees
}

/**
 * Меши деревьев. Инстансинг по паре «порода + деталь», иначе тысяча деревьев
 * съедает кадр на вызовах отрисовки.
 */
export function buildTreeMeshes(trees: Tree[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'trees'
  const byGenus = new Map<TreeGenus, Tree[]>()
  for (const t of trees) {
    const b = byGenus.get(t.genus)
    if (b) b.push(t)
    else byGenus.set(t.genus, [t])
  }

  const dummy = new THREE.Object3D()
  for (const [genus, list] of byGenus) {
    const look = LOOK[genus] ?? DEFAULT_LOOK

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(look.trunk * 0.7, look.trunk, 1, 7),
      new THREE.MeshStandardMaterial({ color: look.trunkColor, roughness: 1 }),
      list.length,
    )
    const crowns = new THREE.InstancedMesh(
      look.conifer
        ? new THREE.ConeGeometry(look.crown, 1, 8)
        : new THREE.SphereGeometry(look.crown, 8, 6),
      new THREE.MeshStandardMaterial({ color: look.crownColor, roughness: 1 }),
      list.length,
    )

    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y + t.height / 2, t.z)
      dummy.scale.set(1, t.height, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      trunks.setMatrixAt(i, dummy.matrix)

      const crownH = t.height * (look.conifer ? 0.7 : 0.45)
      dummy.position.set(t.x, t.y + t.height * (look.conifer ? 0.6 : 0.8), t.z)
      dummy.scale.set(1, look.conifer ? crownH : 1, 1)
      dummy.updateMatrix()
      crowns.setMatrixAt(i, dummy.matrix)
    })

    group.add(trunks, crowns)
  }
  return group
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/world/trees.ts test/world/trees.test.ts
git commit -m "feat: расстановка деревьев пятнами пород и их меши"
```

---

### Task 9: Экологические точки и влажность

**Files:**
- Create: `src/ecology/sites.ts`
- Test: `test/ecology/sites.test.ts`

**Interfaces:**
- Consumes: `ElevationProvider`, `Tree`, `Biome`, `Substrate`, `TreeGenus`, `mulberry32`
- Produces: `interface HostRef { genus: TreeGenus; distance: number }`, `interface Site { x: number; z: number; y: number; biome: Biome; hosts: HostRef[]; substrate: Substrate; moisture: number }`, `moistureAt(provider: ElevationProvider, x: number, z: number): number`, `buildSites(provider: ElevationProvider, trees: Tree[], halfSize: number, seed: number, biome: Biome, count?: number): Site[]`

Влажность считается из вогнутости рельефа: сравниваем высоту точки со средней высотой вокруг. В ложбинке значение выше, на бугре — ниже. Это и есть та связь, которая заставляет игрока читать местность.

- [ ] **Step 1: Написать падающий тест**

`test/ecology/sites.test.ts`:

```ts
import { moistureAt, buildSites } from '../../src/ecology/sites'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { placeTrees } from '../../src/world/trees'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const bowl: ElevationProvider = { heightAt: (x, z) => (x * x + z * z) * 0.02 }
const hill: ElevationProvider = { heightAt: (x, z) => -(x * x + z * z) * 0.02 }

describe('moistureAt', () => {
  it('лежит в [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const m = moistureAt(proceduralTerrain(3), i * 2.7, i * -1.3)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThanOrEqual(1)
    }
  })

  it('в ложбинке сырее, чем на бугре', () => {
    expect(moistureAt(bowl, 0, 0)).toBeGreaterThan(moistureAt(hill, 0, 0))
  })

  it('на ровном месте — середина шкалы', () => {
    expect(moistureAt(flat, 0, 0)).toBeCloseTo(0.5, 1)
  })
})

describe('buildSites', () => {
  const terrain = proceduralTerrain(5)
  const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])

  it('детерминирован', () => {
    expect(buildSites(terrain, trees, 60, 11, 'forest-mixed', 200))
      .toEqual(buildSites(terrain, trees, 60, 11, 'forest-mixed', 200))
  })

  it('точки внутри участка и на земле', () => {
    for (const s of buildSites(terrain, trees, 60, 11, 'forest-mixed', 100)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(60)
      expect(s.y).toBeCloseTo(terrain.heightAt(s.x, s.z), 5)
    }
  })

  it('хозяева отсортированы по расстоянию', () => {
    for (const s of buildSites(terrain, trees, 60, 11, 'forest-mixed', 100)) {
      for (let i = 1; i < s.hosts.length; i++) {
        expect(s.hosts[i].distance).toBeGreaterThanOrEqual(s.hosts[i - 1].distance)
      }
    }
  })

  it('рядом с деревом хозяин найден', () => {
    const near = buildSites(terrain, trees, 60, 11, 'forest-mixed', 400)
      .filter((s) => s.hosts.length > 0)
    expect(near.length).toBeGreaterThan(0)
  })

  it('часть точек — валеж, а не почва', () => {
    const sites = buildSites(terrain, trees, 60, 11, 'forest-mixed', 400)
    expect(sites.some((s) => s.substrate === 'deadwood')).toBe(true)
    expect(sites.some((s) => s.substrate === 'soil')).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/ecology/sites.ts`**

```ts
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Tree } from '../world/trees'
import type { Biome, Substrate, TreeGenus } from '../species/schema'

export interface HostRef {
  genus: TreeGenus
  /** Расстояние до дерева в метрах. */
  distance: number
}

export interface Site {
  x: number
  z: number
  y: number
  biome: Biome
  /** Ближайшие деревья, по возрастанию расстояния. */
  hosts: HostRef[]
  substrate: Substrate
  /** 0 — сухо, 1 — мокро. */
  moisture: number
}

/** Насколько далеко вокруг смотрим, оценивая вогнутость, м. */
const PROBE = 4
/** Дальше этого дерево уже не считается партнёром. */
const HOST_RADIUS = 8

/**
 * Влажность точки по форме рельефа.
 *
 * Средняя высота четырёх соседей минус высота самой точки: в ложбине соседи
 * выше, разность положительна и вода собирается здесь; на бугре наоборот.
 * Это дешёвая замена гидрологической модели, и её достаточно — игроку нужно
 * не число, а привычка смотреть под ноги и читать низинку.
 */
export function moistureAt(provider: ElevationProvider, x: number, z: number): number {
  const h = provider.heightAt(x, z)
  const around =
    (provider.heightAt(x + PROBE, z) +
      provider.heightAt(x - PROBE, z) +
      provider.heightAt(x, z + PROBE) +
      provider.heightAt(x, z - PROBE)) /
    4
  const concavity = (around - h) / PROBE
  return Math.max(0, Math.min(1, 0.5 + concavity * 4))
}

/**
 * Точки-кандидаты, в которых может вырасти гриб.
 *
 * Каждая знает свою экологию: биом, ближайшие породы, субстрат и влажность.
 * Отбором вида занимается spawn.ts — здесь только описание места.
 */
export function buildSites(
  provider: ElevationProvider,
  trees: Tree[],
  halfSize: number,
  seed: number,
  biome: Biome,
  count = 1200,
): Site[] {
  const rng = mulberry32(seed)
  const sites: Site[] = []

  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize

    const hosts: HostRef[] = []
    for (const t of trees) {
      const d = Math.hypot(t.x - x, t.z - z)
      if (d <= HOST_RADIUS) hosts.push({ genus: t.genus, distance: d })
    }
    hosts.sort((a, b) => a.distance - b.distance)

    // Валеж встречается там, где стоят деревья: пни и упавшие стволы.
    // Двадцать процентов точек у самого комля считаем древесиной.
    const nearTrunk = hosts.length > 0 && hosts[0].distance < 1.2
    const substrate: Substrate = nearTrunk && rng() < 0.35 ? 'deadwood' : rng() < 0.25 ? 'litter' : 'soil'

    sites.push({
      x,
      z,
      y: provider.heightAt(x, z),
      biome,
      hosts,
      substrate,
      moisture: moistureAt(provider, x, z),
    })
  }

  return sites
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/ecology/sites.ts test/ecology/sites.test.ts
git commit -m "feat: экологические точки, влажность из вогнутости рельефа"
```

---

### Task 10: Отбор вида и раскладка грибов

**Files:**
- Create: `src/ecology/spawn.ts`
- Test: `test/ecology/spawn.test.ts`

**Interfaces:**
- Consumes: `Site`, `Species`, `mulberry32`, `pickWeighted`
- Produces: `interface Placement { speciesId: string; x: number; z: number; y: number; rotationY: number; age: number; seed: number }`, `interface SpawnContext { month: number; seed: number; daysSinceRain: number }`, `speciesScore(species: Species, site: Site, ctx: SpawnContext): number`, `spawnMushrooms(species: Species[], sites: Site[], ctx: SpawnContext): Placement[]`

Это сердце обещания «игрок учится». Жёсткие фильтры отсекают невозможное, вес отражает предпочтения, `gregarious` превращает одну точку в колонию.

- [ ] **Step 1: Написать падающий тест**

`test/ecology/spawn.test.ts`:

```ts
import { speciesScore, spawnMushrooms } from '../../src/ecology/spawn'
import { loadSpecies, speciesById } from '../../src/species/load'
import type { Site } from '../../src/ecology/sites'
import type { SpawnContext } from '../../src/ecology/spawn'

const boletus = speciesById('boletus-edulis')!
const oyster = speciesById('pleurotus-ostreatus')!

const site = (over: Partial<Site> = {}): Site => ({
  x: 0, z: 0, y: 0,
  biome: 'forest-mixed',
  hosts: [{ genus: 'picea', distance: 2 }],
  substrate: 'soil',
  moisture: 0.5,
  ...over,
})

const ctx: SpawnContext = { month: 9, seed: 1, daysSinceRain: 2 }

describe('speciesScore', () => {
  it('вне сезона — ноль', () => {
    expect(speciesScore(boletus, site(), { ...ctx, month: 1 })).toBe(0)
  })

  it('в чужом биоме — ноль', () => {
    expect(speciesScore(boletus, site({ biome: 'dunes-coast' }), ctx)).toBe(0)
  })

  it('на чужом субстрате — ноль', () => {
    expect(speciesScore(oyster, site({ substrate: 'soil' }), ctx)).toBe(0)
  })

  it('вешенка растёт на валеже', () => {
    const s = site({ substrate: 'deadwood', biome: 'forest-broadleaved', hosts: [] })
    expect(speciesScore(oyster, s, { ...ctx, month: 10 })).toBeGreaterThan(0)
  })

  it('микоризному виду нужен партнёр рядом', () => {
    expect(speciesScore(boletus, site({ hosts: [] }), ctx)).toBe(0)
  })

  it('ближе к партнёру — выше вес', () => {
    const near = speciesScore(boletus, site({ hosts: [{ genus: 'picea', distance: 1 }] }), ctx)
    const far = speciesScore(boletus, site({ hosts: [{ genus: 'picea', distance: 7 }] }), ctx)
    expect(near).toBeGreaterThan(far)
  })

  it('влажность вне диапазона вида роняет вес', () => {
    const good = speciesScore(boletus, site({ moisture: 0.5 }), ctx)
    const bad = speciesScore(boletus, site({ moisture: 0.02 }), ctx)
    expect(good).toBeGreaterThan(bad)
  })

  it('после дождя грибов больше, чем в засуху', () => {
    const wet = speciesScore(boletus, site(), { ...ctx, daysSinceRain: 1 })
    const dry = speciesScore(boletus, site(), { ...ctx, daysSinceRain: 30 })
    expect(wet).toBeGreaterThan(dry)
  })
})

describe('spawnMushrooms', () => {
  const sites = Array.from({ length: 300 }, (_, i) =>
    site({ x: i % 20, z: Math.floor(i / 20), moisture: 0.4 + (i % 5) * 0.08 }),
  )

  it('детерминирован', () => {
    expect(spawnMushrooms(loadSpecies(), sites, ctx)).toEqual(spawnMushrooms(loadSpecies(), sites, ctx))
  })

  it('в еловом лесу не вырастает дюнный вид', () => {
    for (const p of spawnMushrooms(loadSpecies(), sites, ctx)) {
      expect(speciesById(p.speciesId)!.ecology.biomes).toContain('forest-mixed')
    }
  })

  it('зимой в этом лесу почти пусто', () => {
    const winter = spawnMushrooms(loadSpecies(), sites, { ...ctx, month: 2 })
    const autumn = spawnMushrooms(loadSpecies(), sites, ctx)
    expect(winter.length).toBeLessThan(autumn.length)
  })

  it('что-то всё же вырастает', () => {
    expect(spawnMushrooms(loadSpecies(), sites, ctx).length).toBeGreaterThan(0)
  })

  it('кучные виды растут группами', () => {
    const deadwood = Array.from({ length: 100 }, (_, i) =>
      site({ x: i, z: 0, substrate: 'deadwood', biome: 'forest-broadleaved', hosts: [], moisture: 0.6 }),
    )
    const placements = spawnMushrooms([oyster], deadwood, { ...ctx, month: 10 })
    const byPoint = new Map<string, number>()
    for (const p of placements) {
      const k = `${Math.round(p.x)}`
      byPoint.set(k, (byPoint.get(k) ?? 0) + 1)
    }
    expect(Math.max(...byPoint.values())).toBeGreaterThan(1)
  })

  it('у каждого гриба свой seed — экземпляры различаются', () => {
    const seeds = spawnMushrooms(loadSpecies(), sites, ctx).map((p) => p.seed)
    expect(new Set(seeds).size).toBeGreaterThan(seeds.length * 0.5)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/ecology/spawn.ts`**

```ts
import { mulberry32, pickWeighted } from '../util/rng'
import type { Site } from './sites'
import type { Species, Frequency, Gregarious } from '../species/schema'

export interface Placement {
  speciesId: string
  x: number
  z: number
  y: number
  rotationY: number
  /** 0 — молодой, 1 — зрелый. */
  age: number
  /** Seed конкретного экземпляра: форма, размер, наклон. */
  seed: number
}

export interface SpawnContext {
  /** Месяц 1..12. */
  month: number
  seed: number
  /** Сколько дней назад был дождь: чем больше, тем суше лес. */
  daysSinceRain: number
}

const FREQUENCY_WEIGHT: Record<Frequency, number> = {
  common: 1,
  occasional: 0.4,
  rare: 0.12,
}

/** Сколько плодовых тел даёт одна колония. */
const COLONY_SIZE: Record<Gregarious, [number, number]> = {
  solitary: [1, 1],
  scattered: [1, 3],
  troops: [3, 8],
  clustered: [4, 12],
  rings: [6, 14],
}

/** Насколько тесно жмутся друг к другу плодовые тела одной колонии, м. */
const COLONY_SPREAD: Record<Gregarious, number> = {
  solitary: 0,
  scattered: 1.6,
  troops: 1.2,
  clustered: 0.35,
  rings: 2.2,
}

/** Доля точек, в которых вообще что-то вырастает. Лес не должен быть ковром. */
const OCCUPANCY = 0.12

/**
 * Насколько этот вид уместен в этой точке. Ноль означает «невозможно».
 *
 * Жёсткие условия — сезон, биом, субстрат, наличие партнёра — отсекают сразу.
 * Остальное складывается в вес: чем ближе дерево-партнёр и чем точнее влажность,
 * тем чаще вид здесь встречается. Игрок этого числа не видит, но именно оно
 * учит его смотреть, под каким деревом и в какой ложбинке искать.
 */
export function speciesScore(species: Species, site: Site, ctx: SpawnContext): number {
  const eco = species.ecology
  if (!eco.season.includes(ctx.month)) return 0
  if (!eco.biomes.includes(site.biome)) return 0
  if (eco.substrate !== site.substrate) return 0

  let score = FREQUENCY_WEIGHT[eco.frequency]

  // Микоризным видам партнёр обязателен, сапротрофам он безразличен.
  if (eco.mycorrhizal.length > 0) {
    const host = site.hosts.find((h) => eco.mycorrhizal.includes(h.genus))
    if (!host) return 0
    score *= 1 / (1 + host.distance * 0.35)
  }

  // Влажность: внутри диапазона полный вес, снаружи быстро падает.
  const [lo, hi] = eco.moisture
  if (site.moisture < lo) score *= Math.max(0.05, 1 - (lo - site.moisture) * 4)
  else if (site.moisture > hi) score *= Math.max(0.05, 1 - (site.moisture - hi) * 4)

  // Засуха бьёт по всем одинаково: через неделю без дождя лес пустеет.
  score *= 1 / (1 + Math.max(0, ctx.daysSinceRain - 1) * 0.18)

  return score
}

/**
 * Расставляет грибы по точкам: сначала решает, где вообще есть колония,
 * потом какой вид её образует, потом рассыпает вокруг плодовые тела.
 */
export function spawnMushrooms(species: Species[], sites: Site[], ctx: SpawnContext): Placement[] {
  const rng = mulberry32(ctx.seed)
  const out: Placement[] = []

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]
    if (rng() > OCCUPANCY) continue

    const chosen = pickWeighted(rng, species, (s) => speciesScore(s, site, ctx))
    if (!chosen) continue

    const [min, max] = COLONY_SIZE[chosen.ecology.gregarious]
    const spread = COLONY_SPREAD[chosen.ecology.gregarious]
    const n = min + Math.floor(rng() * (max - min + 1))

    for (let k = 0; k < n; k++) {
      const angle = rng() * Math.PI * 2
      // Ведьмино кольцо растёт по окружности, остальные — пятном.
      const dist =
        chosen.ecology.gregarious === 'rings' ? spread * (0.85 + rng() * 0.3) : spread * Math.sqrt(rng())
      out.push({
        speciesId: chosen.id,
        x: site.x + Math.cos(angle) * dist,
        z: site.z + Math.sin(angle) * dist,
        y: site.y,
        rotationY: rng() * Math.PI * 2,
        age: 0.25 + rng() * 0.75,
        seed: Math.floor(rng() * 0xffffff),
      })
    }
  }

  return out
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/ecology/spawn.ts test/ecology/spawn.test.ts
git commit -m "feat: экологический отбор вида и раскладка колоний"
```

---

### Task 11: Движение игрока

**Files:**
- Create: `src/game/player.ts`
- Test: `test/game/player.test.ts`

**Interfaces:**
- Consumes: `ElevationProvider`
- Produces: `interface PlayerState { x: number; z: number; yaw: number; pitch: number; crouch: number }`, `interface PlayerInput { forward: number; strafe: number; dYaw: number; dPitch: number; crouching: boolean; dt: number }`, `interface Obstacle { x: number; z: number; radius: number }`, `eyeHeight(s: PlayerState): number`, `stepPlayer(s: PlayerState, i: PlayerInput, ground: ElevationProvider, obstacles: Obstacle[]): PlayerState`

Чистая функция состояния — вся математика движения проверяется без браузера.

- [ ] **Step 1: Написать падающий тест**

`test/game/player.test.ts`:

```ts
import { stepPlayer, eyeHeight, type PlayerState, type PlayerInput } from '../../src/game/player'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const start: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0 }
const idle: PlayerInput = { forward: 0, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, dt: 1 / 60 }

describe('stepPlayer', () => {
  it('без ввода стоит на месте', () => {
    const s = stepPlayer(start, idle, flat, [])
    expect(s.x).toBeCloseTo(0)
    expect(s.z).toBeCloseTo(0)
  })

  it('идёт вперёд по направлению взгляда', () => {
    const s = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0.5)
  })

  it('поворот меняет направление движения', () => {
    const turned = { ...start, yaw: Math.PI / 2 }
    const a = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const b = stepPlayer(turned, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBeGreaterThan(0.5)
  })

  it('взгляд вверх-вниз ограничен', () => {
    let s = start
    for (let i = 0; i < 200; i++) s = stepPlayer(s, { ...idle, dPitch: 0.1 }, flat, [])
    expect(s.pitch).toBeLessThanOrEqual(Math.PI / 2)
    expect(s.pitch).toBeGreaterThanOrEqual(-Math.PI / 2)
  })

  it('диагональ не быстрее прямой', () => {
    const straight = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const diagonal = stepPlayer(start, { ...idle, forward: 1, strafe: 1, dt: 1 }, flat, [])
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeLessThanOrEqual(Math.hypot(straight.x, straight.z) + 1e-6)
  })

  it('не проходит сквозь дерево', () => {
    // При yaw = 0 движение вперёд идёт в сторону −z, поэтому дерево ставим туда.
    const tree = { x: 0, z: -2, radius: 0.4 }
    let s = start
    for (let i = 0; i < 120; i++) {
      s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, flat, [tree])
    }
    // Радиус дерева плюс радиус игрока — ближе подойти нельзя.
    expect(Math.hypot(s.x - tree.x, s.z - tree.z)).toBeGreaterThanOrEqual(0.69)
  })

  it('приседание опускает камеру', () => {
    let s = start
    for (let i = 0; i < 60; i++) s = stepPlayer(s, { ...idle, crouching: true }, flat, [])
    expect(eyeHeight(s)).toBeLessThan(eyeHeight(start))
  })

  it('приседая идёт медленнее', () => {
    const crouched = { ...start, crouch: 1 }
    const fast = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const slow = stepPlayer(crouched, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.hypot(slow.x, slow.z)).toBeLessThan(Math.hypot(fast.x, fast.z))
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/game/player.ts`**

```ts
import type { ElevationProvider } from '../terrain/provider'

export interface PlayerState {
  x: number
  z: number
  /** Поворот вокруг вертикали, радианы. */
  yaw: number
  /** Наклон взгляда, радианы, ограничен ±π/2. */
  pitch: number
  /** 0 — стоит, 1 — присел полностью. */
  crouch: number
}

export interface PlayerInput {
  /** −1..1, вперёд положительно. */
  forward: number
  /** −1..1, вправо положительно. */
  strafe: number
  dYaw: number
  dPitch: number
  crouching: boolean
  dt: number
}

export interface Obstacle {
  x: number
  z: number
  radius: number
}

const WALK_SPEED = 2.4
const CROUCH_SPEED = 1.1
const STAND_EYE = 1.65
const CROUCH_EYE = 0.75
const CROUCH_RATE = 6
const PLAYER_RADIUS = 0.3
const MAX_PITCH = Math.PI / 2

/** Высота глаз над землёй с учётом приседания. */
export function eyeHeight(s: PlayerState): number {
  return STAND_EYE + (CROUCH_EYE - STAND_EYE) * s.crouch
}

/**
 * Шаг симуляции игрока. Чистая функция: новое состояние из старого.
 *
 * Столкновения — скольжение вдоль препятствия, а не остановка: упереться в
 * дерево и залипнуть в спокойной игре про лес неприятнее, чем обойти его.
 */
export function stepPlayer(
  s: PlayerState,
  i: PlayerInput,
  ground: ElevationProvider,
  obstacles: Obstacle[],
): PlayerState {
  const yaw = s.yaw + i.dYaw
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch + i.dPitch))

  const target = i.crouching ? 1 : 0
  const crouch = s.crouch + Math.sign(target - s.crouch) * Math.min(Math.abs(target - s.crouch), CROUCH_RATE * i.dt)

  // Нормализуем ввод, иначе по диагонали игрок бежал бы в 1.41 раза быстрее.
  let fx = i.forward
  let sx = i.strafe
  const len = Math.hypot(fx, sx)
  if (len > 1) {
    fx /= len
    sx /= len
  }

  const speed = (WALK_SPEED + (CROUCH_SPEED - WALK_SPEED) * crouch) * i.dt
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  let x = s.x + (-sin * fx + cos * sx) * speed
  let z = s.z + (-cos * fx - sin * sx) * speed

  for (const o of obstacles) {
    const dx = x - o.x
    const dz = z - o.z
    const d = Math.hypot(dx, dz)
    const min = o.radius + PLAYER_RADIUS
    if (d < min && d > 1e-6) {
      x = o.x + (dx / d) * min
      z = o.z + (dz / d) * min
    }
  }

  // Земля читается здесь же, чтобы вызывающий не забыл этого сделать.
  ground.heightAt(x, z)

  return { x, z, yaw, pitch, crouch }
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/game/player.ts test/game/player.test.ts
git commit -m "feat: движение игрока, приседание и скольжение вдоль деревьев"
```

---

### Task 12: Лес, по которому можно ходить

**Files:**
- Create: `src/game/controls.ts`, `src/game/scene.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: всё предыдущее
- Produces: `createControls(dom: HTMLElement): { read(dt: number): PlayerInput; dispose(): void }`, `const HALF_SIZE: number`, `interface Forest { scene: THREE.Scene; ground: ElevationProvider; trees: Tree[]; placements: Placement[]; mushroomObjects: THREE.Object3D[] }`, `createForest(seed: number): Forest`. Камеру и цикл кадров держит `main.ts`, а не сцена: так режим осмотра может открыть свой рендерер, не трогая лес.

Вторая большая точка «посмотреть глазами»: после неё по лесу можно гулять.

- [ ] **Step 1: Создать `src/game/controls.ts`**

```ts
import type { PlayerInput } from './player'

/**
 * Клавиатура и мышь → PlayerInput. Захват указателя по клику: без него
 * мышь упирается в край окна и осмотреться вокруг нельзя.
 */
export function createControls(dom: HTMLElement): { read(dt: number): PlayerInput; dispose(): void } {
  const keys = new Set<string>()
  let dYaw = 0
  let dPitch = 0

  const SENS = 0.0022

  const down = (e: KeyboardEvent) => keys.add(e.code)
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== dom) return
    dYaw -= e.movementX * SENS
    dPitch -= e.movementY * SENS
  }
  const click = () => dom.requestPointerLock()

  addEventListener('keydown', down)
  addEventListener('keyup', up)
  addEventListener('mousemove', move)
  dom.addEventListener('click', click)

  return {
    read(dt: number): PlayerInput {
      const input: PlayerInput = {
        forward: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
        strafe: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        dYaw,
        dPitch,
        crouching: keys.has('ShiftLeft') || keys.has('ControlLeft'),
        dt,
      }
      dYaw = 0
      dPitch = 0
      return input
    },
    dispose() {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('mousemove', move)
      dom.removeEventListener('click', click)
    },
  }
}
```

- [ ] **Step 2: Создать `src/game/scene.ts`**

```ts
import * as THREE from 'three'
import { proceduralTerrain } from '../terrain/procedural'
import { buildGround } from '../world/ground'
import { placeTrees, buildTreeMeshes, type Tree } from '../world/trees'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, type Placement } from '../ecology/spawn'
import { loadSpecies, speciesById } from '../species/load'
import { buildMushroom } from '../mushroom/build'
import type { ElevationProvider } from '../terrain/provider'

/** Половина стороны участка, м. 90 — примерно пятнадцать минут неспешной ходьбы. */
export const HALF_SIZE = 90

export interface Forest {
  scene: THREE.Scene
  ground: ElevationProvider
  trees: Tree[]
  placements: Placement[]
  /** Меш каждого гриба, тот же порядок, что и в placements. */
  mushroomObjects: THREE.Object3D[]
}

/**
 * Собирает лес: рельеф, земля, деревья, грибы по экологии.
 *
 * Месяц и «дней с дождя» пока заданы: сентябрь после недавнего дождя — лучшее
 * время в году, и для первого знакомства с игрой правильнее показать лес
 * богатым. Календарь появится вместе с сохранением.
 */
export function createForest(seed: number): Forest {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xa8c0a2)
  scene.fog = new THREE.Fog(0xa8c0a2, 30, 140)

  scene.add(new THREE.HemisphereLight(0xdfeede, 0x2f2a20, 1.9))
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.5)
  sun.position.set(40, 80, 20)
  scene.add(sun)

  const ground = proceduralTerrain(seed)
  scene.add(buildGround(ground, HALF_SIZE, 160))

  const trees = placeTrees(ground, HALF_SIZE, seed + 1, ['betula', 'picea', 'pinus', 'populus'])
  scene.add(buildTreeMeshes(trees))

  const sites = buildSites(ground, trees, HALF_SIZE, seed + 2, 'forest-mixed', 1600)
  const placements = spawnMushrooms(loadSpecies(), sites, { month: 9, seed: seed + 3, daysSinceRain: 2 })

  const mushroomObjects: THREE.Object3D[] = []
  for (const p of placements) {
    const species = speciesById(p.speciesId)
    if (!species) continue
    const g = buildMushroom(species.morphology, p.seed, p.age)
    g.position.set(p.x, ground.heightAt(p.x, p.z), p.z)
    g.rotateY(p.rotationY)
    g.userData.placement = p
    scene.add(g)
    mushroomObjects.push(g)
  }

  return { scene, ground, trees, placements, mushroomObjects }
}
```

- [ ] **Step 3: Переписать `src/main.ts` под прогулку**

```ts
import * as THREE from 'three'
import { createForest, HALF_SIZE } from './game/scene'
import { createControls } from './game/controls'
import { stepPlayer, eyeHeight, type PlayerState, type Obstacle } from './game/player'

declare global {
  interface Window { __READY?: boolean }
}

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const forest = createForest(2026)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 300)
const controls = createControls(renderer.domElement)

const obstacles: Obstacle[] = forest.trees.map((t) => ({ x: t.x, z: t.z, radius: t.radius }))
let player: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0 }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let last = performance.now()
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  player = stepPlayer(player, controls.read(dt), forest.ground, obstacles)
  player.x = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.x))
  player.z = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.z))

  camera.position.set(player.x, forest.ground.heightAt(player.x, player.z) + eyeHeight(player), player.z)
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')

  renderer.render(forest.scene, camera)
})

window.__READY = true
```

- [ ] **Step 4: Посмотреть глазами**

Run: `npm run dev`

Проверить: клик захватывает мышь, WASD ходит, Shift приседает, камера следует рельефу, в дерево не пройти, грибы стоят на земле и не парят. Присесть у гриба и посмотреть под шляпку — видно ли пластинки.

- [ ] **Step 5: Проверить сборку и закоммитить**

```bash
npm run build && npm run boot-check
git add src/game src/main.ts
git commit -m "feat: лес, по которому можно ходить от первого лица"
git push
```

---

### Task 13: Прицел, подбор и корзина

**Files:**
- Create: `src/game/pick.ts`, `src/ui/hud.ts`
- Modify: `src/main.ts`
- Test: `test/game/pick.test.ts`

**Interfaces:**
- Consumes: `Placement`, `Species`
- Produces: `interface Basket { items: Placement[]; add(p: Placement): boolean; readonly full: boolean }`, `createBasket(capacity?: number): Basket`, `nearestInView(camera: THREE.Camera, objects: THREE.Object3D[], maxDistance: number): THREE.Object3D | null`, `createHud(root: HTMLElement): { setTarget(name: string | null): void; setBasket(n: number, cap: number): void }`

- [ ] **Step 1: Написать падающий тест на корзину**

`test/game/pick.test.ts`:

```ts
import { createBasket } from '../../src/game/pick'
import type { Placement } from '../../src/ecology/spawn'

const item = (id: string): Placement => ({
  speciesId: id, x: 0, z: 0, y: 0, rotationY: 0, age: 0.5, seed: 1,
})

describe('createBasket', () => {
  it('пустая в начале', () => {
    expect(createBasket().items).toHaveLength(0)
  })

  it('принимает грибы', () => {
    const b = createBasket()
    expect(b.add(item('boletus-edulis'))).toBe(true)
    expect(b.items).toHaveLength(1)
  })

  it('переполняется и больше не принимает', () => {
    const b = createBasket(2)
    b.add(item('a'))
    b.add(item('b'))
    expect(b.full).toBe(true)
    expect(b.add(item('c'))).toBe(false)
    expect(b.items).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/game/pick.ts`**

```ts
import * as THREE from 'three'
import type { Placement } from '../ecology/spawn'

export interface Basket {
  readonly items: Placement[]
  add(p: Placement): boolean
  readonly full: boolean
}

/** Корзина. Ограничена нарочно: она задаёт ритм вылазки и заставляет выбирать. */
export function createBasket(capacity = 24): Basket {
  const items: Placement[] = []
  return {
    items,
    add(p) {
      if (items.length >= capacity) return false
      items.push(p)
      return true
    },
    get full() {
      return items.length >= capacity
    },
  }
}

const raycaster = new THREE.Raycaster()
const centre = new THREE.Vector2(0, 0)

/**
 * Что под прицелом. Луч из центра экрана: грибник смотрит туда, куда идёт,
 * и подбирать надо то, на что он смотрит, а не то, что ближе всего.
 */
export function nearestInView(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
): THREE.Object3D | null {
  raycaster.setFromCamera(centre, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(objects, true)
  if (hits.length === 0) return null
  // Попали в шляпку или ножку — вернуть сам гриб, а не его деталь.
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.placement) o = o.parent
  return o
}
```

- [ ] **Step 4: Реализовать `src/ui/hud.ts`**

```ts
/**
 * Прицел, подсказка и счётчик корзины. Обычный DOM поверх canvas: текст в
 * трёхмерной сцене читается хуже, а нам нужны названия видов на двух языках.
 */
export function createHud(root: HTMLElement): {
  setTarget(name: string | null): void
  setBasket(n: number, cap: number): void
} {
  root.insertAdjacentHTML(
    'beforeend',
    `<div id="crosshair" style="position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;opacity:.55"></div>
     <div id="hint" style="position:fixed;left:50%;top:calc(50% + 24px);transform:translateX(-50%);font-size:15px;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .12s"></div>
     <div id="basket" style="position:fixed;right:16px;bottom:14px;font-size:14px;text-shadow:0 1px 3px #000;opacity:.85"></div>`,
  )
  const hint = root.querySelector<HTMLElement>('#hint')!
  const basket = root.querySelector<HTMLElement>('#basket')!

  return {
    setTarget(name) {
      hint.textContent = name ? `${name} — E` : ''
      hint.style.opacity = name ? '1' : '0'
    },
    setBasket(n, cap) {
      basket.textContent = `🧺 ${n} / ${cap}`
    },
  }
}
```

- [ ] **Step 5: Подключить в `src/main.ts`**

Добавить после создания `controls`:

```ts
import { createBasket, nearestInView } from './game/pick'
import { createHud } from './ui/hud'
import { speciesById } from './species/load'

const BASKET_CAP = 24
const basket = createBasket(BASKET_CAP)
const hud = createHud(document.getElementById('ui')!)
hud.setBasket(0, BASKET_CAP)

let aimed: THREE.Object3D | null = null

addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || !aimed) return
  const placement = aimed.userData.placement
  if (!basket.add(placement)) return
  aimed.removeFromParent()
  forest.mushroomObjects.splice(forest.mushroomObjects.indexOf(aimed), 1)
  aimed = null
  hud.setTarget(null)
  hud.setBasket(basket.items.length, BASKET_CAP)
})
```

И внутри цикла кадров, перед `renderer.render`:

```ts
  aimed = nearestInView(camera, forest.mushroomObjects, 3)
  const species = aimed ? speciesById(aimed.userData.placement.speciesId) : undefined
  hud.setTarget(species ? species.name.ru : null)
```

- [ ] **Step 6: Проверить**

Run: `npm test` → PASS; `npm run dev` → подойти к грибу, увидеть подсказку с названием, нажать E, гриб исчезает, счётчик корзины растёт.

- [ ] **Step 7: Закоммитить**

```bash
git add src/game/pick.ts src/ui/hud.ts src/main.ts test/game/pick.test.ts
git commit -m "feat: прицел, подбор гриба и корзина"
```

---

### Task 14: Режим осмотра

**Files:**
- Create: `src/ui/inspect.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `buildMushroom`, `attachOrbit`, `Species`
- Produces: `openInspect(species: Species, seed: number, age: number, onCollect: () => void, onLeave: () => void): void`

Ключевой экран проекта: имя гриб называет сразу, а здесь игрок узнаёт, **почему** это он. Отдельный маленький рендерер поверх игры — так модель можно крутить, не трогая сцену леса.

- [ ] **Step 1: Реализовать `src/ui/inspect.ts`**

```ts
import * as THREE from 'three'
import { buildMushroom } from '../mushroom/build'
import { attachOrbit } from './orbit'
import type { Species } from '../species/schema'
import { EDIBILITY } from '../species/schema'

const EDIBILITY_LABEL: Record<(typeof EDIBILITY)[number], string> = {
  edible: 'съедобный',
  conditional: 'условно съедобный',
  inedible: 'несъедобный',
  poisonous: 'ядовитый',
  deadly: 'смертельно ядовитый',
}

const EDIBILITY_COLOR: Record<(typeof EDIBILITY)[number], string> = {
  edible: '#7ec46b',
  conditional: '#d8c169',
  inedible: '#9a9a9a',
  poisonous: '#e08a4a',
  deadly: '#e2564a',
}

/**
 * Гриб в руках: модель крутится, рядом карточка с признаками.
 *
 * Имя игрок уже знает — оно было в подсказке. Ценность этого экрана в другом:
 * увидеть вольву и кольцо своими глазами, прочитать, на чём гриб растёт, и
 * узнать про опасных двойников. Это и есть обучение, ради которого игра.
 */
export function openInspect(
  species: Species,
  seed: number,
  age: number,
  onCollect: () => void,
  onLeave: () => void,
): void {
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'inspect'
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(14,18,13,.92);pointer-events:auto;display:flex;font-family:system-ui,sans-serif;color:#eee'
  document.getElementById('ui')!.appendChild(overlay)

  const view = document.createElement('div')
  view.style.cssText = 'flex:1 1 55%;position:relative;cursor:grab'
  const card = document.createElement('div')
  card.style.cssText = 'flex:1 1 45%;max-width:480px;padding:32px 34px;overflow:auto'
  overlay.append(view, card)

  const m = species.morphology
  const hymenium = m.hymenium.type === 'gills' ? 'пластинки' : m.hymenium.type === 'pores' ? 'трубчатый слой' : 'гименофор'
  card.innerHTML = `
    <h1 style="margin:0 0 2px;font-size:26px">${species.name.ru}</h1>
    <div style="opacity:.6;font-style:italic;margin-bottom:14px">${species.name.la}</div>
    <div style="display:inline-block;padding:4px 12px;border-radius:14px;margin-bottom:20px;color:#12160f;font-weight:600;background:${EDIBILITY_COLOR[species.edibility]}">
      ${EDIBILITY_LABEL[species.edibility]}
    </div>
    <p style="line-height:1.55;opacity:.9">${species.text.ru}</p>
    <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.08em;opacity:.55;margin:24px 0 8px">Признаки</h2>
    <ul style="line-height:1.7;padding-left:20px;margin:0">
      <li>Шляпка ${m.cap.diameter[0]}–${m.cap.diameter[1]} мм, поверхность: ${m.cap.surface}</li>
      <li>Снизу — ${hymenium}, прикрепление: ${m.hymenium.attachment}</li>
      <li>Ножка ${m.stipe.height[0]}–${m.stipe.height[1]} мм${m.stipe.ring !== 'none' ? ', с кольцом' : ', без кольца'}${m.stipe.volva !== 'none' ? ', с вольвой у основания' : ''}</li>
      <li>Субстрат: ${species.ecology.substrate}${species.ecology.mycorrhizal.length ? `, партнёры: ${species.ecology.mycorrhizal.join(', ')}` : ''}</li>
    </ul>
    ${species.lookalikes.length ? `<h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.08em;opacity:.55;margin:24px 0 8px">Двойники</h2><div style="opacity:.9">${species.lookalikes.join(', ')}</div>` : ''}
    <div style="margin-top:32px;display:flex;gap:12px">
      <button id="collect" style="padding:11px 22px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-size:15px;font-weight:600;cursor:pointer">В корзину</button>
      <button id="leave" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">Оставить расти</button>
    </div>`

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(view.clientWidth, view.clientHeight)
  view.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(1, 2, 1.5)
  scene.add(key)

  const model = buildMushroom(species.morphology, seed, age)
  // Ставим гриб так, чтобы центр модели был в начале координат — иначе орбита
  // вращается вокруг земли под ним, и разглядеть изнанку невозможно.
  const box = new THREE.Box3().setFromObject(model)
  const centre = box.getCenter(new THREE.Vector3())
  model.position.sub(centre)
  scene.add(model)

  const camera = new THREE.PerspectiveCamera(45, view.clientWidth / view.clientHeight, 0.005, 10)
  const size = box.getSize(new THREE.Vector3())
  const detachOrbit = attachOrbit(camera, view, new THREE.Vector3(0, 0, 0), Math.max(size.x, size.y) * 2.4)

  renderer.setAnimationLoop(() => renderer.render(scene, camera))

  const close = () => {
    renderer.setAnimationLoop(null)
    detachOrbit()
    renderer.dispose()
    overlay.remove()
    removeEventListener('keydown', onKey)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') { close(); onLeave() }
  }
  addEventListener('keydown', onKey)

  card.querySelector('#collect')!.addEventListener('click', () => { close(); onCollect() })
  card.querySelector('#leave')!.addEventListener('click', () => { close(); onLeave() })
}
```

- [ ] **Step 2: Подключить в `src/main.ts`**

Заменить обработчик `KeyE` из задачи 13 на открытие осмотра:

```ts
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || !aimed || document.getElementById('inspect')) return
  const target = aimed
  const placement = target.userData.placement
  const species = speciesById(placement.speciesId)
  if (!species) return

  openInspect(
    species,
    placement.seed,
    placement.age,
    () => {
      if (!basket.add(placement)) return
      target.removeFromParent()
      forest.mushroomObjects.splice(forest.mushroomObjects.indexOf(target), 1)
      hud.setBasket(basket.items.length, BASKET_CAP)
    },
    () => {},
  )
  aimed = null
  hud.setTarget(null)
})
```

Также в цикле кадров пропускать прицеливание, пока открыт осмотр:

```ts
  aimed = document.getElementById('inspect') ? null : nearestInView(camera, forest.mushroomObjects, 3)
```

- [ ] **Step 3: Посмотреть глазами**

Run: `npm run dev`

Подойти к мухомору, нажать E: гриб в руках, вращается мышью, снизу видны пластинки, справа карточка с признаками и красной плашкой «ядовитый». «Оставить расти» возвращает в лес, гриб на месте. «В корзину» — гриб исчезает, счётчик растёт.

- [ ] **Step 4: Проверить сборку и закоммитить**

```bash
npm run build && npm run boot-check
git add src/ui/inspect.ts src/main.ts
git commit -m "feat: режим осмотра — гриб в руках и карточка признаков"
git push
```

---

### Task 15: Сохранение в IndexedDB

**Files:**
- Create: `src/save/store.ts`
- Test: `test/save/store.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `interface Find { speciesId: string; x: number; z: number; at: number }`, `interface SaveData { discovered: string[]; finds: Find[]; lang: 'ru' | 'en'; disclaimerSeen: boolean }`, `emptySave(): SaveData`, `applyFind(save: SaveData, find: Find): SaveData`, `loadSave(): Promise<SaveData>`, `persistSave(save: SaveData): Promise<void>`

Логика записи отделена от IndexedDB: чистая `applyFind` тестируется, а обёртка над хранилищем — тонкая.

- [ ] **Step 1: Написать падающий тест**

`test/save/store.test.ts`:

```ts
import { emptySave, applyFind, type Find } from '../../src/save/store'

const find = (id: string, at = 1000): Find => ({ speciesId: id, x: 1, z: 2, at })

describe('applyFind', () => {
  it('первая находка открывает вид', () => {
    const s = applyFind(emptySave(), find('boletus-edulis'))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('повторная находка не дублирует вид', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('но записывает каждую находку', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.finds).toHaveLength(2)
  })

  it('не меняет исходный объект', () => {
    const before = emptySave()
    applyFind(before, find('boletus-edulis'))
    expect(before.discovered).toHaveLength(0)
  })

  it('пустое сохранение валидно', () => {
    const s = emptySave()
    expect(s.discovered).toEqual([])
    expect(s.finds).toEqual([])
    expect(s.disclaimerSeen).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/save/store.ts`**

```ts
export interface Find {
  speciesId: string
  x: number
  z: number
  /** Время находки, Date.now(). */
  at: number
}

export interface SaveData {
  /** Виды, открытые в энциклопедии, в порядке первой находки. */
  discovered: string[]
  finds: Find[]
  lang: 'ru' | 'en'
  disclaimerSeen: boolean
}

const DB_NAME = 'itffm'
const STORE = 'save'
const KEY = 'current'

export function emptySave(): SaveData {
  return { discovered: [], finds: [], lang: 'ru', disclaimerSeen: false }
}

/** Чистое применение находки. Возвращает новый объект, старый не трогает. */
export function applyFind(save: SaveData, find: Find): SaveData {
  return {
    ...save,
    discovered: save.discovered.includes(find.speciesId)
      ? save.discovered
      : [...save.discovered, find.speciesId],
    finds: [...save.finds, find],
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Читает сохранение. Любая ошибка — начинаем с чистого листа, а не падаем. */
export async function loadSave(): Promise<SaveData> {
  try {
    const db = await openDb()
    return await new Promise<SaveData>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve({ ...emptySave(), ...(req.result as Partial<SaveData> | undefined) })
      req.onerror = () => reject(req.error)
    })
  } catch {
    return emptySave()
  }
}

export async function persistSave(save: SaveData): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(save, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Приватный режим или запрет на хранение: играть это не мешает.
  }
}
```

- [ ] **Step 4: Подключить в `src/main.ts`**

В начале, до цикла кадров:

```ts
import { loadSave, persistSave, applyFind, type SaveData } from './save/store'

let save: SaveData = await loadSave()
```

`main.ts` становится модулем с верхнеуровневым `await` — это поддерживается в ES-модулях и Vite собирает такое без настроек.

В обработчике «В корзину» внутри `openInspect`, после `basket.add`:

```ts
      save = applyFind(save, { speciesId: placement.speciesId, x: placement.x, z: placement.z, at: Date.now() })
      void persistSave(save)
```

- [ ] **Step 5: Проверить**

Run: `npm test` → PASS; `npm run dev` → собрать гриб, перезагрузить страницу, открыть DevTools → Application → IndexedDB → `itffm`: находка на месте.

- [ ] **Step 6: Закоммитить**

```bash
git add src/save/store.ts test/save/store.test.ts src/main.ts
git commit -m "feat: сохранение находок и открытых видов в IndexedDB"
```

---

### Task 16: Энциклопедия

**Files:**
- Create: `src/ui/encyclopedia.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loadSpecies`, `buildMushroom`, `openInspect`, `SaveData`
- Produces: `openEncyclopedia(save: SaveData): void`

Открывается на `Tab`. Неоткрытые виды — силуэты с подсказкой, где искать: это превращает энциклопедию из справочника в список целей.

- [ ] **Step 1: Реализовать `src/ui/encyclopedia.ts`**

```ts
import * as THREE from 'three'
import { loadSpecies } from '../species/load'
import { buildMushroom } from '../mushroom/build'
import { hashString } from '../util/rng'
import type { SaveData } from '../save/store'
import type { Species } from '../species/schema'

const BIOME_LABEL: Record<string, string> = {
  'forest-broadleaved': 'лиственный лес',
  'forest-coniferous': 'хвойный лес',
  'forest-mixed': 'смешанный лес',
  'meadow-scrub': 'опушки и луга',
  'dunes-coast': 'дюны',
  wetland: 'болото',
  'cave-adit': 'штольни и пещеры',
  'park-urban': 'парки',
  alpine: 'высокогорье',
}

/**
 * Превью вида: тот же генератор, что и в лесу, отрисованный один раз в
 * картинку. Живой рендерер на каждую карточку браузер бы не выдержал, а
 * снимок — выдержит, и вид на карточке ровно тот же, что игрок встретит.
 */
function renderPreview(species: Species, size: number, silhouette: boolean): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(size, size)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2))

  const model = buildMushroom(species.morphology, hashString(species.id), 0.7)
  if (silhouette) {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = new THREE.MeshBasicMaterial({ color: 0x1c2118 })
    })
  }
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  scene.add(model)

  const extent = Math.max(...box.getSize(new THREE.Vector3()).toArray())
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10)
  camera.position.set(extent * 1.6, extent * 0.9, extent * 1.6)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL()
  renderer.dispose()
  return url
}

/** Энциклопедия: что уже найдено и что ещё предстоит. */
export function openEncyclopedia(save: SaveData): void {
  if (document.getElementById('encyclopedia')) return
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'encyclopedia'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;overflow:auto;padding:36px 40px;font-family:system-ui,sans-serif;color:#eee'
  document.getElementById('ui')!.appendChild(overlay)

  const all = loadSpecies()
  const found = new Set(save.discovered)

  const cards = all
    .map((s) => {
      const known = found.has(s.id)
      const preview = renderPreview(s, 180, !known)
      const where = s.ecology.biomes.map((b) => BIOME_LABEL[b] ?? b).join(', ')
      return `<div style="background:#171d15;border-radius:12px;padding:16px;text-align:center">
        <img src="${preview}" width="180" height="180" alt="" style="display:block;margin:0 auto 10px" />
        <div style="font-weight:600">${known ? s.name.ru : '???'}</div>
        <div style="font-size:13px;opacity:.55;font-style:italic;margin-top:2px">${known ? s.name.la : where}</div>
      </div>`
    })
    .join('')

  overlay.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:6px">
      <h1 style="margin:0;font-size:28px">Энциклопедия</h1>
      <span style="opacity:.55">${found.size} из ${all.length}</span>
      <span style="margin-left:auto;opacity:.5;font-size:14px">Tab — закрыть</span>
    </div>
    <p style="margin:0 0 26px;padding:10px 14px;background:#2a1f14;border-left:3px solid #d8a04a;border-radius:0 6px 6px 0;font-size:13px;line-height:1.5;opacity:.9;max-width:760px">
      Игра не является определителем грибов. Не используйте её, чтобы решать,
      что можно есть: реальный гриб определяют по совокупности признаков, а
      ошибка стоит здоровья.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:16px">${cards}</div>`

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'Tab' && e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
```

- [ ] **Step 2: Подключить в `src/main.ts`**

```ts
import { openEncyclopedia } from './ui/encyclopedia'

addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return
  e.preventDefault()
  if (!document.getElementById('encyclopedia')) openEncyclopedia(save)
})
```

- [ ] **Step 3: Посмотреть глазами**

Run: `npm run dev`

Tab открывает энциклопедию: собранные виды показаны цветными с названием, несобранные — тёмными силуэтами с подсказкой биома. Дисклеймер на месте. Tab закрывает.

- [ ] **Step 4: Проверить сборку и закоммитить**

```bash
npm run build && npm run boot-check
git add src/ui/encyclopedia.ts src/main.ts
git commit -m "feat: энциклопедия с силуэтами неоткрытых видов"
git push
```

---

### Task 17: Два языка, дисклеймер и разбор корзины

**Files:**
- Create: `src/i18n/i18n.ts`
- Modify: `src/ui/hud.ts`, `src/ui/inspect.ts`, `src/ui/encyclopedia.ts`, `src/main.ts`
- Test: `test/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `SaveData`
- Produces: `type Lang = 'ru' | 'en'`, `setLang(l: Lang): void`, `getLang(): Lang`, `t(key: keyof typeof RU): string`, `speciesName(s: Species): string`, `speciesText(s: Species): string`

Последняя задача плана: собирает все строки в одно место, добавляет переключатель языка, дисклеймер при первом запуске и экран разбора корзины, которым заканчивается вылазка.

- [ ] **Step 1: Написать падающий тест**

`test/i18n/i18n.test.ts`:

```ts
import { setLang, getLang, t, speciesName, RU, EN } from '../../src/i18n/i18n'
import { speciesById } from '../../src/species/load'

describe('i18n', () => {
  it('по умолчанию русский', () => {
    expect(getLang()).toBe('ru')
  })

  it('переключается', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    setLang('ru')
  })

  it('в обоих словарях одни и те же ключи', () => {
    expect(Object.keys(RU).sort()).toEqual(Object.keys(EN).sort())
  })

  it('ни одно значение не пустое', () => {
    for (const dict of [RU, EN]) {
      for (const [k, v] of Object.entries(dict)) expect(v.length, `${k} пуст`).toBeGreaterThan(0)
    }
  })

  it('переводит по текущему языку', () => {
    setLang('en')
    expect(t('collect')).toBe(EN.collect)
    setLang('ru')
    expect(t('collect')).toBe(RU.collect)
  })

  it('название вида следует за языком', () => {
    const s = speciesById('boletus-edulis')!
    setLang('en')
    expect(speciesName(s)).toBe(s.name.en)
    setLang('ru')
    expect(speciesName(s)).toBe(s.name.ru)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/i18n/i18n.ts`**

```ts
import type { Species } from '../species/schema'

export type Lang = 'ru' | 'en'

export const RU = {
  collect: 'В корзину',
  leave: 'Оставить расти',
  traits: 'Признаки',
  lookalikes: 'Двойники',
  encyclopedia: 'Энциклопедия',
  closeHint: 'Tab — закрыть',
  of: 'из',
  unknown: '???',
  basketFull: 'Корзина полна',
  tally: 'Разбор корзины',
  tallyEmpty: 'Корзина пуста — но прогулка всё равно удалась.',
  edible: 'съедобный',
  conditional: 'условно съедобный',
  inedible: 'несъедобный',
  poisonous: 'ядовитый',
  deadly: 'смертельно ядовитый',
  disclaimer:
    'Игра не является определителем грибов. Не используйте её, чтобы решать, что можно есть: реальный гриб определяют по совокупности признаков, а ошибка стоит здоровья.',
  understood: 'Понятно',
  controls: 'WASD — идти, Shift — присесть, E — рассмотреть, Tab — энциклопедия',
} as const

export const EN: Record<keyof typeof RU, string> = {
  collect: 'Into the basket',
  leave: 'Leave it growing',
  traits: 'Field marks',
  lookalikes: 'Look-alikes',
  encyclopedia: 'Encyclopedia',
  closeHint: 'Tab to close',
  of: 'of',
  unknown: '???',
  basketFull: 'The basket is full',
  tally: 'Sorting the basket',
  tallyEmpty: 'An empty basket — but the walk was still worth it.',
  edible: 'edible',
  conditional: 'edible with care',
  inedible: 'inedible',
  poisonous: 'poisonous',
  deadly: 'deadly poisonous',
  disclaimer:
    'This game is not a field guide. Do not use it to decide what is safe to eat: a real mushroom is identified from the whole set of its characters, and a mistake costs your health.',
  understood: 'Understood',
  controls: 'WASD to walk, Shift to crouch, E to examine, Tab for the encyclopedia',
}

let current: Lang = 'ru'

export function setLang(l: Lang): void {
  current = l
}

export function getLang(): Lang {
  return current
}

export function t(key: keyof typeof RU): string {
  return current === 'ru' ? RU[key] : EN[key]
}

export function speciesName(s: Species): string {
  return current === 'ru' ? s.name.ru : s.name.en
}

export function speciesText(s: Species): string {
  return current === 'ru' ? s.text.ru : s.text.en
}
```

- [ ] **Step 4: Перевести UI на словарь**

В `src/ui/inspect.ts`: заменить `species.name.ru` на `speciesName(species)`, `species.text.ru` на `speciesText(species)`, подписи кнопок — на `t('collect')` и `t('leave')`, заголовки — на `t('traits')` и `t('lookalikes')`, а `EDIBILITY_LABEL` — на `t(species.edibility)` (ключи словаря совпадают со значениями `Edibility` намеренно).

В `src/ui/encyclopedia.ts`: заголовок — `t('encyclopedia')`, `из` — `t('of')`, `???` — `t('unknown')`, текст предупреждения — `t('disclaimer')`, подсказка — `t('closeHint')`, названия видов — `speciesName(s)`.

В `src/ui/hud.ts`: подсказка прицела принимает уже готовое имя, менять нечего.

В `src/main.ts`: имя в подсказке — `speciesName(species)`.

- [ ] **Step 5: Добавить дисклеймер и разбор корзины в `src/main.ts`**

```ts
import { t, setLang, speciesName } from './i18n/i18n'
import { speciesById } from './species/load'

setLang(save.lang)

if (!save.disclaimerSeen) {
  const modal = document.createElement('div')
  modal.style.cssText =
    'position:fixed;inset:0;background:#0f130ef2;pointer-events:auto;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee'
  modal.innerHTML = `<div style="max-width:520px;padding:34px">
    <p style="line-height:1.6;margin:0 0 24px">${t('disclaimer')}</p>
    <p style="opacity:.6;font-size:14px;margin:0 0 24px">${t('controls')}</p>
    <button id="ok" style="padding:11px 24px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-weight:600;font-size:15px;cursor:pointer">${t('understood')}</button>
  </div>`
  document.getElementById('ui')!.appendChild(modal)
  modal.querySelector('#ok')!.addEventListener('click', () => {
    modal.remove()
    save = { ...save, disclaimerSeen: true }
    void persistSave(save)
  })
}

/** Разбор корзины: чем закончилась вылазка. Вызывается по клавише Q. */
function showTally(): void {
  if (document.getElementById('tally')) return
  document.exitPointerLock()
  const counts = new Map<string, number>()
  for (const item of basket.items) counts.set(item.speciesId, (counts.get(item.speciesId) ?? 0) + 1)

  const rows = [...counts.entries()]
    .map(([id, n]) => {
      const s = speciesById(id)!
      return `<li style="line-height:1.8">${speciesName(s)} — ${n} <span style="opacity:.6">(${t(s.edibility)})</span></li>`
    })
    .join('')

  const overlay = document.createElement('div')
  overlay.id = 'tally'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130ef2;pointer-events:auto;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee'
  overlay.innerHTML = `<div style="max-width:460px;padding:34px">
    <h1 style="margin:0 0 18px;font-size:24px">${t('tally')}</h1>
    ${rows ? `<ul style="padding-left:20px;margin:0">${rows}</ul>` : `<p style="opacity:.8">${t('tallyEmpty')}</p>`}
    <p style="opacity:.5;font-size:14px;margin-top:26px">${t('closeHint')}</p>
  </div>`
  document.getElementById('ui')!.appendChild(overlay)

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.code !== 'KeyQ' && e.code !== 'Tab') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyQ') showTally()
})
```

- [ ] **Step 6: Проверить всё**

Run: `npm test` → PASS
Run: `npm run build && npm run boot-check` → OK
Run: `npm run dev` → при первом запуске (после очистки IndexedDB) виден дисклеймер и подсказка по управлению; собрать несколько грибов, нажать Q — разбор корзины с названиями и съедобностью.

- [ ] **Step 7: Закоммитить и запушить**

```bash
git add src/i18n src/ui src/main.ts test/i18n/i18n.test.ts
git commit -m "feat: два языка, дисклеймер при первом запуске, разбор корзины"
git push
```

---

## Что получилось и что дальше

После задачи 17 на Pages стоит играбельная вещь: лес, ходьба от первого лица, грибы по экологии, осмотр в руках, энциклопедия, сохранение, два языка.

### Что из спеки сюда осознанно не вошло

Чтобы это не потерялось, три пункта спеки остаются за рамками этого плана:

1. **Гео-конвейер** (спека, раздел 6) — план 2, `…-real-geography.md`. Заменит
   `terrain/procedural.ts` на реальный DEM из AWS Terrain Tiles и `world/trees.ts`
   — на деревья из полигонов OSM, добавит выбор места по названию и запасной
   demo-лес. `ElevationProvider` и `Tree` спроектированы так, что менять придётся
   только эти два модуля.
2. **ETL и фотографии** (спека, раздел 4.2) — план 3. Скрипты сбора таксономии из
   GBIF, названий из Wikidata и фото из iNaturalist Open Data, плюс показ фото с
   атрибуцией в карточке вида и фильтры в энциклопедии. Поле `media` в схеме уже
   есть и валидируется, так что данные лягут в готовое место; в этом плане оно
   просто пустое.
3. **База из 20–25 видов** — работа с данными, а не с кодом: новый YAML в
   `data/species/`, тесты валидации и сборки моделей подхватывают его сами. Три
   вида здесь взяты как проверка генератора на разных типах морфологии, а не как
   целевой объём.

Полный MVP из спеки = этот план + план 2 + расширенная база видов.
