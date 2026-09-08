import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { FindMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as every other kind's build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/**
 * A single non-food find built from its species parameters. Pure and
 * deterministic, the same way the other kinds' generators are.
 *
 * A find has no taxonomic parts to model — a nest, an antler, a feather and a
 * stone share nothing morphologically. What they share is being one
 * irregular object a walker notices and picks up, so one jittered
 * icosahedron, coloured and sized by species data, stands in for all of them.
 *
 * @param age 0..1, both ends read the same for a find — nothing here "ripens"
 *   the way a berry or a nut does, but the parameter is kept for a uniform
 *   buildX(morphology, seed, age) signature across every kind.
 */
export function buildFind(m: FindMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  void age

  const size = rng()
  const radius = (lerp(m.size, 0.3 + size * 0.7) * MM) / 2

  const geo = new THREE.IcosahedronGeometry(radius, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const jitter = 1 + (rng() - 0.5) * 0.3
    pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter, pos.getZ(i) * jitter)
  }
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.9 })
  const object = new THREE.Mesh(geo, mat)
  object.name = 'object'
  group.add(object)

  return group
}
