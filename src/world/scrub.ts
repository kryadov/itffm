import * as THREE from 'three'
import { hashString } from '../util/rng'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'
import type { QuestObstacle } from '../quest/placement'

/** Same roughened-icosahedron trick, squashed low and wide, as
 *  `world/undergrowth.ts`'s own bush — reused rather than reinvented per
 *  CLAUDE.md's "look for an existing decoration first" rule. Unlike
 *  undergrowth's InstancedMesh (decorative, never removed one at a time),
 *  a quest-detour scrub needs its own mesh and its own identity: the
 *  hatchet (main.ts) removes exactly one bush, not the whole clump. */
const SCRUB_COLOR = 0x445c2e

/**
 * One quest-detour scrub object's mesh, at the obstacle's own position and
 * radius, tagged with the same `id` as the obstacle circle it stands for —
 * `main.ts`'s hatchet handling looks this up on the object it is aiming at
 * (`userData.scrubId`) to remove the matching circle from the obstacle list.
 */
export function buildScrubMesh(o: QuestObstacle, ground: ElevationProvider): THREE.Mesh {
  const height = o.radius * 1.6
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const bumpSeed = hashString(o.id)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const bump = 1 + fbm2(x * 1.8 + 17, z * 1.8 + 17, bumpSeed, 2) * 0.28
    pos.setXYZ(i, x * bump, y * bump * 0.6, z * bump)
  }
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({ color: SCRUB_COLOR, roughness: 1 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'scrub'
  mesh.position.set(o.x, ground.heightAt(o.x, o.z) + height / 2, o.z)
  mesh.scale.set(o.radius, height, o.radius)
  mesh.userData.scrubId = o.id
  return mesh
}

/** One mesh per obstacle circle, in the same order — see `buildScrubMesh`'s
 *  own doc comment for why each needs to stay a separate, removable object. */
export function buildScrubMeshes(obstacles: QuestObstacle[], ground: ElevationProvider): THREE.Mesh[] {
  return obstacles.map((o) => buildScrubMesh(o, ground))
}
