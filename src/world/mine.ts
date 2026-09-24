import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32, randRange } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'
import { densify } from '../util/geometry'

/**
 * The wood's one mine: a branching system of tunnels driven into the ground,
 * a rough-hewn rock mouth on the meadow, and a floor the player can actually
 * walk. This file is the pure core of it — the shape of the tunnels
 * (`placeMine`), which points are cave and which are rock (`caveSdf`), the
 * lattice the tunnel mesh and the tunnel collision are both read off
 * (`caveLattice`), and where the player stands (`mineFloorHeightAt`). How the
 * hillside is dressed around it lives in `mineTerrain.ts`, how it is drawn in
 * `mineMesh.ts`; both read this file, so the mesh, the collision and the
 * height the player walks at can never disagree.
 *
 * Design notes, and what changed from the first version (see the fix in
 * v0.95.5 — the mine used to be buried 5-7 m under the terrain, behind a
 * single-sided mesh):
 *
 *  - The floor is FLAT, at the height of the ground at the mouth. The first
 *    version dropped 5+ m over a 5 m ramp (a 45 degree wall the player's own
 *    slope limit refused), and hid the whole thing under the terrain mesh,
 *    which is opaque and single-sided.
 *  - The tunnels are the union of round-ended capsules, one per segment, so a
 *    fork is one open junction rather than two rectangles with a notch and a
 *    stray wall standing in the passage.
 *  - The mesh is built from a lattice of cells over that union, so it is
 *    watertight by construction: every wall, floor and ceiling quad shares
 *    its corner vertices with its neighbours.
 */

export interface MineSegment {
  id: number
  /** null for the entrance/root segment. */
  parentId: number | null
  /** Local start/end, metres, before `Mine.heading`'s rotation — the same
   *  local frame `localToWorld` already rotates as one piece. The mouth is
   *  the local origin, and the tunnels bore along local +x. */
  x0: number
  z0: number
  x1: number
  z1: number
  /** Floor height relative to the entrance. Always 0 now — the floor is flat,
   *  see the note at the top of the file. Kept on the segment so a future
   *  sloped shaft has somewhere to put it. */
  y0: number
  y1: number
  width: number
  /** No children — a dead end (or the diamond chamber). */
  isLeaf: boolean
  /** True for exactly one leaf: the far end of the one path that actually
   *  leads to the diamond, per the branching cave design
   *  (docs/superpowers/specs/2026-09-15-mine-cave-design.md §1). */
  isDiamondChamber: boolean
}

export interface Mine {
  x: number
  z: number
  /** Ground height at the entrance itself — also the height of the whole
   *  floor. */
  y: number
  /** Radians the cave bores away from the entrance, 0 along +x. */
  heading: number
  /** The cave's own branching graph — see MineSegment. Always has at least
   *  one segment (the entrance), even with zero forks. */
  segments: MineSegment[]
  /** Farthest straight-line distance, in local metres, from the entrance to
   *  the far end of any segment. */
  reach: number
}

/** Structurally identical to game/player.ts's Obstacle — see the same note in deadwood.ts. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
}

/** A tunnel comfortable to walk in, and to turn round in: the first version
 *  was 2.2 m wide, and a first-person player's 0.3 m body radius plus the
 *  wall circles' own left barely a metre and a half to steer through. */
export const TUNNEL_WIDTH = 3.2
export const TUNNEL_HEIGHT = 2.8
/** The floor mesh sits this far above the ground the player is told they
 *  stand on — hides the seam against the apron terrain. */
export const FLOOR_LIFT = 0.02

/** How far out, and how many directions, `placeMine` samples to find "into
 *  the hillside" — see its own doc comment for why this reads the terrain
 *  instead of a tag or a seed. */
const HEADING_SAMPLE_DIST = 8
const HEADING_CANDIDATES = 12

/** How far the procedurally-sited entrance needs from anything already
 *  standing, metres. The mound the tunnels sit under is wider than this, but
 *  the mouth is the part that must stay clear. */
const MINE_CLEARANCE = 8

/** How far the levelled apron in front of the mouth reaches, metres (see
 *  mineTerrain.ts), and the slack kept between the whole system — mound rim
 *  included — and the plot's edge. */
const APRON_EXTENT = 12
const EDGE_MARGIN = 8

/** A trail this close to a passage (metres, outline to point) counts as
 *  running over the mound; the mound's own radius depends on the terrain mesh
 *  (mineTerrain.ts), and this is a little over its usual reach. */
const TRAIL_CLEARANCE = 6
const TRAIL_SAMPLE = 2
/** How far out from the tunnels the mound reaches, metres, for keeping the
 *  hut and the rest out from under it — a little over the mound's own reach
 *  on the usual terrain mesh (mineTerrain.ts's deckRadius, 3.6 cells). */
const MOUND_REACH = 9
/** Half the width of the levelled apron in front of the mouth, metres. */
const APRON_HALF_WIDTH = 6
/** Mouths tried round the shelter before settling for the least bad one. */
const MOUTH_TRIES = 12

/** Root segment: length of the entrance passage, metres. */
const ROOT_LENGTH_RANGE: [number, number] = [6, 8]
/** How many forks the whole tree tries for. A live request (2026-09-24): the
 *  diamond was too easy to find in 3-5, so the mine is a real maze now. */
const BRANCH_COUNT_RANGE: [number, number] = [9, 12]
const CHILD_LENGTH_RANGE: [number, number] = [5.5, 10]
/** Half-angle, radians, each of a fork's side passages turns away from the
 *  parent's own heading — wide enough that the forks read as genuinely
 *  different directions, not a barely-there kink. */
const FORK_TURN_RANGE: [number, number] = [0.55, 1.0]
/** The chance a fork splits three ways — a side passage each way and one
 *  running on nearly straight. */
const THREE_WAY_CHANCE = 0.35
/** No passage may head more than this far off the entrance's own axis, so the
 *  system fans out into the hill instead of curling back through the mouth. */
const MAX_HEADING = 1.3
const CHILD_WIDTH_FACTOR_RANGE: [number, number] = [0.85, 1.15]
/** The diamond chamber's own leaf is wider — a small room, not just a wider
 *  corridor. */
const CHAMBER_WIDTH_FACTOR = 1.5
/** The farthest any passage reaches from the mouth, metres — and never more
 *  than half the plot, so the tunnels, their mound and the apron all fit it. */
const MAX_REACH = 55
/** Solid rock kept between two passages that are not joined, metres, wall to
 *  wall — or a new passage would break into an old one and make a shortcut
 *  (and a chamber widened afterwards would eat into its neighbour). */
const ROCK_BETWEEN = 1.2
/** The same, around the widened diamond chamber. */
const CHAMBER_ROCK = 0.9
/** Tries per passage: its length is cut back each time it would break into
 *  another one, and it is dropped when none fits. */
const FIT_TRIES = 4
/** Least angle between two passages out of one fork, radians: closer, and the
 *  rock between them is a sliver the tunnel lattice cannot draw. */
const MIN_SIBLING_SPREAD = 0.7

/** Closest distance between two segments that do not cross, local metres. */
function segmentGap(a: MineSegment, b: MineSegment): number {
  const d = (px: number, pz: number, s: MineSegment): number => {
    const dx = s.x1 - s.x0
    const dz = s.z1 - s.z0
    const l2 = dx * dx + dz * dz
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / l2)) : 0
    return Math.hypot(px - s.x0 - dx * t, pz - s.z0 - dz * t)
  }
  // Crossing segments are 0 apart.
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
  const d1 = cross(a.x0, a.z0, a.x1, a.z1, b.x0, b.z0)
  const d2 = cross(a.x0, a.z0, a.x1, a.z1, b.x1, b.z1)
  const d3 = cross(b.x0, b.z0, b.x1, b.z1, a.x0, a.z0)
  const d4 = cross(b.x0, b.z0, b.x1, b.z1, a.x1, a.z1)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(d(a.x0, a.z0, b), d(a.x1, a.z1, b), d(b.x0, b.z0, a), d(b.x1, b.z1, a))
}

/** Tunnel length from the mouth to the far end of `s`. */
function depthOf(s: MineSegment, byId: Map<number, MineSegment>): number {
  let d = 0
  for (let c: MineSegment | undefined = s; c; c = c.parentId === null ? undefined : byId.get(c.parentId)) {
    d += Math.hypot(c.x1 - c.x0, c.z1 - c.z0)
  }
  return d
}

/**
 * Builds the cave's own branching graph: an entrance passage, then
 * `BRANCH_COUNT_RANGE` forks — two ways or three — off whichever leaf the RNG
 * picks each time (deeper ones more often, so the maze grows into the hill
 * rather than bunching at the mouth). A passage that would break into
 * another is cut back or dropped, so solid rock always stands between two
 * passages that are not joined. The diamond chamber is the dead end farthest
 * along the tunnels from the mouth; every other leaf is a dead end.
 * See docs/superpowers/specs/2026-09-15-mine-cave-design.md §1.
 */
function buildMineGraph(rng: () => number, maxReach: number): MineSegment[] {
  const rootLength = randRange(rng, ROOT_LENGTH_RANGE)
  const root: MineSegment = {
    id: 0,
    parentId: null,
    x0: 0,
    z0: 0,
    x1: rootLength,
    z1: 0,
    y0: 0,
    y1: 0,
    width: TUNNEL_WIDTH,
    isLeaf: true,
    isDiamondChamber: false,
  }
  const segments: MineSegment[] = [root]
  const byId = new Map<number, MineSegment>([[0, root]])
  let openLeaves = [root]
  let nextId = 1

  const fits = (child: MineSegment, parent: MineSegment, siblings: MineSegment[]): boolean => {
    // The whole system must fit the plot (see placeMine).
    if (Math.hypot(child.x1, child.z1) + (child.width * CHAMBER_WIDTH_FACTOR) / 2 > maxReach) return false
    for (const s of segments) {
      if (s.id === parent.id || s.parentId === parent.id) continue
      if (segmentGap(child, s) < (child.width + s.width) / 2 + ROCK_BETWEEN) return false
    }
    for (const s of siblings) {
      // Siblings share their start (and MIN_SIBLING_SPREAD keeps them apart
      // there); their far ends must stand clear of each other.
      if (Math.hypot(child.x1 - s.x1, child.z1 - s.z1) < (child.width + s.width) / 2 + ROCK_BETWEEN) return false
    }
    return true
  }

  const branchCount = Math.floor(randRange(rng, BRANCH_COUNT_RANGE))
  // Only a real fork — two passages or three — is taken; a leaf that finds no
  // room for one twice is left a dead end. A bounded number of tries in all.
  const failures = new Map<number, number>()
  let forks = 0
  for (let attempt = 0; forks < branchCount && attempt < branchCount * 8 && openLeaves.length > 0; attempt++) {
    // Deeper leaves are a little likelier to fork, so the maze grows into the
    // hill rather than bunching at the mouth.
    const weights = openLeaves.map((l) => 1 + depthOf(l, byId) / 25)
    let pick = rng() * weights.reduce((a, b) => a + b, 0)
    let parent = openLeaves[openLeaves.length - 1]
    for (let k = 0; k < openLeaves.length; k++) {
      pick -= weights[k]
      if (pick <= 0) {
        parent = openLeaves[k]
        break
      }
    }
    const parentAngle = Math.atan2(parent.z1 - parent.z0, parent.x1 - parent.x0)
    const turns = rng() < THREE_WAY_CHANCE
      ? [randRange(rng, FORK_TURN_RANGE), (rng() - 0.5) * 0.3, -randRange(rng, FORK_TURN_RANGE)]
      : [randRange(rng, FORK_TURN_RANGE), -randRange(rng, FORK_TURN_RANGE)]
    const children: MineSegment[] = []
    for (const turn of turns) {
      const angle = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, parentAngle + turn))
      // Clamping can fold two passages onto one heading; keep them apart.
      if (children.some((c) => Math.abs(Math.atan2(c.z1 - c.z0, c.x1 - c.x0) - angle) < MIN_SIBLING_SPREAD)) continue
      let length = randRange(rng, CHILD_LENGTH_RANGE)
      const width = TUNNEL_WIDTH * randRange(rng, CHILD_WIDTH_FACTOR_RANGE)
      for (let tryNo = 0; tryNo < FIT_TRIES; tryNo++, length *= 0.75) {
        const child: MineSegment = {
          id: nextId + children.length,
          parentId: parent.id,
          x0: parent.x1,
          z0: parent.z1,
          x1: parent.x1 + Math.cos(angle) * length,
          z1: parent.z1 + Math.sin(angle) * length,
          y0: 0,
          y1: 0,
          width,
          isLeaf: true,
          isDiamondChamber: false,
        }
        if (length < CHILD_LENGTH_RANGE[0] * 0.5 || !fits(child, parent, children)) continue
        children.push(child)
        break
      }
    }
    if (children.length < 2) {
      const failed = (failures.get(parent.id) ?? 0) + 1
      failures.set(parent.id, failed)
      if (failed >= 2) openLeaves = openLeaves.filter((s) => s.id !== parent.id)
      continue
    }
    forks++
    nextId += children.length
    parent.isLeaf = false
    for (const c of children) {
      segments.push(c)
      byId.set(c.id, c)
    }
    openLeaves = openLeaves.filter((s) => s.id !== parent.id).concat(children)
  }

  // The diamond waits at the far end of the longest way in, in a chamber
  // widened as far as the rock around it allows.
  const leaves = segments.filter((s) => s.isLeaf)
  let chamber = leaves[0]
  for (const l of leaves) if (depthOf(l, byId) > depthOf(chamber, byId)) chamber = l
  chamber.isDiamondChamber = true
  const base = chamber.width
  const neighbours = segments.filter((s) =>
    s.id !== chamber.id && s.id !== chamber.parentId && s.parentId !== chamber.parentId)
  for (let f = CHAMBER_WIDTH_FACTOR; f >= 1; f -= 0.1) {
    chamber.width = base * f
    if (neighbours.every((s) => segmentGap(chamber, s) >= (chamber.width + s.width) / 2 + CHAMBER_ROCK)) break
    chamber.width = base
  }

  return segments
}

/**
 * Where the wood's one mine/cave interior sits. A real OSM cave/adit/
 * mineshaft mouth (`geo/parse.ts`'s `CaveEntrance`, `mapped` here) always
 * wins when this plot has one — the same rule `world/shelter.ts`'s
 * `placeShelter` already follows for a mapped hut. Every wood gets a mine
 * either way (a live request, 2026-09-15: the diamond quest item needs
 * somewhere to be in every wood) — where nothing was surveyed, the entrance is
 * sited the same way the shelter and campfire already are: a random
 * direction from the shelter, `findOpenSpot` keeping it clear of everything
 * else already standing.
 *
 * OSM never records which way a mapped entrance faces, and a procedural one
 * has no such record either, so the heading is always read off the terrain
 * itself rather than guessed or seeded: whichever of a ring of candidate
 * directions climbs the most over `HEADING_SAMPLE_DIST` is treated as "into
 * the hillside" — the same thing a real visitor would look for. The mouth
 * ends up with the hill rising behind it and open ground in front.
 */
export function placeMine(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
  shelterPos: Vec2,
  mapped: Vec2[] = [],
  /** Trails (local metres): the tunnels are pointed away from them where the
   *  hillside allows, so a trail arrives at the doorway rather than at the
   *  back of the mound. */
  trails: Vec2[][] = [],
  /** What the mound over the tunnels and the apron in front must never bury:
   *  the hut, the campfire, the fishing shack, the platforms, the rails. A
   *  mine is dozens of metres across (a live report, 2026-09-24: its mound
   *  swallowed the hut once it grew), so keeping only the mouth clear of the
   *  rest is not enough. */
  keepClear: Circle[] = [],
): Mine {
  // The tunnels, the mound over them and the levelled apron in front must all
  // stand inside this plot: past its edge the ground is another chunk's
  // (game/worldStream.ts), which knows nothing of the mine. The graph does not
  // depend on where it sits, so it is built first and its size decides how far
  // from the edge the mouth may be sited.
  const graphRng = mulberry32((seed + 0x9e3779b1) >>> 0)
  const graph = buildMineGraph(graphRng, Math.min(MAX_REACH, halfSize * 0.5))
  const reach = Math.max(...graph.map((s) => Math.hypot(s.x1, s.z1)))
  const extent = Math.max(
    APRON_EXTENT,
    ...graph.flatMap((s) => [Math.hypot(s.x0, s.z0) + s.width / 2, Math.hypot(s.x1, s.z1) + s.width / 2]),
  )
  const edge = halfSize - extent - EDGE_MARGIN
  const trailPoints = trails.flatMap((t) => densify(t, TRAIL_SAMPLE))

  interface Candidate { x: number; z: number; here: number; heading: number; rise: number; overshoot: number; buried: number; onTrail: number }

  /** Every heading from one mouth, scored. */
  const headingsAt = (x: number, z: number): Candidate[] => {
    const here = ground.heightAt(x, z)
    const out: Candidate[] = []
    for (let i = 0; i < HEADING_CANDIDATES; i++) {
      const heading = (i / HEADING_CANDIDATES) * Math.PI * 2
      const rise = ground.heightAt(x + Math.cos(heading) * HEADING_SAMPLE_DIST, z + Math.sin(heading) * HEADING_SAMPLE_DIST) - here
      let overshoot = 0
      const cos = Math.cos(heading)
      const sin = Math.sin(heading)
      for (const s of graph) {
        for (const [lx, lz] of [[s.x1, s.z1], [s.x0, s.z0]] as const) {
          const r = s.width / 2 + EDGE_MARGIN
          const wx = x + lx * cos - lz * sin
          const wz = z + lx * sin + lz * cos
          overshoot = Math.max(overshoot, Math.abs(wx) + r - halfSize, Math.abs(wz) + r - halfSize)
        }
      }
      const fx = x - APRON_EXTENT * cos
      const fz = z - APRON_EXTENT * sin
      overshoot = Math.max(overshoot, Math.abs(fx) - halfSize, Math.abs(fz) - halfSize)
      const probe: Mine = { x, z, y: here, heading, segments: graph, reach }
      // Anything that must stay clear lying under the mound, or on the apron.
      let buried = 0
      for (const k of keepClear) {
        const { lx, lz } = worldToLocal(probe, k.x, k.z)
        const underMound = lx > -k.radius && caveSdf(probe, Math.max(0, lx), lz) < MOUND_REACH + k.radius
        const onApron = lx <= 0 && lx > -APRON_EXTENT - k.radius && Math.abs(lz) < APRON_HALF_WIDTH + k.radius
        if (underMound || onApron) buried++
      }
      // Trail points lying on the mound (behind the mouth's plane, within its
      // radius of the tunnels): the trail would run into the back of the rock.
      let onTrail = 0
      for (const tp of trailPoints) {
        const { lx, lz } = worldToLocal(probe, tp.x, tp.z)
        if (lx > 1 && caveSdf(probe, lx, lz) < TRAIL_CLEARANCE) onTrail++
      }
      out.push({ x, z, here, heading, rise, overshoot: Math.max(0, overshoot), buried, onTrail })
    }
    return out
  }

  const better = (a: Candidate, b: Candidate): boolean => {
    // Staying on the plot always wins; then burying nothing; then keeping off
    // the trails; then the steepest climb into the hill.
    if (Math.abs(a.overshoot - b.overshoot) > 1e-9) return a.overshoot < b.overshoot
    if (a.buried !== b.buried) return a.buried < b.buried
    if (a.onTrail !== b.onTrail) return a.onTrail < b.onTrail
    return a.rise > b.rise
  }
  const bestOf = (cs: Candidate[]): Candidate => cs.reduce((best, c) => (better(c, best) ? c : best))

  const real = mapped.find((m) => Math.abs(m.x) <= halfSize && Math.abs(m.z) <= halfSize)
  let best: Candidate
  if (real) {
    best = bestOf(headingsAt(real.x, real.z))
  } else {
    // A few mouths round the shelter, the first that fits the plot and buries
    // nothing winning (the seed's own direction first, so a wood with room
    // keeps the mine where it always was).
    const rng = mulberry32(seed)
    const angle = rng() * Math.PI * 2
    const dist = halfSize * (0.25 + rng() * 0.4)
    const limit = Math.max(0, edge)
    const clamp = (v: number): number => Math.max(-limit, Math.min(limit, v))
    best = null as unknown as Candidate
    for (let k = 0; k < MOUTH_TRIES; k++) {
      const a = angle + (k * Math.PI * 2 * 0.382)
      const d = k === 0 ? dist : halfSize * (0.2 + ((k * 0.37) % 0.5))
      const origin = { x: clamp(shelterPos.x + Math.cos(a) * d), z: clamp(shelterPos.z + Math.sin(a) * d) }
      const { x, z } = findOpenSpot(obstacles, limit, origin, MINE_CLEARANCE)
      const c = bestOf(headingsAt(x, z))
      if (!best || better(c, best)) best = c
      if (best.overshoot === 0 && best.buried === 0) break
    }
  }
  return { x: best.x, z: best.z, y: best.here, heading: best.heading, segments: graph, reach }
}

/** A point `lx` deep and `lz` across from the entrance, in world metres. */
export function localToWorld(m: Mine, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(m.heading)
  const sin = Math.sin(m.heading)
  return { x: m.x + lx * cos - lz * sin, z: m.z + lx * sin + lz * cos }
}

/** The inverse of `localToWorld` — world metres back to the graph's own
 *  local frame. */
export function worldToLocal(m: Mine, x: number, z: number): { lx: number; lz: number } {
  const cos = Math.cos(m.heading)
  const sin = Math.sin(m.heading)
  const dx = x - m.x
  const dz = z - m.z
  return { lx: dx * cos + dz * sin, lz: -dx * sin + dz * cos }
}

/** Value returned by `caveSdf` for anything behind the mouth's own plane —
 *  large, so it reads as "solid" to every caller. */
const OUTSIDE = 1e3

/**
 * Signed distance from a local point to the tunnel system: negative inside a
 * passage (how far from the nearest wall), positive in rock. The union of one
 * round-ended capsule per segment, clipped to the mouth's own plane (nothing
 * of the cave exists at lx < 0). The single source of truth for "is this
 * cave?" — the mesh lattice, the collision and the player's floor all ask it.
 */
export function caveSdf(m: Mine, lx: number, lz: number): number {
  if (lx < 0) return OUTSIDE
  let best = Infinity
  for (const seg of m.segments) {
    const dx = seg.x1 - seg.x0
    const dz = seg.z1 - seg.z0
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((lx - seg.x0) * dx + (lz - seg.z0) * dz) / len2))
    const d = Math.hypot(lx - (seg.x0 + dx * t), lz - (seg.z0 + dz * t)) - seg.width / 2
    if (d < best) best = d
  }
  return best
}

/**
 * Whether a point is over (or right at the mouth of) this mine's own tunnels
 * in plan view — a metre of slack included so the doorway itself counts. Pure
 * geometry: the hill above a tunnel is over the same x/z, so this does NOT
 * tell whether the player is actually down in it. The game asks
 * `MineTerrain.update` (mineTerrain.ts) for that.
 */
export function isInsideMine(m: Mine, x: number, z: number): boolean {
  const { lx, lz } = worldToLocal(m, x, z)
  return caveSdf(m, lx, lz) < 1
}

/**
 * The height the player stands at inside the tunnels (world metres), or
 * `null` when a point is not over any passage. `game/scene.ts` wraps the real
 * terrain with `mineTerrain.ts`, which decides when this answer is the right
 * one for the player (the hill above the tunnels shares their x/z).
 */
export function mineFloorHeightAt(m: Mine, x: number, z: number): number | null {
  const { lx, lz } = worldToLocal(m, x, z)
  return caveSdf(m, lx, lz) < 0 ? m.y : null
}

// --------------------------------------------------------------------------
// The lattice: the one description of the tunnel walls the mesh and the
// collision are both read from.

/** Cell size of the tunnel lattice, metres. Fine enough for a rough-hewn
 *  wall, coarse enough that the whole system is a few thousand quads. */
export const LATTICE = 0.5
/** How much lower the vault comes at the wall than in the middle of a
 *  passage, metres — a rounded, hewn profile instead of a rectangular box. */
const VAULT_DROP = 0.7
/** How far from the wall the vault has fully risen, metres. */
const VAULT_SPAN = 1.3
/** Deterministic wobble of a lattice corner, metres — must stay well inside
 *  what the wall circles below leave the player (see WALL_RADIUS). */
const ROCK_JITTER_XZ = 0.07
/** How far a boundary corner is pulled onto the true outline (a share of its
 *  distance from it, capped). Not all the way: pulling every boundary corner
 *  fully onto a diagonal outline flattens the cells along it to slivers, and a
 *  sliver can fold over and face the wrong way. */
const PULL = 0.6
const PULL_MAX = 0.3 * LATTICE
const ROCK_JITTER_Y = 0.14
/** Collision circle on every wall corner. Together with the player's own
 *  radius (0.3) it keeps the camera at least ~0.4 m from any visible wall
 *  face, which is more than the near plane and the jitter above need. */
const WALL_RADIUS = 0.22

export interface CaveVertex {
  /** Local metres. */
  x: number
  z: number
  /** Ceiling height above the floor, metres. */
  ceil: number
}

export interface WallEdge {
  a: CaveVertex
  b: CaveVertex
  /** Unit direction (local x/z) the wall faces — into the passage. */
  nx: number
  nz: number
}

export interface CaveCell {
  i: number
  j: number
  /** Its four corners in order (i,j) (i+1,j) (i+1,j+1) (i,j+1) — x then z. */
  corners: [CaveVertex, CaveVertex, CaveVertex, CaveVertex]
  cx: number
  cz: number
}

export interface CaveLattice {
  cells: CaveCell[]
  walls: WallEdge[]
}

const latticeCache = new WeakMap<Mine, CaveLattice>()

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A deterministic pair of [-1, 1] values for one lattice corner. */
function cornerNoise(i: number, j: number, salt: number): [number, number, number] {
  const rng = mulberry32((Math.imul(i + 4096, 73856093) ^ Math.imul(j + 4096, 19349663) ^ salt) >>> 0)
  return [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]
}

/**
 * The tunnel system as a grid of cells: every cell whose centre is cave is a
 * floor + ceiling quad, every cell edge between cave and rock is a wall. The
 * corners on the boundary are pulled onto the true cave outline (`caveSdf`
 * zero), and every corner wobbles by a fixed deterministic amount, so the
 * walls read as rock — while the corners stay SHARED between neighbouring
 * quads, which is what makes the surface closed with no cracks to see the
 * outside through. Cached per mine.
 */
export function caveLattice(m: Mine): CaveLattice {
  const cached = latticeCache.get(m)
  if (cached) return cached

  const salt = (Math.round(m.x * 131) ^ Math.round(m.z * 733) ^ 0x2545f491) >>> 0
  let maxX = 0
  let maxZ = 0
  for (const s of m.segments) {
    const r = s.width / 2 + 1
    maxX = Math.max(maxX, s.x0 + r, s.x1 + r)
    maxZ = Math.max(maxZ, Math.abs(s.z0) + r, Math.abs(s.z1) + r)
  }
  const ni = Math.ceil(maxX / LATTICE)
  const j0 = -Math.ceil(maxZ / LATTICE)
  const nj = -j0 * 2
  const occupied = new Uint8Array(ni * nj)
  const occ = (i: number, j: number): boolean =>
    i >= 0 && i < ni && j >= j0 && j < j0 + nj && occupied[i * nj + (j - j0)] === 1
  for (let i = 0; i < ni; i++) {
    for (let j = j0; j < j0 + nj; j++) {
      if (caveSdf(m, (i + 0.5) * LATTICE, (j + 0.5) * LATTICE) < 0) occupied[i * nj + (j - j0)] = 1
    }
  }

  const vertexCache = new Map<number, CaveVertex>()
  // Where each corner stood before the pull onto the outline, and before its
  // jitter too — for undoing either where a cell folds (below).
  const unpulled = new Map<CaveVertex, { x: number; z: number; gx: number; gz: number }>()
  const vertex = (i: number, j: number): CaveVertex => {
    const key = i * 100003 + j
    const hit = vertexCache.get(key)
    if (hit) return hit
    let x = i * LATTICE
    let z = j * LATTICE
    const gx0 = x
    const gz0 = z
    let px = 0
    let pz = 0
    const sdf0 = caveSdf(m, x, z)
    // On the boundary when the four cells around it are not all cave.
    const around = [occ(i - 1, j - 1), occ(i, j - 1), occ(i - 1, j), occ(i, j)]
    const boundary = around.some(Boolean) && !around.every(Boolean)
    if (i > 0) {
      if (boundary) {
        const e = 0.05
        let gx = caveSdf(m, x + e, z) - caveSdf(m, x - e, z)
        let gz = caveSdf(m, x, z + e) - caveSdf(m, x, z - e)
        const gl = Math.hypot(gx, gz) || 1
        gx /= gl
        gz /= gl
        const pull = Math.max(-PULL_MAX, Math.min(PULL_MAX, sdf0 * PULL))
        px = -gx * pull
        pz = -gz * pull
        x += px
        z += pz
      }
      const [nx, nz] = cornerNoise(i, j, salt)
      x += nx * ROCK_JITTER_XZ
      z += nz * ROCK_JITTER_XZ
    } else if (boundary) {
      // The mouth plane itself: slide along it onto the outline, never off it.
      const gz = Math.sign(caveSdf(m, 0, z + 0.05) - caveSdf(m, 0, z - 0.05)) || 1
      z -= gz * Math.max(-PULL_MAX, Math.min(PULL_MAX, sdf0 * PULL))
    }
    const [, , ny] = cornerNoise(i, j, salt ^ 0x9e3779b1)
    const depth = Math.max(0, -caveSdf(m, Math.max(0, x), z))
    const ceil = TUNNEL_HEIGHT - VAULT_DROP * (1 - smoothstep(0, VAULT_SPAN, depth)) + (i > 0 ? ny * ROCK_JITTER_Y : 0)
    const v = { x, z, ceil }
    vertexCache.set(key, v)
    if (i > 0) unpulled.set(v, { x: x - px, z: z - pz, gx: gx0, gz: gz0 })
    return v
  }

  const cells: CaveCell[] = []
  const walls: WallEdge[] = []
  for (let i = 0; i < ni; i++) {
    for (let j = j0; j < j0 + nj; j++) {
      if (!occ(i, j)) continue
      const v00 = vertex(i, j)
      const v10 = vertex(i + 1, j)
      const v11 = vertex(i + 1, j + 1)
      const v01 = vertex(i, j + 1)
      const cx = (i + 0.5) * LATTICE
      const cz = (j + 0.5) * LATTICE
      cells.push({ i, j, corners: [v00, v10, v11, v01], cx, cz })
      // Walls: toward every neighbour that is rock. The neighbour behind the
      // mouth plane (i - 1 at i = 0) is the doorway, not a wall.
      if (i > 0 && !occ(i - 1, j)) walls.push({ a: v01, b: v00, nx: 1, nz: 0 })
      if (!occ(i + 1, j)) walls.push({ a: v10, b: v11, nx: -1, nz: 0 })
      if (!occ(i, j - 1)) walls.push({ a: v00, b: v10, nx: 0, nz: 1 })
      if (!occ(i, j + 1)) walls.push({ a: v11, b: v01, nx: 0, nz: -1 })
    }
  }

  // A corner pulled onto a diagonal outline from both sides can fold a cell
  // over. Where one does, its corners give up the pull, then the jitter too —
  // shared corners, so the neighbours follow and the surface stays closed.
  const folded = (c: CaveCell): boolean => {
    const [a, b, cc, d] = c.corners
    return (b.x - a.x) * (cc.z - a.z) - (b.z - a.z) * (cc.x - a.x) <= 1e-6 ||
      (cc.x - a.x) * (d.z - a.z) - (cc.z - a.z) * (d.x - a.x) <= 1e-6
  }
  for (const stage of [0, 1]) {
    for (const c of cells) {
      if (!folded(c)) continue
      for (const v of c.corners) {
        const u = unpulled.get(v)
        if (!u) continue
        v.x = stage === 0 ? u.x : u.gx
        v.z = stage === 0 ? u.z : u.gz
      }
    }
  }

  const lattice = { cells, walls }
  latticeCache.set(m, lattice)
  return lattice
}

/**
 * The cave's own collision: a small circle on every wall corner (and one
 * mid-way along any long wall edge), read off the very lattice the mesh is
 * built from — so the walls the player bumps are exactly the walls they see.
 * Nothing is placed across the doorway itself. Dead ends and the diamond
 * chamber need nothing special: their walls are lattice walls like any other.
 *
 * `moundRadius` (mineTerrain.ts's `deckRadius`) adds the outside of the mine:
 * the rock face either side of the doorway, and a ring along the foot of the
 * mound over the tunnels. The mound is a steep outcrop, and a slope limit is
 * not a wall (walk at an angle to the fall line and any grade becomes a
 * climb), so its foot is collision, at the height where it has visibly
 * risen into a cliff.
 */
export function mineObstacles(m: Mine, moundRadius?: number): CircleObstacle[] {
  const out: CircleObstacle[] = []
  const seen = new Set<CaveVertex>()
  const push = (lx: number, lz: number): void => {
    out.push({ ...localToWorld(m, lx, lz), radius: WALL_RADIUS })
  }
  for (const w of caveLattice(m).walls) {
    for (const v of [w.a, w.b]) {
      if (seen.has(v)) continue
      seen.add(v)
      push(v.x, v.z)
    }
    if (Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) > 0.55) push((w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2)
  }

  const half = m.segments[0].width / 2
  const faceExtra = moundRadius === undefined ? FACE_HALF_EXTRA : moundRadius + 0.5
  for (let s = half + LATTICE; s <= half + faceExtra; s += 0.4) {
    push(0, s)
    push(0, -s)
  }

  if (moundRadius !== undefined) {
    // The boulders tumbled at the foot of the face stand out in front of it.
    for (const b of outcropBoulders(m, moundRadius)) {
      if (b.at === 'foot') out.push({ ...localToWorld(m, b.lx, b.lz), radius: b.r * 0.85 })
    }
    // Where the mound has risen to about a metre: a cliff by then.
    const foot = moundRadius - FOOT_INSET
    let maxX = 0
    let maxZ = 0
    for (const s of m.segments) {
      maxX = Math.max(maxX, s.x0, s.x1)
      maxZ = Math.max(maxZ, Math.abs(s.z0), Math.abs(s.z1))
    }
    const reach = moundRadius + 1
    for (let x = 0.5; x <= maxX + reach; x += RING_STEP) {
      for (let z = -(maxZ + reach); z <= maxZ + reach; z += RING_STEP) {
        if (Math.abs(caveSdf(m, x, z) - foot) <= RING_BAND) push(x, z)
      }
    }
  }
  return out
}

/** A boulder dressing the outcrop: at the foot of the rock face (on the
 *  apron's ground) or along its top edge (on the mound). Local metres. */
export interface OutcropBoulder {
  lx: number
  lz: number
  /** Rough radius, metres. */
  r: number
  at: 'foot' | 'crest'
}

/**
 * Boulders along the outcrop: tumbled at the foot of the rock face either side
 * of the doorway, and set along its top edge, so neither reads as one long
 * ruled line (a live report, 2026-09-24: "a long grey wall"). Pure and
 * deterministic; the mesh (`mineMesh.ts`) and the collision (`mineObstacles`)
 * both read this one list.
 */
export function outcropBoulders(m: Mine, moundRadius: number): OutcropBoulder[] {
  const rng = mulberry32((Math.round(m.x * 41) ^ Math.round(m.z * 43) ^ 0x6b43a9b5) >>> 0)
  const half = m.segments[0].width / 2
  const out: OutcropBoulder[] = []
  const clearOfDoor = (r: number): number => half + 0.35 + r
  for (const side of [1, -1]) {
    // The foot: every metre or two along the face, a few gaps.
    for (let s = half + 0.9; s < half + moundRadius;) {
      const r = 0.45 + rng() * 0.6
      const keep = rng() < 0.82
      const lz = side * Math.max(s + r * 0.4, clearOfDoor(r))
      const lx = 0.12 + rng() * 0.28
      if (keep) out.push({ lx, lz, r, at: 'foot' })
      s += r * 1.2 + 0.5 + rng() * 1.3
    }
    // The top edge, a little back from the brink.
    for (let s = half + 0.6 + rng() * 1.5; s < half + moundRadius * 0.75;) {
      const r = 0.35 + rng() * 0.45
      const lz = side * Math.max(s, clearOfDoor(r))
      out.push({ lx: 0.7 + rng() * 1.1, lz, r, at: 'crest' })
      s += 2.2 + rng() * 2.2
    }
  }
  return out
}

/** How far in from the mound's rim its foot collision stands, metres, the
 *  spacing of the sample grid the ring is read from, and half the width of
 *  the band of the outline it takes points from (a little over the grid step,
 *  so no gap opens along a diagonal). */
const FOOT_INSET = 0.4
const RING_STEP = 0.35
const RING_BAND = 0.22

/** How far past each doorway jamb the rock face (and its collision) runs,
 *  metres — `mineTerrain.ts`'s mound tapers to nothing inside this. */
export const FACE_HALF_EXTRA = 5.5

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
  const along = length * 0.8
  const across = chamber.width * 0.22
  const lx = chamber.x0 + dirX * along + perpX * across
  const lz = chamber.z0 + dirZ * along + perpZ * across
  const { x, z } = localToWorld(m, lx, lz)
  return { x, y: m.y, z }
}
