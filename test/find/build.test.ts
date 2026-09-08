import * as THREE from 'three'
import { buildFind } from '../../src/find/build'
import type { FindMorphology } from '../../src/species/schema'

const stone: FindMorphology = {
  color: '#9a9a92',
  size: [30, 90],
  material: 'кварц или кремень',
}

describe('buildFind', () => {
  it('gives the same object for the same seed', () => {
    const a = buildFind(stone, 123, 0.5)
    const b = buildFind(stone, 123, 0.5)
    const posA = (a.getObjectByName('object') as THREE.Mesh).geometry.attributes.position.array
    const posB = (b.getObjectByName('object') as THREE.Mesh).geometry.attributes.position.array
    expect(posA).toEqual(posB)
  })

  it('gives a different object for a different seed', () => {
    const a = buildFind(stone, 1, 0.5)
    const b = buildFind(stone, 2, 0.5)
    const posA = (a.getObjectByName('object') as THREE.Mesh).geometry.attributes.position.array
    const posB = (b.getObjectByName('object') as THREE.Mesh).geometry.attributes.position.array
    expect(posA).not.toEqual(posB)
  })

  it('always builds one object', () => {
    const g = buildFind(stone, 5, 0.5)
    expect(g.getObjectByName('object')).toBeDefined()
  })

  it('stays a plausible size: centimetres, not a metre', () => {
    const box = new THREE.Box3().setFromObject(buildFind(stone, 9, 1))
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.2)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.001)
  })
})
