import * as THREE from 'three'
import { withPickHitbox, HITBOX_RADIUS } from '../../src/collectible/worldMesh'

describe('withPickHitbox', () => {
  it('wraps the given mesh as a child of a new group', () => {
    const speck = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
    const wrapped = withPickHitbox(speck)
    expect(wrapped).toBeInstanceOf(THREE.Group)
    expect(wrapped.children).toContain(speck)
  })

  it('adds an invisible hitbox that never draws but still raycasts', () => {
    const speck = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
    const wrapped = withPickHitbox(speck)
    const hitbox = wrapped.children.find((c) => c !== speck) as THREE.Mesh
    expect(hitbox).toBeDefined()
    expect(hitbox.visible).toBe(true)
    const mat = hitbox.material as THREE.MeshBasicMaterial
    expect(mat.opacity).toBe(0)
    expect(mat.colorWrite).toBe(false)
  })

  it('is hit by a ray the wrapped speck alone could never catch', () => {
    const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 300)
    camera.position.set(0, 0, 0)
    camera.updateMatrixWorld(true)

    const speck = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
    const wrapped = withPickHitbox(speck)
    wrapped.position.set(0, 0, -3)
    wrapped.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(raycaster.intersectObject(wrapped, true).length).toBeGreaterThan(0)
  })

  it('never shrinks the hitbox below the floor radius for a tiny model', () => {
    const speck = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
    const wrapped = withPickHitbox(speck)
    const hitbox = wrapped.children.find((c) => c !== speck) as THREE.Mesh
    const sphere = hitbox.geometry as THREE.SphereGeometry
    expect(sphere.parameters.radius).toBeCloseTo(HITBOX_RADIUS, 5)
  })

  it('grows the hitbox to cover a model bigger than the floor radius, centred on it', () => {
    // A berry bush (berry/build.ts) stands up to ~0.4m tall — the hitbox
    // must reach that whole height, not just a small sphere at its base
    // (2026-09-09 live report: a fixed sphere at ground level covered only
    // the bottom third of a knee-high bush).
    const tall = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05))
    tall.position.y = 0.2 // sitting on the ground, not straddling it
    const wrapped = withPickHitbox(tall)
    const hitbox = wrapped.children.find((c) => c !== tall) as THREE.Mesh
    const sphere = hitbox.geometry as THREE.SphereGeometry
    expect(sphere.parameters.radius).toBeGreaterThan(HITBOX_RADIUS)
    expect(hitbox.position.y).toBeCloseTo(0.2, 5)
  })
})
