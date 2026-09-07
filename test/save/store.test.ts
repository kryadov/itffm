import { emptySave, applyFind, type Find } from '../../src/save/store'

const find = (id: string, at = 1000): Find => ({ speciesId: id, x: 1, z: 2, at })

describe('applyFind', () => {
  it('opens a species on the first find', () => {
    const s = applyFind(emptySave(), find('boletus-edulis'))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('does not open the same species twice', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('records every find all the same', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.finds).toHaveLength(2)
  })

  it('keeps the order species were first found in', () => {
    let s = applyFind(emptySave(), find('amanita-muscaria'))
    s = applyFind(s, find('boletus-edulis'))
    expect(s.discovered).toEqual(['amanita-muscaria', 'boletus-edulis'])
  })

  it('leaves the original save untouched', () => {
    const before = emptySave()
    applyFind(before, find('boletus-edulis'))
    expect(before.discovered).toHaveLength(0)
  })

  it('starts from a valid empty save', () => {
    const s = emptySave()
    expect(s.discovered).toEqual([])
    expect(s.finds).toEqual([])
    expect(s.disclaimerSeen).toBe(false)
  })
})
