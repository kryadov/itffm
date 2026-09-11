import * as THREE from 'three'
import { withPits } from '../terrain/pits'
import { proceduralTerrain } from '../terrain/procedural'
import { griddedProvider } from '../terrain/gridded'
import { placeTrees, buildTreeMeshes, treePerches, type Tree } from '../world/trees'
import { regionalMix } from '../world/osmTrees'
import { buildGround } from '../world/ground'
import { buildSites } from '../ecology/sites'
import { createHares, createSquirrels, placeCritterHomes, type CritterGroup } from '../world/critters'
import { placeBoulders, buildBoulderMeshes } from '../world/boulders'
import { placeLogs, placeStumps, placeLeaningTrees, buildDeadwoodMeshes, buildLeaningTreeMeshes } from '../world/deadwood'
import { placeBushes, buildBushMeshes } from '../world/undergrowth'
import { placeFlora, buildFloraMeshes } from '../world/flora'
import { placeGrass, buildGrassMesh } from '../world/grass'
import { spawnMushrooms, type Placement } from '../ecology/spawn'
import { buildPlacementObject } from '../collectible/placement'
import { loadSpecies } from '../species/load'
import {
  CHUNK_SIZE, CHUNK_GROUND_SEGMENTS, chunkCoordAt, chunkOrigin, chunkSeed, chunksInRadius, chunkKey,
  type ChunkCoord,
} from '../world/chunking'
import { collectScatterCullers, sweepAll, type ScatterCuller } from '../world/instanceCulling'
import { mulberry32 } from '../util/rng'
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

/** How many placement objects (one mushroom/berry/herb/nut/find's own built-
 *  and-merged mesh, wrapped in its LOD) get actually constructed per
 *  `update()` call, across every chunk still mid-build. Measured this
 *  session (see TODO.md's "Chunk build cost"): building a chunk's ~130
 *  placements is itself the dominant cost of the whole chunk build (~110ms
 *  of a ~150-250ms total, the rest — terrain, trees, decorative scatter —
 *  comes to a few dozen ms) — the single biggest lever a chunk build has,
 *  bigger than any of the scatter systems combined. `buildChunk` below
 *  builds the chunk's terrain/trees/scatter/sites (and its own ground mesh
 *  goes on screen) synchronously, same as before, but leaves its
 *  `placements` array to fill in over several subsequent `update()` calls
 *  instead of building every mushroom's real geometry in the same freeze —
 *  same idea as `BUILD_BUDGET_PER_UPDATE` above, one level deeper: even a
 *  single chunk's own build cost is now sliced, not just the queue of
 *  chunks. 16 keeps a single `update()` call's own placement work down
 *  around 15-20ms even on this session's own (slower than a real GPU host's
 *  CPU) measurement rig — a real frame budget at 60fps is ~16ms, so this is
 *  already close to "at most one frame's worth," not free, but nothing like
 *  the ~150ms a whole chunk's ~130 placements cost built all at once. */
const PLACEMENT_BUDGET_PER_UPDATE = 16

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

/** Hares/squirrels per streamed chunk — a flat, much smaller count than the
 *  home plot's own 5-and-5 (`game/scene.ts`), same "sparser further out"
 *  reasoning as CHUNK_SITE_COUNT/TREE_DENSITY above: up to nine chunks are
 *  live at once (LOAD_RADIUS), so even a small per-chunk count adds up.
 *  Snakes are deliberately left out here — the brainstormed count was "two
 *  to a wood, not five" (see world/critters.ts's own comment), a rarity
 *  that means something only if it does not repeat per chunk. */
const CHUNK_HARE_COUNT = 2
const CHUNK_SQUIRREL_COUNT = 2

interface LoadedChunk {
  group: THREE.Group
  ground: ElevationProvider
  trees: Tree[]
  lods: THREE.LOD[]
  mushroomObjects: THREE.Object3D[]
  critters: CritterGroup[]
  scatterCullers: ScatterCuller[]
  /** Every mushroom/berry/herb/nut/find this chunk's ecology spawned —
   *  computed synchronously (cheap, see PLACEMENT_BUDGET_PER_UPDATE above),
   *  but turned into real objects only `placementCursor` at a time. */
  placements: Placement[]
  /** How many of `placements` already have a built object in `group` and
   *  `mushroomObjects` — `placements.length` once this chunk has fully
   *  caught up. */
  placementCursor: number
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
  /** Real distance culling for every loaded chunk's static InstancedMesh
   *  scatter — same mechanism and same "call periodically, not every frame"
   *  rule as `Forest.updateScatterCulling` (world/instanceCulling.ts). */
  updateScatterCulling(camX: number, camZ: number, radius: number): void
  /** Steps every loaded chunk's hares and squirrels (state machine, pose,
   *  instanced-mesh matrices) — three.js does not do this on its own either,
   *  same reason `updateLod` above exists. Call every frame. */
  updateCritters(dt: number, playerX: number, playerZ: number): void
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
 * ecology, hares and squirrels) and is not (the hut, campfire, hive/bees,
 * dragonflies, snakes, decorative InstancedMesh scatter, real-place OSM
 * tiling) chunked in this pass.
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
    // Litter colour is a continuous field over the whole world, not per-chunk
    // content — it has to share one seed everywhere (globalSeed + 17, the
    // same convention game/scene.ts's home plot uses) rather than this
    // chunk's own chunkSeed. fbm2 with two different seeds is two unrelated
    // noise fields, so passing the chunk seed here made the ground colour
    // jump at every chunk border even though the world (x, z) coordinates on
    // both sides line up exactly — see TODO.md's "Швы между чанками карты
    // видны".
    group.add(buildGround(baseTerrain, half, CHUNK_GROUND_SEGMENTS, biomeAt, globalSeed + 17, origin))

    const trees = placeTrees(baseTerrain, half, seed + 1, mix, TREE_DENSITY, origin)
    group.add(buildTreeMeshes(trees))

    // Decorative scatter, chunked — the same generators the home plot uses
    // (`game/scene.ts`), at their own default densities: the demo wood's own
    // home plot is itself exactly one chunk's area now (`CHUNK_SIZE / 2`,
    // see `game/loadForest.ts`), so there is no "forty times bigger" density
    // problem here the way real trees/sites had (TREE_DENSITY/
    // CHUNK_SITE_COUNT above) — this chunk and the home plot are the same
    // size. Deliberately NOT feeding logs/boulders into `buildSites` the way
    // the home plot does (real deadwood/moss ecology sites) — measured
    // during this session: doing so pushed one chunk's site count from 200
    // to ~950 (every log/boulder contributes several spawn points) and its
    // own build cost from ~20ms to ~78ms, enough to take the whole test
    // suite from ~30s to over two minutes across many chunks. Visual-only
    // scatter here; real ecology sites on deadwood/moss stay home-plot-only.
    const logs = placeLogs(ground, half, seed + 4, undefined, origin)
    const stumps = placeStumps(ground, half, seed + 5, undefined, origin)
    const leaningTrees = placeLeaningTrees(ground, half, seed + 6, undefined, origin)
    group.add(buildDeadwoodMeshes(logs, stumps))
    group.add(buildLeaningTreeMeshes(leaningTrees))
    const boulders = placeBoulders(ground, half, seed + 7, undefined, origin)
    group.add(buildBoulderMeshes(boulders))
    const bushes = placeBushes(ground, half, seed + 8, undefined, origin)
    group.add(buildBushMeshes(bushes))
    group.add(buildFloraMeshes(placeFlora(ground, half, seed + 9, undefined, origin)))
    group.add(buildGrassMesh(placeGrass(ground, half, seed + 10, origin)))

    const sites = buildSites(ground, trees, half, seed + 2, biomeAt, CHUNK_SITE_COUNT, [], [], [], origin)
    const month = new Date().getMonth() + 1
    const placements: Placement[] = spawnMushrooms(species, sites, { month, seed: seed + 3, daysSinceRain: 2 })

    // Deliberately NOT built here — see PLACEMENT_BUDGET_PER_UPDATE's own
    // comment. `placements` only decides WHAT this chunk will hold; turning
    // each one into a real, merged mesh (the actually expensive step) is
    // `advancePlacements`' job, called a few at a time from `update()` below.
    const lods: THREE.LOD[] = []
    const mushroomObjects: THREE.Object3D[] = []

    // Snapshotted once the chunk's own scatter (trees/boulders/deadwood/
    // leaning-trees/undergrowth/flora/grass) already sits in `group` with its
    // real transforms — same as game/scene.ts's home plot, see world/
    // instanceCulling.ts.
    const scatterCullers = collectScatterCullers(group)

    // Ground fauna, chunked — see docs/superpowers/specs/2026-09-10-
    // infinite-world-design.md's own follow-up note. createHares/
    // createSquirrels add their instanced meshes straight to `scene`
    // (not into `group` — the same layering `game/scene.ts` uses for the
    // home plot's own wildlife), so they're tracked and disposed here
    // through the returned CritterGroup handles instead.
    const treeCircles = trees.map((t) => ({ x: t.x, z: t.z, radius: t.radius }))
    const hareHomes = placeCritterHomes(ground, half, seed + 20, CHUNK_HARE_COUNT, treeCircles, 1.5, origin)
    const hares = createHares(scene, mulberry32(seed + 21), CHUNK_HARE_COUNT, ground, hareHomes)
    const squirrelHomes = placeCritterHomes(ground, half, seed + 22, CHUNK_SQUIRREL_COUNT, treeCircles, 1.5, origin)
    const squirrels = createSquirrels(
      scene, mulberry32(seed + 23), CHUNK_SQUIRREL_COUNT, ground, squirrelHomes, treePerches(trees),
    )

    scene.add(group)
    return {
      group, ground, trees, lods, mushroomObjects, critters: [hares, squirrels], scatterCullers,
      placements, placementCursor: 0,
    }
  }

  /** Builds up to `budget` of `loaded`'s still-pending placements (its own
   *  chunk group and mushroomObjects/lods grow in place) — the actual
   *  amortization PLACEMENT_BUDGET_PER_UPDATE exists for. Returns how many
   *  it actually built (fewer than `budget` once this chunk's own placements
   *  run out, so the caller can spend the rest of its budget on another
   *  chunk in the same `update()` call). */
  function advancePlacements(loaded: LoadedChunk, budget: number): number {
    const end = Math.min(loaded.placements.length, loaded.placementCursor + budget)
    let built = 0
    for (; loaded.placementCursor < end; loaded.placementCursor++, built++) {
      const p = loaded.placements[loaded.placementCursor]
      const obj = buildPlacementObject(p, loaded.ground)
      if (!obj) continue
      loaded.lods.push(obj.lod)
      loaded.group.add(obj.object)
      loaded.mushroomObjects.push(obj.object)
    }
    return built
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
    for (const c of loaded.critters) c.dispose()
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

      // Spend this call's placement budget across every chunk still mid-
      // build, nearest-loaded-first (Map iteration order = insertion order,
      // so the longest-waiting chunk catches up first) — see
      // PLACEMENT_BUDGET_PER_UPDATE's own comment.
      let remaining = PLACEMENT_BUDGET_PER_UPDATE
      for (const loaded of chunks.values()) {
        if (remaining <= 0) break
        remaining -= advancePlacements(loaded, remaining)
      }
    },
    pendingChunkCount() {
      // Not fully settled either while a chunk is still queued to be built
      // at all, or while a loaded chunk's own placements are still mid-
      // build — settle() (test/game/worldStream.test.ts) polls this exact
      // count to know when to stop calling update().
      let midBuild = 0
      for (const loaded of chunks.values()) {
        if (loaded.placementCursor < loaded.placements.length) midBuild++
      }
      return buildQueue.length + midBuild
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
    updateCritters(dt, playerX, playerZ) {
      for (const loaded of chunks.values()) {
        for (const c of loaded.critters) c.update(dt, playerX, playerZ)
      }
    },
    updateScatterCulling(camX, camZ, radius) {
      for (const loaded of chunks.values()) sweepAll(loaded.scatterCullers, camX, camZ, radius)
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
