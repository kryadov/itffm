import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { NutMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as mushroom/build.ts, berry/build.ts and herb/build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/**
 * A single nut or seed built from its species parameters. Pure and
 * deterministic, the same way the other kinds' generators are.
 *
 * One body sphere plus one spherical cap wrapping its top by `capCoverage` —
 * a small cap reads as an acorn, a cap that wraps most of the body reads as
 * a husked hazelnut, from the same two meshes.
 *
 * @param age 0 green (small, cap covers less), 1 ripe (full size, fullest cap)
 */
export function buildNut(m: NutMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const radius = (lerp(m.size, 0.4 + size * 0.6) * MM * (0.7 + age * 0.3)) / 2
  const capFraction = lerp(m.capCoverage, size) * (0.6 + age * 0.4)

  const bodyGeo = new THREE.SphereGeometry(radius, 10, 8)
  const bodyMat = new THREE.MeshStandardMaterial({ color: m.bodyColor, roughness: 0.5 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.name = 'body'
  group.add(body)

  const capGeo = new THREE.SphereGeometry(radius * 1.04, 10, 6, 0, Math.PI * 2, 0, Math.PI * capFraction)
  const capMat = new THREE.MeshStandardMaterial({ color: m.capColor, roughness: 1 })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.name = 'cap'
  group.add(cap)

  return group
}
