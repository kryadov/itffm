import { regionalMix, placeOsmTrees } from '../../src/world/osmTrees'
import { isClearing } from '../../src/world/clearings'
import type { WorldData } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const square = (cx: number, cz: number, r: number) => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [] }
const CONIFERS = ['picea', 'pinus', 'abies', 'larix']

describe('regionalMix', () => {
  it('gives a needleleaved wood conifers only', () => {
    for (const g of regionalMix('needleleaved', 55)) expect(CONIFERS).toContain(g)
  })

  it('gives a broadleaved wood no conifers', () => {
    for (const g of regionalMix('broadleaved', 55)) expect(CONIFERS).not.toContain(g)
  })

  it('mixes both when the tag says mixed or says nothing', () => {
    const mixed = regionalMix('mixed', 55)
    expect(mixed.some((g) => CONIFERS.includes(g))).toBe(true)
    expect(mixed.some((g) => !CONIFERS.includes(g))).toBe(true)
    expect(regionalMix('unknown', 55)).toEqual(mixed)
  })

  it('changes the species with latitude', () => {
    // Beech and hornbeam do not grow in the taiga, and larch is not southern.
    expect(regionalMix('broadleaved', 45)).not.toEqual(regionalMix('broadleaved', 65))
  })

  it('never returns an empty mix', () => {
    for (const lat of [10, 35, 45, 55, 65, 75]) {
      for (const lt of ['broadleaved', 'needleleaved', 'mixed', 'unknown'] as const) {
        expect(regionalMix(lt, lat).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('placeOsmTrees', () => {
  const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 60), leafType: 'needleleaved' }] }

  it('is deterministic', () => {
    expect(placeOsmTrees(world, flat, 55, 3, 90)).toEqual(placeOsmTrees(world, flat, 55, 3, 90))
  })

  it('fills the wood and leaves the clearing alone', () => {
    const trees = placeOsmTrees(world, flat, 55, 3, 200)
    expect(trees.length).toBeGreaterThan(20)
    for (const t of trees) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(61)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(61)
    }
  })

  it('respects the polygon leaf type', () => {
    for (const t of placeOsmTrees(world, flat, 55, 3, 200)) expect(CONIFERS).toContain(t.genus)
  })

  it('lets a mapper-tagged genus override the regional guess', () => {
    const tagged: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 60), leafType: 'unknown', genus: 'quercus' }],
    }
    for (const t of placeOsmTrees(tagged, flat, 55, 3, 200)) expect(t.genus).toBe('quercus')
  })

  it('ignores a genus tag naming a tree we cannot draw', () => {
    const exotic: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 60), leafType: 'broadleaved', genus: 'eucalyptus' }],
    }
    const trees = placeOsmTrees(exotic, flat, 55, 3, 200)
    expect(trees.length).toBeGreaterThan(0)
    for (const t of trees) expect(CONIFERS).not.toContain(t.genus)
  })

  it('keeps individually mapped trees exactly where the mapper put them', () => {
    const mapped: WorldData = { ...empty, trees: [{ at: { x: 12, z: -7 }, genus: 'betula' }] }
    const trees = placeOsmTrees(mapped, flat, 55, 3, 200)
    expect(trees).toContainEqual(expect.objectContaining({ x: 12, z: -7, genus: 'betula' }))
  })

  it('grows nothing where no wood was mapped', () => {
    expect(placeOsmTrees(empty, flat, 55, 3, 200)).toHaveLength(0)
  })

  it('stands trees on the ground', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.05 }
    for (const t of placeOsmTrees(world, slope, 55, 3, 200)) {
      expect(t.y).toBeCloseTo(slope.heightAt(t.x, t.z), 5)
    }
  })

  it('clips a wood that runs off the edge of the plot', () => {
    const huge: WorldData = { ...empty, woods: [{ ring: square(0, 0, 5000), leafType: 'mixed' }] }
    for (const t of placeOsmTrees(huge, flat, 55, 3, 90)) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(90)
    }
  })

  it('leaves gaps in the canopy for the noise-driven clearings', () => {
    const big: WorldData = { ...empty, woods: [{ ring: square(0, 0, 150), leafType: 'mixed' }] }
    const seed = 9
    for (const t of placeOsmTrees(big, flat, 55, seed, 200)) {
      expect(isClearing(t.x, t.z, seed)).toBe(false)
    }
  })

  it('grows stands rather than an even shuffle in a mixed wood', () => {
    const mixed: WorldData = { ...empty, woods: [{ ring: square(0, 0, 150), leafType: 'mixed' }] }
    const trees = placeOsmTrees(mixed, flat, 55, 9, 200)
    let same = 0
    for (const t of trees) {
      let best = Infinity
      let bestGenus = t.genus
      for (const o of trees) {
        if (o === t) continue
        const d = Math.hypot(o.x - t.x, o.z - t.z)
        if (d < best) {
          best = d
          bestGenus = o.genus
        }
      }
      if (bestGenus === t.genus) same++
    }
    expect(same / trees.length).toBeGreaterThan(0.5)
  })

  it('leaves a clear corridor along a path running through the wood', () => {
    const withPath: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 60), leafType: 'needleleaved' }],
      paths: [{ points: [{ x: -60, z: 0 }, { x: 60, z: 0 }] }],
    }
    const trees = placeOsmTrees(withPath, flat, 55, 3, 60)
    for (const t of trees) expect(Math.abs(t.z)).toBeGreaterThanOrEqual(1.8)
  })

  it('never moves a mapped, surveyed tree away from a path', () => {
    const mappedOnPath: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 60), leafType: 'needleleaved' }],
      paths: [{ points: [{ x: -60, z: 0 }, { x: 60, z: 0 }] }],
      trees: [{ at: { x: 5, z: 0 }, genus: 'betula' }],
    }
    const trees = placeOsmTrees(mappedOnPath, flat, 55, 3, 60)
    expect(trees.some((t) => t.x === 5 && t.z === 0)).toBe(true)
  })
})
