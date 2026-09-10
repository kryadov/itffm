import { placeBushes, bushObstacle } from '../../src/world/undergrowth'
import { proceduralTerrain } from '../../src/terrain/procedural'

const ground = proceduralTerrain(5)

describe('placeBushes', () => {
  it('is deterministic', () => {
    expect(placeBushes(ground, 90, 3)).toEqual(placeBushes(ground, 90, 3))
  })

  it('gives a different layout for a different seed', () => {
    expect(placeBushes(ground, 90, 1)[0]?.x).not.toBe(placeBushes(ground, 90, 2)[0]?.x)
  })

  it('keeps every bush within the plot and on the ground', () => {
    for (const b of placeBushes(ground, 90, 3)) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(b.z)).toBeLessThanOrEqual(90)
      expect(b.y).toBeCloseTo(ground.heightAt(b.x, b.z), 5)
    }
  })

  it('gives plausible dimensions: wider than tall, roughly eye height or under', () => {
    for (const b of placeBushes(ground, 90, 3)) {
      expect(b.radius).toBeGreaterThan(0.2)
      expect(b.radius).toBeLessThan(1.2)
      expect(b.height).toBeGreaterThan(0.3)
      expect(b.height).toBeLessThan(1.6)
    }
  })

  it('grows more bushes at a higher density', () => {
    const sparse = placeBushes(ground, 90, 3, 0.0004)
    const dense = placeBushes(ground, 90, 3, 0.004)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  it('clusters into patches rather than spreading evenly across the plot', () => {
    // Index of dispersion (variance/mean of counts per cell): close to 1 for
    // an evenly-scattered (Poisson) layout, well above 1 for real clustering.
    const bushes = placeBushes(ground, 90, 3, 0.004)
    const cellSize = 22 // matches the patch noise's own spatial scale
    const cellsPerSide = Math.ceil((90 * 2) / cellSize)
    const counts = new Array(cellsPerSide * cellsPerSide).fill(0)
    for (const b of bushes) {
      const cx = Math.min(cellsPerSide - 1, Math.floor((b.x + 90) / cellSize))
      const cz = Math.min(cellsPerSide - 1, Math.floor((b.z + 90) / cellSize))
      counts[cz * cellsPerSide + cx]++
    }
    const mean = counts.reduce((a, n) => a + n, 0) / counts.length
    const variance = counts.reduce((a, n) => a + (n - mean) ** 2, 0) / counts.length
    expect(variance / mean).toBeGreaterThan(1.3)
  })

  it('never places two bushes on top of each other', () => {
    const bushes = placeBushes(ground, 90, 3, 0.004)
    for (let i = 0; i < bushes.length; i++) {
      for (let j = i + 1; j < bushes.length; j++) {
        expect(Math.hypot(bushes[i].x - bushes[j].x, bushes[i].z - bushes[j].z)).toBeGreaterThan(0)
      }
    }
  })

  it('clusters around an optional chunkOrigin instead of world (0, 0)', () => {
    const origin = { x: 1000, z: -400 }
    for (const b of placeBushes(ground, 90, 3, 0.002, origin)) {
      expect(Math.abs(b.x - origin.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(b.z - origin.z)).toBeLessThanOrEqual(90)
    }
  })
})

describe('bushObstacle', () => {
  it('matches the bush position and radius', () => {
    const b = { x: 2, z: -1, y: 0, radius: 0.5, height: 0.9 }
    expect(bushObstacle(b)).toEqual({ x: 2, z: -1, radius: 0.5 })
  })
})
