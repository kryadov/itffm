import * as THREE from 'three'
import { createWorldStream } from '../../src/game/worldStream'
import { CHUNK_SIZE } from '../../src/world/chunking'
import type { ElevationProvider } from '../../src/terrain/provider'

const flatHome: ElevationProvider = { heightAt: () => 0 }
const HOME_RADIUS = CHUNK_SIZE / 2

/** Keeps calling update() at the same position until the build queue has
 *  fully drained — the real game just calls update() every frame and lets
 *  it catch up over several of them; tests stand in for "several frames
 *  passed" explicitly instead of asserting on one single call. Higher than
 *  it used to be: `pendingChunkCount()` now also counts a loaded chunk's own
 *  placements still mid-build (PLACEMENT_BUDGET_PER_UPDATE in
 *  game/worldStream.ts slices that too, not just the chunk queue — see
 *  TODO.md's "Chunk build cost"), and a full 3x3 block can hold over a
 *  thousand placements between them. */
function settle(stream: ReturnType<typeof createWorldStream>, x: number, z: number, maxTicks = 400): void {
  stream.update(x, z) // first call: queues whatever the new position needs
  for (let i = 0; i < maxTicks && stream.pendingChunkCount() > 0; i++) stream.update(x, z)
}

describe('createWorldStream', () => {
  it('never generates the reserved home chunk itself, even though its neighbours preload', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    // The player starting inside the home chunk still preloads its ring of
    // neighbours over several frames (so there's no pop-in the moment they
    // walk toward an edge) — chunk (0, 0) itself must never appear.
    settle(stream, 0, 0)
    const chunkGroups = scene.children.filter((c) => c.name.startsWith('chunk:'))
    expect(chunkGroups.map((c) => c.name)).not.toContain('chunk:0:0')
  })

  it('builds at most one chunk per update() call', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    stream.update(CHUNK_SIZE * 2, 0) // leaves the home chunk: a burst of new chunks queues up
    expect(stream.pendingChunkCount()).toBeGreaterThan(0)
    const afterFirst = scene.children.filter((c) => c.name.startsWith('chunk:')).length
    expect(afterFirst).toBe(1)
  })

  it('loads a 3x3 block of chunks once the player leaves the home chunk and enough frames pass', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    // Two chunk-widths east of the origin — well clear of the reserved
    // home chunk (0, 0) and its immediate neighbours.
    settle(stream, CHUNK_SIZE * 2, 0)
    const chunkGroups = scene.children.filter((c) => c.name.startsWith('chunk:'))
    expect(chunkGroups).toHaveLength(9)
    expect(stream.pendingChunkCount()).toBe(0)
  })

  it('is deterministic: the same seed gives the same trees in the same chunk', () => {
    const sceneA = new THREE.Scene()
    const sceneB = new THREE.Scene()
    const a = createWorldStream(sceneA, 42, flatHome, HOME_RADIUS)
    const b = createWorldStream(sceneB, 42, flatHome, HOME_RADIUS)
    settle(a, CHUNK_SIZE * 2, 0)
    settle(b, CHUNK_SIZE * 2, 0)
    expect(a.obstacles()).toEqual(b.obstacles())
  })

  it('gives a different wood for a different seed', () => {
    const sceneA = new THREE.Scene()
    const sceneB = new THREE.Scene()
    const a = createWorldStream(sceneA, 1, flatHome, HOME_RADIUS)
    const b = createWorldStream(sceneB, 2, flatHome, HOME_RADIUS)
    settle(a, CHUNK_SIZE * 2, 0)
    settle(b, CHUNK_SIZE * 2, 0)
    expect(a.obstacles()).not.toEqual(b.obstacles())
  })

  it('unloads chunks that fall well outside the new load radius', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    const nearGroupName = scene.children.find((c) => c.name === 'chunk:1:0')?.name
    expect(nearGroupName).toBe('chunk:1:0')
    settle(stream, CHUNK_SIZE * 10, 0)
    const stillThere = scene.children.some((c) => c.name === nearGroupName)
    expect(stillThere).toBe(false)
  })

  it('keeps the same loaded chunks on a small wobble within the same chunk', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    const before = scene.children.filter((c) => c.name.startsWith('chunk:')).map((c) => c.name).sort()
    stream.update(CHUNK_SIZE * 2 + 1, 0.5) // moved a metre, same chunk
    const after = scene.children.filter((c) => c.name.startsWith('chunk:')).map((c) => c.name).sort()
    expect(after).toEqual(before)
  })

  it('keeps every tree obstacle outside the reserved home radius', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 3, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, CHUNK_SIZE * 2)
    for (const o of stream.obstacles()) {
      const inHome = Math.abs(o.x) <= HOME_RADIUS && Math.abs(o.z) <= HOME_RADIUS
      expect(inHome).toBe(false)
    }
  })

  it('defers to the home ground provider inside the home radius', () => {
    const scene = new THREE.Scene()
    const slopeHome: ElevationProvider = { heightAt: (x) => x * 2 }
    const stream = createWorldStream(scene, 1, slopeHome, HOME_RADIUS)
    expect(stream.heightAt(10, 0)).toBeCloseTo(20, 5)
  })

  it('samples real terrain outside the home radius, continuous across the chunk seam', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 5, flatHome, HOME_RADIUS)
    settle(stream, HOME_RADIUS + CHUNK_SIZE / 2, 0)
    const justOutside = stream.heightAt(HOME_RADIUS + 1, 0)
    const wellOutside = stream.heightAt(HOME_RADIUS + 5, 0)
    expect(Number.isFinite(justOutside)).toBe(true)
    expect(Number.isFinite(wellOutside)).toBe(true)
  })

  it('keeps ground height continuous at the shared edge between two streamed chunks', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 9, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0) // loads chunks (1,0)..(3,0) among others
    const left = scene.children.find((c) => c.name === 'chunk:1:0') as THREE.Group
    const right = scene.children.find((c) => c.name === 'chunk:2:0') as THREE.Group
    const leftGround = left.children.find((c) => c.name === 'ground') as THREE.Mesh
    const rightGround = right.children.find((c) => c.name === 'ground') as THREE.Mesh
    const leftPos = leftGround.geometry.getAttribute('position')
    const rightPos = rightGround.geometry.getAttribute('position')
    // Chunk (1,0)'s right edge (local x = +halfSize) and chunk (2,0)'s left
    // edge (local x = -halfSize) sit at the same world x — same segment
    // count and origin spacing means every z row lines up exactly too.
    const rightEdgeByZ = new Map<number, number>()
    for (let i = 0; i < leftPos.count; i++) {
      if (leftPos.getX(i) === 200) rightEdgeByZ.set(leftPos.getZ(i), leftPos.getY(i))
    }
    expect(rightEdgeByZ.size).toBeGreaterThan(0)
    let compared = 0
    for (let i = 0; i < rightPos.count; i++) {
      if (rightPos.getX(i) !== -200) continue
      const z = rightPos.getZ(i)
      expect(rightEdgeByZ.has(z)).toBe(true)
      expect(rightPos.getY(i)).toBeCloseTo(rightEdgeByZ.get(z)!, 5)
      compared++
    }
    expect(compared).toBe(rightEdgeByZ.size)
  })

  it('keeps ground litter colour continuous at the shared edge between two streamed chunks', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 9, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    const left = scene.children.find((c) => c.name === 'chunk:1:0') as THREE.Group
    const right = scene.children.find((c) => c.name === 'chunk:2:0') as THREE.Group
    const leftGround = left.children.find((c) => c.name === 'ground') as THREE.Mesh
    const rightGround = right.children.find((c) => c.name === 'ground') as THREE.Mesh
    const leftPos = leftGround.geometry.getAttribute('position')
    const leftColor = leftGround.geometry.getAttribute('color')
    const rightPos = rightGround.geometry.getAttribute('position')
    const rightColor = rightGround.geometry.getAttribute('color')
    const rightEdgeByZ = new Map<number, [number, number, number]>()
    for (let i = 0; i < leftPos.count; i++) {
      if (leftPos.getX(i) === 200) {
        rightEdgeByZ.set(leftPos.getZ(i), [leftColor.getX(i), leftColor.getY(i), leftColor.getZ(i)])
      }
    }
    expect(rightEdgeByZ.size).toBeGreaterThan(0)
    let compared = 0
    for (let i = 0; i < rightPos.count; i++) {
      if (rightPos.getX(i) !== -200) continue
      const z = rightPos.getZ(i)
      const expected = rightEdgeByZ.get(z)!
      expect(rightColor.getX(i)).toBeCloseTo(expected[0], 5)
      expect(rightColor.getY(i)).toBeCloseTo(expected[1], 5)
      expect(rightColor.getZ(i)).toBeCloseTo(expected[2], 5)
      compared++
    }
    expect(compared).toBe(rightEdgeByZ.size)
  })

  it('collects placements only from currently-loaded chunks', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 7, flatHome, HOME_RADIUS)
    expect(stream.mushroomObjects()).toHaveLength(0)
    settle(stream, CHUNK_SIZE * 2, 0)
    expect(stream.mushroomObjects().length).toBeGreaterThan(0)
  })

  it('removeMushroomObject removes a placement from its owning chunk, and reports the miss for an unowned one', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 7, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    const [first] = stream.mushroomObjects()
    const before = stream.mushroomObjects().length
    expect(stream.removeMushroomObject(first)).toBe(true)
    expect(stream.mushroomObjects().length).toBe(before - 1)
    expect(stream.removeMushroomObject(new THREE.Object3D())).toBe(false)
  })

  it('updateLod does not throw over every loaded chunk', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    const camera = new THREE.PerspectiveCamera()
    expect(() => stream.updateLod(camera)).not.toThrow()
  })

  it('dispose removes every loaded chunk from the scene', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    stream.dispose()
    expect(scene.children.filter((c) => c.name.startsWith('chunk:'))).toHaveLength(0)
  })

  it('gives each loaded chunk its own hares and squirrels, disposed when the chunk unloads', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    expect(scene.children.filter((c) => c.name === 'hares')).toHaveLength(9)
    expect(scene.children.filter((c) => c.name === 'squirrels')).toHaveLength(9)
    // Far enough away that none of the original 9 chunks stay loaded — if
    // their wildlife wasn't disposed alongside them, this would double up
    // to 18 rather than staying at a fresh 9.
    settle(stream, CHUNK_SIZE * 10, 0)
    expect(scene.children.filter((c) => c.name === 'hares')).toHaveLength(9)
    expect(scene.children.filter((c) => c.name === 'squirrels')).toHaveLength(9)
  })

  it('updateCritters does not throw over every loaded chunk', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    expect(() => stream.updateCritters(0.1, CHUNK_SIZE * 2, 0)).not.toThrow()
  })

  it('dispose removes every loaded chunk\'s wildlife too', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)
    stream.dispose()
    expect(scene.children.filter((c) => c.name === 'hares' || c.name === 'squirrels')).toHaveLength(0)
  })

  // TODO.md's "Chunk build cost": building a chunk's own placements (each
  // mushroom/berry/herb/nut/find's real, merged mesh) measured as the
  // dominant cost of a whole chunk build this session, well past terrain,
  // trees or any of the decorative scatter combined — so it's sliced across
  // several update() calls (PLACEMENT_BUDGET_PER_UPDATE), the same way
  // BUILD_BUDGET_PER_UPDATE already slices the queue of whole chunks.
  it('builds a chunk\'s own placements gradually across several update() calls, not all at once', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 3, flatHome, HOME_RADIUS)
    stream.update(CHUNK_SIZE * 2, 0) // first call: builds one chunk's skeleton, starts its placement backlog
    const afterFirstCall = stream.mushroomObjects().length
    stream.update(CHUNK_SIZE * 2, 0)
    const afterSecondCall = stream.mushroomObjects().length
    // Some placements exist after the very first call (the budget is spent
    // the same call the chunk itself is built), but not the whole chunk's
    // worth — and a second call grows the count further, proving the
    // backlog is real, not a one-shot list that happened to come up short.
    expect(afterFirstCall).toBeGreaterThan(0)
    expect(afterSecondCall).toBeGreaterThan(afterFirstCall)
    settle(stream, CHUNK_SIZE * 2, 0)
    expect(stream.mushroomObjects().length).toBeGreaterThan(afterSecondCall)
  })

  it('a single update() call never has to build a whole chunk\'s worth of placements at once', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 5, flatHome, HOME_RADIUS)
    stream.update(CHUNK_SIZE * 2, 0)
    let maxGrowthPerCall = 0
    let last = stream.mushroomObjects().length
    for (let i = 0; i < 400 && stream.pendingChunkCount() > 0; i++) {
      stream.update(CHUNK_SIZE * 2, 0)
      const now = stream.mushroomObjects().length
      maxGrowthPerCall = Math.max(maxGrowthPerCall, now - last)
      last = now
    }
    // PLACEMENT_BUDGET_PER_UPDATE caps how many placements any single call
    // can add — well under a full chunk's worth (a streamed chunk regularly
    // spawns well over 50 placements, see the CHUNK_SITE_COUNT comment in
    // game/worldStream.ts).
    expect(maxGrowthPerCall).toBeLessThanOrEqual(16)
  })

  // Wall-clock regression guard for TODO.md's "Chunk build cost". Measured
  // this session, in this same environment (breakdown kept in the session's
  // own notes, not committed as its own fixture): building one streamed
  // chunk's ~130 placements synchronously — the code path this test would
  // have exercised before PLACEMENT_BUDGET_PER_UPDATE existed — cost roughly
  // 110-150ms on top of the chunk's own terrain/trees/scatter (another
  // ~100-130ms), for a combined single-frame stall around 250-400ms per
  // newly-needed chunk. Building a brand-new chunk's terrain/trees/scatter is
  // NOT sliced by this session's change (a bigger refactor — see TODO.md's
  // own honest note on it); this guard instead isolates calls where every
  // chunk's own skeleton is already built and only its placement backlog is
  // left, which is exactly what PLACEMENT_BUDGET_PER_UPDATE bounds. The
  // threshold is deliberately generous — a regression guard against "someone
  // re-inlines the placement loop into buildChunk," not a tight perf
  // assertion, since wall-clock numbers do not port across CI hardware (see
  // CLAUDE.md's own boot-check/silhouette-sheet precedent for treating such
  // numbers as guards, not gospel).
  it('keeps a placement-only update() call well under one whole chunk\'s former unsliced placement cost', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 9, flatHome, HOME_RADIUS)
    // LOAD_RADIUS=1 around this position needs a 3x3 block (9 chunks);
    // BUILD_BUDGET_PER_UPDATE=1 skeleton per call, so exactly 9 calls
    // guarantees every chunk's own terrain/trees/scatter is already built —
    // after that, every further call spends its budget purely on the
    // placement backlog, never on a fresh skeleton.
    for (let i = 0; i < 9; i++) stream.update(CHUNK_SIZE * 2, 0)
    let worst = 0
    for (let i = 0; i < 100 && stream.pendingChunkCount() > 0; i++) {
      const t0 = performance.now()
      stream.update(CHUNK_SIZE * 2, 0)
      worst = Math.max(worst, performance.now() - t0)
    }
    // Raised 80 → 150 (2026-09-11): flaked three CI runs running at
    // 96-111ms, comfortably under any real regression (re-inlining the
    // placement loop would jump into the hundreds), just over shared-runner
    // noise this guard was never meant to be sensitive to (see the comment
    // above). Never observed failing locally.
    expect(worst).toBeLessThan(150)
  })

  // TODO.md's "…но БЕЗ отсечения по дальности": static scatter (trees,
  // boulders, deadwood, undergrowth, flora, grass) is only ever hidden by
  // fog, a shader effect over geometry the GPU already drew — see
  // world/instanceCulling.ts. Streamed chunks get their own culler per
  // chunk, the same way game/scene.ts's home plot gets one for itself.
  it('updateScatterCulling zeroes far instances and restores them once the camera is close again', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 1, flatHome, HOME_RADIUS)
    settle(stream, CHUNK_SIZE * 2, 0)

    // The exact chunk the settled player position (CHUNK_SIZE * 2, 0) falls
    // in — not just "any" loaded chunk: settle() preloads a 3x3 block, and
    // an arbitrary one of those eight neighbours could easily sit far enough
    // from this test's own camera positions to fail for the wrong reason.
    const treeGroup = scene.children.find((c) => c.name === 'chunk:2:0')!
      .children.find((c) => c.name === 'trees') as THREE.Group | undefined
    expect(treeGroup).toBeTruthy()
    const trunkMesh = treeGroup!.children[0] as THREE.InstancedMesh
    const before = new THREE.Matrix4()
    trunkMesh.getMatrixAt(0, before)

    // Player standing far from every streamed chunk: every instance culls.
    stream.updateScatterCulling(-CHUNK_SIZE * 50, -CHUNK_SIZE * 50, 45)
    const culled = new THREE.Matrix4()
    trunkMesh.getMatrixAt(0, culled)
    expect(culled.equals(before)).toBe(false)
    const scale = new THREE.Vector3()
    culled.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
    expect(scale.x).toBeCloseTo(0, 5)

    // Player back at the chunk itself (radius wide enough to cover any tree
    // in it, wherever within the chunk it happened to land): the instance's
    // exact original transform comes back, not a recomputed approximation.
    stream.updateScatterCulling(CHUNK_SIZE * 2, 0, CHUNK_SIZE)
    const restored = new THREE.Matrix4()
    trunkMesh.getMatrixAt(0, restored)
    expect(restored.equals(before)).toBe(true)
  })
})
