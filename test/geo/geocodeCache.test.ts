import { geocodeKey } from '../../src/geo/geocodeCache'

describe('geocodeKey', () => {
  it('is case-insensitive', () => {
    expect(geocodeKey('Kavgolovo')).toBe(geocodeKey('kavgolovo'))
  })

  it('trims leading and trailing whitespace', () => {
    expect(geocodeKey('  Kavgolovo  ')).toBe(geocodeKey('Kavgolovo'))
  })

  it('collapses internal whitespace', () => {
    expect(geocodeKey('Лосиный   Остров')).toBe(geocodeKey('Лосиный Остров'))
  })

  it('keeps different places apart', () => {
    expect(geocodeKey('Kavgolovo')).not.toBe(geocodeKey('Kavgolovskoe'))
  })
})
