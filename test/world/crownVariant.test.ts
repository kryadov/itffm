import { crownVariantIndex } from '../../src/world/trees'

describe('crownVariantIndex', () => {
  it('is deterministic for the same position', () => {
    expect(crownVariantIndex(12.3, -4.5, 3)).toBe(crownVariantIndex(12.3, -4.5, 3))
  })

  it('stays within range', () => {
    for (let i = 0; i < 200; i++) {
      const v = crownVariantIndex(i * 1.7, i * -2.3, 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(3)
    }
  })

  it('uses more than one variant across many positions', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(crownVariantIndex(i * 3.1, i * -1.9, 3))
    expect(seen.size).toBeGreaterThan(1)
  })
})
