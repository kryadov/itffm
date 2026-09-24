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

const BOAT_LENGTH = 2.6
/** Greatest half-beam, metres. */
const BOAT_HALF_BEAM = 0.55
/** Gunwale height amidships over the keel, metres. */
const BOAT_DEPTH = 0.42
/** Planking thickness, metres. */
const BOAT_PLANK = 0.03

/** Half-beam at u (stern 0, bow 1): a transom at the stern, widest a little
 *  aft of the middle, drawn in to the stem at the bow. */
function boatHalfBeam(u: number): number {
  if (u < 0.4) return BOAT_HALF_BEAM * (0.62 + 0.38 * Math.sin(((u / 0.4) * Math.PI) / 2))
  return BOAT_HALF_BEAM * (1 - Math.pow((u - 0.4) / 0.6, 1.8))
}
/** The keel line, lifting toward the bow (and a touch at the stern). */
function boatKeel(u: number): number {
  return 0.18 * Math.max(0, (u - 0.6) / 0.4) ** 2 + 0.04 * Math.max(0, (0.15 - u) / 0.15)
}
/** The sheer — the gunwale's line — sweeping up at the bow and the stern. */
function boatSheer(u: number): number {
  return BOAT_DEPTH + 0.16 * Math.max(0, (u - 0.55) / 0.45) ** 2 + 0.06 * Math.max(0, (0.2 - u) / 0.2)
}

/** The inside half-width at height y over station u — the planking curves in
 *  toward the keel, so anything fitted inside must be narrower low down. */
function boatInnerHalfWidth(u: number, y: number): number {
  const keel = boatKeel(u) + BOAT_PLANK
  const f = Math.min(1, Math.max(0, (y - keel) / (boatSheer(u) - keel)))
  return Math.max(0, boatHalfBeam(u) - BOAT_PLANK) * Math.pow(f, 1 / 1.6)
}

/**
 * The hull as one mesh in baked vertex colours: tarred planking outside with
 * a painted top strake, bare wood inside, a dark gunwale joining the two, and
 * a flat transom at the stern.
 */
function buildBoatHull(): THREE.Mesh {
  const N = 28
  const STRAKES = 6
  // Across the hull, gunwale to gunwale: each strake (plank) its own run of
  // points, the rows at a seam doubled so every plank keeps its own colour
  // and the seam shows as a fine crease in the light.
  const across: { t: number; strake: number }[] = []
  for (const side of [-1, 1]) {
    const run: { t: number; strake: number }[] = []
    for (let b = 0; b < STRAKES; b++) {
      for (let k = 0; k <= 2; k++) {
        const fr = (b + k / 2) / STRAKES
        run.push({ t: side * Math.pow(fr, 1 / 1.6), strake: b })
      }
    }
    across.push(...(side < 0 ? run.reverse() : run))
  }
  const M = across.length - 1
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  const c = new THREE.Color()
  const tar = new THREE.Color(0x5c4631)
  const paint = new THREE.Color(0x5f7f6c)
  const wood = new THREE.Color(0xa0805a)
  const rail = new THREE.Color(0x4a3622)
  const vert = (x: number, y: number, z: number, col: THREE.Color): number => {
    positions.push(x, y, z)
    colors.push(col.r, col.g, col.b)
    return positions.length / 3 - 1
  }
  /** One skin of planking: stations along the boat × points across it. */
  const surface = (inner: boolean): number[][] => {
    const grid: number[][] = []
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const x = inner
        ? -BOAT_LENGTH / 2 + BOAT_PLANK + (BOAT_LENGTH - 2.5 * BOAT_PLANK) * u
        : -BOAT_LENGTH / 2 + BOAT_LENGTH * u
      const w = Math.max(0, boatHalfBeam(u) - (inner ? BOAT_PLANK : 0))
      const keel = boatKeel(u) + (inner ? BOAT_PLANK : 0)
      const sheer = boatSheer(u)
      const row: number[] = []
      for (const { t, strake } of across) {
        const f = Math.pow(Math.abs(t), 1.6)
        const y = keel + (sheer - keel) * f
        if (inner) c.copy(wood).multiplyScalar(0.9 + 0.1 * (strake % 2))
        else c.copy(strake >= STRAKES - 2 ? paint : tar).multiplyScalar(0.84 + 0.16 * (strake % 2))
        row.push(vert(x, y, w * t, c))
      }
      grid.push(row)
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = grid[i][j]
        const b = grid[i + 1][j]
        const d = grid[i][j + 1]
        const e = grid[i + 1][j + 1]
        index.push(a, b, d, b, e, d)
      }
    }
    return grid
  }
  const outer = surface(false)
  const inner = surface(true)
  const at = (k: number) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]] as const

  // The gunwale: a strip over the top of the planking on each side.
  for (const j of [0, M]) {
    for (let i = 0; i < N; i++) {
      const p = [outer[i][j], outer[i + 1][j], inner[i][j], inner[i + 1][j]].map((k) => {
        const [x, y, z] = at(k)
        return vert(x, y + 0.012, z, rail)
      })
      index.push(p[0], p[1], p[2], p[1], p[3], p[2])
    }
  }
  // The transom: the stern's flat board, painted outside, bare inside.
  const board = (ring: number[], col: THREE.Color): void => {
    let cy = 0
    for (const k of ring) cy += at(k)[1]
    const centre = vert(at(ring[0])[0], cy / ring.length + 0.05, 0, col)
    const rim = ring.map((k) => {
      const [x, y, z] = at(k)
      return vert(x, y, z, col)
    })
    for (let j = 0; j < rim.length - 1; j++) index.push(centre, rim[j], rim[j + 1])
    index.push(centre, rim[rim.length - 1], rim[0])
  }
  board(outer[0], paint)
  board(inner[0], wood)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  const hull = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  )
  hull.name = 'hull'
  hull.castShadow = true
  hull.receiveShadow = true
  return hull
}

/** One oar: a round loom, a flat blade and a grip. */
function buildOar(mat: THREE.Material): THREE.Group {
  const oar = new THREE.Group()
  oar.name = 'oar'
  const loom = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.7, 7), mat)
  loom.rotation.z = Math.PI / 2
  oar.add(loom)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.13), mat)
  blade.position.x = 1.7 / 2 + 0.2
  oar.add(blade)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 7), mat)
  grip.rotation.z = Math.PI / 2
  grip.position.x = -1.7 / 2 - 0.05
  oar.add(grip)
  return oar
}

/**
 * A wooden rowing boat drawn up at the water's edge: a hollow planked hull
 * whose sheer sweeps up to a pointed bow and a flat transom, three thwarts,
 * floorboards, and a pair of oars laid in along its length. A live request
 * (2026-09-24) — it used to be a solid pointed slab with two sticks on top.
 */
export function buildBoatMesh(boat: Boat): THREE.Group {
  const group = new THREE.Group()
  group.name = 'boat'
  // Resting on its keel, it leans a little onto one side.
  const body = new THREE.Group()
  body.rotation.x = 0.06
  group.add(body)
  body.add(buildBoatHull())

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 })
  for (const u of [0.22, 0.48, 0.74]) {
    const y = boatSheer(u) - 0.1
    // Its narrower edge decides: a thwart is 0.2 m fore and aft.
    const du = 0.1 / BOAT_LENGTH
    const w = Math.min(boatInnerHalfWidth(u - du, y - 0.015), boatInnerHalfWidth(u + du, y - 0.015))
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, w * 2), plankMat)
    thwart.name = 'thwart'
    thwart.position.set(-BOAT_LENGTH / 2 + BOAT_LENGTH * u, y, 0)
    body.add(thwart)
  }
  for (const z of [-0.055, 0.055]) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(BOAT_LENGTH * 0.45, 0.015, 0.1), plankMat)
    floor.position.set(-0.15, BOAT_PLANK + 0.07, z)
    body.add(floor)
  }
  const oarMat = new THREE.MeshStandardMaterial({ color: 0xb08c5e, roughness: 0.8 })
  for (const side of [-1, 1]) {
    const oar = buildOar(oarMat)
    oar.position.set(-0.3, boatSheer(0.48) - 0.07, side * 0.09)
    oar.rotation.y = side * 0.03
    body.add(oar)
  }

  group.position.set(boat.x, boat.y, boat.z)
  group.rotation.y = boat.rotationY
  return group
}
