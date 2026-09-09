import * as THREE from 'three'
import { placeCampfire, campfireObstacle, buildCampfireMesh } from '../../src/world/campfire'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { Circle } from '../../src/util/openSpot'

const ground = proceduralTerrain(5)
const shelter = { x: 20, z: -15 }

describe('placeCampfire', () => {
  it('is deterministic', () => {
    expect(placeCampfire(ground, 90, 3, [], shelter)).toEqual(placeCampfire(ground, 90, 3, [], shelter))
  })

  it('gives a different spot for a different seed', () => {
    expect(placeCampfire(ground, 90, 1, [], shelter).x).not.toBe(placeCampfire(ground, 90, 2, [], shelter).x)
  })

  it('stands on the ground beneath it', () => {
    const c = placeCampfire(ground, 90, 3, [], shelter)
    expect(c.y).toBeCloseTo(ground.heightAt(c.x, c.z), 5)
  })

  it('stays within the plot', () => {
    const c = placeCampfire(ground, 90, 3, [], shelter)
    expect(Math.abs(c.x)).toBeLessThanOrEqual(90)
    expect(Math.abs(c.z)).toBeLessThanOrEqual(90)
  })

  it('sites itself apart from the shelter, not right next to it', () => {
    const c = placeCampfire(ground, 90, 3, [], shelter)
    expect(Math.hypot(c.x - shelter.x, c.z - shelter.z)).toBeGreaterThan(20)
  })

  it('stays clear of existing obstacles', () => {
    const obstacles: Circle[] = [{ x: 0, z: 0, radius: 0.3 }]
    const c = placeCampfire(ground, 90, 3, obstacles, { x: 0, z: 0 })
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(2)
  })
})

describe('campfireObstacle', () => {
  it('blocks walking through the fire ring and bench', () => {
    const c = { x: 4, z: -2, y: 0, rotationY: 0.5 }
    const o = campfireObstacle(c)
    expect(o.x).toBe(4)
    expect(o.z).toBe(-2)
    expect(o.radius).toBeGreaterThan(0.5)
  })
})

describe('buildCampfireMesh', () => {
  const c = { x: 4, z: -2, y: 0, rotationY: 0.5 }

  it('places the group at the campfire position', () => {
    const { group } = buildCampfireMesh(c)
    expect(group.position.x).toBe(4)
    expect(group.position.z).toBe(-2)
  })

  it('gives the embers a white-to-red palette, not one flat colour', () => {
    const { group } = buildCampfireMesh(c)
    const emberMats = group.children
      .filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'IcosahedronGeometry')
      .map((o) => (o.material as THREE.MeshStandardMaterial).color.getHex())
    const distinct = new Set(emberMats)
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('adds a pot hanging from a tripod over the fire', () => {
    const { group } = buildCampfireMesh(c)
    const pot = group.children.find((o) => {
      const geo = (o as THREE.Mesh).geometry
      return geo instanceof THREE.CylinderGeometry && geo.parameters.radiusTop < geo.parameters.radiusBottom
    }) as THREE.Mesh
    expect(pot).toBeDefined()
    expect(pot.position.y).toBeGreaterThan(0.3)
  })

  it('adds a bench facing the fire', () => {
    const { group } = buildCampfireMesh(c)
    const bench = group.getObjectByName('bench')!
    expect(bench.children.length).toBeGreaterThan(0)
    expect(Math.hypot(bench.position.x, bench.position.z)).toBeGreaterThan(0.5)
  })

  it('lets the smoke drift and the embers flicker without throwing', () => {
    const { update } = buildCampfireMesh(c)
    expect(() => {
      for (let i = 0; i < 60; i++) update(1 / 30)
    }).not.toThrow()
  })

  it('keeps the fire light within a sane range as it flickers', () => {
    const { group, update } = buildCampfireMesh(c)
    const light = group.children.find((o) => o instanceof THREE.PointLight) as THREE.PointLight
    for (let i = 0; i < 120; i++) {
      update(1 / 30)
      expect(light.intensity).toBeGreaterThan(0)
      expect(light.intensity).toBeLessThan(30)
    }
  })
})
