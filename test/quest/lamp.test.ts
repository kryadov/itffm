import { lampIsOn } from '../../src/quest/lamp'

describe('lampIsOn', () => {
  it('is off if not owned, regardless of night or being inside a mine', () => {
    expect(lampIsOn(false, 1, true)).toBe(false)
    expect(lampIsOn(false, 0, false)).toBe(false)
  })

  it('is off when owned but daytime and outside any mine', () => {
    expect(lampIsOn(true, 0, false)).toBe(false)
  })

  it('is on when owned and it is night, outside a mine', () => {
    expect(lampIsOn(true, 0.4, false)).toBe(true)
  })

  it('is on when owned and inside a mine, regardless of time of day', () => {
    expect(lampIsOn(true, 0, true)).toBe(true)
    expect(lampIsOn(true, 1, true)).toBe(true)
  })

  it('defaults manuallyOn to true, so existing callers keep their old behaviour', () => {
    expect(lampIsOn(true, 0.4, false)).toBe(true)
  })

  it('is off when manually switched off, even if it would otherwise be on', () => {
    expect(lampIsOn(true, 0.4, false, false)).toBe(false)
    expect(lampIsOn(true, 0, true, false)).toBe(false)
  })

  it('manually off still has no effect if the lamp is not owned', () => {
    expect(lampIsOn(false, 0.4, false, false)).toBe(false)
  })
})
