import * as THREE from 'three'
import { mulberry32 } from '../util/rng'

/** Fixed seed for the diamond's own shape — this is the look of the item
 *  itself, the same in every wood, not part of any per-world procedural
 *  generation (see docs/superpowers/specs/2026-09-15-mine-cave-design.md
 *  §6). Still routed through mulberry32, not Math.random, so the shape is
 *  reproducible and testable like everything else generated in this
 *  project. */
export const DIAMOND_GEM_SEED = 0xd1a2013

/** How far a vertex's radius can wander from the base icosahedron radius,
 *  as a fraction of it — small enough the silhouette still reads as "gem,"
 *  large enough it's visibly not a regular solid. */
const RADIUS_JITTER = 0.22

/** A 20-faced base (three.js `IcosahedronGeometry`) with each vertex's own
 *  radius nudged by a deterministic amount, so the diamond in the mine
 *  reads as a rough-cut stone rather than a perfect symmetric solid. */
export function jitterDiamondGeometry(seed: number, radius = 0.16): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius, 0)
  const pos = geom.getAttribute('position')
  const rng = mulberry32(seed)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const factor = 1 + (rng() * 2 - 1) * RADIUS_JITTER
    v.multiplyScalar(factor)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}
