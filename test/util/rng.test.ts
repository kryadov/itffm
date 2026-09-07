import { mulberry32, hashString, randRange, pickWeighted } from '../../src/util/rng'

describe('mulberry32', () => {
  it('gives the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('diverges for different seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })

  it('stays within [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashString', () => {
  it('is stable for one string', () => {
    expect(hashString('betula')).toBe(hashString('betula'))
  })

  it('tells strings apart', () => {
    expect(hashString('betula')).not.toBe(hashString('picea'))
  })
})

describe('randRange', () => {
  it('never leaves the bounds', () => {
    const r = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const v = randRange(r, [80, 200])
      expect(v).toBeGreaterThanOrEqual(80)
      expect(v).toBeLessThanOrEqual(200)
    }
  })
})

describe('pickWeighted', () => {
  it('never picks a zero-weight item', () => {
    const r = mulberry32(11)
    const items = ['yes', 'no']
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(r, items, (t) => (t === 'yes' ? 1 : 0))).toBe('yes')
    }
  })

  it('returns undefined when every weight is zero', () => {
    expect(pickWeighted(mulberry32(1), ['a', 'b'], () => 0)).toBeUndefined()
  })
})
