import * as THREE from 'three'
import { placeShelter, shelterObstacle, buildShelterMesh } from '../../src/world/shelter'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { Circle } from '../../src/util/openSpot'

const ground = proceduralTerrain(5)

describe('placeShelter', () => {
  it('is deterministic', () => {
    expect(placeShelter(ground, 90, 3, [])).toEqual(placeShelter(ground, 90, 3, []))
  })

  it('gives a different spot for a different seed', () => {
    expect(placeShelter(ground, 90, 1, []).x).not.toBe(placeShelter(ground, 90, 2, []).x)
  })

  it('stands on the ground beneath it', () => {
    const s = placeShelter(ground, 90, 3, [])
    expect(s.y).toBeCloseTo(ground.heightAt(s.x, s.z), 5)
  })

  it('stays clear of existing obstacles by more than a player would need', () => {
    const obstacles: Circle[] = [{ x: 0, z: 0, radius: 0.3 }]
    const s = placeShelter(ground, 90, 3, obstacles)
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(2)
  })

  it('stays within the plot', () => {
    const s = placeShelter(ground, 5, 3, [])
    expect(Math.abs(s.x)).toBeLessThanOrEqual(5)
    expect(Math.abs(s.z)).toBeLessThanOrEqual(5)
  })

  it('stands where a surveyor actually mapped one, not wherever the search would land it', () => {
    const s = placeShelter(ground, 90, 3, [], [{ x: 12, z: -7 }])
    expect(s.x).toBe(12)
    expect(s.z).toBe(-7)
    expect(s.y).toBeCloseTo(ground.heightAt(12, -7), 5)
  })

  it('ignores a mapped hut that falls outside this plot', () => {
    const withoutMapped = placeShelter(ground, 90, 3, [])
    const withOffPlot = placeShelter(ground, 90, 3, [], [{ x: 500, z: 500 }])
    expect(withOffPlot).toEqual(withoutMapped)
  })

  it('falls back to the procedural search with no mapped hut at all', () => {
    expect(placeShelter(ground, 90, 3, [], [])).toEqual(placeShelter(ground, 90, 3, []))
  })
})

describe('shelterObstacle', () => {
  it('blocks walking through the structure itself', () => {
    const s = { x: 4, z: -2, y: 0, rotationY: 0.5 }
    const o = shelterObstacle(s)
    expect(o.x).toBe(4)
    expect(o.z).toBe(-2)
    expect(o.radius).toBeGreaterThan(1)
  })
})

describe('buildShelterMesh', () => {
  const s = { x: 4, z: -2, y: 0, rotationY: 0.5 }

  it('places the group at the shelter position', () => {
    const { group } = buildShelterMesh(s)
    expect(group.position.x).toBe(4)
    expect(group.position.z).toBe(-2)
  })

  it('stays dark by day and glows at full night', () => {
    const { group, setNight } = buildShelterMesh(s)
    const glass = group.getObjectByName('glass') as THREE.Mesh
    const mat = glass.material as THREE.MeshStandardMaterial
    setNight(0)
    expect(mat.emissiveIntensity).toBe(0)
    setNight(1)
    expect(mat.emissiveIntensity).toBeGreaterThan(0)
  })

  it('lets the smoke drift without throwing', () => {
    const { update } = buildShelterMesh(s)
    expect(() => {
      for (let i = 0; i < 30; i++) update(1 / 30)
    }).not.toThrow()
  })

  it('shadows its own hearth light off its own walls, so night light does not leak through the floor', () => {
    const { group } = buildShelterMesh(s)
    const walls = group.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry) as THREE.Mesh
    expect(walls.castShadow).toBe(true)
    expect(walls.receiveShadow).toBe(true)
    const light = group.children.find((c) => c instanceof THREE.PointLight) as THREE.PointLight
    expect(light.castShadow).toBe(true)
  })

  it('gives each window a muntin bar, not just a bare pane', () => {
    const { group } = buildShelterMesh(s)
    const window = group.children.find((c) => c.getObjectByName('glass')) as THREE.Group
    // frame + two glass panes + two muntin bars = five parts.
    expect(window.children.length).toBe(5)
  })

  it('adds a firewood pile and a well next to the hut', () => {
    const { group } = buildShelterMesh(s)
    const firewood = group.getObjectByName('firewood')!
    const well = group.getObjectByName('well')!
    expect(firewood.children.length).toBeGreaterThan(0)
    expect(well.children.length).toBeGreaterThan(0)
    // Both stand outside the hut's own footprint, not inside its walls.
    expect(Math.hypot(firewood.position.x, firewood.position.z)).toBeGreaterThan(1)
    expect(Math.hypot(well.position.x, well.position.z)).toBeGreaterThan(1)
  })
})
