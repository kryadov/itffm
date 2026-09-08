import { sunElevation, sampleDayNight, timeFor, DAY_TIME, NIGHT_TIME } from '../../src/world/daynight'

describe('sunElevation', () => {
  it('peaks at noon', () => {
    expect(sunElevation(0.5)).toBeCloseTo(1, 5)
  })

  it('bottoms out at midnight', () => {
    expect(sunElevation(0)).toBeCloseTo(-1, 5)
  })

  it('crosses zero at dawn and dusk', () => {
    expect(sunElevation(0.25)).toBeCloseTo(0, 5)
    expect(sunElevation(0.75)).toBeCloseTo(0, 5)
  })
})

describe('sampleDayNight', () => {
  it('matches the wood’s original fixed noon look', () => {
    const s = sampleDayNight(0.5)
    expect(s.sky).toBe(0xa8c0a2)
    expect(s.sun).toBe(0xfff1cf)
    expect(s.sunI).toBeCloseTo(1.1, 5)
    expect(s.ambI).toBeCloseTo(2.6, 5)
  })

  it('is darkest at midnight', () => {
    const midnight = sampleDayNight(0)
    const noon = sampleDayNight(0.5)
    expect(midnight.sunI).toBeLessThan(noon.sunI)
    expect(midnight.ambI).toBeLessThan(noon.ambI)
  })

  it('interpolates smoothly between keyframes', () => {
    const before = sampleDayNight(0.49)
    const at = sampleDayNight(0.5)
    const after = sampleDayNight(0.51)
    expect(Math.abs(before.sunI - at.sunI)).toBeLessThan(0.05)
    expect(Math.abs(after.sunI - at.sunI)).toBeLessThan(0.05)
  })

  it('wraps past midnight rather than throwing or clamping', () => {
    expect(sampleDayNight(1.1)).toEqual(sampleDayNight(0.1))
    // A negative time re-enters near the same point in the cycle — allow for
    // floating-point wraparound landing a hair either side of it.
    const wrapped = sampleDayNight(-0.1)
    const direct = sampleDayNight(0.9)
    expect(wrapped.sunI).toBeCloseTo(direct.sunI, 3)
    expect(wrapped.ambI).toBeCloseTo(direct.ambI, 3)
  })
})

describe('timeFor', () => {
  it('locks day and night modes to their fixed times', () => {
    expect(timeFor('day', 0.83)).toBe(DAY_TIME)
    expect(timeFor('night', 0.37)).toBe(NIGHT_TIME)
  })

  it('passes the running clock through in cycle mode', () => {
    expect(timeFor('cycle', 0.37)).toBe(0.37)
  })
})
