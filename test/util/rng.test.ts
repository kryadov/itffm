import { mulberry32, hashString, randRange, pickWeighted } from '../../src/util/rng'

describe('mulberry32', () => {
  it('один seed даёт одну и ту же последовательность', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('разные seed расходятся', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })

  it('значения лежат в [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashString', () => {
  it('стабилен для одной строки', () => {
    expect(hashString('betula')).toBe(hashString('betula'))
  })

  it('различает строки', () => {
    expect(hashString('betula')).not.toBe(hashString('picea'))
  })
})

describe('randRange', () => {
  it('не выходит за границы', () => {
    const r = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const v = randRange(r, [80, 200])
      expect(v).toBeGreaterThanOrEqual(80)
      expect(v).toBeLessThanOrEqual(200)
    }
  })
})

describe('pickWeighted', () => {
  it('никогда не выбирает вариант с нулевым весом', () => {
    const r = mulberry32(11)
    const items = ['да', 'нет']
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(r, items, (t) => (t === 'да' ? 1 : 0))).toBe('да')
    }
  })

  it('возвращает undefined, когда все веса нулевые', () => {
    expect(pickWeighted(mulberry32(1), ['a', 'b'], () => 0)).toBeUndefined()
  })
})
