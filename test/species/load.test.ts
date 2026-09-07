import { loadSpecies, speciesById } from '../../src/species/load'

describe('loadSpecies', () => {
  const all = loadSpecies()

  it('finds every YAML under data/species', () => {
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('validates every species', () => {
    for (const s of all) expect(s.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('keeps ids unique', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })

  it('keeps GBIF keys unique', () => {
    expect(new Set(all.map((s) => s.gbifKey)).size).toBe(all.length)
  })

  it('points every lookalike at a species that exists', () => {
    const ids = new Set(all.map((s) => s.id))
    for (const s of all) {
      for (const l of s.lookalikes) {
        expect(ids.has(l), `${s.id} points at missing ${l}`).toBe(true)
      }
    }
  })

  it('never lists a species as its own lookalike', () => {
    for (const s of all) expect(s.lookalikes).not.toContain(s.id)
  })
})

describe('speciesById', () => {
  it('finds the fly agaric', () => {
    expect(speciesById('amanita-muscaria')?.name.la).toBe('Amanita muscaria')
  })

  it('returns undefined for an unknown id', () => {
    expect(speciesById('no-such-species')).toBeUndefined()
  })
})
