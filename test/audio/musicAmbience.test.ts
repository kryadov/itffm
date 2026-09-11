import { campfireGain } from '../../src/audio/musicAmbience'

describe('campfireGain', () => {
  it('is loudest at zero distance', () => {
    expect(campfireGain(0, 8)).toBeCloseTo(1, 5)
  })

  it('fades to silence at maxDist', () => {
    expect(campfireGain(8, 8)).toBeCloseTo(0, 5)
  })

  it('is monotonically quieter further away', () => {
    expect(campfireGain(2, 8)).toBeGreaterThan(campfireGain(5, 8))
    expect(campfireGain(5, 8)).toBeGreaterThan(campfireGain(7, 8))
  })

  it('never goes negative past maxDist', () => {
    expect(campfireGain(1000, 8)).toBe(0)
  })
})
