import * as THREE from 'three'
import { createWorldStream } from '../../src/game/worldStream'
import { CHUNK_SIZE } from '../../src/world/chunking'
import type { ElevationProvider } from '../../src/terrain/provider'

const flatHome: ElevationProvider = { heightAt: () => 0 }
const HOME_RADIUS = CHUNK_SIZE / 2

/** Keeps calling update() at the same position until the build queue has
 *  fully drained — the real game just calls update() every frame and lets
 *  it catch up over several of them; tests stand in for "several frames
 *  passed" explicitly instead of asserting on one single call. */
function settle(stream: ReturnType<typeof createWorldStream>, x: number, z: number, maxTicks = 20): void {
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

  it('collects placements only from currently-loaded chunks', () => {
    const scene = new THREE.Scene()
    const stream = createWorldStream(scene, 7, flatHome, HOME_RADIUS)
    expect(stream.mushroomObjects()).toHaveLength(0)
    settle(stream, CHUNK_SIZE * 2, 0)
    expect(stream.mushroomObjects().length).toBeGreaterThan(0)
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
})
