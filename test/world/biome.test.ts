import { buildBiomeMap, treelineAt } from '../../src/world/biome'
import type { WorldData } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat = (h: number): ElevationProvider => ({ heightAt: () => h })
const square = (cx: number, cz: number, r: number) => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [] }

describe('treelineAt', () => {
  it('falls as you go north', () => {
    expect(treelineAt(45)).toBeGreaterThan(treelineAt(65))
  })

  it('is symmetric about the equator', () => {
    expect(treelineAt(-50)).toBeCloseTo(treelineAt(50))
  })

  it('gives plausible numbers for the Alps and for Lapland', () => {
    expect(treelineAt(46)).toBeGreaterThan(1500)
    expect(treelineAt(46)).toBeLessThan(2600)
    expect(treelineAt(68)).toBeLessThan(900)
  })
})

describe('buildBiomeMap', () => {
  it('reads the leaf type of the wood you stand in', () => {
    const world: WorldData = {
      ...empty,
      woods: [
        { ring: square(0, 0, 50), leafType: 'needleleaved' },
        { ring: square(200, 0, 50), leafType: 'broadleaved' },
        { ring: square(400, 0, 50), leafType: 'mixed' },
      ],
    }
    const m = buildBiomeMap(world, flat(150), 55)
    expect(m.at(0, 0)).toBe('forest-coniferous')
    expect(m.at(200, 0)).toBe('forest-broadleaved')
    expect(m.at(400, 0)).toBe('forest-mixed')
  })

  it('calls an untyped wood mixed rather than inventing one', () => {
    const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 50), leafType: 'unknown' }] }
    expect(buildBiomeMap(world, flat(150), 55).at(0, 0)).toBe('forest-mixed')
  })

  it('maps open ground to its own biomes', () => {
    const world: WorldData = {
      ...empty,
      open: [
        { ring: square(0, 0, 50), kind: 'scrub' },
        { ring: square(200, 0, 50), kind: 'sand' },
        { ring: square(400, 0, 50), kind: 'wetland' },
        { ring: square(600, 0, 50), kind: 'park' },
      ],
    }
    const m = buildBiomeMap(world, flat(150), 55)
    expect(m.at(0, 0)).toBe('meadow-scrub')
    expect(m.at(200, 0)).toBe('dunes-coast')
    expect(m.at(400, 0)).toBe('wetland')
    expect(m.at(600, 0)).toBe('park-urban')
  })

  it('lets the wood win where a wood and open ground overlap', () => {
    // OSM double-tags all the time; a wood inside a nature reserve is a wood.
    const world: WorldData = {
      ...empty,
      woods: [{ ring: square(0, 0, 50), leafType: 'broadleaved' }],
      open: [{ ring: square(0, 0, 200), kind: 'park' }],
    }
    expect(buildBiomeMap(world, flat(150), 55).at(0, 0)).toBe('forest-broadleaved')
  })

  it('calls unmapped ground meadow rather than nothing', () => {
    expect(buildBiomeMap(empty, flat(150), 55).at(0, 0)).toBe('meadow-scrub')
  })

  it('turns high open ground into alpine', () => {
    expect(buildBiomeMap(empty, flat(2400), 46).at(0, 0)).toBe('alpine')
  })

  it('does not call a wood alpine, however high it stands', () => {
    // A wood above our treeline estimate means the estimate is wrong, not the map.
    const world: WorldData = { ...empty, woods: [{ ring: square(0, 0, 50), leafType: 'needleleaved' }] }
    expect(buildBiomeMap(world, flat(2400), 46).at(0, 0)).toBe('forest-coniferous')
  })

  it('turns a cave entrance into its own biome nearby', () => {
    const world: WorldData = { ...empty, caves: [{ at: { x: 0, z: 0 } }] }
    expect(buildBiomeMap(world, flat(150), 55).at(2, 0)).toBe('cave-adit')
  })

  it('does not spread the cave biome across the wood', () => {
    const world: WorldData = { ...empty, caves: [{ at: { x: 0, z: 0 } }] }
    expect(buildBiomeMap(world, flat(150), 55).at(60, 0)).not.toBe('cave-adit')
  })
})
