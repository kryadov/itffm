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

const TUNNEL_WIDTH = 2.2
const TUNNEL_HEIGHT = 2.3

/** How far out, and how many directions, `placeMine` samples to find "into
 *  the hillside" — see its own doc comment for why this reads the terrain
 *  instead of a tag or a seed. */
const HEADING_SAMPLE_DIST = 8
const HEADING_CANDIDATES = 12

/** How far the procedurally-sited entrance needs from anything already
 *  standing, metres — a rough stand-in for the whole graph's own footprint
 *  along whichever heading it ends up boring (the heading itself is only
 *  known after the entrance point is picked, so this can only protect the
 *  mouth, not the full graph — the same simplification `world/shelter.ts`'s
 *  own SHELTER_CLEARANCE already accepts). */
const MINE_CLEARANCE = 6

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
 * Whether a point is close enough to this mine's own graph to count as
 * "inside" for the lamp's own on/off rule (`quest/lamp.ts`'s `lampIsOn`) — a
 * plain distance check against the graph's own reach (`m.reach`, see
 * `placeMine`), not a precise inside-the-tunnel test: the honest reading of
 * "you're at the mine, it's dark in there" stays the same as the original
 * single-corridor version, just sized to whatever the graph turned out to
 * be this world.
 */
export function isInsideMine(m: Mine, x: number, z: number): boolean {
  return Math.hypot(x - m.x, z - m.z) <= m.reach
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

/** Where the diamond quest item sits: near the far end of the one leaf
 *  marked `isDiamondChamber` (`buildMineGraph`), off to one side rather than
 *  dead-centre — found the same way as everything else back there, not lit
 *  for you. */
export function diamondSpotInMine(m: Mine): { x: number; y: number; z: number } {
  const chamber = m.segments.find((s) => s.isDiamondChamber)!
  const dx = chamber.x1 - chamber.x0
  const dz = chamber.z1 - chamber.z0
  const length = Math.hypot(dx, dz) || 1
  const dirX = dx / length
  const dirZ = dz / length
  const perpX = -dirZ
  const perpZ = dirX
  const along = length * 0.85
  const across = chamber.width * 0.28
  const lx = chamber.x0 + dirX * along + perpX * across
  const lz = chamber.z0 + dirZ * along + perpZ * across
  const { x, z } = localToWorld(m, lx, lz)
  return { x, y: m.y + chamber.y1, z }
}

/** How much a wall/floor/ceiling vertex can wander off its ideal position,
 *  metres — small enough to stay well inside WALL_CIRCLE_RADIUS's own
 *  margin from the collision circles (see `mineObstacles`), so the rock can
 *  never visibly poke through where the player is told they can walk. */
const ROCK_JITTER = 0.06

/** One deterministic jitter stream for the cave's own rock texture — always
 *  the same regardless of how many forks the graph happened to grow this
 *  world, so changing BRANCH_COUNT_RANGE's own roll never changes how
 *  jittery the rock looks. Re-created fresh each call so buildMineMesh stays
 *  a pure function of `m`. */
function jitterStream(m: Mine): () => number {
  return mulberry32((Math.round(m.x * 131) ^ Math.round(m.z * 733) ^ 0x2545f491) >>> 0)
}

/** A quad (two triangles) as a small standalone BufferGeometry, its four
 *  corners individually jittered by `rng` along all three axes — used for
 *  every floor/ceiling/wall panel below so the cave reads as rough rock
 *  rather than flawless drywall. */
function jitteredQuad(
  rng: () => number,
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
): THREE.BufferGeometry {
  const jittered = corners.map((c) => {
    const j = (): number => (rng() * 2 - 1) * ROCK_JITTER
    return new THREE.Vector3(c.x + j(), c.y + j(), c.z + j())
  })
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array([
    jittered[0].x, jittered[0].y, jittered[0].z,
    jittered[1].x, jittered[1].y, jittered[1].z,
    jittered[2].x, jittered[2].y, jittered[2].z,
    jittered[0].x, jittered[0].y, jittered[0].z,
    jittered[2].x, jittered[2].y, jittered[2].z,
    jittered[3].x, jittered[3].y, jittered[3].z,
  ])
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}

/** Floor, ceiling, two side walls (and a back wall on a leaf) for one
 *  segment, each panel following that segment's own start/end height —
 *  where the real slope and turns of the cave graph actually come from,
 *  rather than an axis-aligned box. */
function buildSegmentMeshes(seg: MineSegment, rng: () => number, mat: THREE.Material): THREE.Mesh[] {
  const dx = seg.x1 - seg.x0
  const dz = seg.z1 - seg.z0
  const length = Math.hypot(dx, dz) || 1
  const dirX = dx / length
  const dirZ = dz / length
  const perpX = -dirZ
  const perpZ = dirX
  const half = seg.width / 2

  const startL = new THREE.Vector3(seg.x0 + perpX * half, seg.y0, seg.z0 + perpZ * half)
  const startR = new THREE.Vector3(seg.x0 - perpX * half, seg.y0, seg.z0 - perpZ * half)
  const endL = new THREE.Vector3(seg.x1 + perpX * half, seg.y1, seg.z1 + perpZ * half)
  const endR = new THREE.Vector3(seg.x1 - perpX * half, seg.y1, seg.z1 - perpZ * half)
  const startLTop = startL.clone().setY(seg.y0 + TUNNEL_HEIGHT)
  const startRTop = startR.clone().setY(seg.y0 + TUNNEL_HEIGHT)
  const endLTop = endL.clone().setY(seg.y1 + TUNNEL_HEIGHT)
  const endRTop = endR.clone().setY(seg.y1 + TUNNEL_HEIGHT)

  const meshes: THREE.Mesh[] = [
    new THREE.Mesh(jitteredQuad(rng, [startR, startL, endL, endR]), mat), // floor
    new THREE.Mesh(jitteredQuad(rng, [startLTop, startRTop, endRTop, endLTop]), mat), // ceiling
    new THREE.Mesh(jitteredQuad(rng, [startL, startLTop, endLTop, endL]), mat), // left wall
    new THREE.Mesh(jitteredQuad(rng, [startRTop, startR, endR, endRTop]), mat), // right wall
  ]

  if (seg.isLeaf) {
    meshes.push(new THREE.Mesh(jitteredQuad(rng, [endR, endL, endLTop, endRTop]), mat)) // back wall
  }

  for (const mesh of meshes) mesh.receiveShadow = true
  return meshes
}

/** The entrance mouth's own decorative ring — an irregular fan of triangles
 *  standing in the opening at the very start of the root segment, read as a
 *  jagged hole in the hillside rather than a rectangular doorway. Visual
 *  only: the entrance carries no collision of its own, same as before this
 *  change. */
function buildEntranceDecoration(root: MineSegment, rng: () => number, mat: THREE.Material): THREE.Mesh {
  const half = root.width / 2
  const points = 8
  const positions: number[] = []
  const centerY = root.y0 + TUNNEL_HEIGHT / 2
  const ring: THREE.Vector3[] = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const rx = Math.cos(t) * half * 1.3
    const ry = Math.sin(t) * (TUNNEL_HEIGHT / 2 + half * 0.3)
    const wobble = 1 + (rng() * 2 - 1) * 0.35
    ring.push(new THREE.Vector3(root.x0, centerY + ry * wobble, root.z0 + rx * wobble))
  }
  for (let i = 0; i < points; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % points]
    positions.push(root.x0, centerY, root.z0, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geom.computeVertexNormals()
  return new THREE.Mesh(geom, mat)
}

/**
 * The cave's own geometry — every segment in `m.segments` gets a floor,
 * ceiling, two side walls, and (if it's a dead end or the diamond chamber) a
 * back wall, each panel a jittered quad (see `jitteredQuad`) for a rough,
 * asymmetric rock read rather than flawless boxes. The entrance gets its own
 * jagged decorative ring. One lantern near the diamond chamber, kept
 * deliberately dim — see its own doc comment below. Built in the group's own
 * local space and rotated as one piece by `m.heading`, same convention
 * `localToWorld` above works out by hand for collision, so the mesh and the
 * collision can never disagree.
 */
export function buildMineMesh(m: Mine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mine'
  group.position.set(m.x, m.y, m.z)
  group.rotation.y = -m.heading

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b564e, roughness: 1, flatShading: true })
  const rng = jitterStream(m)

  for (const seg of m.segments) {
    for (const mesh of buildSegmentMeshes(seg, rng, rockMat)) group.add(mesh)
  }
  const root = m.segments.find((s) => s.parentId === null)!
  group.add(buildEntranceDecoration(root, rng, rockMat))

  const chamber = m.segments.find((s) => s.isDiamondChamber)!
  const chamberDx = chamber.x1 - chamber.x0
  const chamberDz = chamber.z1 - chamber.z0
  const chamberLen = Math.hypot(chamberDx, chamberDz) || 1
  // A lantern near the diamond chamber, not the mouth, but deliberately dim
  // — a mine without the lamp quest owned has to read as genuinely dark
  // regardless of time of day (see
  // docs/superpowers/specs/2026-09-13-quest-items-design.md), so this is
  // barely more than a glint on the rock. What actually lights the interior
  // once the player has reason to see is the lamp quest's own PointLight on
  // the player (game/scene.ts's `updatePlayerLamp`), not this.
  const lantern = new THREE.PointLight(0xffb15c, 0.5, 4)
  lantern.position.set(
    chamber.x0 + (chamberDx / chamberLen) * chamberLen * 0.6,
    chamber.y1 + TUNNEL_HEIGHT * 0.6,
    chamber.z0 + (chamberDz / chamberLen) * chamberLen * 0.6,
  )
  lantern.castShadow = true
  lantern.shadow.mapSize.set(256, 256)
  lantern.shadow.bias = -0.002
  group.add(lantern)

  return group
}
