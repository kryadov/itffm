import * as THREE from 'three'
import { buildAxeModel, buildLampModel, buildRodModel, buildBikeModel } from '../../src/world/questItemModels'

function meshCount(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) n++
  })
  return n
}

describe('buildAxeModel', () => {
  it('has a haft and a distinct head, not one plain shape', () => {
    const group = buildAxeModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(2)
    expect(group.getObjectByName('head')).toBeDefined()
  })
})

describe('buildLampModel', () => {
  it('has a chimney whose material the caller can drive independently', () => {
    const { group, chimneyMat } = buildLampModel()
    const chimney = group.getObjectByName('chimney') as THREE.Mesh
    expect(chimney).toBeDefined()
    expect(chimney.material).toBe(chimneyMat)
  })
})

describe('buildRodModel', () => {
  it('has a pole and a reel', () => {
    const group = buildRodModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(2)
  })
})

describe('buildBikeModel', () => {
  it('has two wheels plus a frame', () => {
    const group = buildBikeModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(5)
  })
})
