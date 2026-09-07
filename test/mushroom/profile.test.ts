import { capSurface, capCrossSection } from '../../src/mushroom/profile'

describe('capSurface', () => {
  it('возвращает запрошенное число точек, от центра к краю', () => {
    const p = capSurface('convex', 16)
    expect(p).toHaveLength(17)
    expect(p[0].r).toBe(0)
    expect(p[16].r).toBeCloseTo(1)
  })

  it('у выпуклой шляпки центр выше края', () => {
    const p = capSurface('convex', 16)
    expect(p[0].y).toBeGreaterThan(p[16].y)
  })

  it('у воронковидной шляпки центр ниже края', () => {
    const p = capSurface('funnel', 16)
    expect(p[0].y).toBeLessThan(p[16].y)
  })

  it('коническая выше выпуклой в центре', () => {
    expect(capSurface('conical', 16)[0].y).toBeGreaterThan(capSurface('convex', 16)[0].y)
  })

  it('плоская почти плоская', () => {
    const p = capSurface('flat', 16)
    expect(Math.abs(p[0].y - p[16].y)).toBeLessThan(0.2)
  })
})

describe('capCrossSection', () => {
  it('замкнут: начинается на оси и заканчивается у ножки', () => {
    const s = capCrossSection('convex', 'flat', 0.5, 0.05, 0.008)
    expect(s[0].r).toBe(0)
    expect(s[s.length - 1].r).toBeCloseTo(0.008)
  })

  it('нижняя поверхность лежит не выше верхней', () => {
    const s = capCrossSection('convex', 'flat', 0.5, 0.05, 0.008)
    const top = s.filter((p) => p.r <= 0.05)
    expect(Math.min(...top.map((p) => p.y))).toBeLessThan(Math.max(...top.map((p) => p.y)))
  })

  it('масштабируется радиусом шляпки', () => {
    const small = capCrossSection('convex', 'flat', 0, 0.02, 0.004)
    const big = capCrossSection('convex', 'flat', 0, 0.08, 0.004)
    expect(Math.max(...big.map((p) => p.r))).toBeGreaterThan(Math.max(...small.map((p) => p.r)))
  })

  it('возраст меняет форму', () => {
    const young = capCrossSection('hemispherical', 'flat', 0, 0.05, 0.008)
    const old = capCrossSection('hemispherical', 'flat', 1, 0.05, 0.008)
    expect(Math.max(...young.map((p) => p.y))).toBeGreaterThan(Math.max(...old.map((p) => p.y)))
  })
})
