import { fbm2 } from '../../src/util/noise'

describe('fbm2', () => {
  it('is deterministic', () => {
    expect(fbm2(1.5, -2.25, 7)).toBe(fbm2(1.5, -2.25, 7))
  })

  it('gives different fields for different seeds', () => {
    expect(fbm2(1.5, -2.25, 7)).not.toBe(fbm2(1.5, -2.25, 8))
  })

  it('stays within [-1, 1]', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 0.37, i * -0.71, 3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous: nearby points give nearby values', () => {
    const a = fbm2(10, 10, 5)
    const b = fbm2(10.001, 10, 5)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('actually varies across the plane', () => {
    const samples = Array.from({ length: 100 }, (_, i) => fbm2(i * 0.6, i * 0.37, 2))
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3)
  })
})
