import { pointInPolygon, boundsOf } from '../../src/util/geometry'

const square = [
  { x: -10, z: -10 }, { x: 10, z: -10 },
  { x: 10, z: 10 }, { x: -10, z: 10 },
]

// A C-shape: the gap in the middle is outside, which a bounding box would miss.
const cShape = [
  { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 10 }, { x: 10, z: 10 },
  { x: 10, z: 20 }, { x: 30, z: 20 }, { x: 30, z: 30 }, { x: 0, z: 30 },
]

describe('pointInPolygon', () => {
  it('finds a point inside', () => {
    expect(pointInPolygon(0, 0, square)).toBe(true)
  })

  it('finds a point outside', () => {
    expect(pointInPolygon(50, 0, square)).toBe(false)
    expect(pointInPolygon(0, -50, square)).toBe(false)
  })

  it('handles a non-convex ring', () => {
    expect(pointInPolygon(5, 15, cShape)).toBe(true)
    expect(pointInPolygon(20, 15, cShape)).toBe(false)
  })

  it('says no for a degenerate ring rather than throwing', () => {
    expect(pointInPolygon(0, 0, [])).toBe(false)
    expect(pointInPolygon(0, 0, [{ x: 0, z: 0 }])).toBe(false)
  })
})

describe('boundsOf', () => {
  it('brackets the ring', () => {
    expect(boundsOf(square)).toEqual({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 })
  })

  it('returns null for an empty ring', () => {
    expect(boundsOf([])).toBeNull()
  })
})
