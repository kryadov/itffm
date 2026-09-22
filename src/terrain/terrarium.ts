import type { Vec2, BBox } from '../geo/types'
import type { Projector } from '../geo/project'
import type { ElevationProvider } from './provider'
import { idbGet, idbPut, idbKeys, idbDelete } from '../util/idbCache'

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const TILE_SIZE = 256

const TILE_DB = 'itffm-terrain'
const TILE_STORE = 'tiles'
/** A tile's own cache key — the same z/x/y that names it in the slippy-map grid. */
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`
}
/** Above this many cached tiles, the oldest (by last use) get evicted back down
 *  to it — a handful of real places' worth (a plot's bbox at zoom 14 is
 *  typically a few tiles to a couple of dozen), so a long-lived tab can keep
 *  many places offline without the store growing without bound. */
const TILE_CACHE_CAP = 1500

interface CachedTile {
  bytes: ArrayBuffer
  /** Last time this tile was used (written or re-read), for the cap's eviction. */
  usedAt: number
}

/**
 * Picks which cached entries to drop so the store holds no more than `cap`:
 * the ones least recently used. Pure so the ordering itself is testable
 * without touching IndexedDB.
 */
export function pickEvictions(entries: { key: string; usedAt: number }[], cap: number): string[] {
  if (entries.length <= cap) return []
  return [...entries].sort((a, b) => a.usedAt - b.usedAt).slice(0, entries.length - cap).map((e) => e.key)
}

async function pruneTileCache(): Promise<void> {
  const keys = await idbKeys(TILE_DB, TILE_STORE)
  if (keys.length <= TILE_CACHE_CAP) return
  const entries = await Promise.all(
    keys.map(async (key) => ({ key, usedAt: (await idbGet<CachedTile>(TILE_DB, TILE_STORE, key))?.usedAt ?? 0 })),
  )
  for (const key of pickEvictions(entries, TILE_CACHE_CAP)) void idbDelete(TILE_DB, TILE_STORE, key)
}

function loadImageFromBytes(bytes: ArrayBuffer): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes]))
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('tile decode failed'))
    }
    img.src = url
  })
}

/**
 * One Terrarium tile's image, from the IndexedDB cache when it's there —
 * elevation never changes under a place, so there is no freshness to worry
 * about, unlike Overpass or Nominatim — and off the network on a miss, caching
 * the bytes for next time. A corrupt cache entry (a browser bug, a half-written
 * value) is not fatal: it just falls through to a fresh fetch.
 */
async function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement> {
  const key = tileKey(z, x, y)
  const cached = await idbGet<CachedTile>(TILE_DB, TILE_STORE, key)
  if (cached) {
    try {
      const img = await loadImageFromBytes(cached.bytes)
      void idbPut(TILE_DB, TILE_STORE, key, { bytes: cached.bytes, usedAt: Date.now() } satisfies CachedTile)
      return img
    } catch {
      /* fall through to a fresh fetch below */
    }
  }
  const url = TILE_URL(z, x, y)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tile load failed: ${url}`)
  const bytes = await res.arrayBuffer()
  void idbPut(TILE_DB, TILE_STORE, key, { bytes, usedAt: Date.now() } satisfies CachedTile).then(() => pruneTileCache())
  return loadImageFromBytes(bytes)
}

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Global pixel coordinate (tileIndex*256 + inner) in the slippy-map grid. */
export function lonLatToTilePixel(lat: number, lon: number, zoom: number): { px: number; py: number } {
  const n = Math.pow(2, zoom)
  const x = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  return { px: x * TILE_SIZE, py: y * TILE_SIZE }
}

/** Bilinear sample of a row-major grid, clamped to edges. fx/fy in grid-cell units. */
export function sampleGrid(heights: Float32Array, w: number, h: number, fx: number, fy: number): number {
  const cx = Math.max(0, Math.min(w - 1, fx))
  const cy = Math.max(0, Math.min(h - 1, fy))
  const x0 = Math.floor(cx), y0 = Math.floor(cy)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const tx = cx - x0, ty = cy - y0
  const h00 = heights[y0 * w + x0], h10 = heights[y0 * w + x1]
  const h01 = heights[y1 * w + x0], h11 = heights[y1 * w + x1]
  const top = h00 + (h10 - h00) * tx
  const bot = h01 + (h11 - h01) * tx
  return top + (bot - top) * ty
}

/**
 * Builds an elevation grid covering bbox by stitching Terrarium tiles into a
 * single decoded height array, then samples it per local (x,z).
 */
export async function loadTerrarium(
  bbox: BBox,
  projector: Projector,
  zoom = 14,
): Promise<ElevationProvider> {
  const nw = lonLatToTilePixel(bbox.north, bbox.west, zoom)
  const se = lonLatToTilePixel(bbox.south, bbox.east, zoom)
  const minTileX = Math.floor(nw.px / TILE_SIZE)
  const maxTileX = Math.floor(se.px / TILE_SIZE)
  const minTileY = Math.floor(nw.py / TILE_SIZE)
  const maxTileY = Math.floor(se.py / TILE_SIZE)

  const cols = maxTileX - minTileX + 1
  const rows = maxTileY - minTileY + 1
  const w = cols * TILE_SIZE
  const h = rows * TILE_SIZE
  const heights = new Float32Array(w * h)

  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const img = await loadTile(zoom, tx, ty)
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
      const ox = (tx - minTileX) * TILE_SIZE
      const oy = (ty - minTileY) * TILE_SIZE
      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          const i = (py * TILE_SIZE + px) * 4
          heights[(oy + py) * w + (ox + px)] = decodeTerrarium(data[i], data[i + 1], data[i + 2])
        }
      }
    }
  }

  const originPx = minTileX * TILE_SIZE
  const originPy = minTileY * TILE_SIZE

  return {
    heightAt(x: number, z: number): number {
      const ll = projector.toLatLon({ x, z } as Vec2)
      const gp = lonLatToTilePixel(ll.lat, ll.lon, zoom)
      return sampleGrid(heights, w, h, gp.px - originPx, gp.py - originPy)
    },
  }
}
