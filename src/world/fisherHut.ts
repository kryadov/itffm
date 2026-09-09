import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { classifyWater } from './water'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

export interface Boat {
  x: number
  z: number
  y: number
  rotationY: number
}

export interface FisherHut {
  x: number
  z: number
  y: number
  rotationY: number
  boat: Boat
}

/** How far the hut needs from anything already standing, metres — smaller
 *  than the main shelter's own (world/shelter.ts's SHELTER_CLEARANCE): a
 *  one-room shack needs far less elbow room than a building a player walks
 *  into. */
const HUT_CLEARANCE = 2
/** Its own footprint, for other things to avoid. */
const HUT_RADIUS = 1.6
/** How far from the water's edge the hut sits, metres — close enough to
 *  read as belonging to the pond, far enough that it is not standing in it. */
const SHORE_DISTANCE_MIN = 4
const SHORE_DISTANCE_MAX = 7

/**
 * Sites a small fishing shack and its boat by the water — a live request,
 * 2026-09-09, conditional on the wood actually having one: returns `null`
 * outright when `water` is empty, rather than a hut standing in dry woods
 * with nothing to fish in.
 *
 * A pond is preferred over a stream when the wood has both — a shack belongs
 * on a lake's own bank, not staked out along a running brook — but falls
 * back to whatever water there is rather than finding nothing at all.
 */
export function placeFisherHut(
  water: Vec2[][],
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
): FisherHut | null {
  const ponds = water.filter((ring) => ring.length >= 2 && classifyWater(ring) === 'pond')
  const candidates = (ponds.length > 0 ? ponds : water).filter((ring) => ring.length >= 2)
  if (candidates.length === 0) return null

  const rng = mulberry32(seed)
  const ring = candidates[Math.floor(rng() * candidates.length)]
  const i = Math.floor(rng() * ring.length)
  const shore = ring[i]
  const next = ring[(i + 1) % ring.length]

  const angle = rng() * Math.PI * 2
  const dist = SHORE_DISTANCE_MIN + rng() * (SHORE_DISTANCE_MAX - SHORE_DISTANCE_MIN)
  const origin = { x: shore.x + Math.cos(angle) * dist, z: shore.z + Math.sin(angle) * dist }
  const { x, z } = findOpenSpot(obstacles, halfSize, origin, HUT_CLEARANCE)
  // Faces back toward the shore point it was sited from — the same "which
  // way does local -Z point" convention world/shelter.ts's doorPosition and
  // world/campfire.ts's placement already use, so a front door always looks
  // out over the water rather than at the trees behind it.
  const rotationY = Math.atan2(x - shore.x, z - shore.z)

  const boat: Boat = {
    x: shore.x,
    z: shore.z,
    y: ground.heightAt(shore.x, shore.z),
    // Lies along the bank's own tangent at that point, not pointed
    // straight out into the water — a boat left on shore, not mid-launch.
    rotationY: Math.atan2(next.x - shore.x, next.z - shore.z),
  }

  return { x, z, y: ground.heightAt(x, z), rotationY, boat }
}

/** The hut's own collision footprint. */
export function fisherHutObstacle(h: FisherHut): Circle {
  return { x: h.x, z: h.z, radius: HUT_RADIUS }
}

/**
 * A one-room fishing shack: walls, a roof, a plain door slab — no interior,
 * unlike the main shelter (world/shelter.ts). It exists to be glimpsed from
 * the water's edge, not walked into; giving it the same hollow-room and
 * hinged-door treatment would cost real collision/geometry complexity for a
 * second building nobody asked to enter.
 */
export function buildFisherHutMesh(h: FisherHut): THREE.Group {
  const group = new THREE.Group()
  group.name = 'fisherHut'

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5c4a38, roughness: 1 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x35291c, roughness: 1 })
  const width = 2.0
  const depth = 1.8
  const wallHeight = 2.05

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat)
  walls.position.y = wallHeight / 2
  walls.castShadow = true
  walls.receiveShadow = true
  group.add(walls)

  const roofSpan = Math.hypot(width, depth) * 0.62
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofSpan, 0.9, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = wallHeight + 0.45
  group.add(roof)

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2f2313, roughness: 1 })
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.5, 0.05), doorMat)
  door.position.set(0, 0.75, -depth / 2 - 0.03)
  group.add(door)

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 1, side: THREE.DoubleSide })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fa8ac, roughness: 0.3, side: THREE.DoubleSide })
  const window_ = new THREE.Group()
  window_.add(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), frameMat))
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), glassMat)
  glass.position.z = 0.005
  window_.add(glass)
  window_.position.set(width / 2 + 0.03, wallHeight * 0.6, 0)
  window_.rotation.y = -Math.PI / 2
  group.add(window_)

  group.position.set(h.x, h.y, h.z)
  group.rotation.y = h.rotationY
  return group
}

/**
 * A rowboat's hull, extruded from a simple lens-shaped outline (pointed at
 * bow and stern, its widest point amidships) rather than a primitive box or
 * cone — neither tapers at both ends the way a real hull does. Left drawn
 * up on the bank beside the fishing shack, not out on the water.
 */
export function buildBoatMesh(boat: Boat): THREE.Group {
  const group = new THREE.Group()
  group.name = 'boat'

  const hullLength = 2.2
  const hullWidth = 0.8
  const hullHeight = 0.32

  const outline = new THREE.Shape()
  const halfW = hullWidth / 2
  outline.moveTo(-hullLength / 2, 0)
  outline.quadraticCurveTo(-hullLength * 0.3, halfW, 0, halfW)
  outline.quadraticCurveTo(hullLength * 0.35, halfW, hullLength / 2, 0)
  outline.quadraticCurveTo(hullLength * 0.35, -halfW, 0, -halfW)
  outline.quadraticCurveTo(-hullLength * 0.3, -halfW, -hullLength / 2, 0)

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.9 })
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, { depth: hullHeight, bevelEnabled: false }),
    hullMat,
  )
  // ExtrudeGeometry extrudes the shape's own plane (XY) along +Z — rotated
  // flat so that extrusion becomes the hull's height (Y) instead.
  hull.rotation.x = -Math.PI / 2
  hull.castShadow = true
  group.add(hull)

  // Two thwarts (cross-benches) — the detail that reads as "boat" rather
  // than "hollowed log" at a glance, the same reasoning the door's grooves
  // and the window's muntin bar already followed for their own objects.
  const thwartMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 })
  for (const lx of [-hullLength * 0.18, hullLength * 0.18]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, hullWidth * 0.75), thwartMat)
    thwart.position.set(lx, hullHeight * 0.75, 0)
    group.add(thwart)
  }

  group.position.set(boat.x, boat.y, boat.z)
  group.rotation.y = boat.rotationY
  return group
}
