import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { BerryMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as mushroom/build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/**
 * A berry cluster built from its species parameters. Pure and deterministic,
 * the same way buildMushroom is: one seed gives the same cluster everywhere.
 *
 * Unlike a mushroom, a berry cluster has no single "size" a forager reads off
 * — what varies specimen to specimen is how many berries hang together and
 * how they scatter, so those are what `size` (drawn once, like a mushroom's)
 * drives here.
 *
 * @param age 0 young (small, sparse), 1 ripe (full size, fullest cluster)
 */
export function buildBerry(m: BerryMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const berryR = (lerp(m.diameter, 0.4 + size * 0.6) * MM * (0.6 + age * 0.4)) / 2
  const count = Math.round(lerp(m.clusterSize, size) * (0.5 + age * 0.5))

  const berryGeo = new THREE.SphereGeometry(1, 8, 6)
  const berryMat = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.5 })
  const berries = new THREE.InstancedMesh(berryGeo, berryMat, Math.max(1, count))
  berries.name = 'berries'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < berries.count; i++) {
    // A loose ball of berries around a shared centre, not a flat ring — a
    // real cluster reads as a clump seen from any angle.
    const a = rng() * Math.PI * 2
    const el = (rng() - 0.5) * Math.PI * 0.6
    const d = berryR * (1.1 + rng() * 0.9)
    dummy.position.set(
      Math.cos(a) * Math.cos(el) * d,
      berryR * 1.4 + Math.sin(el) * d * 0.6,
      Math.sin(a) * Math.cos(el) * d,
    )
    dummy.scale.setScalar(berryR * (0.82 + rng() * 0.32))
    dummy.updateMatrix()
    berries.setMatrixAt(i, dummy.matrix)
  }
  group.add(berries)

  // A small leaf tuft under the cluster — enough to read as "growing from a
  // plant", not a pile of marbles on the ground.
  const leafGeo = new THREE.ConeGeometry(berryR * 2.2, berryR * 1.6, 5)
  const leafMat = new THREE.MeshStandardMaterial({ color: m.leafColor, roughness: 1, side: THREE.DoubleSide })
  const leaf = new THREE.Mesh(leafGeo, leafMat)
  leaf.name = 'leaf'
  leaf.position.y = berryR * 0.5
  leaf.rotation.x = Math.PI
  group.add(leaf)

  return group
}
