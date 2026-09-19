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

  it('is a bike seen from the side: long along x, narrow across z, resting on the ground', () => {
    // The first version turned the wheels a quarter turn about y, so they stood
    // across the bike instead of along it and the whole thing read as two loose
    // rings (live report, 2026-09-19).
    const size = new THREE.Box3().setFromObject(buildBikeModel()).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(1.0)
    expect(size.z).toBeLessThan(size.x / 2)
    expect(size.y).toBeGreaterThan(0.8)
    expect(size.y).toBeLessThan(1.1)
  })

  it('has its wheels touching y = 0 and two of them, spaced a wheelbase apart', () => {
    const group = buildBikeModel()
    expect(new THREE.Box3().setFromObject(group).min.y).toBeCloseTo(0, 5)
    const wheels: THREE.Object3D[] = []
    group.traverse((c) => {
      if (c.name === 'wheel') wheels.push(c)
    })
    expect(wheels).toHaveLength(2)
    expect(Math.abs(wheels[0].position.x - wheels[1].position.x)).toBeGreaterThan(0.9)
  })
})
