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
 * A rough straw skep tucked against the bark, on a small wooden shelf — wild
 * enough to read as something the woods grew into rather than a beekeeper's
 * fixture.
 */
export function buildHiveMesh(h: Hive): THREE.Group {
  const group = new THREE.Group()
  group.name = 'hive'

  const strawMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 1 })
  const skep = new THREE.Mesh(new THREE.ConeGeometry(HIVE_RADIUS, HIVE_RADIUS * 1.6, 8), strawMat)
  skep.position.y = HIVE_RADIUS * 0.8
  group.add(skep)

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1 })
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(HIVE_RADIUS * 2.2, 0.04, HIVE_RADIUS * 1.6), woodMat)
  shelf.position.y = 0.02
  group.add(shelf)

  group.position.set(h.x, h.y, h.z)
  group.rotation.y = h.rotationY
  return group
}
