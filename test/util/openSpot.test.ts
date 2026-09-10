import { findOpenSpot, type Circle } from '../../src/util/openSpot'

describe('findOpenSpot', () => {
  it('returns the origin outright when it is already clear', () => {
    expect(findOpenSpot([], 90, { x: 5, z: 5 }, 2)).toEqual({ x: 5, z: 5 })
  })

  it('searches outward until it clears every obstacle', () => {
    const obstacles: Circle[] = [{ x: 0, z: 0, radius: 3 }]
    const spot = findOpenSpot(obstacles, 90, { x: 0, z: 0 }, 1)
    expect(Math.hypot(spot.x, spot.z)).toBeGreaterThanOrEqual(3 + 1)
  })

  it('also requires the optional extra predicate, not just clearance', () => {
    // Everything within 90 is otherwise open — without the predicate the
    // origin itself would be returned outright.
    const east = (x: number): boolean => x > 10
    const spot = findOpenSpot([], 90, { x: 0, z: 0 }, 1, east)
    expect(spot.x).toBeGreaterThan(10)
  })

  it('falls back to the origin when nothing in range satisfies the extra predicate', () => {
    const impossible = (): boolean => false
    const origin = { x: 4, z: 4 }
    expect(findOpenSpot([], 90, origin, 1, impossible)).toEqual(origin)
  })

  it('checks clearance around an optional worldCenter far from world (0, 0)', () => {
    // Without a worldCenter, the halfSize bound is always measured from
    // world (0, 0) — a chunk 1000m out would fail that bound at every
    // candidate, including its own obstacle-blocked origin, and silently
    // fall back to returning that blocked origin. worldCenter re-centers
    // the bound on the chunk itself so clearance actually gets checked.
    const obstacles: Circle[] = [{ x: 1000, z: 1000, radius: 3 }]
    const spot = findOpenSpot(obstacles, 90, { x: 1000, z: 1000 }, 1, undefined, { x: 1000, z: 1000 })
    expect(Math.hypot(spot.x - 1000, spot.z - 1000)).toBeGreaterThanOrEqual(3 + 1)
  })
})
