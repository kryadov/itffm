import * as THREE from 'three'
import { buildCollectible } from '../collectible/build'
import type { Species } from '../species/schema'

/**
 * A snapshot of one specimen: the same generator as in the wood or the
 * basket, rendered once to an image.
 *
 * A live renderer per card would sink the browser, but a snapshot will not —
 * and the mushroom (or berry, or nut...) on the card is exactly the one the
 * player will meet, or already collected.
 */
export function renderCollectiblePreview(
  species: Species,
  seed: number,
  age: number,
  size: number,
  silhouette: boolean,
): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(size, size)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(1, 2, 1.5)
  scene.add(key)

  const model = buildCollectible(species, seed, age)
  if (silhouette) {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = new THREE.MeshBasicMaterial({ color: 0x252c21 })
    })
  }
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  scene.add(model)

  const extent = Math.max(...box.getSize(new THREE.Vector3()).toArray())
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10)
  camera.position.set(extent * 1.5, extent * 0.85, extent * 1.5)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL()
  renderer.dispose()
  return url
}
