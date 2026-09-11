import { windGain } from '../../src/audio/windAmbience'

describe('windGain', () => {
  it('reads windier in rain than on a clear day', () => {
    expect(windGain('rain', 0)).toBeGreaterThan(windGain('clear', 0))
  })

  it('reads windier in snow than fog', () => {
    expect(windGain('snow', 0)).toBeGreaterThan(windGain('fog', 0))
  })

  it('is calmest in fog', () => {
    const fog = windGain('fog', 0)
    expect(fog).toBeLessThan(windGain('clear', 0))
    expect(fog).toBeLessThan(windGain('rain', 0))
    expect(fog).toBeLessThan(windGain('snow', 0))
  })

  it('is louder at night than by day, same weather', () => {
    expect(windGain('clear', 1)).toBeGreaterThan(windGain('clear', 0))
  })

  it('never goes negative', () => {
    for (const w of ['clear', 'fog', 'rain', 'snow'] as const) {
      expect(windGain(w, 0)).toBeGreaterThan(0)
      expect(windGain(w, 1)).toBeGreaterThan(0)
    }
  })
})
