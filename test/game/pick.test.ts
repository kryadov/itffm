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
})
