import { chooseFallback } from '../../src/game/loadForest'
import type { WorldData } from '../../src/geo/types'

const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [] }

describe('chooseFallback', () => {
  it('uses real data when the wood has polygons', () => {
    expect(chooseFallback({ ...empty, woods: [{ ring: [], leafType: 'mixed' }] })).toBe(null)
  })

  it('falls back when OSM returned nothing at all', () => {
    // Half of rural OSM is unmapped. Standing in an empty field looks like a
    // broken game, so we show a wood instead and say so.
    expect(chooseFallback(empty)).toBe('demo')
  })

  it('accepts open ground alone: a dune or a moor is a real place too', () => {
    expect(chooseFallback({ ...empty, open: [{ ring: [], kind: 'sand' }] })).toBe(null)
  })
})
