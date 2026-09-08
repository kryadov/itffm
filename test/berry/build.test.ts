import * as THREE from 'three'
import { buildBerry } from '../../src/berry/build'
import type { BerryMorphology } from '../../src/species/schema'

const chernika: BerryMorphology = {
  color: '#2a2f6b',
  diameter: [6, 10],
  clusterSize: [3, 8],
  leafColor: '#3f5a2c',
}

describe('buildBerry', () => {
  it('gives the same cluster for the same seed', () => {
    const a = buildBerry(chernika, 123, 0.8)
    const b = buildBerry(chernika, 123, 0.8)
    const posA = (a.getObjectByName('berries') as THREE.InstancedMesh).instanceMatrix.array
    const posB = (b.getObjectByName('berries') as THREE.InstancedMesh).instanceMatrix.array
    expect(posA).toEqual(posB)
  })

  it('gives a different cluster for a different seed', () => {
    const a = buildBerry(chernika, 1, 0.8)
    const b = buildBerry(chernika, 2, 0.8)
    const posA = (a.getObjectByName('berries') as THREE.InstancedMesh).instanceMatrix.array
    const posB = (b.getObjectByName('berries') as THREE.InstancedMesh).instanceMatrix.array
    expect(posA).not.toEqual(posB)
  })

  it('always builds at least one berry and a leaf', () => {
    const g = buildBerry(chernika, 5, 0.5)
    expect(g.getObjectByName('berries')).toBeDefined()
    expect((g.getObjectByName('berries') as THREE.InstancedMesh).count).toBeGreaterThan(0)
    expect(g.getObjectByName('leaf')).toBeDefined()
  })

  it('grows a fuller cluster as it ripens', () => {
    let young = 0
    let ripe = 0
    for (let seed = 0; seed < 40; seed++) {
      young += (buildBerry(chernika, seed, 0).getObjectByName('berries') as THREE.InstancedMesh).count
      ripe += (buildBerry(chernika, seed, 1).getObjectByName('berries') as THREE.InstancedMesh).count
    }
    expect(ripe).toBeGreaterThan(young)
  })

  it('stays a plausible size: a few centimetres, not a metre', () => {
    const box = new THREE.Box3().setFromObject(buildBerry(chernika, 9, 1))
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.1)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.001)
  })
})
