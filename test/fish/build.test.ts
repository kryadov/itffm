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

describe('buildFish fins', () => {
  // A live report (2026-09-20): a roach on the meadow showed as a small green
  // oval with huge red spikes. The tail cone was scaled by 1 (a metre) across
  // the fish, and it sat on the blunt end of the body, not the tapered one.
  const sizeOf = (seed: number, age = 0.7) => {
    const g = buildFish(perch, seed, age)
    g.updateMatrixWorld(true)
    return { g, box: new THREE.Box3().setFromObject(g) }
  }
  const lengthOf = (seed: number, age = 0.7) => (buildFish(perch, seed, age).getObjectByName('body') as THREE.Mesh).scale.x * 2

  it('stays a fish-sized thing: no fin sticks out past the body by more than a fraction of its length', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { box } = sizeOf(seed)
      const size = box.getSize(new THREE.Vector3())
      const L = lengthOf(seed)
      expect(size.x, 'long axis').toBeLessThan(L * 1.4)
      expect(size.y, 'height').toBeLessThan(L * 0.6)
      expect(size.z, 'width').toBeLessThan(L * 0.3)
    }
  })

  it('has a flat tail, thin across the fish', () => {
    const tail = buildFish(perch, 3, 1).getObjectByName('tail') as THREE.Mesh
    const size = new THREE.Box3().setFromObject(tail).getSize(new THREE.Vector3())
    expect(size.z).toBeLessThan(size.y * 0.25)
  })

  it('puts the tail on the tapered end of the body, opposite the blunt head', () => {
    const g = buildFish(perch, 3, 1)
    const body = new THREE.Box3().setFromObject(g.getObjectByName('body')!)
    const tail = new THREE.Box3().setFromObject(g.getObjectByName('tail')!)
    // The body narrows toward +x (see buildFish), so that is where the tail goes.
    expect((tail.min.x + tail.max.x) / 2).toBeGreaterThan((body.min.x + body.max.x) / 2)
    expect(tail.max.x).toBeGreaterThan(body.max.x)
  })

  it('has the dorsal fin on top, over the back', () => {
    const g = buildFish(perch, 3, 1)
    const body = new THREE.Box3().setFromObject(g.getObjectByName('body')!)
    const dorsal = new THREE.Box3().setFromObject(g.getObjectByName('dorsal')!)
    expect(dorsal.max.y).toBeGreaterThan(body.max.y)
  })
})
