import { placeMine, mineObstacles } from '../../src/world/mine'
import type { ElevationProvider } from '../../src/terrain/provider'

describe('placeMine', () => {
  it('sits at the entrance, on the ground beneath it', () => {
    const ground: ElevationProvider = { heightAt: () => 3 }
    const m = placeMine({ x: 5, z: -2 }, ground)
    expect(m.x).toBe(5)
    expect(m.z).toBe(-2)
    expect(m.y).toBe(3)
  })

  it('bores into whichever direction actually climbs — a real slope', () => {
    // Ground rises only toward +x: a real hillside behind the entrance.
    const slope: ElevationProvider = { heightAt: (x) => x * 0.5 }
    const m = placeMine({ x: 0, z: 0 }, slope)
    // heading 0 is +x — the only direction that climbs here.
    expect(Math.cos(m.heading)).toBeGreaterThan(0.9)
  })

  it('bores toward the steepest of two rising sides, not the shallow one', () => {
    // Steeper climb toward +z than +x.
    const slope: ElevationProvider = { heightAt: (x, z) => x * 0.1 + z * 0.8 }
    const m = placeMine({ x: 0, z: 0 }, slope)
    expect(Math.sin(m.heading)).toBeGreaterThan(0.9)
  })

  it('is deterministic on perfectly flat ground', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const a = placeMine({ x: 1, z: 1 }, flat)
    const b = placeMine({ x: 1, z: 1 }, flat)
    expect(a.heading).toBe(b.heading)
  })
})

describe('mineObstacles', () => {
  it('gives obstacles on both sides of the tunnel, plus a back wall at its far end', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine({ x: 0, z: 0 }, flat)
    const obstacles = mineObstacles(m)
    // At heading 0 the tunnel bores along +x: every obstacle's own local x
    // (its distance along the tunnel) stays within [0, length], and z spans
    // both sides of the centreline plus the far end's own full width.
    const xs = obstacles.map((o) => o.x)
    expect(Math.max(...xs)).toBeGreaterThan(4)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6)
    const zs = obstacles.map((o) => o.z)
    expect(Math.max(...zs)).toBeGreaterThan(0)
    expect(Math.min(...zs)).toBeLessThan(0)
  })

  it('is deterministic', () => {
    const flat: ElevationProvider = { heightAt: () => 0 }
    const m = placeMine({ x: 2, z: -3 }, flat)
    expect(mineObstacles(m)).toEqual(mineObstacles(m))
  })
})
