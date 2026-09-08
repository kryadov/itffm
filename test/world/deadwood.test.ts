import { placeLogs, placeStumps, logObstacles, logSpawnPoints } from '../../src/world/deadwood'
import { proceduralTerrain } from '../../src/terrain/procedural'

const ground = proceduralTerrain(5)

describe('placeLogs', () => {
  it('is deterministic', () => {
    expect(placeLogs(ground, 90, 3)).toEqual(placeLogs(ground, 90, 3))
  })

  it('gives a different layout for a different seed', () => {
    expect(placeLogs(ground, 90, 1)[0]?.x).not.toBe(placeLogs(ground, 90, 2)[0]?.x)
  })

  it('keeps every log within the plot', () => {
    for (const log of placeLogs(ground, 90, 3)) {
      expect(Math.abs(log.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(log.z)).toBeLessThanOrEqual(90)
    }
  })

  it('stands each log on the ground beneath it', () => {
    for (const log of placeLogs(ground, 90, 3)) {
      expect(log.y).toBeCloseTo(ground.heightAt(log.x, log.z), 5)
    }
  })

  it('gives plausible dimensions', () => {
    for (const log of placeLogs(ground, 90, 3)) {
      expect(log.length).toBeGreaterThan(1)
      expect(log.length).toBeLessThan(8)
      expect(log.radius).toBeGreaterThan(0.05)
      expect(log.radius).toBeLessThan(0.4)
    }
  })

  it('grows more logs at a higher density', () => {
    const sparse = placeLogs(ground, 90, 3, 0.0002)
    const dense = placeLogs(ground, 90, 3, 0.002)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })
})

describe('placeStumps', () => {
  it('is deterministic and bounded', () => {
    expect(placeStumps(ground, 90, 4)).toEqual(placeStumps(ground, 90, 4))
    for (const s of placeStumps(ground, 90, 4)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(90)
      expect(s.height).toBeGreaterThan(0)
      expect(s.height).toBeLessThan(1)
    }
  })
})

describe('logObstacles', () => {
  const log = { x: 0, z: 0, y: 0, angle: 0, length: 4, radius: 0.2 }

  it('covers both ends of the log', () => {
    const beads = logObstacles(log)
    const xs = beads.map((b) => b.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3)
  })

  it('gives every bead the log radius', () => {
    for (const b of logObstacles(log)) expect(b.radius).toBe(log.radius)
  })

  it('follows the log heading', () => {
    const along = logObstacles({ ...log, angle: Math.PI / 2 })
    // Rotated a quarter turn, the spread should now be along z, not x.
    const zs = along.map((b) => b.z)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(3)
  })
})

describe('logSpawnPoints', () => {
  const log = { x: 0, z: 0, y: 0, angle: 0, length: 4, radius: 0.2 }

  it('places points off to the side of the log, not on its centreline', () => {
    for (const p of logSpawnPoints(log)) {
      const lateral = Math.abs(p.z) // log runs along x at angle 0, so z is the offset axis
      expect(lateral).toBeGreaterThan(log.radius)
    }
  })

  it('spreads points along the length of the log', () => {
    const points = logSpawnPoints(log)
    const xs = points.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1)
  })

  it('is deterministic', () => {
    expect(logSpawnPoints(log)).toEqual(logSpawnPoints(log))
  })
})
