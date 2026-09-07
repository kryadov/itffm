# План 2: реальная география

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить выдуманный лес настоящим: игрок вводит место — свой дачный лес, Лосиный Остров, Куршскую косу — и собирает грибы там, по экологии этого самого леса.

**Architecture:** Рельеф приходит из AWS Terrain Tiles, растительность и вода — из OpenStreetMap через Overpass. Всё считается в браузере, бэкенда нет. `ElevationProvider` и `Tree` спроектированы под эту подмену в первом плане, поэтому меняются только `terrain/` и `world/trees.ts`; `ecology/`, `mushroom/`, `game/` и `ui/` не трогаются вовсе.

**Tech Stack:** TypeScript 5.6, Vite 5.4, Three.js 0.169, Vitest 2.1. Никаких новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-09-07-mushroom-game-design.md`, раздел 6.

**Источник переносимого кода:** соседний репозиторий `../race-the-city` (он же `kryadov/race-the-city`). Пути вида `rtc:src/geo/overpass.ts` означают файл в нём.

## Global Constraints

Всё из плана 1 остаётся в силе. Дополнительно:

- **Ни одного нового пакета.** Всё переносимое — чистый TypeScript поверх `three`.
- **Язык:** код на английском, документы и коммиты на русском (как в плане 1).
- **Детерминизм там, где он был.** Данные из сети детерминированными быть не могут, но всё, что мы из них выводим — породы деревьев внутри полигона, расстановка, микрорельеф — обязано зависеть только от сида и данных, а не от порядка ответа сервера.
- **Игра всегда запускается.** Нет сети, Overpass молчит, разметка пустая — игрок всё равно попадает в лес. Ни один сетевой сбой не показывает пустой экран.
- **Атрибуция обязательна:** OpenStreetMap (ODbL) и Terrain Tiles — на экране загрузки и в «о программе». Без неё релиз выкатывать нельзя.
- **Переносимый код адаптируется, а не копируется вслепую.** race-the-city возит машину по городу; мы водим человека по лесу. Всё, что там про здания, дороги и полосы движения, выбрасывается.

## Карта файлов

| Файл | Что делает | Откуда |
|---|---|---|
| `src/geo/types.ts` | `LatLon`, `Vec2`, `Bounds`, наш `WorldData` | rtc, сильно урезав |
| `src/geo/project.ts` | Гео → метры и обратно | rtc, как есть |
| `src/geo/geocode.ts` | Поиск места по названию | rtc, приоритеты перевернуть на лес |
| `src/geo/overpass.ts` | Запрос с зеркалами и таймаутами | rtc, запрос переписать под лес |
| `src/geo/cache.ts` | Кэш ответов в IndexedDB | rtc, как есть |
| `src/geo/parse.ts` | Ответ Overpass → `WorldData` | rtc, переписать под наши теги |
| `src/terrain/terrarium.ts` | Высоты из Terrarium-тайлов | rtc, как есть |
| `src/terrain/gridded.ts` | Билинейная сетка высот | rtc, как есть |
| `src/terrain/detail.ts` | DEM + фрактальный микрорельеф | новое |
| `src/world/biome.ts` | Теги OSM → биом в точке | новое |
| `src/world/osmTrees.ts` | Деревья по полигонам леса | новое |
| `src/world/demoForest.ts` | Запечённый лес на случай сбоя | новое |
| `src/ui/placePicker.ts` | Экран выбора места и загрузки | новое |

---

### Task 1: Гео-примитивы и проекция

**Files:**
- Create: `src/geo/types.ts`, `src/geo/project.ts`
- Test: `test/geo/project.test.ts`

**Interfaces:**
- Produces: `interface LatLon { lat: number; lon: number }`, `interface Vec2 { x: number; z: number }`, `interface BBox { south: number; west: number; north: number; east: number }`, `class Projector { toLocal(p: LatLon): Vec2; toLatLon(v: Vec2): LatLon }`, `bboxAround(center: LatLon, radiusMeters: number): BBox`

- [ ] **Step 1: Написать падающий тест**

`test/geo/project.test.ts`:

```ts
import { Projector, bboxAround } from '../../src/geo/project'

const moscow = { lat: 55.75, lon: 37.62 }

describe('Projector', () => {
  it('puts the centre at the origin', () => {
    const p = new Projector(moscow).toLocal(moscow)
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(0)
  })

  it('round-trips a point', () => {
    const proj = new Projector(moscow)
    const back = proj.toLatLon(proj.toLocal({ lat: 55.76, lon: 37.63 }))
    expect(back.lat).toBeCloseTo(55.76, 6)
    expect(back.lon).toBeCloseTo(37.63, 6)
  })

  it('sends north to -z', () => {
    expect(new Projector(moscow).toLocal({ lat: 55.76, lon: 37.62 }).z).toBeLessThan(0)
  })

  it('sends east to +x', () => {
    expect(new Projector(moscow).toLocal({ lat: 55.75, lon: 37.63 }).x).toBeGreaterThan(0)
  })

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = new Projector({ lat: 0, lon: 0 }).toLocal({ lat: 0, lon: 1 }).x
    const atMoscow = new Projector(moscow).toLocal({ lat: 55.75, lon: 38.62 }).x
    expect(atMoscow).toBeLessThan(atEquator)
  })

  it('scales one degree of latitude to about 111 km', () => {
    expect(Math.abs(new Projector(moscow).toLocal({ lat: 56.75, lon: 37.62 }).z)).toBeCloseTo(111320, -2)
  })
})

describe('bboxAround', () => {
  it('brackets the centre', () => {
    const b = bboxAround(moscow, 1000)
    expect(b.south).toBeLessThan(moscow.lat)
    expect(b.north).toBeGreaterThan(moscow.lat)
    expect(b.west).toBeLessThan(moscow.lon)
    expect(b.east).toBeGreaterThan(moscow.lon)
  })

  it('spans roughly twice the radius', () => {
    const b = bboxAround(moscow, 1000)
    const proj = new Projector(moscow)
    const height = Math.abs(
      proj.toLocal({ lat: b.north, lon: moscow.lon }).z - proj.toLocal({ lat: b.south, lon: moscow.lon }).z,
    )
    expect(height).toBeCloseTo(2000, -2)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Создать `src/geo/types.ts`**

Только то, что нужно лесу. Всё про здания, дороги, рельсы и полосы движения из
исходника не переносится.

```ts
export interface LatLon {
  lat: number
  lon: number
}

/** Local metric coordinates: x east, z south, matching the scene. */
export interface Vec2 {
  x: number
  z: number
}

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

/** What a wooded polygon says about itself. */
export type LeafType = 'broadleaved' | 'needleleaved' | 'mixed' | 'unknown'

export interface WoodArea {
  ring: Vec2[]
  leafType: LeafType
  /** Genus from a `species`/`genus`/`taxon` tag, lowercased, when present. */
  genus?: string
}

export type OpenKind = 'scrub' | 'meadow' | 'grassland' | 'sand' | 'wetland' | 'park'

export interface OpenArea {
  ring: Vec2[]
  kind: OpenKind
}

export interface MappedTree {
  at: Vec2
  genus?: string
}

export interface Path {
  points: Vec2[]
}

export interface CaveEntrance {
  at: Vec2
}

/** Everything we ask OpenStreetMap for, in local metres. */
export interface WorldData {
  woods: WoodArea[]
  open: OpenArea[]
  water: Vec2[][]
  paths: Path[]
  trees: MappedTree[]
  caves: CaveEntrance[]
}
```

- [ ] **Step 4: Создать `src/geo/project.ts`**

Перенести `rtc:src/geo/project.ts` как есть (29 строк, класс `Projector`),
добавив `bboxAround` из `rtc:src/geo/overpass.ts`. Комментарии перевести на
английский, если в оригинале они на русском.

```ts
import type { LatLon, Vec2, BBox } from './types'

const M_PER_DEG_LAT = 111320

/**
 * Flat-earth projection about a centre point. Over a plot a couple of
 * kilometres across the error is millimetres, and it keeps every other module
 * working in plain metres.
 */
export class Projector {
  private readonly lat0: number
  private readonly lon0: number
  private readonly mPerDegLon: number

  constructor(center: LatLon) {
    this.lat0 = center.lat
    this.lon0 = center.lon
    this.mPerDegLon = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180)
  }

  toLocal(p: LatLon): Vec2 {
    return {
      x: (p.lon - this.lon0) * this.mPerDegLon,
      z: -(p.lat - this.lat0) * M_PER_DEG_LAT,
    }
  }

  toLatLon(v: Vec2): LatLon {
    return {
      lat: this.lat0 - v.z / M_PER_DEG_LAT,
      lon: this.lon0 + v.x / this.mPerDegLon,
    }
  }
}

export function bboxAround(center: LatLon, radiusMeters: number): BBox {
  const dLat = radiusMeters / M_PER_DEG_LAT
  const dLon = radiusMeters / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lon - dLon,
    east: center.lon + dLon,
  }
}
```

- [ ] **Step 5: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Закоммитить**

```bash
git add src/geo test/geo
git commit -m "feat: гео-примитивы и проекция гео в метры"
```

---

### Task 2: Высоты из Terrain Tiles

**Files:**
- Create: `src/terrain/terrarium.ts`, `src/terrain/gridded.ts`
- Test: `test/terrain/terrarium.test.ts`

**Interfaces:**
- Consumes: `LatLon`, `BBox`, `Projector`, `ElevationProvider`
- Produces: `decodeTerrarium(r, g, b): number`, `lonLatToTilePixel(lat, lon, zoom): { px, py }`, `sampleGrid(heights: Float32Array, w: number, h: number, fx: number, fy: number): number`, `loadTerrarium(bbox: BBox, projector: Projector, zoom?: number): Promise<ElevationProvider>`, `gridProviderFromArray(h: ArrayLike<number>, halfSize: number, segments: number): ElevationProvider`, `griddedProvider(src: ElevationProvider, halfSize: number, segments: number): ElevationProvider`

Переносится из `rtc:src/terrain/terrarium.ts` (101 строка) и
`rtc:src/terrain/gridded.ts` (76 строк) практически без изменений: убрать
неиспользуемый первый аргумент `_center` у `loadTerrarium`, комментарии на
английском. Три функции чистые — их и тестируем; загрузка тайлов ходит в сеть
и рисует в canvas, автотестами не проверяется.

- [ ] **Step 1: Написать падающий тест**

`test/terrain/terrarium.test.ts`:

```ts
import { decodeTerrarium, lonLatToTilePixel, sampleGrid } from '../../src/terrain/terrarium'
import { gridProviderFromArray } from '../../src/terrain/gridded'

describe('decodeTerrarium', () => {
  it('decodes sea level', () => {
    // Terrarium stores height + 32768 across r*256 + g + b/256.
    expect(decodeTerrarium(128, 0, 0)).toBeCloseTo(0)
  })

  it('decodes a positive height', () => {
    expect(decodeTerrarium(128, 100, 0)).toBeCloseTo(100)
  })

  it('decodes below sea level', () => {
    expect(decodeTerrarium(127, 156, 0)).toBeCloseTo(-100)
  })

  it('uses blue as the fraction', () => {
    expect(decodeTerrarium(128, 0, 128)).toBeCloseTo(0.5)
  })
})

describe('lonLatToTilePixel', () => {
  it('puts the null island at the middle of the world', () => {
    const { px, py } = lonLatToTilePixel(0, 0, 0)
    expect(px).toBeCloseTo(128)
    expect(py).toBeCloseTo(128)
  })

  it('grows eastwards', () => {
    expect(lonLatToTilePixel(0, 10, 5).px).toBeGreaterThan(lonLatToTilePixel(0, 0, 5).px)
  })

  it('grows southwards', () => {
    expect(lonLatToTilePixel(-10, 0, 5).py).toBeGreaterThan(lonLatToTilePixel(10, 0, 5).py)
  })

  it('doubles with every zoom level', () => {
    const a = lonLatToTilePixel(50, 30, 4).px
    const b = lonLatToTilePixel(50, 30, 5).px
    expect(b).toBeCloseTo(a * 2)
  })
})

describe('sampleGrid', () => {
  const grid = new Float32Array([0, 10, 20, 30])

  it('reads a node exactly', () => {
    expect(sampleGrid(grid, 2, 2, 0, 0)).toBe(0)
    expect(sampleGrid(grid, 2, 2, 1, 1)).toBe(30)
  })

  it('interpolates between nodes', () => {
    expect(sampleGrid(grid, 2, 2, 0.5, 0)).toBeCloseTo(5)
  })

  it('clamps outside the grid', () => {
    expect(sampleGrid(grid, 2, 2, -5, -5)).toBe(0)
    expect(sampleGrid(grid, 2, 2, 99, 99)).toBe(30)
  })
})

describe('gridProviderFromArray', () => {
  it('reproduces the stored surface at its nodes', () => {
    const p = gridProviderFromArray([0, 10, 20, 30], 10, 1)
    expect(p.heightAt(-10, -10)).toBeCloseTo(0)
    expect(p.heightAt(10, 10)).toBeCloseTo(30)
  })

  it('interpolates between them', () => {
    expect(gridProviderFromArray([0, 10, 20, 30], 10, 1).heightAt(0, -10)).toBeCloseTo(5)
  })

  it('clamps beyond the edge', () => {
    expect(gridProviderFromArray([0, 10, 20, 30], 10, 1).heightAt(-100, -100)).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Перенести оба файла**

Скопировать `rtc:src/terrain/gridded.ts` целиком. Скопировать
`rtc:src/terrain/terrarium.ts`, изменив сигнатуру:

```ts
export async function loadTerrarium(
  bbox: BBox,
  projector: Projector,
  zoom = 14,
): Promise<ElevationProvider>
```

(первый параметр `_center` в оригинале не используется — убрать вместе с ним и
импорт `LatLon`, иначе `noUnusedLocals` не пропустит сборку).

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/terrain test/terrain
git commit -m "feat: высоты из AWS Terrain Tiles"
```

---

### Task 3: Микрорельеф поверх DEM

**Files:**
- Create: `src/terrain/detail.ts`
- Test: `test/terrain/detail.test.ts`

**Interfaces:**
- Consumes: `ElevationProvider`, `fbm2`
- Produces: `withDetail(base: ElevationProvider, seed: number, amplitude?: number): ElevationProvider`

Terrain tiles на zoom 14 дают ~5–10 метров на пиксель. Машине хватало,
грибнику нет: он идёт 1.4 м/с и живёт в ложбинках, где держится влага, а
влажность у нас решает, что вырастет. Крупная форма остаётся реальной, мелкая
достраивается.

- [ ] **Step 1: Написать падающий тест**

`test/terrain/detail.test.ts`:

```ts
import { withDetail } from '../../src/terrain/detail'
import { moistureAt } from '../../src/ecology/sites'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 100 }
const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }

describe('withDetail', () => {
  it('is deterministic', () => {
    expect(withDetail(flat, 7).heightAt(3, 4)).toBe(withDetail(flat, 7).heightAt(3, 4))
  })

  it('differs by seed', () => {
    expect(withDetail(flat, 1).heightAt(3, 4)).not.toBe(withDetail(flat, 2).heightAt(3, 4))
  })

  it('keeps the broad shape of the source', () => {
    // A hundred metres apart the detail is noise on top of a real slope; the
    // slope must still dominate, or the DEM stops meaning anything.
    const d = withDetail(slope, 5)
    expect(d.heightAt(100, 0) - d.heightAt(-100, 0)).toBeCloseTo(20, 0)
  })

  it('stays within the amplitude of the source', () => {
    const d = withDetail(flat, 5, 0.6)
    for (let i = 0; i < 300; i++) {
      expect(Math.abs(d.heightAt(i * 1.3, i * -0.7) - 100)).toBeLessThanOrEqual(0.6)
    }
  })

  it('adds relief a flat DEM did not have', () => {
    const d = withDetail(flat, 5)
    const hs = Array.from({ length: 60 }, (_, i) => d.heightAt(i * 2, 0))
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.1)
  })

  it('gives a flat DEM hollows and rises to read moisture from', () => {
    // The point of the whole module: without it every site on flat ground
    // scores exactly 0.5 and the ecology has nothing to work with.
    const d = withDetail(flat, 11)
    const wet = Array.from({ length: 200 }, (_, i) => moistureAt(d, i * 3, 0))
    expect(Math.max(...wet)).toBeGreaterThan(0.55)
    expect(Math.min(...wet)).toBeLessThan(0.45)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/terrain/detail.ts`**

```ts
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from './provider'

/** Size of the added relief, metres — tussocks and hollows, not hills. */
const DEFAULT_AMPLITUDE = 0.55
/** Its horizontal scale, metres. */
const SCALE = 6

/**
 * Adds fine relief on top of a coarse elevation source.
 *
 * Terrain tiles are five to ten metres per pixel: enough for a car, useless for
 * someone walking at 1.4 m/s who lives among the hollows that hold the damp.
 * Moisture is read from the concavity of the ground (see ecology/sites.ts), so
 * without this layer a real DEM would give a whole wood one flat moisture value
 * and the ecology would have nothing to say.
 *
 * The broad shape stays real; only the last half-metre is invented.
 */
export function withDetail(
  base: ElevationProvider,
  seed: number,
  amplitude = DEFAULT_AMPLITUDE,
): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      return base.heightAt(x, z) + fbm2(x / SCALE, z / SCALE, seed, 3) * amplitude
    },
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/terrain/detail.ts test/terrain/detail.test.ts
git commit -m "feat: микрорельеф поверх реального DEM"
```

---

### Task 4: Запрос к Overpass и кэш

**Files:**
- Create: `src/geo/overpass.ts`, `src/geo/cache.ts`
- Test: `test/geo/overpass.test.ts`

**Interfaces:**
- Consumes: `BBox`
- Produces: `forestQuery(b: BBox): string`, `fetchOsm(b: BBox, signal?: AbortSignal): Promise<OverpassResponse>`, `bboxKey(b: BBox, query: string): string`, `readCache(key: string): Promise<OverpassResponse | null>`, `writeCache(key: string, data: OverpassResponse): Promise<void>`

`rtc:src/geo/overpass.ts` переносится с его тремя зеркалами, таймаутом на
запрос и failover — это выстраданный код, и переписывать его нечего. Меняется
только сам запрос: вместо зданий, дорог и рельсов спрашиваем лес.
`rtc:src/geo/cache.ts` переносится как есть, сменив имя базы на `itffm`.

- [ ] **Step 1: Написать падающий тест**

`test/geo/overpass.test.ts`:

```ts
import { forestQuery } from '../../src/geo/overpass'
import { bboxKey } from '../../src/geo/cache'

const box = { south: 55.7, west: 37.6, north: 55.8, east: 37.7 }

describe('forestQuery', () => {
  const q = forestQuery(box)

  it('asks for the wood itself', () => {
    expect(q).toContain('"natural"="wood"')
    expect(q).toContain('"landuse"="forest"')
  })

  it('asks for the open ground between the woods', () => {
    for (const tag of ['scrub', 'grassland', 'sand', 'wetland']) expect(q).toContain(tag)
  })

  it('asks for water, paths, mapped trees and cave entrances', () => {
    expect(q).toContain('"natural"="water"')
    expect(q).toContain('"highway"')
    expect(q).toContain('node["natural"="tree"]')
    expect(q).toContain('cave_entrance')
  })

  it('does not ask for the city: buildings and carriageways are not our business', () => {
    expect(q).not.toContain('"building"')
    expect(q).not.toContain('motorway')
  })

  it('covers the bbox and carries a server-side timeout', () => {
    expect(q).toContain('55.7,37.6,55.8,37.7')
    expect(q).toMatch(/\[timeout:\d+\]/)
  })
})

describe('bboxKey', () => {
  it('is stable for the same box and query', () => {
    expect(bboxKey(box, 'q')).toBe(bboxKey(box, 'q'))
  })

  it('changes when the area changes', () => {
    expect(bboxKey(box, 'q')).not.toBe(bboxKey({ ...box, north: 55.9 }, 'q'))
  })

  it('changes when the query changes', () => {
    // Otherwise a place cached before we started asking for wetlands would go
    // on serving the old, wetland-less answer for good.
    expect(bboxKey(box, 'q')).not.toBe(bboxKey(box, 'q2'))
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Перенести `src/geo/cache.ts`**

Скопировать `rtc:src/geo/cache.ts` (126 строк). Изменить `DB_NAME` на
`'itffm-osm'`, `STORE` оставить `'osm'`. Комментарии на английском.

- [ ] **Step 4: Создать `src/geo/overpass.ts`**

Перенести из `rtc:src/geo/overpass.ts` константы `OVERPASS_ENDPOINTS`,
`TIMEOUT_S`, `REQUEST_TIMEOUT_MS`, функцию обхода зеркал и `fetchOsm`. Запрос
заменить целиком:

```ts
/**
 * Everything a wood is made of, as one query.
 *
 * Unlike a city, a wood is light: a few dozen polygons and some paths, so it
 * does not need splitting into separate requests the way buildings did. What we
 * ask for is exactly what the ecology needs — the trees' leaf type decides which
 * mushrooms can grow, water and terrain decide the moisture, and the open ground
 * types are the other biomes we will grow into.
 */
export function forestQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way["natural"="wood"](${box});
  relation["natural"="wood"](${box});
  way["landuse"="forest"](${box});
  relation["landuse"="forest"](${box});
  way["natural"~"scrub|grassland|heath"](${box});
  way["landuse"~"meadow|grass"](${box});
  way["leisure"~"park|nature_reserve"](${box});
  way["natural"~"sand|beach|dune"](${box});
  way["natural"="wetland"](${box});
  relation["natural"="wetland"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["waterway"~"river|stream"](${box});
  way["highway"~"path|footway|track|bridleway|cycleway"](${box});
  node["natural"="tree"](${box});
  node["natural"="cave_entrance"](${box});
  node["man_made"~"adit|mineshaft"](${box});
);
out body;
>;
out skel qt;`
}
```

- [ ] **Step 5: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Закоммитить**

```bash
git add src/geo/overpass.ts src/geo/cache.ts test/geo/overpass.test.ts
git commit -m "feat: запрос леса к Overpass с зеркалами и кэшем"
```

---

### Task 5: Разбор ответа Overpass

**Files:**
- Create: `src/geo/parse.ts`
- Test: `test/geo/parse.test.ts`

**Interfaces:**
- Consumes: `WorldData`, `Projector`, типы из `geo/types.ts`
- Produces: `interface OverpassResponse { elements: OverpassElement[] }`, `parseWorld(res: OverpassResponse, projector: Projector): WorldData`, `leafTypeOf(tags: Record<string, string>): LeafType`

`rtc:src/geo/parse.ts` — 602 строки, из которых нам нужна примерно шестая
часть: сборка узлов в кольца и разбор мультиполигонов. Всё про здания, этажи,
дороги, полосы и мосты не переносится. Пишем свой, подглядывая в него.

- [ ] **Step 1: Написать падающий тест**

`test/geo/parse.test.ts`:

```ts
import { parseWorld, leafTypeOf } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'

const proj = new Projector({ lat: 55.75, lon: 37.62 })

const nodes = [
  { type: 'node', id: 1, lat: 55.75, lon: 37.62 },
  { type: 'node', id: 2, lat: 55.751, lon: 37.62 },
  { type: 'node', id: 3, lat: 55.751, lon: 37.621 },
  { type: 'node', id: 4, lat: 55.75, lon: 37.621 },
]

const wood = {
  type: 'way',
  id: 10,
  nodes: [1, 2, 3, 4, 1],
  tags: { natural: 'wood', leaf_type: 'needleleaved' },
}

describe('leafTypeOf', () => {
  it('reads the tag', () => {
    expect(leafTypeOf({ leaf_type: 'broadleaved' })).toBe('broadleaved')
    expect(leafTypeOf({ leaf_type: 'needleleaved' })).toBe('needleleaved')
    expect(leafTypeOf({ leaf_type: 'mixed' })).toBe('mixed')
  })

  it('falls back to unknown rather than guessing', () => {
    expect(leafTypeOf({})).toBe('unknown')
    expect(leafTypeOf({ leaf_type: 'nonsense' })).toBe('unknown')
  })
})

describe('parseWorld', () => {
  it('turns a tagged way into a wood in local metres', () => {
    const w = parseWorld({ elements: [...nodes, wood] }, proj)
    expect(w.woods).toHaveLength(1)
    expect(w.woods[0].leafType).toBe('needleleaved')
    expect(w.woods[0].ring.length).toBeGreaterThanOrEqual(4)
    // The centre node sits at the origin, so the ring is metres, not degrees.
    expect(Math.abs(w.woods[0].ring[0].x)).toBeLessThan(500)
  })

  it('treats landuse=forest as a wood too', () => {
    const forest = { ...wood, id: 11, tags: { landuse: 'forest' } }
    expect(parseWorld({ elements: [...nodes, forest] }, proj).woods).toHaveLength(1)
  })

  it('picks up a genus tag when the mapper left one', () => {
    const oaks = { ...wood, id: 12, tags: { natural: 'wood', genus: 'Quercus' } }
    expect(parseWorld({ elements: [...nodes, oaks] }, proj).woods[0].genus).toBe('quercus')
  })

  it('sorts open ground by kind', () => {
    const scrub = { ...wood, id: 13, tags: { natural: 'scrub' } }
    const dune = { ...wood, id: 14, tags: { natural: 'sand' } }
    const w = parseWorld({ elements: [...nodes, scrub, dune] }, proj)
    expect(w.open.map((o) => o.kind).sort()).toEqual(['sand', 'scrub'])
  })

  it('keeps water, paths, mapped trees and cave entrances apart', () => {
    const water = { ...wood, id: 15, tags: { natural: 'water' } }
    const path = { type: 'way', id: 16, nodes: [1, 2, 3], tags: { highway: 'path' } }
    const tree = { type: 'node', id: 5, lat: 55.7505, lon: 37.6205, tags: { natural: 'tree', genus: 'Betula' } }
    const cave = { type: 'node', id: 6, lat: 55.7506, lon: 37.6206, tags: { natural: 'cave_entrance' } }
    const w = parseWorld({ elements: [...nodes, water, path, tree, cave] }, proj)
    expect(w.water).toHaveLength(1)
    expect(w.paths).toHaveLength(1)
    expect(w.trees[0].genus).toBe('betula')
    expect(w.caves).toHaveLength(1)
  })

  it('ignores a way whose nodes never arrived', () => {
    // Overpass can return a way referencing nodes outside the bbox.
    expect(parseWorld({ elements: [wood] }, proj).woods).toHaveLength(0)
  })

  it('survives junk without throwing', () => {
    expect(() => parseWorld({ elements: [] }, proj)).not.toThrow()
    expect(() => parseWorld({ elements: [{ type: 'way', id: 1 } as never] }, proj)).not.toThrow()
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/geo/parse.ts`**

Ключевые решения, которые надо соблюсти:

- узлы собираются в `Map<id, LatLon>` за один проход, потом way превращается в
  кольцо; way, чьи узлы не пришли, **молча пропускается**, а не роняет разбор;
- `leaf_type` читается строго из известных значений, иначе `'unknown'` — гадать
  по названию породы нельзя, это чужие данные;
- `genus` / `species` / `taxon` приводятся к нижнему регистру и берётся первое
  слово латинского имени (`Betula pendula` → `betula`);
- отношения-мультиполигоны: берутся только внешние кольца (`role: 'outer'`);
  дырки в лесу для нас несущественны, а код на них удваивается;
- всё, что не разобралось, не бросает исключений: игрок должен попасть в лес
  даже с кривой разметкой.

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/geo/parse.ts test/geo/parse.test.ts
git commit -m "feat: разбор ответа Overpass в описание леса"
```

---

### Task 6: Биом из тегов и высоты

**Files:**
- Create: `src/world/biome.ts`
- Test: `test/world/biome.test.ts`

**Interfaces:**
- Consumes: `WorldData`, `Biome`, `ElevationProvider`
- Produces: `interface BiomeMap { at(x: number, z: number): Biome }`, `buildBiomeMap(world: WorldData, ground: ElevationProvider, lat: number): BiomeMap`, `treelineAt(lat: number): number`

Здесь теги превращаются в биом, а биом — в список видов, которые тут возможны.
Это единственное место, где OSM встречается с экологией.

- [ ] **Step 1: Написать падающий тест**

`test/world/biome.test.ts`:

```ts
import { buildBiomeMap, treelineAt } from '../../src/world/biome'
import type { WorldData } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat = (h: number): ElevationProvider => ({ heightAt: () => h })
const square = (cx: number, cz: number, r: number) => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [] }

describe('treelineAt', () => {
  it('falls as you go north', () => {
    expect(treelineAt(45)).toBeGreaterThan(treelineAt(65))
  })

  it('is symmetric about the equator', () => {
    expect(treelineAt(-50)).toBeCloseTo(treelineAt(50))
  })

  it('gives plausible numbers for the Alps and for Lapland', () => {
    expect(treelineAt(46)).toBeGreaterThan(1500)
    expect(treelineAt(46)).toBeLessThan(2600)
    expect(treelineAt(68)).toBeLessThan(900)
  })
})

describe('buildBiomeMap', () => {
  it('reads the leaf type of the wood you stand in', () => {
    const world: WorldData = {
      ...empty,
      woods: [
        { ring: square(0, 0, 50), leafType: 'needleleaved' },
        { ring: square(200, 0, 50), leafType: 'broadleaved' },
        { ring: square(400, 0, 50), leafType: 'mixed' },
      ],
    }
    const m = buildBiomeMap(world, flat(150), 55)
    expect(m.at(0, 0)).toBe('forest-coniferous')
    expect(m.at(200, 0)).toBe('forest-broadleaved')
    expect(m.at(400, 0)).toBe('forest-mixed')
  })

  it('calls an untyped wood mixed rather than inventing one', () => {
    const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 50), leafType: 'unknown' }] }
    expect(buildBiomeMap(world, flat(150), 55).at(0, 0)).toBe('forest-mixed')
  })

  it('maps open ground to its own biomes', () => {
    const world: WorldData = {
      ...empty,
      open: [
        { ring: square(0, 0, 50), kind: 'scrub' },
        { ring: square(200, 0, 50), kind: 'sand' },
        { ring: square(400, 0, 50), kind: 'wetland' },
        { ring: square(600, 0, 50), kind: 'park' },
      ],
    }
    const m = buildBiomeMap(world, flat(150), 55)
    expect(m.at(0, 0)).toBe('meadow-scrub')
    expect(m.at(200, 0)).toBe('dunes-coast')
    expect(m.at(400, 0)).toBe('wetland')
    expect(m.at(600, 0)).toBe('park-urban')
  })

  it('lets the wood win where a wood and open ground overlap', () => {
    // OSM double-tags all the time; a wood inside a nature reserve is a wood.
    const world: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 50), leafType: 'broadleaved' }],
      open: [{ ring: square(0, 0, 200), kind: 'park' }],
    }
    expect(buildBiomeMap(world, flat(150), 55).at(0, 0)).toBe('forest-broadleaved')
  })

  it('calls unmapped ground meadow rather than nothing', () => {
    expect(buildBiomeMap(empty, flat(150), 55).at(0, 0)).toBe('meadow-scrub')
  })

  it('turns high open ground into alpine', () => {
    expect(buildBiomeMap(empty, flat(2400), 46).at(0, 0)).toBe('alpine')
  })

  it('does not call a wood alpine, however high it stands', () => {
    // A wood above our treeline estimate means the estimate is wrong, not the map.
    const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 50), leafType: 'needleleaved' }] }
    expect(buildBiomeMap(world, flat(2400), 46).at(0, 0)).toBe('forest-coniferous')
  })

  it('turns a cave entrance into its own biome nearby', () => {
    const world: WorldData = { ...empty, caves: [{ at: { x: 0, z: 0 } }] }
    expect(buildBiomeMap(world, flat(150), 55).at(2, 0)).toBe('cave-adit')
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/world/biome.ts`**

Нужен `pointInPolygon` — перенести из `rtc:src/physics/collide.ts` (только эту
функцию) в `src/util/geometry.ts` с тестом на выпуклом и невыпуклом кольце.

Порядок разрешения биома, сверху вниз: пещера рядом → лес (по `leafType`) →
открытая земля (по `kind`) → высота выше линии леса → `meadow-scrub` как
последнее слово. Лес всегда бьёт открытую землю: OSM сплошь двойные теги.

Линия леса — таблицей по широте с линейной интерполяцией, не формулой:

```ts
/** Treeline elevation by latitude, metres. Rough but honest; a formula here
 *  would pretend to a precision the real thing does not have. */
const TREELINE: [lat: number, metres: number][] = [
  [0, 3900], [20, 3800], [30, 3500], [40, 2800],
  [46, 2100], [50, 1700], [55, 1200], [60, 900], [65, 600], [70, 300], [80, 0],
]
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/world/biome.ts src/util/geometry.ts test/world/biome.test.ts test/util/geometry.test.ts
git commit -m "feat: биом из тегов OSM и высоты над уровнем моря"
```

---

### Task 7: Деревья из полигонов OSM

**Files:**
- Create: `src/world/osmTrees.ts`
- Test: `test/world/osmTrees.test.ts`

**Interfaces:**
- Consumes: `WorldData`, `Tree`, `ElevationProvider`, `TreeGenus`
- Produces: `regionalMix(leafType: LeafType, lat: number): TreeGenus[]`, `placeOsmTrees(world: WorldData, ground: ElevationProvider, lat: number, seed: number, halfSize: number): Tree[]`

Честное ограничение спеки: в диком лесу OSM обычно даёт только `leaf_type` на
весь полигон. Порода назначается процедурно из регионального набора, а теги
`species`/`genus` перекрывают её там, где они есть. Набор пород для региона
реальный, конкретное дерево — наше.

- [ ] **Step 1: Написать падающий тест**

`test/world/osmTrees.test.ts`:

```ts
import { regionalMix, placeOsmTrees } from '../../src/world/osmTrees'
import type { WorldData } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const square = (cx: number, cz: number, r: number) => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [] }

describe('regionalMix', () => {
  it('gives a needleleaved wood conifers only', () => {
    for (const g of regionalMix('needleleaved', 55)) {
      expect(['picea', 'pinus', 'abies', 'larix']).toContain(g)
    }
  })

  it('gives a broadleaved wood no conifers', () => {
    for (const g of regionalMix('broadleaved', 55)) {
      expect(['picea', 'pinus', 'abies', 'larix']).not.toContain(g)
    }
  })

  it('mixes both when the tag says mixed or says nothing', () => {
    const mixed = regionalMix('mixed', 55)
    expect(mixed.some((g) => ['picea', 'pinus'].includes(g))).toBe(true)
    expect(mixed.some((g) => ['betula', 'populus'].includes(g))).toBe(true)
    expect(regionalMix('unknown', 55)).toEqual(mixed)
  })

  it('changes the species with latitude', () => {
    // Beech and hornbeam do not grow in the taiga, and larch is not a southern tree.
    expect(regionalMix('broadleaved', 45)).not.toEqual(regionalMix('broadleaved', 65))
  })

  it('never returns an empty mix', () => {
    for (const lat of [10, 35, 45, 55, 65, 75]) {
      for (const lt of ['broadleaved', 'needleleaved', 'mixed', 'unknown'] as const) {
        expect(regionalMix(lt, lat).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('placeOsmTrees', () => {
  const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 60), leafType: 'needleleaved' }] }

  it('is deterministic', () => {
    expect(placeOsmTrees(world, flat, 55, 3, 90)).toEqual(placeOsmTrees(world, flat, 55, 3, 90))
  })

  it('fills the wood and leaves the clearing alone', () => {
    const trees = placeOsmTrees(world, flat, 55, 3, 200)
    expect(trees.length).toBeGreaterThan(20)
    for (const t of trees) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(61)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(61)
    }
  })

  it('respects the polygon leaf type', () => {
    for (const t of placeOsmTrees(world, flat, 55, 3, 200)) {
      expect(['picea', 'pinus', 'abies', 'larix']).toContain(t.genus)
    }
  })

  it('lets a mapper-tagged genus override the regional guess', () => {
    const tagged: WorldData = { ...empty, woods: [{ ring: square(0, 0, 60), leafType: 'unknown', genus: 'quercus' }] }
    for (const t of placeOsmTrees(tagged, flat, 55, 3, 200)) expect(t.genus).toBe('quercus')
  })

  it('keeps individually mapped trees exactly where the mapper put them', () => {
    const mapped: WorldData = { ...empty, trees: [{ at: { x: 12, z: -7 }, genus: 'betula' }] }
    const trees = placeOsmTrees(mapped, flat, 55, 3, 200)
    expect(trees).toContainEqual(expect.objectContaining({ x: 12, z: -7, genus: 'betula' }))
  })

  it('grows nothing where no wood was mapped', () => {
    expect(placeOsmTrees(empty, flat, 55, 3, 200)).toHaveLength(0)
  })

  it('stands trees on the ground', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.05 }
    for (const t of placeOsmTrees(world, slope, 55, 3, 200)) {
      expect(t.y).toBeCloseTo(slope.heightAt(t.x, t.z), 5)
    }
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/world/osmTrees.ts`**

Сетка кандидатов через каждые ~4.5 м по ограничивающему прямоугольнику
полигона, отсев по `pointInPolygon`, минимальный зазор как в `placeTrees`.
Внутри полигона порода выбирается пятнами тем же приёмом, что и в первом плане
(`fbm2` на породу, `STAND_SHARPNESS`), но из `regionalMix` этого полигона.
Размеченные деревья добавляются как есть, поверх.

Региональные наборы — по широтным поясам, с честным комментарием, что это
огрубление:

```ts
/**
 * Which genera to grow at this latitude. A coarse three-band model of the
 * European forest zones — nemoral, mixed, boreal. It is not a vegetation map,
 * and it is not meant to be: the point is that a wood in Karelia should not be
 * full of beech, not that every stand is botanically exact.
 */
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/world/osmTrees.ts test/world/osmTrees.test.ts
git commit -m "feat: деревья по полигонам OSM с региональным набором пород"
```

---

### Task 8: Запасной лес и выбор места

**Files:**
- Create: `src/world/demoForest.ts`, `src/ui/placePicker.ts`, `src/geo/geocode.ts`
- Test: `test/geo/geocode.test.ts`, `test/world/demoForest.test.ts`

**Interfaces:**
- Produces: `demoForest(): { world: WorldData; center: LatLon }`, `nominatimUrl(query: string): string`, `parseNominatim(json: unknown): LatLon`, `geocode(query: string): Promise<LatLon>`, `openPlacePicker(onPick: (query: string) => void): void`, `showLoading(message: string): { update(m: string): void; close(): void }`

`rtc:src/geo/geocode.ts` переносится, но его тиры приоритетов перевёрнуты под
город: он предпочитает `place=city|town|village`. Нам нужен лес, поэтому
порядок другой — сначала природный объект, потом населённый пункт, потом что
пришло.

- [ ] **Step 1: Написать падающий тест**

`test/geo/geocode.test.ts`:

```ts
import { nominatimUrl, parseNominatim } from '../../src/geo/geocode'

describe('nominatimUrl', () => {
  it('asks for several hits, not one', () => {
    expect(nominatimUrl('Лосиный Остров')).toMatch(/limit=\d+/)
  })

  it('escapes the query', () => {
    expect(nominatimUrl('Лосиный Остров')).toContain(encodeURIComponent('Лосиный Остров'))
  })
})

describe('parseNominatim', () => {
  it('prefers a natural feature over a settlement', () => {
    // We are looking for somewhere to pick mushrooms, not for a town centre —
    // the opposite of what the driving game wanted from the same service.
    const hits = [
      { lat: '55.75', lon: '37.62', class: 'place', type: 'city' },
      { lat: '55.87', lon: '37.77', class: 'natural', type: 'wood' },
    ]
    expect(parseNominatim(hits).lat).toBeCloseTo(55.87)
  })

  it('accepts a nature reserve or a national park as a natural feature', () => {
    for (const type of ['nature_reserve', 'national_park', 'forest', 'wood']) {
      const hits = [{ lat: '1', lon: '2', class: 'leisure', type }]
      expect(parseNominatim(hits).lat).toBeCloseTo(1)
    }
  })

  it('falls back to a settlement when nothing natural was found', () => {
    const hits = [{ lat: '55.75', lon: '37.62', class: 'place', type: 'village' }]
    expect(parseNominatim(hits).lat).toBeCloseTo(55.75)
  })

  it('falls back to the first hit rather than failing', () => {
    expect(parseNominatim([{ lat: '3', lon: '4' }]).lat).toBeCloseTo(3)
  })

  it('throws a nameable error on an empty answer', () => {
    expect(() => parseNominatim([])).toThrow()
    expect(() => parseNominatim(null)).toThrow()
  })
})
```

`test/world/demoForest.test.ts`:

```ts
import { demoForest } from '../../src/world/demoForest'
import { buildBiomeMap } from '../../src/world/biome'
import { placeOsmTrees } from '../../src/world/osmTrees'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('demoForest', () => {
  it('describes a real wood, not an empty stub', () => {
    // This is what the player gets when the network is down. If it were empty
    // they would stand in a field and think the game was broken.
    const { world } = demoForest()
    expect(world.woods.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(demoForest().world).toEqual(demoForest().world)
  })

  it('grows trees and resolves to a forest biome', () => {
    const { world, center } = demoForest()
    expect(placeOsmTrees(world, flat, center.lat, 1, 200).length).toBeGreaterThan(50)
    expect(buildBiomeMap(world, flat, center.lat).at(0, 0)).toMatch(/^forest-/)
  })

  it('offers both conifer and broadleaf ground to walk between', () => {
    const kinds = new Set(demoForest().world.woods.map((w) => w.leafType))
    expect(kinds.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Реализовать три файла**

`geocode.ts` — перенести из rtc, заменив выбор:

```ts
/** Natural places worth foraging in, in the order we would rather have them. */
const NATURAL = new Set(['wood', 'forest', 'nature_reserve', 'national_park', 'scrub', 'heath', 'wetland'])
const SETTLEMENTS = new Set(['city', 'town', 'village', 'hamlet', 'suburb'])
```

`demoForest.ts` — руками описанные кольца: два-три лесных полигона разного
`leafType`, поляна, ручей, тропа. Никакой сети, никакой случайности.

`placePicker.ts` — поле ввода с примерами («Лосиный Остров», «Куршская коса»,
«55.87, 37.77»), кнопка «в лес», ссылка «просто показать лес» на demo, и экран
загрузки с текстом стадии. Атрибуция OpenStreetMap и Terrain Tiles — здесь же,
внизу, постоянно.

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
git add src/geo/geocode.ts src/world/demoForest.ts src/ui/placePicker.ts test/geo/geocode.test.ts test/world/demoForest.test.ts
git commit -m "feat: поиск места, запасной лес и экран выбора"
```

---

### Task 9: Сборка настоящего леса

**Files:**
- Modify: `src/game/scene.ts`, `src/main.ts`
- Test: `test/game/loadForest.test.ts`

**Interfaces:**
- Produces: `loadForestData(query: string | null, onStage: (s: string) => void): Promise<{ world: WorldData; center: LatLon; ground: ElevationProvider; fellBackTo: 'demo' | null }>`, `createForest(source: ForestSource, seed: number): Forest`

Последняя задача: `createForest` перестаёт выдумывать рельеф и лес и начинает
принимать их снаружи. `ecology/`, `mushroom/`, `game/player.ts` и весь `ui/` не
меняются вовсе — ради этого всё и проектировалось.

- [ ] **Step 1: Написать падающий тест**

`test/game/loadForest.test.ts`:

```ts
import { chooseFallback } from '../../src/game/loadForest'

describe('chooseFallback', () => {
  it('uses real data when the wood has polygons', () => {
    expect(chooseFallback({ woods: [{ ring: [], leafType: 'mixed' }], open: [], water: [], paths: [], trees: [], caves: [] })).toBe(null)
  })

  it('falls back when OSM returned nothing at all', () => {
    // Half of rural OSM is unmapped. Standing in an empty field looks like a
    // broken game, so we show a wood instead and say so.
    expect(chooseFallback({ woods: [], open: [], water: [], paths: [], trees: [], caves: [] })).toBe('demo')
  })

  it('accepts open ground alone: a dune or a moor is a real place too', () => {
    expect(chooseFallback({ woods: [], open: [{ ring: [], kind: 'sand' }], water: [], paths: [], trees: [], caves: [] })).toBe(null)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализовать `src/game/loadForest.ts` и переписать `createForest`**

`loadForest.ts` собирает конвейер и сообщает стадии наружу: геокодинг →
Overpass (или кэш) → разбор → Terrain Tiles → готово. Любая ошибка на любом
шаге ведёт в `demoForest`, а не в пустой экран; факт подмены возвращается
наружу, чтобы игроку об этом честно сказали.

Высоты собираются так:

```ts
const dem = await loadTerrarium(bbox, projector)
const ground = griddedProvider(withDetail(dem, seed), HALF_SIZE, GROUND_SEGMENTS)
```

Порядок важен: `withDetail` кладёт микрорельеф на DEM, а `griddedProvider`
пересэмплирует результат ровно в узлах меша земли — иначе игрок ходит по одной
поверхности, а видит другую.

`createForest` принимает `{ world, ground, center }` вместо сида, берёт деревья
из `placeOsmTrees`, биом из `buildBiomeMap`, а месяц — из текущей даты.
`buildSites` получает биом на точку, а не один на всю локацию.

- [ ] **Step 4: Запустить тесты и собрать**

Run: `npm test && npm run build && npm run boot-check`
Expected: всё зелёное

- [ ] **Step 5: Посмотреть глазами**

Run: `npm run dev`

Ввести реальное место с хорошей разметкой — «Лосиный Остров», «Sokolniki»,
«Куршская коса». Проверить: рельеф отличается от процедурного и совпадает с
местностью; хвойные и лиственные участки стоят там же, где на карте OSM; вода
на месте; грибы растут под подходящими породами. Затем ввести заведомо
неразмеченное место и убедиться, что игра честно уходит в demo-лес и говорит
об этом.

- [ ] **Step 6: Закоммитить**

```bash
git add src/game src/main.ts test/game/loadForest.test.ts
git commit -m "feat: лес из настоящего места по данным OSM и Terrain Tiles"
```

---

## После плана

Атрибуция обязана быть на экране до релиза — это условие лицензий, а не
пожелание. Затем `v0.3.0`.

Дальше по `TODO.md`: тропинки и водоёмы уже придут в `WorldData` этим планом, но
рисоваться начнут отдельной задачей; биомы за пределами леса станут вопросом
данных о видах, а не кода.
