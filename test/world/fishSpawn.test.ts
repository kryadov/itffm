import { speciesScore } from '../../src/ecology/spawn'
import { SWIM_MAX_ROAM } from '../../src/fish/swim'
import type { Site } from '../../src/ecology/sites'
import type { Species } from '../../src/species/schema'
import { spawnFish, SHORE_BAND } from '../../src/world/fishSpawn'
import { waterLevel, STREAM_WIDTH } from '../../src/world/water'
import { pointInPolygon, distanceToPolyline } from '../../src/util/geometry'
import { loadSpecies } from '../../src/species/load'
import type { Vec2 } from '../../src/geo/types'

/**
 * A live report (2026-09-20): "why is the roach in the forest?" Fish were an
 * ordinary species whose only condition was wet ground, so they lay on the
 * meadow. They now live in the water itself.
 */
const fish = (id: string, over: Partial<Species['ecology']> = {}): Species => ({
  id,
  gbifKey: 1,
  name: { la: id, ru: id, en: id },
  kind: 'fish',
  edibility: 'edible',
  lookalikes: [],
  morphology: {
    bodyColor: '#000000', bellyColor: '#ffffff', finColor: '#888888', length: [100, 200],
    bodyDepth: 0.26, pattern: 'plain', patternColor: '#000000', eyeColor: '#d8c070', lowerFinColor: '#888888',
    dorsalFins: 1, dorsalAt: 0.45,
  },
  ecology: {
    mycorrhizal: [], substrate: 'soil', biomes: ['forest-mixed'], season: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    moisture: [0.85, 1], gregarious: 'scattered', frequency: 'common', ...over,
  },
  media: [],
  text: { ru: '', en: '' },
})

const square = (cx: number, cz: number, r: number): Vec2[] => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r }, { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const stream: Vec2[] = [{ x: 0, z: 0 }, { x: 15, z: 4 }, { x: 30, z: 0 }, { x: 45, z: 6 }, { x: 60, z: 2 }]
const hill = { heightAt: (x: number, z: number) => 3 + 0.05 * x + 0.02 * z }
const ctx = { month: 6, seed: 7, daysSinceRain: 0 }
const roach = fish('roach')

describe('fish no longer spawn on land', () => {
  const site: Site = { x: 0, z: 0, y: 0, biome: 'forest-mixed', hosts: [], substrate: 'soil', moisture: 1 }
  it('scores zero at any land site, however wet', () => {
    expect(speciesScore(roach, site, ctx)).toBe(0)
    expect(speciesScore(roach, { ...site, moisture: 0.2 }, ctx)).toBe(0)
  })
})

describe('spawnFish in a pond', () => {
  const pond = square(50, 40, 20)
  const place = (over = {}) => spawnFish([roach], [pond], hill, { ...ctx, ...over })

  it('puts every fish inside the water', () => {
    const p = place()
    expect(p.length).toBeGreaterThan(3)
    for (const f of p) expect(pointInPolygon(f.x, f.z, pond)).toBe(true)
  })

  it('keeps them within reach of the bank, not out in the middle of the pond', () => {
    for (const f of place()) {
      // schools are centred within the shore band; a school's spread can add a little
      expect(distanceToPolyline(f.x, f.z, [...pond, pond[0]])).toBeLessThanOrEqual(SHORE_BAND + 2.5)
    }
  })

  it("rides at the water's own level, not at the ground's", () => {
    const level = waterLevel(pond, hill)
    for (const f of place()) {
      expect(f.y).toBeGreaterThan(level - 0.02)
      expect(f.y).toBeLessThan(level + 0.05)
    }
  })

  it('is deterministic, and a different seed gives a different shoal', () => {
    expect(place()).toEqual(place())
    expect(place({ seed: 8 })).not.toEqual(place())
  })

  it('gives valid placements: species, ages, seeds, no NaN', () => {
    for (const f of place()) {
      expect(f.speciesId).toBe('roach')
      expect(f.age).toBeGreaterThanOrEqual(0.25)
      expect(f.age).toBeLessThanOrEqual(1)
      expect(Number.isFinite(f.x + f.y + f.z + f.rotationY + f.seed)).toBe(true)
    }
  })

  it('gives each fish room to swim that stays in the water and within reach', () => {
    const p = place()
    expect(p.some((f) => (f.roam ?? 0) > 0.3)).toBe(true)
    for (const f of p) {
      const r = f.roam ?? 0
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(SWIM_MAX_ROAM)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        expect(pointInPolygon(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, pond)).toBe(true)
      }
    }
  })

  it('scales with the water: a bigger pond holds more fish', () => {
    const big = spawnFish([roach], [square(0, 0, 40)], hill, ctx)
    const small = spawnFish([roach], [square(0, 0, 6)], hill, ctx)
    expect(big.length).toBeGreaterThan(small.length)
  })
})

describe('spawnFish in a stream', () => {
  const place = () => spawnFish([roach], [stream], hill, ctx)

  it('keeps fish inside the channel', () => {
    const p = place()
    expect(p.length).toBeGreaterThan(1)
    for (const f of p) expect(distanceToPolyline(f.x, f.z, stream)).toBeLessThanOrEqual(STREAM_WIDTH / 2)
  })

  it('keeps the room each fish swims in inside the channel', () => {
    for (const f of place()) {
      const r = f.roam ?? 0
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        expect(distanceToPolyline(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, stream)).toBeLessThanOrEqual(STREAM_WIDTH / 2 + 1e-9)
      }
    }
  })

  it('floats them on the stream surface, which follows the ground down the channel', () => {
    for (const f of place()) {
      const bed = hill.heightAt(f.x, f.z)
      expect(f.y).toBeGreaterThan(bed)
      expect(f.y).toBeLessThan(bed + 0.2)
    }
  })
})

describe('spawnFish species and edge cases', () => {
  const pond = square(0, 0, 25)

  it('only ever places fish species', () => {
    const mushroom = { ...roach, id: 'not-a-fish', kind: 'find' } as unknown as Species
    const ids = new Set(spawnFish([mushroom, roach], [pond], hill, ctx).map((p) => p.speciesId))
    expect([...ids]).toEqual(['roach'])
  })

  it('makes nothing without water, without fish species, or with a degenerate outline', () => {
    expect(spawnFish([roach], [], hill, ctx)).toEqual([])
    expect(spawnFish([], [pond], hill, ctx)).toEqual([])
    expect(spawnFish([roach], [[{ x: 0, z: 0 }, { x: 1, z: 1 }]], hill, ctx)).toEqual([])
  })

  it('favours the common species over the rare one', () => {
    const rare = fish('pike', { frequency: 'rare' })
    const counts = { roach: 0, pike: 0 }
    for (let seed = 0; seed < 30; seed++) {
      for (const p of spawnFish([roach, rare], [pond], hill, { ...ctx, seed })) counts[p.speciesId as 'roach' | 'pike']++
    }
    expect(counts.roach).toBeGreaterThan(counts.pike * 2)
  })

  it('still shows fish out of season, only fewer of that species', () => {
    const summerOnly = fish('roach', { season: [6, 7] })
    const inSeason = spawnFish([summerOnly, fish('perch', { season: [12] })], [pond], hill, { ...ctx, month: 6 })
    expect(inSeason.filter((p) => p.speciesId === 'roach').length).toBeGreaterThan(
      inSeason.filter((p) => p.speciesId === 'perch').length,
    )
  })

  it('works with the real species data', () => {
    const all = loadSpecies()
    const fishIds = all.filter((sp) => sp.kind === 'fish').map((sp) => sp.id)
    const real = spawnFish(all, [pond], hill, ctx)
    expect(real.length).toBeGreaterThan(0)
    for (const p of real) expect(fishIds).toContain(p.speciesId)
  })
})

describe('spawnFish keeps fish within reach of someone standing on the bank', () => {
  // A live finding (2026-09-21): a pond floats at its lowest bed point, so the
  // banks can stand metres above the water — in the demo wood only 6 of 20 fish
  // could be reached. A player stands ~0.95 m back from the bank (the bank is an
  // obstacle), eyes 1.65 m up, and reaches 3 m.
  const REACH = 3
  const pond = square(0, 0, 20)
  // A bowl: low in the middle, banks rising steeply to the edge.
  const bowl = { heightAt: (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) * 0.12 - 1 }
  const nearestBank = (x: number, z: number) => {
    let best = { d: Infinity, px: 0, pz: 0 }
    for (let i = 0; i < pond.length; i++) {
      const a = pond[i], b = pond[(i + 1) % pond.length]
      const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
      const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz)
      if (d < best.d) best = { d, px, pz }
    }
    return best
  }

  it('is reachable for every fish, in a pond whose banks rise above the water', () => {
    let total = 0
    for (let seed = 0; seed < 12; seed++) {
      for (const f of spawnFish([roach], [pond], bowl, { ...ctx, seed })) {
        total++
        const b = nearestBank(f.x, f.z)
        const ux = (b.px - f.x) / (b.d || 1), uz = (b.pz - f.z) / (b.d || 1)
        const sx = b.px + ux * 0.95, sz = b.pz + uz * 0.95
        const eye = bowl.heightAt(sx, sz) + 1.65
        expect(Math.hypot(b.d + 0.95, eye - f.y)).toBeLessThanOrEqual(REACH)
      }
    }
    expect(total).toBeGreaterThan(0)
  })

  it('keeps to the low stretches of bank, none along the banks that stand too high to reach over', () => {
    // The water floats at the lowest of the outline's own vertices (the corners):
    // deep there, with the bank level (0) everywhere else — so only fish near a
    // corner, where the bank is low too, can be reached.
    const cliff = { heightAt: (x: number, z: number) => (Math.hypot(Math.abs(x) - 20, Math.abs(z) - 20) < 2 ? -8 : 0) }
    let near = 0
    for (let seed = 0; seed < 20; seed++) {
      for (const f of spawnFish([roach], [pond], cliff, { ...ctx, seed })) {
        near++
        const toCorner = Math.hypot(Math.abs(f.x) - 20, Math.abs(f.z) - 20)
        expect(toCorner).toBeLessThan(6) // only where the bank drops away too
      }
    }
    expect(near).toBeGreaterThan(0)
  })
})
