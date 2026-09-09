import * as THREE from 'three'
import { createBasket, nearestInView } from '../../src/game/pick'
import type { Placement } from '../../src/ecology/spawn'

const item = (id: string): Placement => ({
  speciesId: id,
  x: 0,
  z: 0,
  y: 0,
  rotationY: 0,
  age: 0.5,
  seed: 1,
})

describe('createBasket', () => {
  it('starts empty', () => {
    expect(createBasket().items).toHaveLength(0)
  })

  it('takes mushrooms', () => {
    const b = createBasket()
    expect(b.add(item('boletus-edulis'))).toBe(true)
    expect(b.items).toHaveLength(1)
  })

  it('fills up and then refuses more', () => {
    const b = createBasket(2)
    b.add(item('a'))
    b.add(item('b'))
    expect(b.full).toBe(true)
    expect(b.add(item('c'))).toBe(false)
    expect(b.items).toHaveLength(2)
  })

  it('keeps the same mushroom twice — a basket is not a checklist', () => {
    const b = createBasket()
    b.add(item('boletus-edulis'))
    b.add(item('boletus-edulis'))
    expect(b.items).toHaveLength(2)
  })
})

describe('nearestInView', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 300)
  camera.position.set(0, 0, 0)
  camera.updateMatrixWorld(true)

  const mushroom = (z: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    m.position.set(0, 0, z)
    m.userData.placement = item('boletus-edulis')
    m.updateMatrixWorld(true)
    return m
  }

  it('finds a mushroom straight ahead within reach', () => {
    const m = mushroom(-3)
    expect(nearestInView(camera, [m], 10)).toBe(m)
  })

  it('sees nothing beyond the given distance', () => {
    const m = mushroom(-3)
    expect(nearestInView(camera, [m], 2)).toBe(null)
  })

  it('is hidden behind an occluder standing in front of it', () => {
    const m = mushroom(-3)
    const grassBlade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    grassBlade.position.set(0, 0, -1)
    grassBlade.updateMatrixWorld(true)
    expect(nearestInView(camera, [m], 10, [grassBlade])).toBe(null)
  })

  it('is found once nothing stands between the camera and it', () => {
    const m = mushroom(-3)
    const grassBlade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    grassBlade.position.set(5, 5, 5)
    grassBlade.updateMatrixWorld(true)
    expect(nearestInView(camera, [m], 10, [grassBlade])).toBe(m)
  })

  // A berry/nut/find is real-world millimetres across — far too small for the
  // exact ray above to land on reliably — so it gets a forgiving aim cone
  // instead (see TODO.md, 2026-09-08).
  describe('small-object fallback', () => {
    const tinyBerry = (x: number, z: number): THREE.Object3D => {
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      g.userData.placement = item('vaccinium-myrtillus')
      g.updateMatrixWorld(true)
      return g
    }

    it('finds a tiny object the exact ray missed, straight ahead', () => {
      const b = tinyBerry(0, -3)
      expect(nearestInView(camera, [], 10, [], [b])).toBe(b)
    })

    it('ignores a tiny object well outside the aim cone', () => {
      const b = tinyBerry(3, -3)
      expect(nearestInView(camera, [], 10, [], [b])).toBe(null)
    })

    it('ignores a tiny object beyond the given distance', () => {
      const b = tinyBerry(0, -3)
      expect(nearestInView(camera, [], 2, [], [b])).toBe(null)
    })

    it('prefers an exact hit over the small-object cone', () => {
      const m = mushroom(-3)
      const b = tinyBerry(0, -3)
      expect(nearestInView(camera, [m], 10, [], [b])).toBe(m)
    })

    it('still falls through to the cone when the only thing the exact ray hit was bare grass', () => {
      // A berry grows IN the grass around it, not behind a bush — bare
      // occluder with no real target anywhere on the ray must not shadow the
      // cone fallback, or it would almost never fire for exactly the small
      // objects it exists for (see TODO.md, 2026-09-08 live report).
      const b = tinyBerry(0, -3)
      const grassBlade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
      grassBlade.position.set(0, 0, -1)
      grassBlade.updateMatrixWorld(true)
      expect(nearestInView(camera, [], 10, [grassBlade], [b])).toBe(b)
    })

    it('still finds an off-axis berry when a different real specimen from the same clustered colony sits further along the exact ray', () => {
      // A clustered colony packs several real specimens within centimetres
      // of each other (ecology/spawn.ts's COLONY_SPREAD). Grass at z=-1
      // blocks the exact ray first; a DIFFERENT real berry from the same
      // colony (real geometry, not the one being aimed at) happens to sit
      // further along that same ray at z=-3 — neither should stop the
      // off-axis target from being found through the cone (2026-09-09 live
      // report: this exact shape of scene made almost every berry
      // unreachable except when it happened to be alone).
      const grazed = mushroom(-3)
      grazed.userData.placement = item('vaccinium-myrtillus')
      const grassBlade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
      grassBlade.position.set(0, 0, -1)
      grassBlade.updateMatrixWorld(true)
      const target = tinyBerry(0.3, -3)
      expect(nearestInView(camera, [grazed], 10, [grassBlade], [target])).toBe(target)
    })

    it('picks the nearer of two tiny objects both inside the cone', () => {
      const near = tinyBerry(0, -2)
      const far = tinyBerry(0, -5)
      expect(nearestInView(camera, [], 10, [], [far, near])).toBe(near)
    })
  })
})
