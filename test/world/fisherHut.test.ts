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
  it('places the group at the boat position and builds a real hull', () => {
    const boat = { x: 3, z: 5, y: 0, rotationY: 1.1 }
    const group = buildBoatMesh(boat)
    expect(group.position.x).toBe(3)
    expect(group.position.z).toBe(5)
    const hull = group.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ExtrudeGeometry)
    expect(hull).toBeDefined()
  })

  it('tapers to a point at both ends, unlike a plain box or a single cone', () => {
    const group = buildBoatMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
    const hull = group.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ExtrudeGeometry) as THREE.Mesh
    hull.geometry.computeBoundingBox()
    const box = hull.geometry.boundingBox!
    const size = box.getSize(new THREE.Vector3())
    // The hull is longer than it is wide — a boat, not a barrel.
    expect(size.x).toBeGreaterThan(size.z)
  })
})
