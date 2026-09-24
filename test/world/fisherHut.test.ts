import * as THREE from 'three'
import { placeFisherHut, fisherHutObstacle, buildFisherHutMesh, buildBoatMesh } from '../../src/world/fisherHut'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { Vec2 } from '../../src/geo/types'

const ground = proceduralTerrain(5)
const pond: Vec2[] = [
  { x: 20, z: 20 },
  { x: 28, z: 20 },
  { x: 28, z: 28 },
  { x: 20, z: 28 },
]

describe('placeFisherHut', () => {
  it('returns null when the wood has no water at all', () => {
    expect(placeFisherHut([], ground, 90, 3, [])).toBeNull()
  })

  it('is deterministic', () => {
    expect(placeFisherHut([pond], ground, 90, 3, [])).toEqual(placeFisherHut([pond], ground, 90, 3, []))
  })

  it('sites a hut when there is a pond to site it by', () => {
    const h = placeFisherHut([pond], ground, 90, 3, [])
    expect(h).not.toBeNull()
    expect(h!.y).toBeCloseTo(ground.heightAt(h!.x, h!.z), 5)
  })

  it('stays within the plot', () => {
    const h = placeFisherHut([pond], ground, 90, 3, [])!
    expect(Math.abs(h.x)).toBeLessThanOrEqual(90)
    expect(Math.abs(h.z)).toBeLessThanOrEqual(90)
  })

  it("draws the boat up at the water's own edge, not off in the trees with the hut", () => {
    const h = placeFisherHut([pond], ground, 90, 3, [])!
    // Distance from the boat to the nearest pond vertex should be tiny (it
    // IS one of them); distance from the hut should be a real walk away.
    const distToPond = (p: { x: number; z: number }) =>
      Math.min(...pond.map((v) => Math.hypot(v.x - p.x, v.z - p.z)))
    expect(distToPond(h.boat)).toBeLessThan(0.01)
    expect(distToPond(h)).toBeGreaterThan(2)
  })

  it('prefers a pond over a stream when the wood has both', () => {
    // A stream: long, thin, open (not closed on itself) — see
    // world/water.ts's classifyWater.
    const stream: Vec2[] = [{ x: -50, z: -50 }, { x: -30, z: -50 }]
    const h = placeFisherHut([stream, pond], ground, 90, 3, [])!
    const distToPond = Math.min(...pond.map((v) => Math.hypot(v.x - h.boat.x, v.z - h.boat.z)))
    expect(distToPond).toBeLessThan(0.01)
  })
})

describe('fisherHutObstacle', () => {
  it('blocks walking through the shack itself', () => {
    const h = { x: 4, z: -2, y: 0, rotationY: 0.5, boat: { x: 0, z: 0, y: 0, rotationY: 0 } }
    const o = fisherHutObstacle(h)
    expect(o.x).toBe(4)
    expect(o.z).toBe(-2)
    expect(o.radius).toBeGreaterThan(0.5)
  })
})

describe('buildFisherHutMesh', () => {
  it('places the group at the hut position', () => {
    const h = { x: 4, z: -2, y: 0, rotationY: 0.5, boat: { x: 0, z: 0, y: 0, rotationY: 0 } }
    const group = buildFisherHutMesh(h)
    expect(group.position.x).toBe(4)
    expect(group.position.z).toBe(-2)
  })
})

describe('buildBoatMesh', () => {
  const build = () => {
    const g = buildBoatMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
    g.updateMatrixWorld(true)
    return g
  }
  const hullOf = (g: THREE.Group) => g.getObjectByName('hull') as THREE.Mesh

  it('places the group at the boat position', () => {
    const group = buildBoatMesh({ x: 3, z: 5, y: 0, rotationY: 1.1 })
    expect(group.position.x).toBe(3)
    expect(group.position.z).toBe(5)
    expect(group.rotation.y).toBeCloseTo(1.1, 5)
  })

  it('is a boat, not a barrel: longer than it is wide, and not tall', () => {
    const size = new THREE.Box3().setFromObject(hullOf(build())).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(size.z * 2.2)
    expect(size.y).toBeLessThan(size.z)
  })

  // A live request (2026-09-24): the boat was a solid pointed slab.
  it('is hollow: from above, the middle shows a floor well below the gunwale', () => {
    const g = build()
    const hull = hullOf(g)
    const top = new THREE.Box3().setFromObject(hull).max.y
    const ray = new THREE.Raycaster(new THREE.Vector3(0.1, 5, 0), new THREE.Vector3(0, -1, 0))
    const hit = ray.intersectObject(hull)[0]
    expect(hit).toBeDefined()
    expect(hit.point.y).toBeLessThan(top - 0.15)
  })

  it('rises at the bow and the stern, and comes to a point only at the bow', () => {
    const hull = hullOf(build())
    const pos = hull.geometry.getAttribute('position')
    const box = new THREE.Box3().setFromObject(hull)
    let bowTop = -Infinity, midTop = -Infinity, sternHalfWidth = 0, bowHalfWidth = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = Math.abs(pos.getZ(i))
      if (x > box.max.x - 0.05) { bowTop = Math.max(bowTop, y); bowHalfWidth = Math.max(bowHalfWidth, z) }
      if (Math.abs(x) < 0.05) midTop = Math.max(midTop, y)
      if (x < box.min.x + 0.02) sternHalfWidth = Math.max(sternHalfWidth, z)
    }
    expect(bowTop).toBeGreaterThan(midTop + 0.05)
    expect(bowHalfWidth).toBeLessThan(0.06)
    expect(sternHalfWidth).toBeGreaterThan(0.15) // a transom, not a second point
  })

  it('has painted planking outside, in more than one colour', () => {
    const col = hullOf(build()).geometry.getAttribute('color')
    const shades = new Set<string>()
    for (let i = 0; i < col.count; i++) shades.add(col.getX(i).toFixed(2) + col.getY(i).toFixed(2))
    expect(shades.size).toBeGreaterThan(3)
  })

  it('has thwarts to sit on and a pair of oars', () => {
    const g = build()
    const names: string[] = []
    g.traverse((o) => names.push(o.name))
    expect(names.filter((n) => n === 'thwart').length).toBeGreaterThanOrEqual(2)
    expect(names.filter((n) => n === 'oar')).toHaveLength(2)
  })
})
