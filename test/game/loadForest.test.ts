import { chooseFallback, loadForestData } from '../../src/game/loadForest'
import { CHUNK_GROUND_SEGMENTS, CHUNK_SIZE } from '../../src/world/chunking'
import type { WorldData } from '../../src/geo/types'

const empty: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [], shelters: [] }

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

describe('loadForestData', () => {
  it('builds the demo wood at the streamed chunks\' own ground resolution, not the usual finer one', async () => {
    // A null query goes straight to the demo wood, no network involved. Its
    // home plot (chunk (0, 0)) neighbours real streamed chunks
    // (game/worldStream.ts), which always build at CHUNK_GROUND_SEGMENTS —
    // a coarser grid than groundSegmentsFor(200) would otherwise pick. The
    // two meshes have to share a resolution or their shared edge cracks
    // (see TODO.md's "Швы между чанками карты видны").
    const result = await loadForestData(null, () => {})
    expect(result.fellBackTo).toBe('demo')
    expect(result.halfSize).toBe(CHUNK_SIZE / 2)
    expect(result.groundSegments).toBe(CHUNK_GROUND_SEGMENTS)
  })
})
