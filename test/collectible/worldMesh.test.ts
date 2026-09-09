import * as THREE from 'three'
import { withPickHitbox } from '../../src/collectible/worldMesh'

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

  it('reuses one shared hitbox geometry rather than allocating one per call', () => {
    const a = withPickHitbox(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    const b = withPickHitbox(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    const hitboxA = a.children[1] as THREE.Mesh
    const hitboxB = b.children[1] as THREE.Mesh
    expect(hitboxA.geometry).toBe(hitboxB.geometry)
  })
})
