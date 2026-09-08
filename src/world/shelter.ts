import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'

export interface Shelter {
  x: number
  z: number
  y: number
  rotationY: number
}

/** How far the hut needs from anything already standing, metres — wider than
 *  a player needs, since a structure is bigger than one pair of shoulders. */
const SHELTER_CLEARANCE = 2.5
/** Its own footprint, for other things (including the player) to avoid. */
const SHELTER_RADIUS = 1.8

/**
 * Sites the wood's one shelter — a hut, not a decoration. It exists to be
 * rare: the same `findOpenSpot` search that keeps the player out of trunks
 * (game/startPose.ts), given more room to ask for, finds it a clearing of its
 * own. Placed once per wood, so it reads as something you came upon rather
 * than something scattered like a tree.
 */
export function placeShelter(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
): Shelter {
  const rng = mulberry32(seed)
  // The search starts from a seed-chosen point, not always the world centre —
  // otherwise an open wood with nothing crowding it would plant the hut dead
  // centre every single time, seed or no seed.
  const origin = { x: (rng() * 2 - 1) * halfSize * 0.5, z: (rng() * 2 - 1) * halfSize * 0.5 }
  const { x, z } = findOpenSpot(obstacles, halfSize, origin, SHELTER_CLEARANCE)
  const rotationY = rng() * Math.PI * 2
  return { x, z, y: ground.heightAt(x, z), rotationY }
}

/** The shelter's own collision footprint — nobody walks through the wall. */
export function shelterObstacle(s: Shelter): Circle {
  return { x: s.x, z: s.z, radius: SHELTER_RADIUS }
}

/**
 * A small log cabin: a box for the walls, a four-sided pyramid for the roof.
 * One of everything in the wood, so it does not need instancing.
 */
export function buildShelterMesh(s: Shelter): THREE.Group {
  const group = new THREE.Group()
  group.name = 'shelter'

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4429, roughness: 1 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c2f1c, roughness: 1 })

  const width = 2.6
  const depth = 2.2
  const wallHeight = 1.7

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat)
  walls.position.y = wallHeight / 2
  group.add(walls)

  const roofSpan = Math.hypot(width, depth) * 0.62
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofSpan, 1.1, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = wallHeight + 0.55
  group.add(roof)

  group.position.set(s.x, s.y, s.z)
  group.rotation.y = s.rotationY
  return group
}
