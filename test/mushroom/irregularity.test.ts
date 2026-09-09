import { capWobble, stipeBendCurve } from '../../src/mushroom/irregularity'

describe('capWobble', () => {
  it('is deterministic for the same inputs', () => {
    expect(capWobble(1.2, 7, 0.5)).toBe(capWobble(1.2, 7, 0.5))
  })

  it('is periodic — no seam where the rim closes on itself', () => {
    expect(capWobble(0, 7, 1)).toBeCloseTo(capWobble(Math.PI * 2, 7, 1), 5)
  })

  it('grows with age', () => {
    let youngTotal = 0
    let matureTotal = 0
    const samples = 24
    for (let i = 0; i < samples; i++) {
      const phi = (i / samples) * Math.PI * 2
      youngTotal += Math.abs(capWobble(phi, 3, 0))
      matureTotal += Math.abs(capWobble(phi, 3, 1))
    }
    expect(matureTotal).toBeGreaterThan(youngTotal)
  })

  it('stays a subtle fraction — never doubles the radius', () => {
    for (let i = 0; i < 24; i++) {
      const phi = (i / 24) * Math.PI * 2
      expect(Math.abs(capWobble(phi, 5, 1))).toBeLessThan(0.15)
    }
  })
})

describe('stipeBendCurve', () => {
  it('is zero at the base — the stipe still plants where it grew', () => {
    expect(stipeBendCurve(0)).toBe(0)
  })

  it('is at its full value at the top', () => {
    expect(stipeBendCurve(1)).toBeCloseTo(1, 5)
  })

  it('is monotonically non-decreasing', () => {
    let prev = -Infinity
    for (let i = 0; i <= 10; i++) {
      const v = stipeBendCurve(i / 10)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
