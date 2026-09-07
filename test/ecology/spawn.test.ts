import { speciesScore, spawnMushrooms, type SpawnContext } from '../../src/ecology/spawn'
import { loadSpecies, speciesById } from '../../src/species/load'
import type { Site } from '../../src/ecology/sites'

const boletus = speciesById('boletus-edulis')!
const oyster = speciesById('pleurotus-ostreatus')!

const site = (over: Partial<Site> = {}): Site => ({
  x: 0,
  z: 0,
  y: 0,
  biome: 'forest-mixed',
  hosts: [{ genus: 'picea', distance: 2 }],
  substrate: 'soil',
  moisture: 0.5,
  ...over,
})

const ctx: SpawnContext = { month: 9, seed: 1, daysSinceRain: 2 }

describe('speciesScore', () => {
  it('scores zero out of season', () => {
    expect(speciesScore(boletus, site(), { ...ctx, month: 1 })).toBe(0)
  })

  it('scores zero in the wrong biome', () => {
    expect(speciesScore(boletus, site({ biome: 'dunes-coast' }), ctx)).toBe(0)
  })

  it('scores zero on the wrong substrate', () => {
    expect(speciesScore(oyster, site({ substrate: 'soil' }), ctx)).toBe(0)
  })

  it('lets the oyster mushroom grow on dead wood', () => {
    const s = site({ substrate: 'deadwood', biome: 'forest-broadleaved', hosts: [] })
    expect(speciesScore(oyster, s, { ...ctx, month: 10 })).toBeGreaterThan(0)
  })

  it('requires a partner tree for a mycorrhizal species', () => {
    expect(speciesScore(boletus, site({ hosts: [] }), ctx)).toBe(0)
  })

  it('scores higher closer to the partner tree', () => {
    const near = speciesScore(boletus, site({ hosts: [{ genus: 'picea', distance: 1 }] }), ctx)
    const far = speciesScore(boletus, site({ hosts: [{ genus: 'picea', distance: 7 }] }), ctx)
    expect(near).toBeGreaterThan(far)
  })

  it('drops the score when moisture is outside the species range', () => {
    const good = speciesScore(boletus, site({ moisture: 0.5 }), ctx)
    const bad = speciesScore(boletus, site({ moisture: 0.02 }), ctx)
    expect(good).toBeGreaterThan(bad)
  })

  it('favours a wood that has just had rain over one in drought', () => {
    const wet = speciesScore(boletus, site(), { ...ctx, daysSinceRain: 1 })
    const dry = speciesScore(boletus, site(), { ...ctx, daysSinceRain: 30 })
    expect(wet).toBeGreaterThan(dry)
  })
})

describe('spawnMushrooms', () => {
  const sites = Array.from({ length: 300 }, (_, i) =>
    site({ x: i % 20, z: Math.floor(i / 20), moisture: 0.4 + (i % 5) * 0.08 }),
  )

  it('is deterministic', () => {
    expect(spawnMushrooms(loadSpecies(), sites, ctx)).toEqual(spawnMushrooms(loadSpecies(), sites, ctx))
  })

  it('never grows a dune species in a spruce wood', () => {
    for (const p of spawnMushrooms(loadSpecies(), sites, ctx)) {
      expect(speciesById(p.speciesId)!.ecology.biomes).toContain('forest-mixed')
    }
  })

  it('leaves this wood nearly empty in winter', () => {
    const winter = spawnMushrooms(loadSpecies(), sites, { ...ctx, month: 2 })
    const autumn = spawnMushrooms(loadSpecies(), sites, ctx)
    expect(winter.length).toBeLessThan(autumn.length)
  })

  it('grows something at all', () => {
    expect(spawnMushrooms(loadSpecies(), sites, ctx).length).toBeGreaterThan(0)
  })

  it('grows gregarious species in clusters', () => {
    const deadwood = Array.from({ length: 100 }, (_, i) =>
      site({ x: i, z: 0, substrate: 'deadwood', biome: 'forest-broadleaved', hosts: [], moisture: 0.6 }),
    )
    const placements = spawnMushrooms([oyster], deadwood, { ...ctx, month: 10 })
    const byPoint = new Map<string, number>()
    for (const p of placements) {
      const k = `${Math.round(p.x)}`
      byPoint.set(k, (byPoint.get(k) ?? 0) + 1)
    }
    expect(Math.max(...byPoint.values())).toBeGreaterThan(1)
  })

  it('gives each fruiting body its own seed', () => {
    const seeds = spawnMushrooms(loadSpecies(), sites, ctx).map((p) => p.seed)
    expect(new Set(seeds).size).toBeGreaterThan(seeds.length * 0.5)
  })
})
