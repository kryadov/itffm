import * as THREE from 'three'
import { buildHerb } from '../../src/herb/build'
import type { HerbMorphology } from '../../src/species/schema'

const krapiva: HerbMorphology = {
  stemColor: '#4a6b3a',
  leafColor: '#3f6b2c',
  height: [400, 1500],
  leafSize: [60, 150],
  leafCount: [8, 20],
}

describe('buildHerb', () => {
  it('gives the same plant for the same seed', () => {
    const a = buildHerb(krapiva, 123, 0.8)
    const b = buildHerb(krapiva, 123, 0.8)
    const posA = (a.getObjectByName('leaves') as THREE.InstancedMesh).instanceMatrix.array
    const posB = (b.getObjectByName('leaves') as THREE.InstancedMesh).instanceMatrix.array
    expect(posA).toEqual(posB)
  })

  it('gives a different plant for a different seed', () => {
    const a = buildHerb(krapiva, 1, 0.8)
    const b = buildHerb(krapiva, 2, 0.8)
    const posA = (a.getObjectByName('leaves') as THREE.InstancedMesh).instanceMatrix.array
    const posB = (b.getObjectByName('leaves') as THREE.InstancedMesh).instanceMatrix.array
    expect(posA).not.toEqual(posB)
  })

  it('always builds a stem and at least two leaves', () => {
    const g = buildHerb(krapiva, 5, 0.5)
    expect(g.getObjectByName('stem')).toBeDefined()
    expect((g.getObjectByName('leaves') as THREE.InstancedMesh).count).toBeGreaterThanOrEqual(2)
  })

  it('grows fuller leaves as it matures', () => {
    let young = 0
    let mature = 0
    for (let seed = 0; seed < 40; seed++) {
      young += (buildHerb(krapiva, seed, 0).getObjectByName('leaves') as THREE.InstancedMesh).count
      mature += (buildHerb(krapiva, seed, 1).getObjectByName('leaves') as THREE.InstancedMesh).count
    }
    expect(mature).toBeGreaterThan(young)
  })

  it('stays a plausible size: tens of centimetres, not metres', () => {
    const box = new THREE.Box3().setFromObject(buildHerb(krapiva, 9, 1))
    const size = box.getSize(new THREE.Vector3())
    expect(size.y).toBeLessThan(2)
    expect(size.y).toBeGreaterThan(0.01)
  })
})
