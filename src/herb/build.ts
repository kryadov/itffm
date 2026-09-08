import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { HerbMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as mushroom/build.ts and berry/build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/**
 * A single herb plant built from its species parameters. Pure and
 * deterministic, the same way buildMushroom and buildBerry are.
 *
 * A herb has no single dimension a forager reads off the way a mushroom's cap
 * does — what varies specimen to specimen is how tall it stands and how full
 * its leaves are, so `size` (drawn once) drives both together, the same
 * one-factor discipline as buildMushroom.
 *
 * @param age 0 young (short, sparse), 1 mature (full height, fullest leaves)
 */
export function buildHerb(m: HerbMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const height = lerp(m.height, size) * MM * (0.5 + age * 0.5)
  const leafLen = lerp(m.leafSize, size) * MM * (0.6 + age * 0.4)
  const count = Math.max(2, Math.round(lerp(m.leafCount, size) * (0.5 + age * 0.5)))

  const stemGeo = new THREE.CylinderGeometry(height * 0.02, height * 0.03, height, 5)
  const stemMat = new THREE.MeshStandardMaterial({ color: m.stemColor, roughness: 1 })
  const stem = new THREE.Mesh(stemGeo, stemMat)
  stem.name = 'stem'
  stem.position.y = height / 2
  group.add(stem)

  // Leaves climb the stem in a loose spiral, each turned outward — reads as
  // foliage from any angle, not a flat fan pointing one way.
  const leafGeo = new THREE.ConeGeometry(leafLen * 0.32, leafLen, 4)
  const leafMat = new THREE.MeshStandardMaterial({ color: m.leafColor, roughness: 1, side: THREE.DoubleSide })
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count)
  leaves.name = 'leaves'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const a = t * Math.PI * 4 + rng() * 0.6
    dummy.position.set(0, height * (0.2 + t * 0.7), 0)
    dummy.rotation.set(0, a, Math.PI / 2 + (rng() - 0.5) * 0.3)
    dummy.position.x += Math.cos(a) * leafLen * 0.45
    dummy.position.z += Math.sin(a) * leafLen * 0.45
    dummy.scale.setScalar(0.85 + rng() * 0.3)
    dummy.updateMatrix()
    leaves.setMatrixAt(i, dummy.matrix)
  }
  group.add(leaves)

  return group
}
