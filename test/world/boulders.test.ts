import { placeBoulders, boulderObstacle, mossSpawnPoints } from '../../src/world/boulders'
import { proceduralTerrain } from '../../src/terrain/procedural'

const ground = proceduralTerrain(5)

describe('placeBoulders', () => {
  it('is deterministic', () => {
    expect(placeBoulders(ground, 90, 3)).toEqual(placeBoulders(ground, 90, 3))
  })

  it('gives a different layout for a different seed', () => {
    expect(placeBoulders(ground, 90, 1)[0]?.x).not.toBe(placeBoulders(ground, 90, 2)[0]?.x)
  })

  it('keeps every boulder within the plot and on the ground', () => {
    for (const b of placeBoulders(ground, 90, 3)) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(b.z)).toBeLessThanOrEqual(90)
      expect(b.y).toBeCloseTo(ground.heightAt(b.x, b.z), 5)
    }
  })

  it('gives plausible dimensions', () => {
    for (const b of placeBoulders(ground, 90, 3)) {
      expect(b.radius).toBeGreaterThan(0.2)
      expect(b.radius).toBeLessThan(1.5)
    }
  })
})

describe('boulderObstacle', () => {
  it('matches the boulder position and radius', () => {
    const b = { x: 3, z: -4, y: 0, radius: 0.6 }
    expect(boulderObstacle(b)).toEqual({ x: 3, z: -4, radius: 0.6, topHeight: 0.78 })
  })
})

describe('mossSpawnPoints', () => {
  const b = { x: 0, z: 0, y: 0, radius: 0.6 }

  it('places points outside the boulder itself', () => {
    for (const p of mossSpawnPoints(b)) {
      expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(b.radius)
    }
  })

  it('favours the north side (negative z) over the south', () => {
    // North in this world is -z (see geo/project.ts); moss grows thicker
    // on the shaded side of a rock, so more points should land there.
    const points = mossSpawnPoints(b, 40)
    const north = points.filter((p) => p.z < b.z).length
    const south = points.filter((p) => p.z > b.z).length
    expect(north).toBeGreaterThan(south)
  })

  it('is deterministic', () => {
    expect(mossSpawnPoints(b)).toEqual(mossSpawnPoints(b))
  })
})
