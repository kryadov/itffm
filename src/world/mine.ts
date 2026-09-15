import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32, randRange } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

export interface MineSegment {
  id: number
  /** null for the entrance/root segment. */
  parentId: number | null
  /** Local start/end, metres, before `Mine.heading`'s rotation — the same
   *  local frame `localToWorld` already rotates as one piece. */
  x0: number
  z0: number
  x1: number
  z1: number
  /** Floor height relative to the entrance. Only the root segment slopes
   *  (y0 = 0, y1 < 0); every other segment continues flat from its parent's
   *  own y1, matching the "goes down once, at the mouth" brief. */
  y0: number
  y1: number
  width: number
  /** No children — closed by a back wall (mineObstacles/buildMineMesh both
   *  read this instead of assuming the single old dead end). */
  isLeaf: boolean
  /** True for exactly one leaf: the far end of the one path that actually
   *  leads to the diamond, per the branching cave design
   *  (docs/superpowers/specs/2026-09-15-mine-cave-design.md §1). */
  isDiamondChamber: boolean
}

export interface Mine {
  x: number
  z: number
  /** Ground height at the entrance itself. */
  y: number
  /** Radians the cave bores away from the entrance, 0 along +x. */
  heading: number
  /** The cave's own branching graph — see MineSegment. Always has at least
   *  one segment (the entrance ramp), even with zero forks. */
  segments: MineSegment[]
  /** Farthest straight-line distance, in local metres, from the entrance to
   *  any point in the graph — isInsideMine's own "is it dark here" radius. */
  reach: number
}

/** Structurally identical to game/player.ts's Obstacle — see the same note in deadwood.ts. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
}

/** Exported so `isInsideMine` (below) reuses the exact same tunnel size
 *  rather than a second, hand-picked "interior radius" constant. */
export const TUNNEL_LENGTH = 6
const TUNNEL_WIDTH = 2.2
const TUNNEL_HEIGHT = 2.3
const WALL_THICKNESS = 0.15

/** How far out, and how many directions, `placeMine` samples to find "into
 *  the hillside" — see its own doc comment for why this reads the terrain
 *  instead of a tag or a seed. */
const HEADING_SAMPLE_DIST = 8
const HEADING_CANDIDATES = 12

/** How far the procedurally-sited entrance needs from anything already
 *  standing, metres — the tunnel's own length, a rough stand-in for its
 *  whole 6x2.2m footprint along whichever heading it ends up boring (the
 *  heading itself is only known after the entrance point is picked, so this
 *  can only protect the mouth, not the full bore — the same simplification
 *  `world/shelter.ts`'s own SHELTER_CLEARANCE already accepts). */
const MINE_CLEARANCE = TUNNEL_LENGTH

/** Spacing of the small circles standing in for the tunnel's real (thin,
 *  straight) walls in the player's own circle-based collision — the same
 *  technique `world/shelter.ts`'s `wallObstacles` uses, close enough
 *  together that a player's own radius can never slip between two. */
const WALL_CIRCLE_SPACING = 0.3
const WALL_CIRCLE_RADIUS = 0.16

/** Root segment: length of the sloped entrance ramp, metres. */
const RAMP_LENGTH_RANGE: [number, number] = [4, 5.5]
/** How far the floor drops over the ramp, metres — "goes down once, at the
 *  mouth," per the design doc, not a staircase. */
const RAMP_DROP_RANGE: [number, number] = [1.5, 2]
/** How many forks the whole tree gets — leaves end up at 1 + this. */
const BRANCH_COUNT_RANGE: [number, number] = [3, 5]
const CHILD_LENGTH_RANGE: [number, number] = [3, 6]
/** Half-angle, radians, each of a fork's two children turns away from the
 *  parent's own heading — wide enough that the two forks read as genuinely
 *  different directions, not a barely-there kink. */
const FORK_TURN_RANGE: [number, number] = [0.5, 0.95]
const CHILD_WIDTH_FACTOR_RANGE: [number, number] = [0.85, 1.15]
/** The diamond chamber's own leaf gets wider on its last third — a small
 *  room, not just a wider corridor. */
const CHAMBER_WIDTH_FACTOR = 1.6

/**
 * Builds the cave's own branching graph: a sloped entrance segment, then
 * `BRANCH_COUNT_RANGE` forks off whichever leaf the RNG picks each time,
 * ending with exactly one leaf marked as the diamond chamber and the rest
 * as dead ends. See docs/superpowers/specs/2026-09-15-mine-cave-design.md
 * §1 for the shape this is meant to produce.
 */
function buildMineGraph(rng: () => number): MineSegment[] {
  const root: MineSegment = {
    id: 0,
    parentId: null,
    x0: 0,
    z0: 0,
    x1: randRange(rng, RAMP_LENGTH_RANGE),
    z1: 0,
    y0: 0,
    y1: -randRange(rng, RAMP_DROP_RANGE),
    width: TUNNEL_WIDTH,
    isLeaf: true,
    isDiamondChamber: false,
  }
  const segments: MineSegment[] = [root]
  let openLeaves = [root]
  let nextId = 1

  const branchCount = Math.floor(randRange(rng, BRANCH_COUNT_RANGE))
  for (let i = 0; i < branchCount; i++) {
    const parent = openLeaves[Math.floor(rng() * openLeaves.length)]
    parent.isLeaf = false
    const parentAngle = Math.atan2(parent.z1 - parent.z0, parent.x1 - parent.x0)
    const children: MineSegment[] = []
    for (const sign of [1, -1]) {
      const angle = parentAngle + sign * randRange(rng, FORK_TURN_RANGE)
      const length = randRange(rng, CHILD_LENGTH_RANGE)
      const child: MineSegment = {
        id: nextId++,
        parentId: parent.id,
        x0: parent.x1,
        z0: parent.z1,
        x1: parent.x1 + Math.cos(angle) * length,
        z1: parent.z1 + Math.sin(angle) * length,
        y0: parent.y1,
        y1: parent.y1,
        width: TUNNEL_WIDTH * randRange(rng, CHILD_WIDTH_FACTOR_RANGE),
        isLeaf: true,
        isDiamondChamber: false,
      }
      segments.push(child)
      children.push(child)
    }
    openLeaves = openLeaves.filter((s) => s.id !== parent.id).concat(children)
  }

  const chamber = openLeaves[Math.floor(rng() * openLeaves.length)]
  chamber.isDiamondChamber = true
  chamber.width *= CHAMBER_WIDTH_FACTOR

  return segments
}

/**
 * Where the wood's one mine/cave interior sits. A real OSM cave/adit/
 * mineshaft mouth (`geo/parse.ts`'s `CaveEntrance`, `mapped` here) always
 * wins when this plot has one — the same rule `world/shelter.ts`'s
 * `placeShelter` already follows for a mapped hut. Every wood gets a mine
 * either way now (a live request, 2026-09-15: the diamond quest item needs
 * somewhere to be in every wood, not only the ones a surveyor happened to
 * map a real entrance in) — where nothing was surveyed, the entrance is
 * sited the same way the shelter and campfire already are: a random
 * direction from the shelter, `findOpenSpot` keeping it clear of everything
 * else already standing.
 *
 * OSM never records which way a mapped entrance faces, and a procedural one
 * has no such record either, so the heading is always read off the terrain
 * itself rather than guessed or seeded: whichever of a ring of candidate
 * directions climbs the most over `HEADING_SAMPLE_DIST` is treated as "into
 * the hillside" — the same thing a real visitor would look for, and no
 * worse an approximation on a procedurally-sited mouth than a mapped one,
 * since neither ever carried a real heading to begin with.
 */
export function placeMine(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
  shelterPos: Vec2,
  mapped: Vec2[] = [],
): Mine {
  const real = mapped.find((m) => Math.abs(m.x) <= halfSize && Math.abs(m.z) <= halfSize)
  let x: number
  let z: number
  if (real) {
    x = real.x
    z = real.z
  } else {
    const rng = mulberry32(seed)
    const angle = rng() * Math.PI * 2
    const dist = halfSize * (0.25 + rng() * 0.4)
    const clamp = (v: number): number => Math.max(-halfSize, Math.min(halfSize, v))
    const origin = { x: clamp(shelterPos.x + Math.cos(angle) * dist), z: clamp(shelterPos.z + Math.sin(angle) * dist) }
    ;({ x, z } = findOpenSpot(obstacles, halfSize, origin, MINE_CLEARANCE))
  }

  const here = ground.heightAt(x, z)
  let bestHeading = 0
  let bestRise = -Infinity
  for (let i = 0; i < HEADING_CANDIDATES; i++) {
    const heading = (i / HEADING_CANDIDATES) * Math.PI * 2
    const sx = x + Math.cos(heading) * HEADING_SAMPLE_DIST
    const sz = z + Math.sin(heading) * HEADING_SAMPLE_DIST
    const rise = ground.heightAt(sx, sz) - here
    if (rise > bestRise) {
      bestRise = rise
      bestHeading = heading
    }
  }
  const graph = buildMineGraph(mulberry32((seed + 0x9e3779b1) >>> 0))
  const reach = Math.max(...graph.map((s) => Math.hypot(s.x1, s.z1)))
  return { x, z, y: here, heading: bestHeading, segments: graph, reach }
}

/**
 * Whether a point is close enough to this mine's entrance to count as
 * "inside" for the lamp's own on/off rule (`quest/lamp.ts`'s `lampIsOn`) — a
 * plain distance check against the tunnel's own length, not a precise
 * inside-the-box test: standing right at the mouth already counts, which is
 * the honest reading of "you're at the mine, it's dark in there."
 */
export function isInsideMine(m: Mine, x: number, z: number): boolean {
  return Math.hypot(x - m.x, z - m.z) <= TUNNEL_LENGTH
}

/** A point `lx` deep and `lz` across from the entrance, in world metres —
 *  shared by the collision (`mineObstacles`) and the mesh (`buildMineMesh`,
 *  via the same rotation applied to its whole group) so the two can never
 *  drift apart. */
function localToWorld(m: Mine, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(m.heading)
  const sin = Math.sin(m.heading)
  return { x: m.x + lx * cos - lz * sin, z: m.z + lx * sin + lz * cos }
}

/**
 * The cave's own collision: two side walls running each segment's own
 * length, plus a back wall closing every leaf's far end — every dead end
 * and the diamond chamber alike are closed, only the graph's shape (see
 * `buildMineGraph`) decides where those ends are.
 */
export function mineObstacles(m: Mine): CircleObstacle[] {
  const out: CircleObstacle[] = []

  for (const seg of m.segments) {
    const dx = seg.x1 - seg.x0
    const dz = seg.z1 - seg.z0
    const length = Math.hypot(dx, dz) || 1
    const dirX = dx / length
    const dirZ = dz / length
    const perpX = -dirZ
    const perpZ = dirX
    const half = seg.width / 2

    const sideSteps = Math.ceil(length / WALL_CIRCLE_SPACING)
    for (let i = 0; i <= sideSteps; i++) {
      const t = i / sideSteps
      const lx = seg.x0 + dx * t
      const lz = seg.z0 + dz * t
      out.push({ ...localToWorld(m, lx + perpX * half, lz + perpZ * half), radius: WALL_CIRCLE_RADIUS })
      out.push({ ...localToWorld(m, lx - perpX * half, lz - perpZ * half), radius: WALL_CIRCLE_RADIUS })
    }

    if (seg.isLeaf) {
      const backSteps = Math.ceil(seg.width / WALL_CIRCLE_SPACING)
      for (let i = 0; i <= backSteps; i++) {
        const s = -half + (i / backSteps) * seg.width
        out.push({ ...localToWorld(m, seg.x1 + perpX * s, seg.z1 + perpZ * s), radius: WALL_CIRCLE_RADIUS })
      }
    }
  }

  return out
}

/** Where the diamond quest item sits: near the back of the tunnel, off to
 *  one side of the lantern (`buildMineMesh` puts that at local
 *  `(TUNNEL_LENGTH * 0.75, ..., 0)`) rather than dead-centre in its light —
 *  found the same way as everything else back there, not lit for you. */
export function diamondSpotInMine(m: Mine): { x: number; y: number; z: number } {
  const { x, z } = localToWorld(m, TUNNEL_LENGTH * 0.85, TUNNEL_WIDTH * 0.28)
  return { x, y: m.y, z }
}

/**
 * The tunnel's own geometry — floor, ceiling, two side walls, a back wall,
 * and a lantern (the same `PointLight` + small shadow map recipe as the
 * shelter's own hearth light, `world/shelter.ts`) so there is something to
 * actually see by once inside. Built in the group's own local space (its
 * length along local +x, its width along local z) and then rotated as one
 * piece by `m.heading` — the same convention `localToWorld` above works out
 * by hand for collision, so the mesh and the collision can never disagree.
 */
export function buildMineMesh(m: Mine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mine'
  group.position.set(m.x, m.y, m.z)
  group.rotation.y = -m.heading

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b564e, roughness: 1, flatShading: true })
  const half = TUNNEL_WIDTH / 2

  const floor = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL_LENGTH, WALL_THICKNESS, TUNNEL_WIDTH), rockMat)
  floor.position.set(TUNNEL_LENGTH / 2, -WALL_THICKNESS / 2, 0)
  floor.receiveShadow = true
  group.add(floor)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL_LENGTH, WALL_THICKNESS, TUNNEL_WIDTH), rockMat)
  ceiling.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT + WALL_THICKNESS / 2, 0)
  group.add(ceiling)

  const sideGeom = new THREE.BoxGeometry(TUNNEL_LENGTH, TUNNEL_HEIGHT, WALL_THICKNESS)
  const wallL = new THREE.Mesh(sideGeom, rockMat)
  wallL.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT / 2, half)
  group.add(wallL)
  const wallR = new THREE.Mesh(sideGeom, rockMat)
  wallR.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT / 2, -half)
  group.add(wallR)

  const back = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, TUNNEL_HEIGHT, TUNNEL_WIDTH), rockMat)
  back.position.set(TUNNEL_LENGTH, TUNNEL_HEIGHT / 2, 0)
  group.add(back)

  // A lantern near the back, not the mouth, but deliberately dim — a mine
  // without the lamp quest owned has to read as genuinely dark regardless of
  // time of day (see docs/superpowers/specs/2026-09-13-quest-items-design.md),
  // so this is barely more than a glint on the rock rather than the earlier,
  // brighter fixture that lit the whole tunnel by itself. What actually lights
  // the interior once the player has reason to see is the lamp quest's own
  // PointLight on the player (game/scene.ts's `updatePlayerLamp`), not this.
  const lantern = new THREE.PointLight(0xffb15c, 0.5, 4)
  lantern.position.set(TUNNEL_LENGTH * 0.75, TUNNEL_HEIGHT * 0.6, 0)
  lantern.castShadow = true
  lantern.shadow.mapSize.set(256, 256)
  lantern.shadow.bias = -0.002
  group.add(lantern)

  return group
}
