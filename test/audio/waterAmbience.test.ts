import { nearestWater, waterAmbienceGain, type WaterBody } from '../../src/audio/waterAmbience'

describe('waterAmbienceGain', () => {
  it('is loudest at zero distance', () => {
    expect(waterAmbienceGain(0, 45)).toBeCloseTo(1, 5)
  })

  it('fades to silence at maxDist', () => {
    expect(waterAmbienceGain(45, 45)).toBeCloseTo(0, 5)
  })

  it('is monotonically quieter further away', () => {
    expect(waterAmbienceGain(10, 45)).toBeGreaterThan(waterAmbienceGain(30, 45))
    expect(waterAmbienceGain(30, 45)).toBeGreaterThan(waterAmbienceGain(44, 45))
  })

  it('never goes negative past maxDist', () => {
    expect(waterAmbienceGain(1000, 45)).toBe(0)
  })
})

describe('nearestWater', () => {
  const pond: WaterBody = {
    kind: 'pond',
    ring: [
      { x: -3, z: -3 },
      { x: 3, z: -3 },
      { x: 3, z: 3 },
      { x: -3, z: 3 },
      { x: -3, z: -3 },
    ],
  }
  const stream: WaterBody = {
    kind: 'stream',
    ring: [
      { x: 50, z: 0 },
      { x: 55, z: 0 },
      { x: 60, z: 0 },
    ],
  }

  it('picks the closer of two water bodies', () => {
    const result = nearestWater(0, 0, [pond, stream])
    expect(result?.kind).toBe('pond')
    expect(result?.distance).toBeCloseTo(0, 5)
  })

  it('reports the other body once it is actually closer', () => {
    const result = nearestWater(52, 0, [pond, stream])
    expect(result?.kind).toBe('stream')
  })

  it('returns 0 distance for a point inside a closed ring', () => {
    const result = nearestWater(0, 0, [pond])
    expect(result?.distance).toBe(0)
  })

  it('returns null when there is no water at all', () => {
    expect(nearestWater(0, 0, [])).toBeNull()
  })

  it('skips a degenerate ring with fewer than two points', () => {
    const degenerate: WaterBody = { kind: 'pond', ring: [{ x: 0, z: 0 }] }
    expect(nearestWater(0, 0, [degenerate])).toBeNull()
  })
})
