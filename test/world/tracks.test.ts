import * as THREE from 'three'
import {
  footSide, footOffset, fadeScale, sizeJitter, createTrackFx, TRACK_LIFETIME,
} from '../../src/world/tracks'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { mulberry32 } from '../../src/util/rng'

describe('footSide', () => {
  it('alternates left/right every PI of bobPhase', () => {
    expect(footSide(0)).toBe('left')
    expect(footSide(Math.PI + 0.01)).toBe('right')
    expect(footSide(2 * Math.PI + 0.01)).toBe('left')
    expect(footSide(3 * Math.PI + 0.01)).toBe('right')
  })
})

describe('footOffset', () => {
  it('puts left and right on opposite sides of the line of travel', () => {
    const left = footOffset(0, 'left', 0.1)
    const right = footOffset(0, 'right', 0.1)
    expect(left.dz).toBeGreaterThan(0)
    expect(right.dz).toBeLessThan(0)
    expect(left.dx).toBeCloseTo(-right.dx, 6)
  })

  it('is perpendicular to heading, not along it', () => {
    const { dx, dz } = footOffset(0, 'left', 0.2)
    expect(dx).toBeCloseTo(0, 6)
    expect(Math.abs(dz)).toBeCloseTo(0.2, 6)
  })
})

describe('fadeScale', () => {
  it('is 1 while freshly laid', () => {
    expect(fadeScale(45, 45)).toBe(1)
    expect(fadeScale(30, 45)).toBe(1)
  })

  it('shrinks toward 0 near the end of life', () => {
    expect(fadeScale(1, 45)).toBeGreaterThan(0)
    expect(fadeScale(1, 45)).toBeLessThan(0.1)
  })

  it('is exactly 0 once life is spent', () => {
    expect(fadeScale(0, 45)).toBe(0)
  })

  it('never exceeds 1 or drops below 0 across a life', () => {
    for (let l = 0; l <= 45; l += 1) {
      const s = fadeScale(l, 45)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('sizeJitter', () => {
  it('is deterministic for a given rng state', () => {
    expect(sizeJitter(mulberry32(7))).toBe(sizeJitter(mulberry32(7)))
  })

  it('stays within the intended 0.85-1.15 band', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const s = sizeJitter(rand)
      expect(s).toBeGreaterThanOrEqual(0.85)
      expect(s).toBeLessThanOrEqual(1.15)
    }
  })
})

describe('createTrackFx', () => {
  const ground = proceduralTerrain(5)

  it('lays marks on the real ground height', () => {
    const scene = new THREE.Scene()
    const fx = createTrackFx(scene, 1)
    fx.layFoot(ground, 2, 3, 0, 'left')
    fx.update(0)
    const footMesh = scene.getObjectByName('tracks-foot') as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    footMesh.getMatrixAt(0, m)
    const p = new THREE.Vector3().setFromMatrixPosition(m)
    expect(p.y).toBeCloseTo(ground.heightAt(p.x, p.z) + 0.015, 3)
  })

  it('fades a mark out after its lifetime and can be disabled/reset', () => {
    const scene = new THREE.Scene()
    const fx = createTrackFx(scene, 1)
    fx.layBike(ground, 0, 0, 0)
    fx.update(TRACK_LIFETIME.bike + 1)
    const bikeMesh = scene.getObjectByName('tracks-bike') as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    bikeMesh.getMatrixAt(0, m)
    const scale = new THREE.Vector3().setFromMatrixScale(m)
    expect(scale.length()).toBeCloseTo(0, 3)

    fx.layAnimal(ground, 'hare', 1, 1, 0)
    fx.setEnabled(false)
    const hareMesh = scene.getObjectByName('tracks-hare') as THREE.InstancedMesh
    hareMesh.getMatrixAt(0, m)
    const s2 = new THREE.Vector3().setFromMatrixScale(m)
    expect(s2.length()).toBeCloseTo(0, 3)
  })
})
