import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { Circle } from '../util/openSpot'
import type { Tree } from './trees'


export interface Hive {
  x: number
  y: number
  z: number
  rotationY: number
}

/** How far up the trunk a wild hive sits, as a fraction of the tree's own
 *  height — low enough to read as a hollow in the trunk, not a bird's nest
 *  in the crown (`world/trees.ts`'s `treePerches` uses 0.72 for that). */
const HIVE_HEIGHT_FRAC = 0.38
/** How far the hive body stands proud of the bark. */
const HIVE_STANDOFF = 0.12
const HIVE_RADIUS = 0.22

/**
 * Sites the wood's one wild beehive against a real tree's own trunk — a
 * hollow or old woodpecker cavity, not a standalone box or an apiary (decided
 * in the brainstorm, docs/superpowers/specs/2026-09-10-wildlife-design.md).
 * Returns null when the wood has no trees at all, the same honest failure
 * `world/fisherHut.ts`'s `placeFisherHut` gives for a wood with no water.
 */
export function placeHive(trees: Tree[], seed: number): Hive | null {
  if (trees.length === 0) return null
  const rand = mulberry32(seed)
  const tree = trees[Math.floor(rand() * trees.length) % trees.length]
  const rotationY = rand() * Math.PI * 2
  const standoff = tree.radius + HIVE_STANDOFF
  return {
    x: tree.x + Math.cos(rotationY) * standoff,
    z: tree.z + Math.sin(rotationY) * standoff,
    y: tree.y + tree.height * HIVE_HEIGHT_FRAC,
    rotationY,
  }
}

/** A small footprint — the hive stands barely proud of a trunk the player
 *  already can't walk through. */
export function hiveObstacle(h: Hive): Circle {
  return { x: h.x, z: h.z, radius: HIVE_RADIUS }
}

/**
 * A coiled straw skep on a bracketed shelf against the trunk, under a slanted
 * bark roof: seven coils of straw in their own shades narrowing to the top, a
 * dark entrance at its foot facing away from the tree, and a drip of honey on
 * the doorstep. A live request (2026-09-24): it used to be a plain straw cone
 * on a board. Local +x points away from the trunk.
 */
export function buildHiveMesh(h: Hive): THREE.Group {
  const group = new THREE.Group()
  group.name = 'hive'
  const R = HIVE_RADIUS * 1.1
  const COILS = 7
  const tube = 0.032
  const straws = [0xc9a227, 0xb58d1e, 0xd6b24a]

  // A darker core behind the coils, so the gaps between them never show daylight.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.92, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x7a5a1a, roughness: 1 }),
  )
  core.scale.y = 1.25
  core.position.y = 0.03
  group.add(core)
  for (let i = 0; i < COILS; i++) {
    const t = i / COILS
    const ringR = R * Math.sqrt(1 - t * t) + 0.012
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(ringR, tube, 6, 22),
      new THREE.MeshStandardMaterial({ color: straws[i % straws.length], roughness: 1 }),
    )
    coil.name = 'coil'
    coil.rotation.x = Math.PI / 2
    coil.position.y = 0.035 + t * R * 1.2
    group.add(coil)
  }
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshStandardMaterial({ color: straws[0], roughness: 1 }),
  )
  cap.position.y = 0.035 + R * 1.2
  group.add(cap)

  // The entrance at its foot, facing out from the tree, and honey at the door.
  const entrance = new THREE.Mesh(
    new THREE.CircleGeometry(0.065, 10, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x120c06 }),
  )
  entrance.name = 'entrance'
  entrance.rotation.y = Math.PI / 2
  entrance.position.set(R + 0.03, 0.03, 0)
  group.add(entrance)
  const drip = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd98e1c, roughness: 0.2, emissive: 0x3a1c00, emissiveIntensity: 0.4 }),
  )
  drip.name = 'honeyDrip'
  drip.scale.set(1.6, 0.5, 1.2)
  drip.position.set(R + 0.06, 0.025, 0.02)
  group.add(drip)

  // The shelf, on two brackets back to the trunk, and a bark roof over it all.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1 })
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(R * 2.6, 0.04, R * 2.3), woodMat)
  shelf.position.set(0.02, 0.0, 0)
  group.add(shelf)
  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.035), woodMat)
    bracket.name = 'bracket'
    bracket.position.set(-R * 0.55, -0.13, side * R * 0.75)
    bracket.rotation.z = -0.62
    group.add(bracket)
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(R * 3, 0.025, R * 2.8),
    new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }),
  )
  roof.name = 'roof'
  roof.position.set(0.0, 0.035 + R * 1.2 + 0.1, 0)
  roof.rotation.z = -0.28
  group.add(roof)

  group.position.set(h.x, h.y, h.z)
  // Local +x away from the trunk: placeHive stood it off at (cos, sin) of this angle.
  group.rotation.y = -h.rotationY
  return group
}
