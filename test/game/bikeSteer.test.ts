import { steerTarget, smoothSteer, easeToward, wheelSpin, forwardSpeedOf, ROLLING_RADIUS, MAX_STEER } from '../../src/game/bikeSteer'

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

describe('wheelSpin', () => {
  // A live request (2026-09-21): the front wheel of the bicycle you ride must turn,
  // and visibly. Forward is a negative turn about the axle (the model's +x is
  // forward and the axle is z), so the top of the wheel moves ahead.
  it('turns once round for every circumference travelled, and forward is negative', () => {
    const circumference = 2 * Math.PI * ROLLING_RADIUS
    expect(wheelSpin(0, circumference, 1)).toBeCloseTo(-2 * Math.PI, 6)
    expect(wheelSpin(0, 3, 1)).toBeLessThan(0)
  })

  it('turns the other way when going backward, and not at all when standing', () => {
    expect(wheelSpin(0, -3, 1)).toBeGreaterThan(0)
    expect(wheelSpin(1.25, 0, 1 / 60)).toBe(1.25)
  })

  it('adds to where the wheel already is, and is the same however the time is cut up', () => {
    let coarse = 0.5
    for (let i = 0; i < 5; i++) coarse = wheelSpin(coarse, 4, 0.2)
    let fine = 0.5
    for (let i = 0; i < 50; i++) fine = wheelSpin(fine, 4, 0.02)
    expect(coarse).toBeCloseTo(fine, 6)
  })

  it('has the rolling radius of the wheel the model draws (wheel 0.32 + tyre 0.025 + tread 0.004)', () => {
    expect(ROLLING_RADIUS).toBeCloseTo(0.349, 6)
  })
})

describe('forwardSpeedOf', () => {
  it('is the speed along the way you face (yaw 0 faces -z; +90 degrees faces -x)', () => {
    expect(forwardSpeedOf(0, -1, 0, 0.5)).toBeCloseTo(2)
    expect(forwardSpeedOf(-1, 0, Math.PI / 2, 0.5)).toBeCloseTo(2)
  })

  it('is negative moving backward, and zero sideways or standing', () => {
    expect(forwardSpeedOf(0, 1, 0, 0.5)).toBeCloseTo(-2)
    expect(forwardSpeedOf(1, 0, 0, 0.5)).toBeCloseTo(0) // strafing: the front wheel does not roll
    expect(forwardSpeedOf(0, 0, 0.3, 0.5)).toBe(0)
  })

  it('is zero for a frame with no time, and never absurd when the player is moved outright', () => {
    expect(forwardSpeedOf(0, -5, 0, 0)).toBe(0)
    expect(Math.abs(forwardSpeedOf(0, -500, 0, 0.016))).toBeLessThanOrEqual(30)
  })
})
