import * as THREE from 'three'
import { buildBerry } from '../../src/berry/build'
import type { BerryMorphology } from '../../src/species/schema'

const chernika: BerryMorphology = {
  color: '#2a2f6b',
  diameter: [6, 10],
  clusterSize: [3, 8],
  leafColor: '#3f5a2c',
  bushHeight: [250, 400],
}

const cloudberry: BerryMorphology = {
  color: '#e8a53d',
  diameter: [12, 18],
  clusterSize: [1, 1],
  leafColor: '#5a6b3a',
  bushHeight: [120, 220],
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

  it('always builds at least one berry on at least one stem', () => {
    const g = buildBerry(chernika, 5, 0.5)
    const berries = g.getObjectByName('berries') as THREE.InstancedMesh
    expect(berries).toBeDefined()
    expect(berries.count).toBeGreaterThan(0)
    const stemCount = g.children.filter((c) => c instanceof THREE.Mesh && c.geometry.type === 'CylinderGeometry').length
    expect(stemCount).toBeGreaterThan(0)
  })

  it('builds a single stem for a species whose clusterSize never exceeds one', () => {
    // Cloudberry: one berry per stem, not a shrub's many-branched cluster.
    const g = buildBerry(cloudberry, 7, 1)
    const berries = g.getObjectByName('berries') as THREE.InstancedMesh
    expect(berries.count).toBe(1)
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

  it('stays a plausible bush size: tens of centimetres, not metres', () => {
    const box = new THREE.Box3().setFromObject(buildBerry(chernika, 9, 1))
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.6)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.05)
  })

  it('gives a low creeping species a visibly shorter bush than a knee-high one', () => {
    const low: BerryMorphology = { ...chernika, bushHeight: [70, 90] }
    const tall: BerryMorphology = { ...chernika, bushHeight: [350, 400] }
    const lowBox = new THREE.Box3().setFromObject(buildBerry(low, 3, 1))
    const tallBox = new THREE.Box3().setFromObject(buildBerry(tall, 3, 1))
    expect(tallBox.getSize(new THREE.Vector3()).y).toBeGreaterThan(lowBox.getSize(new THREE.Vector3()).y)
  })
})
