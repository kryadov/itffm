import { hashString } from '../util/rng'

/**
 * The world's chunk grid — see docs/superpowers/specs/
 * 2026-09-10-infinite-world-design.md. Every placement function that used to
 * scatter across one fixed `[-halfSize, halfSize]²` plot instead fills one
 * chunk at a time, keyed by its own `(cx, cz)` and seeded independently of
 * every other chunk — so revisiting one regenerates the same tile without
 * replaying the whole world's random draws first.
 *
 * The grid is centred on the world origin, not cornered at it: chunk (0, 0)
 * spans `[-CHUNK_SIZE/2, CHUNK_SIZE/2)` on both axes. That is what lets the
 * existing home plot (the hut, campfire, wildlife, all still built the old,
 * unchunked way — see the design doc) sit entirely inside that one chunk for
 * every plot size on offer (`ui/worldSize.ts`'s largest is 300m across), so
 * the streamed chunks never have to reconcile straddling the home plot's own
 * edge on more than one side.
 */

/** Metres per side. Comfortably bigger than both the fog draw distance
 *  (`game/scene.ts`'s `Fog(...,30,140)`) and the largest home-plot choice
 *  (300m, `ui/worldSize.ts`), so chunk (0, 0) alone can hold the whole home
 *  plot and a chunk seam is never the reason something pops in mid-view. */
export const CHUNK_SIZE = 400

/** Ground-mesh resolution every streamed chunk builds at (`game/worldStream.ts`).
 *  The reserved home-plot chunk (0, 0) has to build its own ground mesh at
 *  exactly this same resolution too, whenever it neighbours streamed chunks
 *  (`game/loadForest.ts`'s demo-wood path, threaded through
 *  `game/scene.ts`'s `createForest`) — otherwise the two meshes tessellate
 *  the shared edge at different vertex spacings and a real crack opens up
 *  even though the underlying height field is perfectly continuous. See
 *  TODO.md's "Швы между чанками карты видны". */
export const CHUNK_GROUND_SEGMENTS = 60

export interface ChunkCoord {
  cx: number
  cz: number
}

/** Which chunk a world point falls in. */
export function chunkCoordAt(x: number, z: number, chunkSize = CHUNK_SIZE): ChunkCoord {
  return { cx: Math.floor(x / chunkSize + 0.5), cz: Math.floor(z / chunkSize + 0.5) }
}

/** A chunk's own centre, in world metres — every chunk-local placement
 *  function's `origin`. */
export function chunkOrigin(coord: ChunkCoord, chunkSize = CHUNK_SIZE): { x: number; z: number } {
  return { x: coord.cx * chunkSize, z: coord.cz * chunkSize }
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
