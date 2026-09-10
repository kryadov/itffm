import { moonPhase } from '../../src/world/moonPhase'

describe('moonPhase', () => {
  it('is 0 (new moon) right at a known new moon', () => {
    // 2000-01-06 18:14 UTC is a documented new moon.
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14, 0)))).toBeCloseTo(0, 2)
  })

  it('is close to 0.5 (full moon) half a synodic month later', () => {
    const newMoon = Date.UTC(2000, 0, 6, 18, 14, 0)
    const halfMonthMs = (29.530588853 / 2) * 86400000
    expect(moonPhase(new Date(newMoon + halfMonthMs))).toBeCloseTo(0.5, 2)
  })

  it('wraps back toward 0 after a full synodic month', () => {
    const newMoon = Date.UTC(2000, 0, 6, 18, 14, 0)
    const fullMonthMs = 29.530588853 * 86400000
    // Floating-point division doesn't cancel perfectly, so this lands right
    // at the wrap boundary — either side (≈0 or ≈1) is the same real phase.
    const p = moonPhase(new Date(newMoon + fullMonthMs))
    expect(Math.min(p, 1 - p)).toBeLessThan(0.01)
  })

  it('always stays within [0, 1), including for a date before the reference new moon', () => {
    for (const ms of [0, Date.UTC(1990, 5, 15), Date.UTC(2026, 8, 10), Date.UTC(2100, 0, 1)]) {
      const p = moonPhase(new Date(ms))
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThan(1)
    }
  })

  it('advances roughly linearly day to day, not jumping', () => {
    const a = moonPhase(new Date(Date.UTC(2026, 8, 10)))
    const b = moonPhase(new Date(Date.UTC(2026, 8, 11)))
    const step = Math.abs(b - a)
    // ~1/29.53 of a full cycle per day, either direction of wrap.
    expect(Math.min(step, 1 - step)).toBeCloseTo(1 / 29.530588853, 2)
  })
})
