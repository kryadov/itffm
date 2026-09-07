import { nominatimUrl, parseNominatim } from '../../src/geo/geocode'

describe('nominatimUrl', () => {
  it('asks for several hits, not one', () => {
    expect(nominatimUrl('Лосиный Остров')).toMatch(/limit=\d+/)
  })

  it('escapes the query', () => {
    expect(nominatimUrl('Лосиный Остров')).toContain(encodeURIComponent('Лосиный Остров'))
  })
})

describe('parseNominatim', () => {
  it('prefers a natural feature over a settlement', () => {
    // We are looking for somewhere to pick mushrooms, not a town centre — the
    // opposite of what a driving game would want from the same service.
    const hits = [
      { lat: '55.75', lon: '37.62', class: 'place', type: 'city' },
      { lat: '55.87', lon: '37.77', class: 'natural', type: 'wood' },
    ]
    expect(parseNominatim(hits).lat).toBeCloseTo(55.87)
  })

  it('accepts a nature reserve or a national park as a natural feature', () => {
    for (const type of ['nature_reserve', 'national_park', 'forest', 'wood']) {
      const hits = [{ lat: '1', lon: '2', class: 'leisure', type }]
      expect(parseNominatim(hits).lat).toBeCloseTo(1)
    }
  })

  it('falls back to a settlement when nothing natural was found', () => {
    const hits = [{ lat: '55.75', lon: '37.62', class: 'place', type: 'village' }]
    expect(parseNominatim(hits).lat).toBeCloseTo(55.75)
  })

  it('falls back to the first hit rather than failing', () => {
    expect(parseNominatim([{ lat: '3', lon: '4' }]).lat).toBeCloseTo(3)
  })

  it('throws a nameable error on an empty answer', () => {
    expect(() => parseNominatim([])).toThrow()
    expect(() => parseNominatim(null)).toThrow()
  })
})
