import * as THREE from 'three'
import { placeMine, mineObstacles, isInsideMine, buildMineMesh, diamondSpotInMine, TUNNEL_LENGTH } from '../../src/world/mine'
import type { ElevationProvider } from '../../src/terrain/provider'

const shelter = { x: 0, z: 0 }

describe('placeMine', () => {
  it('sits at the mapped entrance, on the ground beneath it, when this plot has one', () => {
    const ground: ElevationProvider = { heightAt: () => 3 }
    const m = placeMine(ground, 90, 3, [], shelter, [{ x: 5, z: -2 }])
    expect(m.x).toBe(5)
    expect(m.z).toBe(-2)
    expect(m.y).toBe(3)
  })

  it('ignores a mapped entrance that falls outside this plot', () => {
    const ground: ElevationProvider = { heightAt: () => 0 }
    const withoutMapped = placeMine(ground, 90, 3, [], shelter, [])
    const withOffPlot = placeMine(ground, 90, 3, [], shelter, [{ x: 500, z: 500 }])
    expect(withOffPlot.x).toBe(withoutMapped.x)
    expect(withOffPlot.z).toBe(withoutMapped.z)
  })

  it('sites one procedurally when this plot has no mapped entrance at all', () => {
    const ground: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine(ground, 90, 3, [], shelter, [])
    expect(Math.abs(m.x)).toBeLessThanOrEqual(90)
    expect(Math.abs(m.z)).toBeLessThanOrEqual(90)
    // Not sitting on top of the shelter itself.
    expect(Math.hypot(m.x - shelter.x, m.z - shelter.z)).toBeGreaterThan(1)
  })

  it('is deterministic for the same seed when sited procedurally', () => {
    const ground: ElevationProvider = { heightAt: () => 0 }
    const a = placeMine(ground, 90, 7, [], shelter, [])
    const b = placeMine(ground, 90, 7, [], shelter, [])
    expect(a).toEqual(b)
  })

  it('gives a different procedural spot for a different seed', () => {
    const ground: ElevationProvider = { heightAt: () => 0 }
    const a = placeMine(ground, 90, 1, [], shelter, [])
    const b = placeMine(ground, 90, 2, [], shelter, [])
    expect(a.x).not.toBe(b.x)
  })

  it('bores into whichever direction actually climbs — a real slope', () => {
    // Ground rises only toward +x: a real hillside behind the entrance.
    const slope: ElevationProvider = { heightAt: (x) => x * 0.5 }
    const m = placeMine(slope, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    // heading 0 is +x — the only direction that climbs here.
    expect(Math.cos(m.heading)).toBeGreaterThan(0.9)
  })

  it('bores toward the steepest of two rising sides, not the shallow one', () => {
    // Steeper climb toward +z than +x.
    const slope: ElevationProvider = { heightAt: (x, z) => x * 0.1 + z * 0.8 }
    const m = placeMine(slope, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(Math.sin(m.heading)).toBeGreaterThan(0.9)
  })

  it('is deterministic on perfectly flat ground', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const a = placeMine(flat, 90, 3, [], shelter, [{ x: 1, z: 1 }])
    const b = placeMine(flat, 90, 3, [], shelter, [{ x: 1, z: 1 }])
    expect(a.heading).toBe(b.heading)
  })
})

describe('mine segment graph', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('has one root segment starting at the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const root = m.segments.find((s) => s.parentId === null)
    expect(root).toBeDefined()
    expect(root!.x0).toBe(0)
    expect(root!.z0).toBe(0)
  })

  it('slopes the root segment down from the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const root = m.segments.find((s) => s.parentId === null)!
    expect(root.y0).toBe(0)
    expect(root.y1).toBeLessThan(0)
  })

  it('every non-root segment continues exactly where its parent ends', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    for (const s of m.segments) {
      if (s.parentId === null) continue
      const parent = m.segments.find((p) => p.id === s.parentId)!
      expect(s.x0).toBeCloseTo(parent.x1, 6)
      expect(s.z0).toBeCloseTo(parent.z1, 6)
      expect(s.y0).toBeCloseTo(parent.y1, 6)
    }
  })

  it('has exactly one diamond chamber, and every other leaf is a dead end', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const leaves = m.segments.filter((s) => s.isLeaf)
    const chambers = leaves.filter((s) => s.isDiamondChamber)
    expect(chambers.length).toBe(1)
    expect(leaves.length).toBeGreaterThanOrEqual(4) // 1 + BRANCH_COUNT, BRANCH_COUNT is 3 or 4
    expect(leaves.length).toBeLessThanOrEqual(5)
  })

  it('is deterministic for the same seed', () => {
    const a = placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }])
    const b = placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }])
    expect(a.segments).toEqual(b.segments)
  })

  it('gives a different graph for a different seed', () => {
    const a = placeMine(flat, 90, 1, [], shelter, [{ x: 0, z: 0 }])
    const b = placeMine(flat, 90, 2, [], shelter, [{ x: 0, z: 0 }])
    expect(a.segments).not.toEqual(b.segments)
  })

  it('reach covers the farthest segment endpoint from the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const farthest = Math.max(...m.segments.map((s) => Math.hypot(s.x1, s.z1)))
    expect(m.reach).toBeCloseTo(farthest, 6)
  })
})

describe('mineObstacles', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('gives side obstacles for every segment, plus a back wall on every leaf', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const obstacles = mineObstacles(m)
    expect(obstacles.length).toBeGreaterThanOrEqual(m.segments.length * 2)
    for (const s of m.segments) {
      if (!s.isLeaf) continue
      const nearEnd = obstacles.filter((o) => Math.hypot(o.x - s.x1, o.z - s.z1) <= s.width)
      expect(nearEnd.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 2, z: -3 }])
    expect(mineObstacles(m)).toEqual(mineObstacles(m))
  })

  it('places every obstacle within reach of the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    for (const o of mineObstacles(m)) {
      expect(Math.hypot(o.x - m.x, o.z - m.z)).toBeLessThanOrEqual(m.reach + m.segments[0].width)
    }
  })
})

describe('isInsideMine', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }
  const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])

  it('is true right at the entrance', () => {
    expect(isInsideMine(m, 0, 0)).toBe(true)
  })

  it('is true within the tunnel length', () => {
    expect(isInsideMine(m, TUNNEL_LENGTH * 0.5, 0)).toBe(true)
  })

  it('is false well outside the tunnel length', () => {
    expect(isInsideMine(m, TUNNEL_LENGTH * 5, TUNNEL_LENGTH * 5)).toBe(false)
  })
})

describe('buildMineMesh', () => {
  it('keeps the lantern deliberately dim — the interior must read as dark without the lamp', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const group = buildMineMesh(m)
    let lantern: THREE.PointLight | null = null
    group.traverse((o) => {
      if (o instanceof THREE.PointLight) lantern = o
    })
    expect(lantern).not.toBeNull()
    expect(lantern!.intensity).toBeLessThan(1)
  })
})

describe('diamondSpotInMine', () => {
  it('sits inside the tunnel, not at or beyond the entrance', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const spot = diamondSpotInMine(m)
    expect(isInsideMine(m, spot.x, spot.z)).toBe(true)
    expect(Math.hypot(spot.x - m.x, spot.z - m.z)).toBeGreaterThan(1)
  })

  it('is deterministic', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(diamondSpotInMine(m)).toEqual(diamondSpotInMine(m))
  })
})
