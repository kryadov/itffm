import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { FishMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as every other kind's build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/**
 * A fish built from its species parameters. Pure and deterministic, the same
 * way every other kind's generator is: one seed gives the same fish
 * everywhere.
 *
 * Genuinely simple by design (see the rod quest's own design doc): a
 * stretched, tapered body carrying a lighter belly stripe, plus a tail and a
 * dorsal fin — a silhouette that reads as "fish" from a few metres away in a
 * pond, not a render-accurate anatomical model the way the mushroom
 * generator is for a cap and gills. Real, per-species proportions (length)
 * still come from data, the same "data is the source of truth" rule as
 * every other kind.
 *
 * @param age 0 young (shorter, slimmer), 1 grown (full length)
 */
export function buildFish(m: FishMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const length = lerp(m.length, size) * MM * (0.55 + age * 0.45)
  const height = length * 0.3
  const width = length * 0.16

  // The body: a unit sphere stretched into an ellipsoid and then tapered
  // toward the tail (x > 0 half) so it reads as a torpedo, not an egg.
  const bodyGeo = new THREE.SphereGeometry(1, 12, 8)
  const bodyPos = bodyGeo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < bodyPos.count; i++) {
    const x = bodyPos.getX(i)
    const taper = x > 0 ? 1 - x * 0.4 : 1
    bodyPos.setXYZ(i, x, bodyPos.getY(i) * taper, bodyPos.getZ(i) * taper)
  }
  bodyGeo.computeVertexNormals()
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: m.bodyColor, roughness: 0.45 }))
  body.name = 'body'
  body.scale.set(length / 2, height / 2, width / 2)
  group.add(body)

  // A lighter belly stripe along the underside — the one field mark that
  // keeps a single flat body colour from reading as a coloured blob.
  const bellyGeo = new THREE.SphereGeometry(1, 12, 8)
  const belly = new THREE.Mesh(bellyGeo, new THREE.MeshStandardMaterial({ color: m.bellyColor, roughness: 0.45 }))
  belly.scale.set(length / 2, height * 0.28, width / 2)
  belly.position.y = -height * 0.32
  group.add(belly)

  const finMat = new THREE.MeshStandardMaterial({ color: m.finColor, roughness: 0.7, side: THREE.DoubleSide })

  // A flat fan on the tapered end (+x, see the body above). The cone stands on
  // its base with its apex up; turned a quarter about z its local x becomes the
  // fin's height, its local y the fin's length along the fish (apex toward the
  // body) and its local z the thickness across the fish — which must be thin.
  // (It was 1, a metre, and the tail sat on the blunt end: a live report,
  // 2026-09-20, a roach with huge red spikes.)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3), finMat)
  tail.name = 'tail'
  tail.rotation.z = Math.PI / 2
  tail.scale.set(height * 0.65, length * 0.16, 0.01)
  tail.position.x = length * 0.55
  group.add(tail)

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3), finMat)
  dorsal.name = 'dorsal'
  dorsal.scale.set(length * 0.12, height * 0.6, 0.01)
  dorsal.position.set(length * 0.05, height * 0.42, 0)
  group.add(dorsal)

  return group
}
