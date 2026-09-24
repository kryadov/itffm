import { createForest } from '../../src/game/scene'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { waterObstacles } from '../../src/world/water'
import type { ForestSource } from '../../src/game/scene'
import { stepPlayer, type PlayerState } from '../../src/game/player'
import * as THREE from 'three'

const ground = proceduralTerrain(1)
const biomeAt = (): 'forest-mixed' => 'forest-mixed' as const

// Small on purpose: createForest builds a whole scene (terrain, trees,
// ecology sites, mushrooms...) — this only needs to be big enough that the
// obstacle assembly under test still runs, not a realistic wood.
const HALF_SIZE = 20

describe('createForest obstacle assembly', () => {
  it('includes waterObstacles\' own circles for a mapped pond', () => {
    const pond = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]
    const source: ForestSource = { ground, trees: [], biomeAt, water: [pond] }
    const forest = createForest(source, 1, HALF_SIZE, 20)
    const expected = waterObstacles([pond])
    expect(expected.length).toBeGreaterThan(0)
    for (const o of expected) {
      expect(forest.extraObstacles.some((e) => e.x === o.x && e.z === o.z && e.radius === o.radius)).toBe(true)
    }
  })
})

describe('createForest keeps the water clear', () => {
  // A live report (2026-09-24): trunks stood in the demo wood's pond.
  it('drops every tree standing in a pond, mesh and collision alike', () => {
    const pond = [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }]
    const trees = [
      { x: 0, z: 0, y: 0, genus: 'betula' as const, radius: 0.3, height: 18 },
      { x: 5, z: -3, y: 0, genus: 'pinus' as const, radius: 0.3, height: 22 },
    ]
    const forest = createForest({ ground, trees, biomeAt, water: [pond] }, 1, 30, 20)
    for (const t of forest.trees) expect(Math.abs(t.x) <= 8 && Math.abs(t.z) <= 8, `tree at ${t.x},${t.z}`).toBe(false)
  })
})

describe('createForest deferred placements', () => {
  const source: ForestSource = { ground, trees: [], biomeAt }
  const build = (defer: boolean) => createForest(source, 1, 60, 20, 10, defer)

  it('builds nothing up front when deferred, and everything on request', () => {
    const forest = build(true)
    expect(forest.placements.length).toBeGreaterThan(3)
    expect(forest.mushroomObjects).toHaveLength(0)
    expect(forest.pendingPlacements()).toBe(forest.placements.length)
    expect(forest.buildPlacements(Infinity)).toBe(0)
    expect(forest.pendingPlacements()).toBe(0)
    expect(forest.mushroomObjects.length).toBeGreaterThan(0)
  })

  it('always makes progress, even on a zero budget, and can be drained in slices', () => {
    const forest = build(true)
    const total = forest.placements.length
    let remaining = forest.buildPlacements(0)
    expect(remaining).toBe(total - 1)
    let calls = 1
    while (remaining > 0) {
      const next = forest.buildPlacements(0)
      expect(next).toBeLessThan(remaining)
      remaining = next
      calls++
    }
    expect(calls).toBe(total)
  })

  it('ends up with the same wood as building it all at once', () => {
    const eager = build(false)
    const sliced = build(true)
    while (sliced.buildPlacements(0) > 0) { /* drain */ }
    const key = (f: ReturnType<typeof build>) =>
      f.mushroomObjects.map((o) => [o.position.x, o.position.y, o.position.z, o.userData.placement.speciesId].join(','))
    expect(key(sliced)).toEqual(key(eager))
    expect(eager.pendingPlacements()).toBe(0)
  })
})

describe('createForest with the mine — walking in and out through the real ground and collision', () => {
  // Real terrain, real scatter, real obstacle list: the same objects main.ts
  // hands stepPlayer, with the same per-frame playerInsideMine call.
  const HALF = 90
  const source: ForestSource = { ground, trees: [], biomeAt }
  const forest = createForest(source, 5, HALF, 100)
  const group = forest.scene.getObjectByName('mine')!
  group.updateMatrixWorld(true)
  const toWorld = (lx: number, lz: number): { x: number; z: number } => {
    const v = group.localToWorld(new THREE.Vector3(lx, 0, lz))
    return { x: v.x, z: v.z }
  }

  const walkTo = (p: PlayerState, target: { x: number; z: number }): { p: PlayerState; maxJump: number; steps: number } => {
    let maxJump = 0
    let steps = 0
    let last = forest.ground.heightAt(p.x, p.z)
    while (Math.hypot(target.x - p.x, target.z - p.z) > 0.6 && steps < 3000) {
      const yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z))
      p = stepPlayer(
        p, { forward: 1, strafe: 0, dYaw: yaw - p.yaw, dPitch: 0, crouching: false, sprinting: false, jumping: false, dt: 1 / 60 },
        forest.ground, forest.extraObstacles,
      )
      forest.playerInsideMine(p.x, p.z)
      const h = forest.ground.heightAt(p.x, p.z)
      maxJump = Math.max(maxJump, Math.abs(h - last))
      last = h
      steps++
    }
    return { p, maxJump, steps }
  }

  it('the player can walk from the doorstep to the diamond and back out to the meadow', () => {
    const start = toWorld(-4, 0)
    let p: PlayerState = {
      x: start.x, z: start.z, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
    }
    forest.playerInsideMine(p.x, p.z)
    expect(forest.playerInsideMine(p.x, p.z)).toBe(false)

    const inward = walkTo(p, toWorld(1.5, 0))
    expect(Math.hypot(inward.p.x - toWorld(1.5, 0).x, inward.p.z - toWorld(1.5, 0).z)).toBeLessThan(0.7)
    expect(forest.playerInsideMine(inward.p.x, inward.p.z)).toBe(true)
    expect(inward.maxJump).toBeLessThan(0.08)

    // From the doorway to the diamond along the mine's own passages is the
    // pure-geometry test's job (test/world/mine.test.ts); here the point is
    // that the wired-up scene agrees: the ground under the player is the
    // floor, and stepping back out returns to the meadow smoothly.
    const spot = forest.diamondSpot
    expect(forest.ground.heightAt(spot.x, spot.z)).toBeCloseTo(spot.y, 1)
    const outward = walkTo(inward.p, toWorld(-4, 0))
    expect(Math.hypot(outward.p.x - toWorld(-4, 0).x, outward.p.z - toWorld(-4, 0).z)).toBeLessThan(0.7)
    expect(forest.playerInsideMine(outward.p.x, outward.p.z)).toBe(false)
    expect(outward.maxJump).toBeLessThan(0.08)
  })

  it('leaves no scatter standing in the passages: no scatter collides inside the first passage', () => {
    const lattice = forest.extraObstacles.filter((o) => {
      const l = group.worldToLocal(new THREE.Vector3(o.x, 0, o.z))
      return l.x > 0.5 && l.x < 5.5 && Math.abs(l.z) < 1
    })
    expect(lattice).toHaveLength(0)
  })

  it('draws the ground from the mine-reshaped surface, so the doorstep is level with the floor', () => {
    const mesh = forest.scene.getObjectByName('ground') as THREE.Mesh
    const pos = mesh.geometry.getAttribute('position')
    const door = toWorld(-0.3, 0)
    // nearest ground-mesh vertex to the doorstep
    let best = Infinity
    let bestY = 0
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - door.x, pos.getZ(i) - door.z)
      if (d < best) { best = d; bestY = pos.getY(i) }
    }
    expect(Math.abs(bestY - forest.ground.heightAt(door.x, door.z))).toBeLessThan(0.15)
  })
})
