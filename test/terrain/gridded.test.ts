import { gridProviderFromArray, griddedProvider } from '../../src/terrain/gridded'
import type { ElevationProvider } from '../../src/terrain/provider'

describe('gridProviderFromArray', () => {
  it('reproduces the exact grid values at the nodes', () => {
    // A 3x3 grid over halfSize=1: nodes at -1, 0, 1 on each axis.
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const p = gridProviderFromArray(h, 1, 2)
    expect(p.heightAt(-1, -1)).toBe(0)
    expect(p.heightAt(0, 0)).toBe(4)
    expect(p.heightAt(1, 1)).toBe(8)
  })

  it('interpolates linearly between nodes', () => {
    // A 2x2 grid over halfSize=1: a gradient in x only (0 at x=-1, 10 at x=1).
    const h = [0, 10, 0, 10]
    const p = gridProviderFromArray(h, 1, 1)
    expect(p.heightAt(0, 0)).toBeCloseTo(5, 5)
  })

  it('clamps outside the grid rather than extrapolating', () => {
    const h = [0, 10, 0, 10]
    const p = gridProviderFromArray(h, 1, 1)
    expect(p.heightAt(-5, 0)).toBe(0)
    expect(p.heightAt(5, 0)).toBe(10)
  })

  it('offsets by origin when one is given, without changing unoffset behaviour', () => {
    const h = [0, 10, 0, 10]
    const plain = gridProviderFromArray(h, 1, 1)
    const shifted = gridProviderFromArray(h, 1, 1, { x: 500, z: -300 })
    // Same local shape, just recentred at (500, -300) instead of (0, 0).
    expect(shifted.heightAt(500, -300)).toBeCloseTo(plain.heightAt(0, 0), 5)
    expect(shifted.heightAt(501, -300)).toBeCloseTo(plain.heightAt(1, 0), 5)
  })
})

describe('griddedProvider', () => {
  const linear: ElevationProvider = { heightAt: (x) => x }

  it('resamples a source onto its own grid, unoffset by default', () => {
    const g = griddedProvider(linear, 10, 4)
    expect(g.heightAt(0, 0)).toBeCloseTo(0, 4)
    expect(g.heightAt(5, 0)).toBeCloseTo(5, 4)
  })

  it('resamples an off-centre chunk correctly when given an origin', () => {
    const g = griddedProvider(linear, 10, 4, { x: 1000, z: 0 })
    // The chunk spans [990, 1010] in world space; the source is heightAt(x)=x.
    expect(g.heightAt(1000, 0)).toBeCloseTo(1000, 4)
    expect(g.heightAt(1005, 0)).toBeCloseTo(1005, 4)
  })
})
