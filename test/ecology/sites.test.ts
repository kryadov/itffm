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
    expect(buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 200)).toEqual(
      buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 200),
    )
  })

  it('keeps sites inside the plot and on the ground', () => {
    for (const s of buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 100)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(60)
      expect(s.y).toBeCloseTo(terrain.heightAt(s.x, s.z), 5)
    }
  })

  it('sorts hosts by distance', () => {
    for (const s of buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 100)) {
      for (let i = 1; i < s.hosts.length; i++) {
        expect(s.hosts[i].distance).toBeGreaterThanOrEqual(s.hosts[i - 1].distance)
      }
    }
  })

  it('finds hosts for sites near trees', () => {
    const withHosts = buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 400).filter(
      (s) => s.hosts.length > 0,
    )
    expect(withHosts.length).toBeGreaterThan(0)
  })

  it('offers soil to grow on', () => {
    const sites = buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 400)
    expect(sites.some((s) => s.substrate === 'soil')).toBe(true)
  })

  it('grows dead wood only where a real log or stump was given, not near any trunk', () => {
    const withoutWood = buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 400)
    expect(withoutWood.some((s) => s.substrate === 'deadwood')).toBe(false)

    const deadwoodPoints = [{ x: 5, z: 5 }, { x: -5, z: -5 }]
    const withWood = buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 400, deadwoodPoints)
    const wood = withWood.filter((s) => s.substrate === 'deadwood')
    expect(wood.length).toBe(deadwoodPoints.length)
    expect(wood.map((s) => [s.x, s.z]).sort()).toEqual(deadwoodPoints.map((p) => [p.x, p.z]).sort())
  })

  it('grows moss only at given points, same as deadwood', () => {
    const mossPoints = [{ x: 7, z: 7 }]
    const sites = buildSites(terrain, trees, 60, 11, () => 'forest-mixed', 400, [], mossPoints)
    const moss = sites.filter((s) => s.substrate === 'moss')
    expect(moss).toHaveLength(1)
    expect([moss[0].x, moss[0].z]).toEqual([7, 7])
  })

  it('wets the ground near a pond even where the terrain shape says dry', () => {
    const pond = [{ x: 40, z: 40 }, { x: 46, z: 40 }, { x: 46, z: 46 }, { x: 40, z: 46 }]
    const near = buildSites(flat, [], 60, 11, () => 'forest-mixed', 0, [{ x: 43, z: 38 }], [], [pond])[0]
    const far = buildSites(flat, [], 60, 11, () => 'forest-mixed', 0, [{ x: -43, z: -30 }], [], [pond])[0]
    expect(near.moisture).toBeGreaterThan(far.moisture)
  })

  it('lets the biome vary from point to point', () => {
    const sites = buildSites(terrain, trees, 60, 11, (x) => (x < 0 ? 'forest-coniferous' : 'dunes-coast'), 200)
    expect(sites.some((s) => s.biome === 'forest-coniferous')).toBe(true)
    expect(sites.some((s) => s.biome === 'dunes-coast')).toBe(true)
    for (const s of sites) expect(s.biome).toBe(s.x < 0 ? 'forest-coniferous' : 'dunes-coast')
  })
})
