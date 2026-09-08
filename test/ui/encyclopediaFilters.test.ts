import { matchesFilters } from '../../src/ui/encyclopediaFilters'
import { loadSpecies, speciesById } from '../../src/species/load'

const all = loadSpecies()
const deathCap = speciesById('amanita-phalloides')!
const boletus = speciesById('boletus-edulis')!

describe('matchesFilters', () => {
  it('matches everything when no filter is set', () => {
    for (const s of all) expect(matchesFilters(s, {})).toBe(true)
  })

  it('filters by edibility', () => {
    expect(matchesFilters(deathCap, { edibility: 'deadly' })).toBe(true)
    expect(matchesFilters(boletus, { edibility: 'deadly' })).toBe(false)
  })

  it('filters by hymenium type', () => {
    expect(matchesFilters(boletus, { hymenium: 'pores' })).toBe(true)
    expect(matchesFilters(deathCap, { hymenium: 'pores' })).toBe(false)
  })

  it('filters by biome membership, not exact match', () => {
    for (const s of all.filter((s) => matchesFilters(s, { biome: 'forest-mixed' }))) {
      expect(s.ecology.biomes).toContain('forest-mixed')
    }
  })

  it('filters by season, matching if any month overlaps', () => {
    for (const s of all.filter((s) => matchesFilters(s, { season: 'winter' }))) {
      expect(s.ecology.season.some((m) => [12, 1, 2].includes(m))).toBe(true)
    }
  })

  it('combines several filters with AND', () => {
    const combined = all.filter((s) => matchesFilters(s, { edibility: 'edible', hymenium: 'pores' }))
    for (const s of combined) {
      expect(s.edibility).toBe('edible')
      expect(s.morphology.hymenium.type).toBe('pores')
    }
    expect(combined.length).toBeLessThan(all.length)
  })
})
