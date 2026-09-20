import { steerTarget, smoothSteer, easeToward, MAX_STEER } from '../../src/game/bikeSteer'

describe('steerTarget', () => {
  it('is straight when not turning', () => {
    expect(steerTarget(0)).toBe(0)
  })

  it('steers the way you turn, symmetrically', () => {
    expect(steerTarget(1)).toBeGreaterThan(0)
    expect(steerTarget(-1)).toBeLessThan(0)
    expect(steerTarget(-1)).toBeCloseTo(-steerTarget(1), 10)
  })

  it('turns further for a faster turn, but never past full lock', () => {
    expect(steerTarget(2)).toBeGreaterThan(steerTarget(1))
    for (const rate of [5, 50, 1e6]) expect(steerTarget(rate)).toBeLessThanOrEqual(MAX_STEER)
    for (const rate of [-5, -50, -1e6]) expect(steerTarget(rate)).toBeGreaterThanOrEqual(-MAX_STEER)
  })
})

describe('smoothSteer', () => {
  it('moves toward the target without overshooting it', () => {
    let s = 0
    for (let i = 0; i < 200; i++) {
      const next = smoothSteer(s, 0.4, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(s)
      expect(next).toBeLessThanOrEqual(0.4)
      s = next
    }
    expect(s).toBeCloseTo(0.4, 3)
  })

  it('settles back to straight once the turn stops', () => {
    let s = 0.5
    for (let i = 0; i < 200; i++) s = smoothSteer(s, 0, 1 / 60)
    expect(Math.abs(s)).toBeLessThan(1e-3)
  })

  it('is frame-rate independent: one second is one second at any step size', () => {
    let coarse = 0
    for (let i = 0; i < 10; i++) coarse = smoothSteer(coarse, 0.5, 0.1)
    let fine = 0
    for (let i = 0; i < 100; i++) fine = smoothSteer(fine, 0.5, 0.01)
    expect(coarse).toBeCloseTo(fine, 6)
  })
})

describe('easeToward', () => {
  it('moves toward the target without overshooting, and settles on it', () => {
    let v = 1
    for (let i = 0; i < 300; i++) {
      const next = easeToward(v, 0, 1 / 60, 8)
      expect(next).toBeLessThanOrEqual(v)
      expect(next).toBeGreaterThanOrEqual(0)
      v = next
    }
    expect(v).toBeLessThan(1e-6)
  })

  it('takes about the same wall-clock time at any frame rate', () => {
    let coarse = 1
    for (let i = 0; i < 6; i++) coarse = easeToward(coarse, 0, 0.1, 8)
    let fine = 1
    for (let i = 0; i < 60; i++) fine = easeToward(fine, 0, 0.01, 8)
    expect(coarse).toBeCloseTo(fine, 6)
  })

  it('a faster rate arrives sooner', () => {
    expect(easeToward(1, 0, 0.1, 20)).toBeLessThan(easeToward(1, 0, 0.1, 5))
  })
})
