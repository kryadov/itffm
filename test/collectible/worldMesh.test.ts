import * as THREE from 'three'
import { withPickHitbox, HITBOX_RADIUS, buildLodProxy, buildCollectibleLod, LOD_DISTANCE } from '../../src/collectible/worldMesh'

/** A stand-in for a toWorldMesh() output: baked per-vertex colour, roughly
 *  mushroom-cap-sized, with enough geometry that a cheap proxy is worth it. */
function coloredMesh(color: THREE.Color, radius = 0.05, height = 0.08): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 12, 4)
  const count = geo.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }))
}

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

describe('buildLodProxy', () => {
  it('is far cheaper than the mesh it stands in for', () => {
    const full = coloredMesh(new THREE.Color(0.8, 0.6, 0.2))
    const proxy = buildLodProxy(full)
    const fullCount = full.geometry.getAttribute('position').count
    const proxyCount = proxy.geometry.getAttribute('position').count
    expect(proxyCount).toBeLessThan(fullCount)
    expect(proxyCount).toBeLessThanOrEqual(40)
  })

  it('fills roughly the same footprint as the mesh it replaces', () => {
    // Both built at local origin — game/scene.ts places the LOD wrapper in
    // the world, not the mesh inside it, the same way it always placed the
    // plain merged mesh before LOD existed.
    const full = coloredMesh(new THREE.Color(1, 1, 1), 0.05, 0.08)
    full.updateMatrixWorld(true)
    const proxy = buildLodProxy(full)

    const fullBox = new THREE.Box3().setFromObject(full)
    const proxyBox = new THREE.Box3().setFromObject(proxy)
    const fullCenter = fullBox.getCenter(new THREE.Vector3())
    const proxyCenter = proxyBox.getCenter(new THREE.Vector3())
    expect(proxyCenter.distanceTo(fullCenter)).toBeLessThan(0.03)

    const fullSize = fullBox.getSize(new THREE.Vector3())
    const proxySize = proxyBox.getSize(new THREE.Vector3())
    expect(proxySize.y).toBeGreaterThan(fullSize.y * 0.7)
    expect(proxySize.y).toBeLessThan(fullSize.y * 1.3)
  })

  it('takes on the mesh\'s own baked colour rather than a fixed placeholder', () => {
    const red = coloredMesh(new THREE.Color(0.9, 0.1, 0.1))
    const redProxy = buildLodProxy(red)
    const redMat = redProxy.material as THREE.MeshLambertMaterial
    expect(redMat.color.r).toBeGreaterThan(redMat.color.g)
    expect(redMat.color.r).toBeGreaterThan(redMat.color.b)

    const green = coloredMesh(new THREE.Color(0.1, 0.9, 0.1))
    const greenProxy = buildLodProxy(green)
    const greenMat = greenProxy.material as THREE.MeshLambertMaterial
    expect(greenMat.color.g).toBeGreaterThan(greenMat.color.r)
    expect(greenMat.color.g).toBeGreaterThan(greenMat.color.b)
  })

  it('does not paint per vertex — a proxy this small is not worth the attribute', () => {
    const proxy = buildLodProxy(coloredMesh(new THREE.Color(0.5, 0.5, 0.5)))
    const mat = proxy.material as THREE.MeshLambertMaterial
    expect(mat.vertexColors).toBe(false)
  })
})

describe('buildCollectibleLod', () => {
  it('shows the real mesh up close and the cheap proxy beyond LOD_DISTANCE', () => {
    const full = coloredMesh(new THREE.Color(0.4, 0.7, 0.3))
    const lod = buildCollectibleLod(full)
    expect(lod).toBeInstanceOf(THREE.LOD)
    expect(lod.levels).toHaveLength(2)
    expect(lod.levels[0].object).toBe(full)
    expect(lod.levels[0].distance).toBe(0)
    expect(lod.levels[1].object).not.toBe(full)
    expect(lod.levels[1].distance).toBe(LOD_DISTANCE)
  })

  it('actually swaps which child is visible as the camera moves away', () => {
    const full = coloredMesh(new THREE.Color(0.4, 0.7, 0.3))
    const lod = buildCollectibleLod(full)
    lod.updateMatrixWorld(true)

    const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 300)
    camera.position.set(0, 0, 0)
    camera.updateMatrixWorld(true)
    lod.update(camera)
    expect(full.visible).toBe(true)

    camera.position.set(0, 0, LOD_DISTANCE + 5)
    camera.updateMatrixWorld(true)
    lod.update(camera)
    expect(full.visible).toBe(false)
  })
})
