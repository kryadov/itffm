import { withDetail } from '../../src/terrain/detail'
import { moistureAt } from '../../src/ecology/sites'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 100 }
const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }

describe('withDetail', () => {
  it('is deterministic', () => {
    expect(withDetail(flat, 7).heightAt(3, 4)).toBe(withDetail(flat, 7).heightAt(3, 4))
  })

  it('differs by seed', () => {
    expect(withDetail(flat, 1).heightAt(3, 4)).not.toBe(withDetail(flat, 2).heightAt(3, 4))
  })

  it('keeps the broad shape of the source', () => {
    // A hundred metres apart the detail is noise on top of a real slope; the
    // slope must still dominate, or the DEM stops meaning anything.
    const d = withDetail(slope, 5)
    expect(d.heightAt(100, 0) - d.heightAt(-100, 0)).toBeCloseTo(20, 0)
  })

  it('stays within the amplitude it was given', () => {
    const d = withDetail(flat, 5, 0.6)
    for (let i = 0; i < 300; i++) {
      expect(Math.abs(d.heightAt(i * 1.3, i * -0.7) - 100)).toBeLessThanOrEqual(0.6)
    }
  })

  it('adds relief a flat DEM did not have', () => {
    const d = withDetail(flat, 5)
    const hs = Array.from({ length: 60 }, (_, i) => d.heightAt(i * 2, 0))
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.1)
  })

  it('gives a flat DEM hollows and rises to read moisture from', () => {
    // The point of the whole module: without it every site on flat ground
    // scores exactly 0.5 and the ecology has nothing to work with.
    const d = withDetail(flat, 11)
    const wet = Array.from({ length: 200 }, (_, i) => moistureAt(d, i * 3, 0))
    expect(Math.max(...wet)).toBeGreaterThan(0.55)
    expect(Math.min(...wet)).toBeLessThan(0.45)
  })
})
