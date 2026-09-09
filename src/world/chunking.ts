import { hashString } from '../util/rng'

/**
 * The world's chunk grid — see docs/superpowers/specs/
 * 2026-09-10-infinite-world-design.md. Every placement function that used to
 * scatter across one fixed `[-halfSize, halfSize]²` plot instead fills one
 * chunk at a time, keyed by its own `(cx, cz)` and seeded independently of
 * every other chunk — so revisiting one regenerates the same tile without
 * replaying the whole world's random draws first.
 */

/** Metres per side. Comfortably bigger than the fog draw distance
 *  (`game/scene.ts`'s `Fog(...,30,140)`), so a chunk seam is never the
 *  reason something pops in mid-view. */
export const CHUNK_SIZE = 200

export interface ChunkCoord {
  cx: number
  cz: number
}

/** Which chunk a world point falls in. Floors toward negative infinity (not
 *  toward zero), so a chunk's own coordinate always identifies the square
 *  it actually occupies, on either side of the origin. */
export function chunkCoordAt(x: number, z: number, chunkSize = CHUNK_SIZE): ChunkCoord {
  return { cx: Math.floor(x / chunkSize), cz: Math.floor(z / chunkSize) }
}

/** A chunk's own centre, in world metres — every chunk-local placement
 *  function's `origin`. */
export function chunkOrigin(coord: ChunkCoord, chunkSize = CHUNK_SIZE): { x: number; z: number } {
  return { x: (coord.cx + 0.5) * chunkSize, z: (coord.cz + 0.5) * chunkSize }
}

/** A chunk's own seed: a pure function of its coordinate and the world's
 *  global seed, independent of every other chunk — the one thing that makes
 *  "generate just this tile" possible at all. */
export function chunkSeed(coord: ChunkCoord, globalSeed: number): number {
  return hashString(`${coord.cx}:${coord.cz}:${globalSeed}`)
}

/** Every chunk within `radius` chunks of `center`, inclusive — a
 *  `(2·radius+1)²` square, not a circle: cheap, and a chunk manager already
 *  keeps a slightly larger unload radius to absorb the corner difference. */
export function chunksInRadius(center: ChunkCoord, radius: number): ChunkCoord[] {
  const list: ChunkCoord[] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      list.push({ cx: center.cx + dx, cz: center.cz + dz })
    }
  }
  return list
}

/** A stable map key for a chunk coordinate. */
export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx}:${coord.cz}`
}
