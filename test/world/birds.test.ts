import * as THREE from 'three'
import { createBirds, pickPlumage } from '../../src/world/birds'
import { mulberry32 } from '../../src/util/rng'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('pickPlumage', () => {
  it('is deterministic for the same draw', () => {
    expect(pickPlumage(() => 0.5)).toBe(pickPlumage(() => 0.5))
  })

  it('gives the white crow only on the low slice of the roll', () => {
    expect(pickPlumage(() => 0)).toBe(0xe9e6dd)
    expect(pickPlumage(() => 0.999)).not.toBe(0xe9e6dd)
  })

  it('always returns a valid hex colour', () => {
    for (let i = 0; i < 50; i++) {
      const c = pickPlumage(mulberry32(i))
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(0xffffff)
    }
  })
})

describe('createBirds', () => {
  const build = (seed: number) => {
    const scene = new THREE.Scene()
    const birds = createBirds(scene, mulberry32(seed), 4, flat)
    return { scene, birds }
  }

  it('adds one named group to the scene', () => {
    const { scene } = build(1)
    expect(scene.getObjectByName('birds')).toBeDefined()
  })

  it('gives the same flock for the same seed', () => {
    const a = build(1)
    const b = build(1)
    a.birds.update(1 / 30, 0, 0)
    b.birds.update(1 / 30, 0, 0)
    const bodyA = a.scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    const bodyB = b.scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    expect(bodyA.instanceMatrix.array).toEqual(bodyB.instanceMatrix.array)
  })

  it('gives a different flock for a different seed', () => {
    const a = build(1)
    const b = build(2)
    a.birds.update(1 / 30, 0, 0)
    b.birds.update(1 / 30, 0, 0)
    const bodyA = a.scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    const bodyB = b.scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    expect(bodyA.instanceMatrix.array).not.toEqual(bodyB.instanceMatrix.array)
  })

  it('keeps every bird a finite, real position after a long run', () => {
    const { scene, birds } = build(3)
    let x = 0
    let z = 0
    for (let i = 0; i < 2000; i++) {
      x += 0.05
      birds.update(1 / 20, x, z)
    }
    const body = scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
      expect(Number.isFinite(pos.z)).toBe(true)
    }
  })

  it('hides the flock when disabled', () => {
    const { scene, birds } = build(1)
    birds.setEnabled(false)
    expect(scene.getObjectByName('birds')!.visible).toBe(false)
  })

  it('disposes without throwing', () => {
    const { scene, birds } = build(1)
    expect(() => birds.dispose()).not.toThrow()
    expect(scene.getObjectByName('birds')).toBeUndefined()
  })
})
