import { pointInPolygon, boundsOf, densify, distanceToRing } from '../../src/util/geometry'

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

describe('distanceToRing', () => {
  it('is zero inside the ring', () => {
    expect(distanceToRing(0, 0, square)).toBe(0)
  })

  it('measures the gap to the nearest edge outside the ring', () => {
    expect(distanceToRing(20, 0, square)).toBeCloseTo(10, 5)
  })

  it('measures to the nearest point on a diagonal edge, not just a vertex', () => {
    const triangle = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 10 }]
    expect(distanceToRing(6, 6, triangle)).toBeCloseTo(Math.SQRT2, 5)
  })

  it('returns Infinity for a degenerate ring', () => {
    expect(distanceToRing(0, 0, [])).toBe(Infinity)
    expect(distanceToRing(0, 0, [{ x: 1, z: 1 }])).toBe(Infinity)
  })
})

describe('densify', () => {
  it('leaves a short segment alone', () => {
    const line = [{ x: 0, z: 0 }, { x: 1, z: 0 }]
    expect(densify(line, 5)).toEqual(line)
  })

  it('adds vertices along a segment longer than the step', () => {
    const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }]
    const out = densify(line, 4)
    expect(out[0]).toEqual({ x: 0, z: 0 })
    expect(out[out.length - 1]).toEqual({ x: 10, z: 0 })
    expect(out.length).toBeGreaterThan(2)
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z)).toBeLessThanOrEqual(4 + 1e-9)
    }
  })

  it('returns a degenerate line unchanged rather than throwing', () => {
    expect(densify([], 5)).toEqual([])
    expect(densify([{ x: 1, z: 2 }], 5)).toEqual([{ x: 1, z: 2 }])
  })
})
