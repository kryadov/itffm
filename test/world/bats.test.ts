import * as THREE from 'three'
import { placeBatRoosts, batPose, shouldFlush, buildBats, BAT_FLIGHT_SECONDS } from '../../src/world/bats'
import { placeMine, caveSdf, TUNNEL_HEIGHT } from '../../src/world/mine'

const flat = { heightAt: () => 0 }
const mine = (seed: number) => placeMine(flat, 90, seed, [], { x: 0, z: 0 }, [{ x: 0, z: 0 }])

describe('placeBatRoosts', () => {
  it('is deterministic', () => {
    expect(placeBatRoosts(mine(3), 5)).toEqual(placeBatRoosts(mine(3), 5))
  })

  it('hangs a few colonies from the ceiling of dead ends, inside the passages, never in the diamond chamber', () => {
    for (const seed of [1, 3, 7, 11, 23]) {
      const m = mine(seed)
      const roosts = placeBatRoosts(m, seed)
      expect(roosts.length).toBeGreaterThanOrEqual(2)
      const chamber = m.segments.find((s) => s.isDiamondChamber)!
      for (const r of roosts) {
        expect(caveSdf(m, r.lx, r.lz)).toBeLessThan(-0.8)
        expect(r.ceiling).toBeGreaterThan(m.y + TUNNEL_HEIGHT - 0.4)
        expect(r.ceiling).toBeLessThanOrEqual(m.y + TUNNEL_HEIGHT + 0.01)
        expect(r.count).toBeGreaterThanOrEqual(4)
        expect(Math.hypot(r.lx - chamber.x1, r.lz - chamber.z1)).toBeGreaterThan(3)
      }
    }
  })
})

describe('batPose', () => {
  const m = mine(3)
  const roost = placeBatRoosts(m, 3)[0]

  it('hangs head down at the ceiling while undisturbed', () => {
    const p = batPose(roost, 2, 50, -Infinity)
    expect(p.hanging).toBe(true)
    expect(p.y).toBeGreaterThan(roost.ceiling - 0.2)
    expect(p.y).toBeLessThanOrEqual(roost.ceiling)
  })

  it('takes wing when flushed, and stays inside the passage the whole flight', () => {
    for (let k = 0; k < roost.count; k++) {
      for (let dt = 0.2; dt < BAT_FLIGHT_SECONDS; dt += 0.23) {
        const p = batPose(roost, k, 100 + dt, 100)
        expect(caveSdf(m, p.lx, p.lz), `bat ${k} at +${dt.toFixed(2)}s`).toBeLessThan(-0.25)
        expect(p.y).toBeGreaterThan(m.y + 0.6)
        expect(p.y).toBeLessThanOrEqual(roost.ceiling)
      }
    }
    expect(batPose(roost, 1, 102, 100).hanging).toBe(false)
  })

  it('actually flies about, not hovering in place', () => {
    const a = batPose(roost, 0, 101.5, 100)
    const b = batPose(roost, 0, 102.5, 100)
    expect(Math.hypot(b.lx - a.lx, b.lz - a.lz, b.y - a.y)).toBeGreaterThan(0.5)
  })

  it('settles back on the ceiling once the flight is over', () => {
    expect(batPose(roost, 0, 100 + BAT_FLIGHT_SECONDS + 0.5, 100).hanging).toBe(true)
  })

  it('is deterministic', () => {
    expect(batPose(roost, 3, 101.7, 100)).toEqual(batPose(roost, 3, 101.7, 100))
  })
})

describe('shouldFlush', () => {
  const roost = placeBatRoosts(mine(3), 3)[0]
  it('flushes a quiet colony when the player comes near inside the mine', () => {
    expect(shouldFlush(roost, { lx: roost.lx + 2, lz: roost.lz }, true, 10, -Infinity)).toBe(true)
  })
  it('leaves it be from far off, from outside, or while it is already up', () => {
    expect(shouldFlush(roost, { lx: roost.lx + 12, lz: roost.lz }, true, 10, -Infinity)).toBe(false)
    expect(shouldFlush(roost, { lx: roost.lx + 2, lz: roost.lz }, false, 10, -Infinity)).toBe(false)
    expect(shouldFlush(roost, { lx: roost.lx + 2, lz: roost.lz }, true, 10, 8)).toBe(false)
  })
})

describe('buildBats', () => {
  it('draws every bat — body and two wings — as instanced meshes lit like the cave', () => {
    const m = mine(3)
    const roosts = placeBatRoosts(m, 3)
    const material = new THREE.MeshBasicMaterial({ vertexColors: true })
    const bats = buildBats(roosts, material)
    const total = roosts.reduce((n, r) => n + r.count, 0)
    const meshes = bats.group.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh)
    expect(meshes).toHaveLength(3)
    for (const mesh of meshes) {
      expect(mesh.count).toBe(total)
      expect(mesh.geometry.getAttribute('color')).toBeDefined()
    }
    bats.update(0, null, false)
    bats.update(1, { lx: roosts[0].lx, lz: roosts[0].lz }, true)
  })
})
