import * as THREE from 'three'
import { buildFish } from '../../src/fish/build'
import type { FishMorphology } from '../../src/species/schema'

const perch: FishMorphology = {
  bodyColor: '#4a6b3a',
  bellyColor: '#d8d0a0',
  finColor: '#8a2f2f',
  length: [150, 350],
}

describe('buildFish', () => {
  it('gives the same fish for the same seed', () => {
    const a = buildFish(perch, 5, 0.8)
    const b = buildFish(perch, 5, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).scale
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).scale
    expect(bodyA).toEqual(bodyB)
  })

  it('gives a different fish for a different seed', () => {
    const a = buildFish(perch, 1, 0.8)
    const b = buildFish(perch, 2, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).scale
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).scale
    expect(bodyA).not.toEqual(bodyB)
  })

  it('builds a body, a tail and a dorsal fin', () => {
    const g = buildFish(perch, 3, 1)
    expect(g.getObjectByName('body')).toBeDefined()
    expect(g.getObjectByName('tail')).toBeDefined()
    expect(g.getObjectByName('dorsal')).toBeDefined()
  })

  it('keeps sane, non-chimeric proportions — longer than it is tall or wide', () => {
    for (let seed = 0; seed < 20; seed++) {
      const body = buildFish(perch, seed, 0.7).getObjectByName('body') as THREE.Mesh
      expect(body.scale.x).toBeGreaterThan(body.scale.y)
      expect(body.scale.x).toBeGreaterThan(body.scale.z)
    }
  })

  it('grows longer as it matures', () => {
    let youngTotal = 0
    let grownTotal = 0
    for (let seed = 0; seed < 20; seed++) {
      youngTotal += (buildFish(perch, seed, 0).getObjectByName('body') as THREE.Mesh).scale.x
      grownTotal += (buildFish(perch, seed, 1).getObjectByName('body') as THREE.Mesh).scale.x
    }
    expect(grownTotal).toBeGreaterThan(youngTotal)
  })

  it('stays within the species length range (in scene metres)', () => {
    const MM = 0.001
    for (let seed = 0; seed < 20; seed++) {
      const body = buildFish(perch, seed, 1).getObjectByName('body') as THREE.Mesh
      const lengthM = body.scale.x * 2
      expect(lengthM).toBeGreaterThanOrEqual(perch.length[0] * MM * 0.5)
      expect(lengthM).toBeLessThanOrEqual(perch.length[1] * MM * 1.01)
    }
  })
})
