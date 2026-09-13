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
})
