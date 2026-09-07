import { proceduralTerrain } from '../../src/terrain/procedural'

describe('proceduralTerrain', () => {
  it('is deterministic for one seed', () => {
    expect(proceduralTerrain(42).heightAt(3, -4)).toBe(proceduralTerrain(42).heightAt(3, -4))
  })

  it('gives different terrain for different seeds', () => {
    expect(proceduralTerrain(1).heightAt(3, -4)).not.toBe(proceduralTerrain(2).heightAt(3, -4))
  })

  it('never exceeds its amplitude', () => {
    const t = proceduralTerrain(9, 6)
    for (let i = 0; i < 300; i++) {
      expect(Math.abs(t.heightAt(i * 1.7, i * -2.3))).toBeLessThanOrEqual(6)
    }
  })

  it('is not flat', () => {
    const t = proceduralTerrain(4)
    const hs = Array.from({ length: 50 }, (_, i) => t.heightAt(i * 3, 0))
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.3)
  })

  it('carries fine detail as well as broad hills', () => {
    // Two points a metre apart sit on the same hill, so any difference between
    // them comes from the detail octave — the hollows that hold the moisture.
    const t = proceduralTerrain(11)
    const diffs = Array.from({ length: 40 }, (_, i) =>
      Math.abs(t.heightAt(i * 5, 0) - t.heightAt(i * 5 + 1, 0)),
    )
    expect(Math.max(...diffs)).toBeGreaterThan(0.01)
  })
})
