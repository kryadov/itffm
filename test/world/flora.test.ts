import { placeFlora } from '../../src/world/flora'
import { proceduralTerrain } from '../../src/terrain/procedural'

const ground = proceduralTerrain(5)

describe('placeFlora', () => {
  it('is deterministic', () => {
    expect(placeFlora(ground, 90, 3)).toEqual(placeFlora(ground, 90, 3))
  })

  it('gives a different scatter for a different seed', () => {
    expect(placeFlora(ground, 90, 1)[0]?.x).not.toBe(placeFlora(ground, 90, 2)[0]?.x)
  })

  it('keeps everything within the plot and on the ground', () => {
    for (const f of placeFlora(ground, 90, 3)) {
      expect(Math.abs(f.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(f.z)).toBeLessThanOrEqual(90)
      expect(f.y).toBeCloseTo(ground.heightAt(f.x, f.z), 5)
    }
  })

  it('scatters both flowers and fern, not just one', () => {
    const kinds = new Set(placeFlora(ground, 90, 3).map((f) => f.kind))
    expect(kinds.has('flower')).toBe(true)
    expect(kinds.has('fern')).toBe(true)
  })

  it('grows more with a higher density', () => {
    const sparse = placeFlora(ground, 90, 3, 0.002)
    const dense = placeFlora(ground, 90, 3, 0.02)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  it('produces a scatter dense enough to read as ground cover, not scattered specimens', () => {
    // The whole point is visual noise a mushroom can hide in — a handful of
    // flowers across a 180x180m plot would not be that.
    expect(placeFlora(ground, 90, 5).length).toBeGreaterThan(100)
  })
})
