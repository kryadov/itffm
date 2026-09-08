import { bearingDegrees, compassLabel } from '../../src/ui/compass'

describe('bearingDegrees', () => {
  it('faces north at yaw 0', () => {
    expect(bearingDegrees(0)).toBeCloseTo(0)
  })

  it('faces west a quarter turn one way', () => {
    expect(bearingDegrees(Math.PI / 2)).toBeCloseTo(270)
  })

  it('faces east a quarter turn the other way', () => {
    expect(bearingDegrees(-Math.PI / 2)).toBeCloseTo(90)
  })

  it('faces south at a half turn', () => {
    expect(bearingDegrees(Math.PI)).toBeCloseTo(180)
  })

  it('wraps multiple full turns back to the same bearing', () => {
    expect(bearingDegrees(Math.PI + 6 * Math.PI)).toBeCloseTo(bearingDegrees(Math.PI))
  })

  it('always returns a value in [0, 360)', () => {
    for (let yaw = -20; yaw < 20; yaw += 0.37) {
      const b = bearingDegrees(yaw)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(360)
    }
  })
})

describe('compassLabel', () => {
  it('names the four cardinal points', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(180)).toBe('S')
    expect(compassLabel(270)).toBe('W')
  })

  it('names the four intercardinal points', () => {
    expect(compassLabel(45)).toBe('NE')
    expect(compassLabel(135)).toBe('SE')
    expect(compassLabel(225)).toBe('SW')
    expect(compassLabel(315)).toBe('NW')
  })

  it('rounds to the nearest of the eight points', () => {
    expect(compassLabel(20)).toBe('N')
    expect(compassLabel(25)).toBe('NE')
    expect(compassLabel(160)).toBe('S')
  })

  it('wraps around zero', () => {
    expect(compassLabel(350)).toBe('N')
    expect(compassLabel(359.9)).toBe('N')
  })
})
