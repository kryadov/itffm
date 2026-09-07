import { Projector, bboxAround } from '../../src/geo/project'

const moscow = { lat: 55.75, lon: 37.62 }

describe('Projector', () => {
  it('puts the centre at the origin', () => {
    const p = new Projector(moscow).toLocal(moscow)
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(0)
  })

  it('round-trips a point', () => {
    const proj = new Projector(moscow)
    const back = proj.toLatLon(proj.toLocal({ lat: 55.76, lon: 37.63 }))
    expect(back.lat).toBeCloseTo(55.76, 6)
    expect(back.lon).toBeCloseTo(37.63, 6)
  })

  it('sends north to -z', () => {
    expect(new Projector(moscow).toLocal({ lat: 55.76, lon: 37.62 }).z).toBeLessThan(0)
  })

  it('sends east to +x', () => {
    expect(new Projector(moscow).toLocal({ lat: 55.75, lon: 37.63 }).x).toBeGreaterThan(0)
  })

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = new Projector({ lat: 0, lon: 0 }).toLocal({ lat: 0, lon: 1 }).x
    const atMoscow = new Projector(moscow).toLocal({ lat: 55.75, lon: 38.62 }).x
    expect(atMoscow).toBeLessThan(atEquator)
  })

  it('scales one degree of latitude to about 111 km', () => {
    expect(Math.abs(new Projector(moscow).toLocal({ lat: 56.75, lon: 37.62 }).z)).toBeCloseTo(111320, -2)
  })
})

describe('bboxAround', () => {
  it('brackets the centre', () => {
    const b = bboxAround(moscow, 1000)
    expect(b.south).toBeLessThan(moscow.lat)
    expect(b.north).toBeGreaterThan(moscow.lat)
    expect(b.west).toBeLessThan(moscow.lon)
    expect(b.east).toBeGreaterThan(moscow.lon)
  })

  it('spans roughly twice the radius', () => {
    const b = bboxAround(moscow, 1000)
    const proj = new Projector(moscow)
    const height = Math.abs(
      proj.toLocal({ lat: b.north, lon: moscow.lon }).z - proj.toLocal({ lat: b.south, lon: moscow.lon }).z,
    )
    expect(height).toBeCloseTo(2000, -2)
  })
})
