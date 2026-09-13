import { speciesScore } from '../../src/ecology/spawn'
import type { Site } from '../../src/ecology/sites'
import type { Species } from '../../src/species/schema'

/**
 * Fish have no substrate or mycorrhizal partner of their own — the ecology
 * pipeline (unchanged, see docs/superpowers/specs/2026-09-13-quest-items-
 * design.md) is fed a stretched `moisture` range instead, the same
 * "stretch an existing field's meaning" compromise the forest-finds design
 * already accepted for `find`. A high `moisture` range works because
 * `ecology/sites.ts`'s own `moistureNear` boosts a site's moisture toward 1
 * near real water (`waterObstacles`'s own data) regardless of the terrain's
 * shape — so fish only score well at sites that are, in effect, near water.
 */
const fishSpecies: Species = {
  id: 'test-fish',
  gbifKey: 1,
  name: { la: 'Testus fishus', ru: 'Тестовая рыба', en: 'Test fish' },
  kind: 'fish',
  edibility: 'edible',
  lookalikes: [],
  morphology: { bodyColor: '#000000', bellyColor: '#ffffff', finColor: '#888888', length: [100, 200] },
  ecology: {
    mycorrhizal: [],
    substrate: 'soil',
    biomes: ['forest-mixed'],
    season: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    moisture: [0.85, 1],
    gregarious: 'scattered',
    frequency: 'common',
  },
  media: [],
  text: { ru: '', en: '' },
}

const ctx = { month: 6, seed: 1, daysSinceRain: 0 }

const siteAt = (moisture: number): Site => ({
  x: 0,
  z: 0,
  y: 0,
  biome: 'forest-mixed',
  hosts: [],
  substrate: 'soil',
  moisture,
})

describe('fish spawn condition (moisture as a proxy for water proximity)', () => {
  it('scores far higher at a near-water site (moisture close to 1) than a dry one', () => {
    const nearWater = speciesScore(fishSpecies, siteAt(1), ctx)
    const dry = speciesScore(fishSpecies, siteAt(0.2), ctx)
    expect(nearWater).toBeGreaterThan(dry * 5)
  })

  it('scores zero at a site of the wrong substrate — the hard gate still applies', () => {
    const litterSite: Site = { ...siteAt(1), substrate: 'deadwood' }
    expect(speciesScore(fishSpecies, litterSite, ctx)).toBe(0)
  })
})
