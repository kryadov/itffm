import { forestQuery } from '../../src/geo/overpass'
import { bboxKey } from '../../src/geo/cache'

const box = { south: 55.7, west: 37.6, north: 55.8, east: 37.7 }

describe('forestQuery', () => {
  const q = forestQuery(box)

  it('asks for the wood itself', () => {
    expect(q).toContain('"natural"="wood"')
    expect(q).toContain('"landuse"="forest"')
  })

  it('asks for the open ground between the woods', () => {
    for (const tag of ['scrub', 'grassland', 'sand', 'wetland']) expect(q).toContain(tag)
  })

  it('asks for water, paths, mapped trees and cave entrances', () => {
    expect(q).toContain('"natural"="water"')
    expect(q).toContain('"highway"')
    expect(q).toContain('node["natural"="tree"]')
    expect(q).toContain('cave_entrance')
  })

  it('does not ask for the city: buildings and carriageways are not our business', () => {
    expect(q).not.toContain('"building"')
    expect(q).not.toContain('motorway')
  })

  it('covers the bbox and carries a server-side timeout', () => {
    expect(q).toContain('55.7,37.6,55.8,37.7')
    expect(q).toMatch(/\[timeout:\d+\]/)
  })
})

describe('bboxKey', () => {
  it('is stable for the same box and query', () => {
    expect(bboxKey(box, 'q')).toBe(bboxKey(box, 'q'))
  })

  it('changes when the area changes', () => {
    expect(bboxKey(box, 'q')).not.toBe(bboxKey({ ...box, north: 55.9 }, 'q'))
  })

  it('changes when the query changes', () => {
    // Otherwise a place cached before we started asking for wetlands would go
    // on serving the old, wetland-less answer for good.
    expect(bboxKey(box, 'q')).not.toBe(bboxKey(box, 'q2'))
  })
})
