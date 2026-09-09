import { smokeOffset, smokeScale, smokeOpacity } from '../../src/world/smoke'

describe('smokeOffset', () => {
  it('has not risen at all when t is 0 — a wisp spawns at the fire/chimney, not above it', () => {
    expect(smokeOffset(0, 0).y).toBeCloseTo(0, 5)
  })

  it('rises as t advances toward 1', () => {
    expect(smokeOffset(1, 0).y).toBeGreaterThan(smokeOffset(0.5, 0).y)
    expect(smokeOffset(0.5, 0).y).toBeGreaterThan(smokeOffset(0, 0).y)
  })

  it('drifts sideways rather than rising in a dead straight line', () => {
    const o = smokeOffset(0.5, 0)
    expect(Math.hypot(o.x, o.z)).toBeGreaterThan(0)
  })

  it('gives each phase its own drift, so a group of wisps does not move as one', () => {
    const a = smokeOffset(0.5, 0)
    const b = smokeOffset(0.5, 0.3)
    expect(a.x !== b.x || a.z !== b.z).toBe(true)
  })
})

describe('smokeScale', () => {
  it('grows as the wisp rises', () => {
    expect(smokeScale(1)).toBeGreaterThan(smokeScale(0))
  })

  it('never starts at zero — a wisp is never briefly invisible at spawn', () => {
    expect(smokeScale(0)).toBeGreaterThan(0)
  })
})

describe('smokeOpacity', () => {
  it('fades from visible to fully gone as t goes from 0 to 1', () => {
    expect(smokeOpacity(0)).toBeGreaterThan(0)
    expect(smokeOpacity(1)).toBeCloseTo(0, 5)
  })

  it('fades monotonically, not just at the endpoints', () => {
    expect(smokeOpacity(0.2)).toBeGreaterThan(smokeOpacity(0.6))
  })
})
