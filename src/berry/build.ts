import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { BerryMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as mushroom/build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/** A woody twig colour shared by every berry species — bark reads the same
 *  brown regardless of which berry or leaf it carries, and morphology.ts
 *  already has enough per-species colour fields without adding one more for
 *  a detail nobody looks that closely at. */
const STEM_COLOR = 0x5a4a30

const berryGeo = new THREE.SphereGeometry(1, 8, 6)
const leafGeo = new THREE.ConeGeometry(1, 1, 5)

/** Positions and orients a unit-height cylinder mesh to run from `from` to
 *  `to` — the one piece of vector math a believable branch needs and a bare
 *  `position`/`rotation` pair cannot express directly. */
function orientAlong(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  mesh.scale.y = len
  mesh.position.copy(from).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
}

/**
 * A berry bush built from its species parameters. Pure and deterministic,
 * the same way buildMushroom is: one seed gives the same bush everywhere.
 *
 * A single berry is only a few millimetres across — real enough, but
 * unaimable on its own at any distance a player actually stands at (see
 * TODO.md, 2026-09-09: berries kept failing to register at all, and the
 * root cause traced back to there being nothing bigger than the fruit
 * itself to see or aim at). What a forager actually spots and reaches for
 * is the whole plant, so a handful of woody stems fan out from a shared
 * base — few and short for a creeping lingonberry mat, one alone for a
 * single-stemmed cloudberry, several and tall for a knee-high bilberry
 * shrub, all from the same `bushHeight` species field — carrying the
 * leaves and the berries at their tips.
 *
 * @param age 0 young (small, sparse), 1 ripe (full size, fullest cluster)
 */
export function buildBerry(m: BerryMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const bushHeight = lerp(m.bushHeight, size) * MM * (0.6 + age * 0.4)
  const berryR = (lerp(m.diameter, 0.4 + size * 0.6) * MM * (0.6 + age * 0.4)) / 2
  const berryCount = Math.max(1, Math.round(lerp(m.clusterSize, size) * (0.5 + age * 0.5)))

  const stemCount = Math.max(1, Math.min(5, berryCount + 1))
  const stemMat = new THREE.MeshStandardMaterial({ color: STEM_COLOR, roughness: 1 })
  const leafMat = new THREE.MeshStandardMaterial({ color: m.leafColor, roughness: 1, side: THREE.DoubleSide })
  const base = new THREE.Vector3(0, 0, 0)
  const tips: THREE.Vector3[] = []

  for (let i = 0; i < stemCount; i++) {
    const a = (i / stemCount) * Math.PI * 2 + rng() * 0.6
    // How far the tip leans out from straight up — a single cloudberry stem
    // stands nearly upright, a spreading shrub's outer stems lean further.
    const lean = 0.12 + rng() * 0.3
    const stemLen = bushHeight * (0.7 + rng() * 0.3)
    const tip = new THREE.Vector3(Math.cos(a) * bushHeight * lean, stemLen, Math.sin(a) * bushHeight * lean)
    tips.push(tip)

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(bushHeight * 0.012, bushHeight * 0.02, 1, 5), stemMat)
    orientAlong(stem, base, tip)
    group.add(stem)

    const leafCount = 2 + Math.floor(rng() * 2)
    for (let j = 0; j < leafCount; j++) {
      const t = 0.4 + (j / leafCount) * 0.6
      const leafLen = bushHeight * (0.18 + rng() * 0.08)
      const leaf = new THREE.Mesh(leafGeo, leafMat)
      leaf.scale.set(leafLen * 0.35, leafLen, leafLen * 0.35)
      leaf.position.lerpVectors(base, tip, t)
      leaf.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.6, rng() * Math.PI * 2, 0)
      group.add(leaf)
    }
  }

  // The berries themselves, a small loose knot around whichever tip each one
  // belongs to — several tips can share the load once there are more
  // berries than stems, the same way real fruit clusters at a branch end
  // rather than spreading one-per-twig.
  const berryMat = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.5 })
  const berries = new THREE.InstancedMesh(berryGeo, berryMat, berryCount)
  berries.name = 'berries'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < berryCount; i++) {
    const tip = tips[i % tips.length]
    const a = rng() * Math.PI * 2
    const d = berryR * (1.1 + rng() * 0.7)
    dummy.position.set(tip.x + Math.cos(a) * d, tip.y - berryR * 0.6 + rng() * berryR * 1.2, tip.z + Math.sin(a) * d)
    dummy.scale.setScalar(berryR * (0.82 + rng() * 0.32))
    dummy.updateMatrix()
    berries.setMatrixAt(i, dummy.matrix)
  }
  group.add(berries)

  return group
}
