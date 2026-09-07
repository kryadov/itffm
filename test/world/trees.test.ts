import { placeTrees } from '../../src/world/trees'
import { proceduralTerrain } from '../../src/terrain/procedural'

const terrain = proceduralTerrain(5)

describe('placeTrees', () => {
  it('is deterministic for one seed', () => {
    expect(placeTrees(terrain, 60, 3, ['betula', 'picea'])).toEqual(
      placeTrees(terrain, 60, 3, ['betula', 'picea']),
    )
  })

  it('gives a different wood for a different seed', () => {
    const a = placeTrees(terrain, 60, 1, ['betula'])
    const b = placeTrees(terrain, 60, 2, ['betula'])
    expect(a[0]?.x).not.toBe(b[0]?.x)
  })

  it('keeps every tree inside the plot', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula', 'picea'])) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(60)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(60)
    }
  })

  it('uses only the genera it was given', () => {
    const mix = ['betula', 'picea'] as const
    for (const t of placeTrees(terrain, 60, 3, [...mix])) {
      expect(mix).toContain(t.genus)
    }
  })

  it('stands every tree on the ground', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula'])) {
      expect(t.y).toBeCloseTo(terrain.heightAt(t.x, t.z), 5)
    }
  })

  it('grows a wood that is neither empty nor endless', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])
    expect(trees.length).toBeGreaterThan(20)
    expect(trees.length).toBeLessThan(3000)
  })

  it('never grows two trees inside each other', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula'])
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const d = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z)
        expect(d).toBeGreaterThan(1.5)
      }
    }
  })

  it('grows more trees at a higher density', () => {
    const sparse = placeTrees(terrain, 60, 3, ['betula'], 0.02)
    const dense = placeTrees(terrain, 60, 3, ['betula'], 0.12)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  it('clumps genera into stands rather than mixing them evenly', () => {
    // A forager looks for a corner of the wood, not for "trees in general".
    // Nearest neighbours should share a genus far more often than chance.
    const trees = placeTrees(terrain, 80, 7, ['betula', 'picea'])
    let same = 0
    for (const t of trees) {
      let best = Infinity
      let bestGenus = t.genus
      for (const o of trees) {
        if (o === t) continue
        const d = Math.hypot(o.x - t.x, o.z - t.z)
        if (d < best) {
          best = d
          bestGenus = o.genus
        }
      }
      if (bestGenus === t.genus) same++
    }
    expect(same / trees.length).toBeGreaterThan(0.6)
  })
})
