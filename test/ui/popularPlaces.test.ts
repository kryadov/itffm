import { POPULAR_PLACES } from '../../src/ui/popularPlaces'

describe('POPULAR_PLACES', () => {
  it('is not empty', () => {
    expect(POPULAR_PLACES.length).toBeGreaterThan(0)
  })

  it('gives every place a unique id', () => {
    const ids = POPULAR_PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every place a name in both languages and a query to geocode', () => {
    for (const p of POPULAR_PLACES) {
      expect(p.ru.length).toBeGreaterThan(0)
      expect(p.en.length).toBeGreaterThan(0)
      expect(p.query.length).toBeGreaterThan(0)
    }
  })
})
