import { parseWorld, leafTypeOf, type OverpassElement } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'

const proj = new Projector({ lat: 55.75, lon: 37.62 })

const nodes: OverpassElement[] = [
  { type: 'node', id: 1, lat: 55.75, lon: 37.62 },
  { type: 'node', id: 2, lat: 55.751, lon: 37.62 },
  { type: 'node', id: 3, lat: 55.751, lon: 37.621 },
  { type: 'node', id: 4, lat: 55.75, lon: 37.621 },
]

const wood: OverpassElement = {
  type: 'way',
  id: 10,
  nodes: [1, 2, 3, 4, 1],
  tags: { natural: 'wood', leaf_type: 'needleleaved' },
}

describe('leafTypeOf', () => {
  it('reads the tag', () => {
    expect(leafTypeOf({ leaf_type: 'broadleaved' })).toBe('broadleaved')
    expect(leafTypeOf({ leaf_type: 'needleleaved' })).toBe('needleleaved')
    expect(leafTypeOf({ leaf_type: 'mixed' })).toBe('mixed')
  })

  it('falls back to unknown rather than guessing', () => {
    expect(leafTypeOf({})).toBe('unknown')
    expect(leafTypeOf({ leaf_type: 'nonsense' })).toBe('unknown')
  })
})

describe('parseWorld', () => {
  it('turns a tagged way into a wood in local metres', () => {
    const w = parseWorld({ elements: [...nodes, wood] }, proj)
    expect(w.woods).toHaveLength(1)
    expect(w.woods[0].leafType).toBe('needleleaved')
    expect(w.woods[0].ring.length).toBeGreaterThanOrEqual(4)
    // The centre node sits at the origin, so the ring is metres, not degrees.
    expect(Math.abs(w.woods[0].ring[0].x)).toBeLessThan(500)
  })

  it('treats landuse=forest as a wood too', () => {
    const forest = { ...wood, id: 11, tags: { landuse: 'forest' } }
    expect(parseWorld({ elements: [...nodes, forest] }, proj).woods).toHaveLength(1)
  })

  it('picks up a genus tag when the mapper left one', () => {
    const oaks = { ...wood, id: 12, tags: { natural: 'wood', genus: 'Quercus' } }
    expect(parseWorld({ elements: [...nodes, oaks] }, proj).woods[0].genus).toBe('quercus')
  })

  it('takes the genus from a binomial species tag', () => {
    const birches = { ...wood, id: 17, tags: { natural: 'wood', species: 'Betula pendula' } }
    expect(parseWorld({ elements: [...nodes, birches] }, proj).woods[0].genus).toBe('betula')
  })

  it('sorts open ground by kind', () => {
    const scrub = { ...wood, id: 13, tags: { natural: 'scrub' } }
    const dune = { ...wood, id: 14, tags: { natural: 'sand' } }
    const w = parseWorld({ elements: [...nodes, scrub, dune] }, proj)
    expect(w.open.map((o) => o.kind).sort()).toEqual(['sand', 'scrub'])
  })

  it('keeps water, paths, mapped trees and cave entrances apart', () => {
    const water = { ...wood, id: 15, tags: { natural: 'water' } }
    const path: OverpassElement = { type: 'way', id: 16, nodes: [1, 2, 3], tags: { highway: 'path' } }
    const tree: OverpassElement = {
      type: 'node', id: 5, lat: 55.7505, lon: 37.6205,
      tags: { natural: 'tree', genus: 'Betula' },
    }
    const cave: OverpassElement = {
      type: 'node', id: 6, lat: 55.7506, lon: 37.6206, tags: { natural: 'cave_entrance' },
    }
    const w = parseWorld({ elements: [...nodes, water, path, tree, cave] }, proj)
    expect(w.water).toHaveLength(1)
    expect(w.paths).toHaveLength(1)
    expect(w.trees[0].genus).toBe('betula')
    expect(w.caves).toHaveLength(1)
  })

  it('reads a multipolygon relation through its outer ways', () => {
    const rel: OverpassElement = {
      type: 'relation',
      id: 20,
      tags: { type: 'multipolygon', natural: 'wood', leaf_type: 'broadleaved' },
      members: [{ type: 'way', ref: 10, role: 'outer' }],
    }
    const w = parseWorld({ elements: [...nodes, { ...wood, tags: undefined }, rel] }, proj)
    expect(w.woods).toHaveLength(1)
    expect(w.woods[0].leafType).toBe('broadleaved')
  })

  it('ignores a way whose nodes never arrived', () => {
    // Overpass can return a way referencing nodes outside the bbox.
    expect(parseWorld({ elements: [wood] }, proj).woods).toHaveLength(0)
  })

  it('survives junk without throwing', () => {
    expect(() => parseWorld({ elements: [] }, proj)).not.toThrow()
    expect(() => parseWorld({ elements: [{ type: 'way', id: 1 } as OverpassElement] }, proj)).not.toThrow()
  })
})
