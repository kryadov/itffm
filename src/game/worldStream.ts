import * as THREE from 'three'
import { withPits } from '../terrain/pits'
import { proceduralTerrain } from '../terrain/procedural'
import { griddedProvider } from '../terrain/gridded'
import { placeTrees, buildTreeMeshes, type Tree } from '../world/trees'
import { regionalMix } from '../world/osmTrees'
import { buildGround } from '../world/ground'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, type Placement } from '../ecology/spawn'
import { buildPlacementObject } from '../collectible/placement'
import { loadSpecies } from '../species/load'
import { CHUNK_SIZE, chunkCoordAt, chunkOrigin, chunkSeed, chunksInRadius, chunkKey, type ChunkCoord } from '../world/chunking'
import type { ElevationProvider } from '../terrain/provider'
import type { Species } from '../species/schema'

/** How many chunks either side of the player's own stay generated — a 3x3
 *  block around them, comfortably past the fog draw distance in every
 *  direction (`CHUNK_SIZE` is itself already bigger than the fog). */
const LOAD_RADIUS = 1
/** A little wider than LOAD_RADIUS, so a chunk right at the load boundary
 *  doesn't load and unload again every time the player's own position
 *  wobbles by a metre near the edge. */
const UNLOAD_RADIUS = 2
/** At most this many chunks actually get BUILT per `update()` call, however
 *  many are missing — a fresh chunk (terrain + trees + ecology + real
 *  THREE.js geometry for every spawned placement) measured at ~400ms even
 *  after the density cuts below; doing eight of those the instant the
 *  player leaves the home plot would freeze a whole render frame for
 *  seconds. One per call spreads that same total cost over the next several
 *  real frames instead — still a real, if much smaller, per-frame cost
 *  right at a chunk boundary, not free, but no longer a multi-second stall.
 *  A proper fix (building off the main thread, or in slices within a
 *  frame's own time budget) is real future work, logged in TODO.md. */
const BUILD_BUDGET_PER_UPDATE = 1

/** Ground mesh resolution for a streamed chunk — coarser than the curated
 *  home plot's own (`groundSegmentsFor`, up to 220): wilderness further out
 *  does not need the same fidelity, the same "detail falls off with
 *  distance" principle the mushroom LOD already uses. */
const CHUNK_GROUND_SEGMENTS = 60

/** Sites per chunk — a flat count, not scaled to the chunk's (much bigger)
 *  area the way the home plot's own count is: with up to nine chunks live
 *  at once (LOAD_RADIUS above), area-scaling the home plot's own density
 *  would multiply the home plot's already-tuned site count roughly forty
 *  times over, all at once. Sparser wilderness further out is also simply
 *  the more honest read of "still finding things, not as thick as the one
 *  curated clearing near the hut" — and, pragmatically, a real chunk-build
 *  time cost this keeps down (see BUILD_BUDGET_PER_UPDATE above). */
const CHUNK_SITE_COUNT = 200

/** Half `placeTrees`' own default (0.06/m²) elsewhere — the same build-time
 *  reasoning as CHUNK_SITE_COUNT: a streamed chunk is forty times the home
 *  plot's own area, so even a lighter density is still a lot of trees. */
const TREE_DENSITY = 0.03

/** The regional genus mix streamed chunks grow from — the demo wood's own
 *  location (Losiny Ostrov, `world/demoForest.ts`), "mixed" leaf type: this
 *  system only ever runs for the offline/demo wood (see docs/superpowers/
 *  specs/2026-09-10-infinite-world-design.md), never for a named real place. */
const STREAM_LAT = 55.87

interface LoadedChunk {
  group: THREE.Group
  ground: ElevationProvider
  trees: Tree[]
  lods: THREE.LOD[]
  mushroomObjects: THREE.Object3D[]
}

export interface WorldStream {
  /** Figures out which chunks the player's position needs (only when their
   *  own chunk has actually changed — cheap otherwise) and unloads whatever
   *  fell out of range, then builds up to `BUILD_BUDGET_PER_UPDATE` of
   *  whatever is still missing. Call every frame; expect an occasional
   *  costlier call right at a chunk boundary while the queue drains, never
   *  a multi-chunk stall in one call. */
  update(playerX: number, playerZ: number): void
  /** How many needed chunks are still queued, waiting for a future
   *  `update()` call to actually build them — 0 once the area around the
   *  player has fully caught up. */
  pendingChunkCount(): number
  /** Every currently-loaded chunk's placements, flattened — feed this into
   *  the same pick/raycast candidate list `Forest.mushroomObjects` already
   *  goes through. Live: grows and shrinks as chunks load and unload, so
   *  read it fresh each time rather than holding on to the reference. */
  mushroomObjects(): THREE.Object3D[]
  /** Removes one collected/cut object from its owning chunk's own pick-
   *  candidate list (not from the scene — the caller already does that the
   *  same way it does for a home-plot find, `Object3D.removeFromParent()`).
   *  Returns false if no loaded chunk owns it (a plain mistake to call this
   *  on a home-plot object, which never lived in `WorldStream` to begin
   *  with — `main.ts` only reaches for this once the home plot's own list
   *  didn't have it). */
  removeMushroomObject(object: THREE.Object3D): boolean
  /** Every currently-loaded chunk's tree trunks, as collision circles —
   *  feed this into the same obstacle list `stepPlayer` already uses. */
  obstacles(): { x: number; z: number; radius: number }[]
  /** Ticks every loaded chunk's placements' LOD against the camera — three.js
   *  never does this on its own (same reason `Forest.updateMushroomLod`
   *  exists). Call every frame. */
  updateLod(camera: THREE.Camera): void
  /** Terrain height anywhere in a loaded chunk (or the reserved home-plot
   *  chunk, where this defers to `homeGround` instead of generating
   *  anything of its own). Falls back to the raw, ungridded base terrain
   *  for a point in a chunk that is not currently loaded — no visible mesh
   *  sits there yet regardless, so an exact grid match does not matter. */
  heightAt(x: number, z: number): number
  dispose(): void
}

/**
 * The chunk manager for the offline/demo wood's infinite wilderness beyond
 * its own home plot — see docs/superpowers/specs/2026-09-10-infinite-world-
 * design.md for what is (terrain, trees, mushroom/berry/herb/nut/find
 * ecology) and is not (the hut, campfire, wildlife, decorative scatter,
 * real-place OSM tiling) chunked in this pass.
 *
 * @param homeGround the home plot's own `ElevationProvider` (`createForest`'s
 *   `source.ground`) — reused, not reimplemented, for any point that falls
 *   inside `homeRadius` of the origin; the reserved chunk (0, 0) itself is
 *   never generated here at all, on the assumption the caller already built
 *   it the old way.
 * @param homeRadius the home plot's own half-size — always `CHUNK_SIZE / 2`
 *   for the streamed demo wood (see the design doc's "Scope actually shipped
 *   this pass"), passed in rather than hardcoded so the boundary check
 *   reads as what it is, not a magic number repeated in two places.
 */
export function createWorldStream(
  scene: THREE.Scene,
  globalSeed: number,
  homeGround: ElevationProvider,
  homeRadius: number,
  species: Species[] = loadSpecies(),
): WorldStream {
  const baseTerrain = withPits(proceduralTerrain(globalSeed), globalSeed + 3)
  const mix = regionalMix('mixed', STREAM_LAT)
  const biomeAt = (): 'forest-mixed' => 'forest-mixed' as const

  const chunks = new Map<string, LoadedChunk>()
  let currentPlayerChunk: ChunkCoord | null = null

  const inHome = (x: number, z: number): boolean => Math.abs(x) <= homeRadius && Math.abs(z) <= homeRadius

  function buildChunk(coord: ChunkCoord): LoadedChunk {
    const origin = chunkOrigin(coord)
    const seed = chunkSeed(coord, globalSeed)
    const half = CHUNK_SIZE / 2
    const ground = griddedProvider(baseTerrain, half, CHUNK_GROUND_SEGMENTS, origin)

    const group = new THREE.Group()
    group.name = `chunk:${chunkKey(coord)}`
    group.add(buildGround(baseTerrain, half, CHUNK_GROUND_SEGMENTS, biomeAt, seed, origin))

    const trees = placeTrees(baseTerrain, half, seed + 1, mix, TREE_DENSITY, origin)
    group.add(buildTreeMeshes(trees))

    const sites = buildSites(ground, trees, half, seed + 2, biomeAt, CHUNK_SITE_COUNT, [], [], [], origin)
    const month = new Date().getMonth() + 1
    const placements: Placement[] = spawnMushrooms(species, sites, { month, seed: seed + 3, daysSinceRain: 2 })

    const lods: THREE.LOD[] = []
    const mushroomObjects: THREE.Object3D[] = []
    for (const p of placements) {
      const built = buildPlacementObject(p, ground)
      if (!built) continue
      lods.push(built.lod)
      group.add(built.object)
      mushroomObjects.push(built.object)
    }

    scene.add(group)
    return { group, ground, trees, lods, mushroomObjects }
  }

  function disposeChunk(loaded: LoadedChunk): void {
    scene.remove(loaded.group)
    loaded.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
  }

  // Coordinates that are needed but not yet built, nearest first — drained
  // at BUILD_BUDGET_PER_UPDATE per `update()` call rather than all at once,
  // so a sudden burst of newly-needed chunks (leaving the home plot for the
  // first time, or a long sprint across several chunks at once) spreads its
  // real build cost over the next several frames instead of one huge stall.
  let buildQueue: ChunkCoord[] = []

  function resync(playerChunk: ChunkCoord): void {
    const needed = chunksInRadius(playerChunk, LOAD_RADIUS).filter((c) => !(c.cx === 0 && c.cz === 0))
    const neededKeys = new Set(needed.map(chunkKey))
    const keep = new Set(chunksInRadius(playerChunk, UNLOAD_RADIUS).map(chunkKey))

    for (const [key, loaded] of chunks) {
      if (!keep.has(key)) {
        disposeChunk(loaded)
        chunks.delete(key)
      }
    }

    // Drop queued chunks the player is no longer heading toward, and queue
    // any newly-needed one not already loaded or already queued.
    const queuedKeys = new Set(buildQueue.map(chunkKey))
    buildQueue = buildQueue.filter((c) => neededKeys.has(chunkKey(c)))
    for (const coord of needed) {
      const key = chunkKey(coord)
      if (!chunks.has(key) && !queuedKeys.has(key)) buildQueue.push(coord)
    }
  }

  return {
    update(playerX, playerZ) {
      const playerChunk = chunkCoordAt(playerX, playerZ)
      if (!currentPlayerChunk || currentPlayerChunk.cx !== playerChunk.cx || currentPlayerChunk.cz !== playerChunk.cz) {
        currentPlayerChunk = playerChunk
        resync(playerChunk)
      }
      for (let i = 0; i < BUILD_BUDGET_PER_UPDATE && buildQueue.length > 0; i++) {
        const coord = buildQueue.shift()!
        chunks.set(chunkKey(coord), buildChunk(coord))
      }
    },
    pendingChunkCount() {
      return buildQueue.length
    },
    mushroomObjects() {
      return Array.from(chunks.values()).flatMap((c) => c.mushroomObjects)
    },
    removeMushroomObject(object) {
      for (const loaded of chunks.values()) {
        const i = loaded.mushroomObjects.indexOf(object)
        if (i >= 0) {
          loaded.mushroomObjects.splice(i, 1)
          return true
        }
      }
      return false
    },
    obstacles() {
      return Array.from(chunks.values()).flatMap((c) => c.trees.map((t) => ({ x: t.x, z: t.z, radius: t.radius })))
    },
    updateLod(camera) {
      for (const loaded of chunks.values()) {
        for (const lod of loaded.lods) lod.update(camera)
      }
    },
    heightAt(x, z) {
      if (inHome(x, z)) return homeGround.heightAt(x, z)
      const coord = chunkCoordAt(x, z)
      const loaded = chunks.get(chunkKey(coord))
      // The loaded chunk's own GRIDDED provider matches its rendered mesh
      // exactly (griddedProvider's whole reason to exist — see terrain/
      // gridded.ts); the raw continuous base terrain is a fine fallback for
      // an unloaded chunk, since no mesh is on screen there to disagree with.
      return loaded ? loaded.ground.heightAt(x, z) : baseTerrain.heightAt(x, z)
    },
    dispose() {
      for (const loaded of chunks.values()) disposeChunk(loaded)
      chunks.clear()
    },
  }
}
