import { placeShelter, shelterObstacle } from '../../src/world/shelter'
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
