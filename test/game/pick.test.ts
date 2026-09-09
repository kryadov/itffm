import * as THREE from 'three'
import { createBasket, nearestInView } from '../../src/game/pick'
import { withPickHitbox } from '../../src/collectible/worldMesh'
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

  // A berry/nut/find is real-world millimetres across — far too small for a
  // bare exact ray to land on reliably. Two earlier approaches tried to
  // patch this with a second, angular aim-forgiveness code path for small
  // objects and both went through live regressions (see TODO.md,
  // 2026-09-09) — the actual fix is `withPickHitbox`, which gives the small
  // object itself a real, exact-ray-sized target, so it needs no separate
  // aiming logic here at all: it is just another entry in `objects`.
  describe('small collectibles (via withPickHitbox)', () => {
    const tinyBerry = (x: number, z: number): THREE.Object3D => {
      // The real visible geometry is a speck — a single, barely-there
      // triangle — deliberately too small for a bare exact ray to land on,
      // so any pass here is entirely down to the hitbox withPickHitbox adds.
      const speck = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
      const wrapped = withPickHitbox(speck)
      wrapped.position.set(x, 0, z)
      wrapped.userData.placement = item('vaccinium-myrtillus')
      wrapped.updateMatrixWorld(true)
      return wrapped
    }

    it('finds a tiny collectible dead ahead that its own bare geometry could never catch', () => {
      const b = tinyBerry(0, -3)
      expect(nearestInView(camera, [b], 10)).toBe(b)
    })

    it('still respects the given distance', () => {
      const b = tinyBerry(0, -3)
      expect(nearestInView(camera, [b], 2)).toBe(null)
    })

    it('stays hidden behind a real occluder in front of it, same as a mushroom', () => {
      const b = tinyBerry(0, -3)
      const grassBlade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
      grassBlade.position.set(0, 0, -1)
      grassBlade.updateMatrixWorld(true)
      expect(nearestInView(camera, [b], 10, [grassBlade])).toBe(null)
    })

    it('tells apart two real specimens from the same clustered colony, standing centimetres apart', () => {
      // A clustered colony packs several real specimens within centimetres
      // of each other (ecology/spawn.ts's COLONY_SPREAD) — one neighbour
      // sitting nearby must never be mistaken for the one actually dead
      // ahead of the crosshair.
      const target = tinyBerry(0, -3)
      const neighbour = tinyBerry(0.4, -3)
      expect(nearestInView(camera, [target, neighbour], 10)).toBe(target)
    })
  })

  // Touch has no crosshair worth centring on (game/touchControls.ts) — a tap
  // lands wherever the player's own finger is, not the middle of the screen.
  describe('an off-centre screen point (touch tap)', () => {
    it('finds nothing at screen centre when the object sits off to one side', () => {
      const m = mushroom(-3)
      m.position.x = 2
      m.updateMatrixWorld(true)
      expect(nearestInView(camera, [m], 10)).toBe(null)
    })

    it('finds that same off-centre object once the ray is aimed at its own screen point', () => {
      const m = mushroom(-3)
      m.position.x = 2
      m.updateMatrixWorld(true)
      // Where a mushroom 2m right of the camera, 3m out, actually projects in
      // NDC — worked out from the same projection nearestInView itself uses,
      // not guessed: project the world point through the camera.
      const ndc = new THREE.Vector3(2, 0, -3).project(camera)
      expect(nearestInView(camera, [m], 10, [], new THREE.Vector2(ndc.x, ndc.y))).toBe(m)
    })
  })
})
