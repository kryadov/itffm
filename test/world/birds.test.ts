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

  it('flies head first — its body points the way it is going', () => {
    // It used to be drawn facing (cos h, -sin h) while it flew (cos h, sin h):
    // sideways or tail-first at most headings.
    const { scene, birds } = build(4)
    const body = scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const at = (i: number): THREE.Vector3 => {
      body.getMatrixAt(i, m)
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    birds.update(1 / 20, 0, 0) // the first frame places the flock
    let prev = Array.from({ length: body.count }, (_, i) => at(i))
    let checked = 0
    for (let step = 0; step < 3000; step++) {
      birds.update(1 / 20, 0, 0)
      for (let i = 0; i < body.count; i++) {
        const now = at(i)
        const move = now.clone().sub(prev[i]).setY(0)
        prev[i] = now
        // Only a real flight step: a perched bird's shuffle rocks back and forth.
        if (move.length() < 0.2) continue
        m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
        const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize()
        expect(facing.dot(move.normalize())).toBeGreaterThan(0.8)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('hides the flock when disabled', () => {
    const { scene, birds } = build(1)
    birds.setEnabled(false)
    expect(scene.getObjectByName('birds')!.visible).toBe(false)
  })

  it('positions() matches where each bird was actually rendered', () => {
    const { scene, birds } = build(4)
    birds.update(1 / 30, 5, -3)
    const body = scene.getObjectByName('birds')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const reported = birds.positions()
    expect(reported).toHaveLength(4)
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      expect(reported[i].x).toBeCloseTo(pos.x, 5)
      expect(reported[i].y).toBeCloseTo(pos.y, 5)
      expect(reported[i].z).toBeCloseTo(pos.z, 5)
    }
  })

  it('disposes without throwing', () => {
    const { scene, birds } = build(1)
    expect(() => birds.dispose()).not.toThrow()
    expect(scene.getObjectByName('birds')).toBeUndefined()
  })
})
