import { moistureAt, buildSites } from '../../src/ecology/sites'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { placeTrees } from '../../src/world/trees'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const bowl: ElevationProvider = { heightAt: (x, z) => (x * x + z * z) * 0.02 }
const hill: ElevationProvider = { heightAt: (x, z) => -(x * x + z * z) * 0.02 }

describe('moistureAt', () => {
  it('stays within [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const m = moistureAt(proceduralTerrain(3), i * 2.7, i * -1.3)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThanOrEqual(1)
    }
  })

  it('makes a hollow wetter than a rise', () => {
    expect(moistureAt(bowl, 0, 0)).toBeGreaterThan(moistureAt(hill, 0, 0))
  })

  it('puts flat ground in the middle of the scale', () => {
    expect(moistureAt(flat, 0, 0)).toBeCloseTo(0.5, 1)
  })
})

describe('buildSites', () => {
  const terrain = proceduralTerrain(5)
  const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])

  it('is deterministic', () => {
    expect(buildSites(terrain, trees, 60, 11, 'forest-mixed', 200)).toEqual(
      buildSites(terrain, trees, 60, 11, 'forest-mixed', 200),
    )
  })

  it('keeps sites inside the plot and on the ground', () => {
    for (const s of buildSites(terrain, trees, 60, 11, 'forest-mixed', 100)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(60)
      expect(s.y).toBeCloseTo(terrain.heightAt(s.x, s.z), 5)
    }
  })

  it('sorts hosts by distance', () => {
    for (const s of buildSites(terrain, trees, 60, 11, 'forest-mixed', 100)) {
      for (let i = 1; i < s.hosts.length; i++) {
        expect(s.hosts[i].distance).toBeGreaterThanOrEqual(s.hosts[i - 1].distance)
      }
    }
  })

  it('finds hosts for sites near trees', () => {
    const withHosts = buildSites(terrain, trees, 60, 11, 'forest-mixed', 400).filter(
      (s) => s.hosts.length > 0,
    )
    expect(withHosts.length).toBeGreaterThan(0)
  })

  it('offers both soil and dead wood to grow on', () => {
    const sites = buildSites(terrain, trees, 60, 11, 'forest-mixed', 400)
    expect(sites.some((s) => s.substrate === 'deadwood')).toBe(true)
    expect(sites.some((s) => s.substrate === 'soil')).toBe(true)
  })
})
