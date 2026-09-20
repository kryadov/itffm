import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'
import { buildRodModel, buildBikeModel } from './questItemModels'

export interface Shelter {
  x: number
  z: number
  y: number
  rotationY: number
}

/** How far the hut needs from anything already standing, metres — wider than
 *  a player needs, since a structure is bigger than one pair of shoulders. */
const SHELTER_CLEARANCE = 2.5
/** Its own footprint, for siting anything else (the campfire) well clear of
 *  it — a circle wide enough to cover the box's own far corner (half-diagonal
 *  ~2.38m at the wall dimensions below). NOT what the player collides with
 *  any more (see `wallObstacles`/`doorObstacle` below) — a circle this size
 *  would block the doorway along with everything else. */
const SHELTER_RADIUS = 2.5

// Wall/door dimensions, shared between the mesh (buildShelterMesh) and the
// player's own collision (wallObstacles/doorObstacle) — kept as one set of
// module constants rather than two copies, so the two can never drift apart
// the way the firewood pile once quietly did (see TODO.md, 2026-09-09).
//
// Grown a further step (live report, 2026-09-11): the door being walkable
// again (see the radius-0-obstacle fix in game/player.ts) still left the hut
// itself reading as on the small side. WIDTH/DEPTH/WALL_HEIGHT/door size all
// grew ~15-20% from their v0.60.0 values; SHELTER_RADIUS above follows the
// same half-diagonal-plus-margin rule the v0.60.0 fix already established,
// not just multiplied blind — everything that depends on these constants
// (interior furniture positions, roof span, wall-panel geometry) is a
// formula off them already, so it stays in proportion without its own edit.
const WIDTH = 3.6
export const DEPTH = 3.1
// A live report (2026-09-09) found the hut reading as toy-sized, with the
// player's own eye level (game/player.ts's STAND_EYE, 1.65m) sitting above
// the door — the old 1.7m wall was barely taller than the player, let alone
// the door cut into it. Tall enough now for real headroom above STAND_EYE.
const WALL_HEIGHT = 2.6
const WALL_THICKNESS = 0.12
/** How far the walls (and the floor) extend below the hut's own origin
 *  (`Shelter.y`, one ground sample at the footprint's centre) — a live
 *  report: on real, uneven terrain a corner of the ~3.6x3.1m footprint can
 *  sit noticeably lower than that one centre sample, leaving a real gap
 *  between a wall's rigid bottom edge and the actual ground there. Nothing
 *  occluded that gap (no floor mesh existed at all), so the lamp's light —
 *  physically correct falloff, ignores geometry outright without shadow
 *  casting — shone straight out underneath, nowhere near a window. A fixed
 *  skirt is a bounded compromise, not true terrain-conforming walls (which
 *  would need sampling the ground under each corner, a bigger job than one
 *  live report's fix): generous enough to swallow ordinary local bump, honest
 *  that it is not a guarantee on every conceivable slope.  */
export const FOUNDATION_DEPTH = 0.8
// A real human doorway, not the 0.7x1.25m child-sized slab a live report
// (2026-09-09) caught — that made the player's own eye level sit above the
// door entirely, part of the same "toy house" bug as the wall height above.
export const DOOR_WIDTH = 1.1
const DOOR_HEIGHT = 2.2

/** Spacing of the small circles standing in for a real (thin, straight) wall
 *  in the player's own circle-based collision (game/player.ts's `Obstacle`
 *  has no notion of a line or a box) — close enough together that a player's
 *  own radius (`PLAYER_RADIUS`, 0.3m) can never slip between two of them. */
const WALL_CIRCLE_SPACING = 0.3
const WALL_CIRCLE_RADIUS = 0.16
/** The doorway's own blocker when closed — reaches exactly to where the
 *  nearest wall circle's own blocking surface already starts
 *  (`gapHalf = DOOR_WIDTH/2 + WALL_CIRCLE_RADIUS` in `wallObstacles`), plus a
 *  hair for a clean overlap rather than a seam a player could catch on. */
const DOOR_CLOSED_RADIUS = DOOR_WIDTH / 2 + WALL_CIRCLE_RADIUS + 0.05
/** How far the player can stand from the door and still open/close it —
 *  generous, the way a real doorway is easy to reach without lining up an
 *  exact aim (main.ts checks plain distance, not a raycast — a door is a
 *  fixed, room-sized target, not a mushroom). */
export const DOOR_INTERACT_RADIUS = 1.8
/** Radians the door swings open by, negative so the free edge moves toward
 *  +local-Z — inward, since the doorway sits on the hut's -Z face. Just
 *  short of a right angle so the open leaf clears the jamb without looking
 *  like it swung impossibly far. */
const DOOR_OPEN_ANGLE = -Math.PI * 0.42
/** How fast the door swings toward whichever way it was last set, 1/seconds
 *  — a simple exponential ease, not a fixed-duration tween: the swing looks
 *  the same whether it starts from fully shut or already half-open. */
const DOOR_SWING_RATE = 6

/**
 * Sites the wood's one shelter — a hut, not a decoration. It exists to be
 * rare: the same `findOpenSpot` search that keeps the player out of trunks
 * (game/startPose.ts), given more room to ask for, finds it a clearing of its
 * own. Placed once per wood, so it reads as something you came upon rather
 * than something scattered like a tree.
 *
 * A real survey position (`mapped`, from `geo/parse.ts`'s `isShelterTag`)
 * always wins over the procedural search, the same rule `world/osmTrees.ts`
 * already follows for mapped trees: a surveyor finding an actual hut in this
 * wood outranks our own guess at where a clearing ought to be. Orientation is
 * still seeded, since OSM tagging essentially never records which way a hut
 * faces.
 */
export function placeShelter(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
  mapped: Vec2[] = [],
): Shelter {
  const rng = mulberry32(seed)
  const real = mapped.find((m) => Math.abs(m.x) <= halfSize && Math.abs(m.z) <= halfSize)
  let x: number
  let z: number
  if (real) {
    x = real.x
    z = real.z
  } else {
    // The search starts from a seed-chosen point, not always the world centre
    // — otherwise an open wood with nothing crowding it would plant the hut
    // dead centre every single time, seed or no seed.
    const origin = { x: (rng() * 2 - 1) * halfSize * 0.5, z: (rng() * 2 - 1) * halfSize * 0.5 }
    ;({ x, z } = findOpenSpot(obstacles, halfSize, origin, SHELTER_CLEARANCE))
  }
  const rotationY = rng() * Math.PI * 2
  return { x, z, y: ground.heightAt(x, z), rotationY }
}

/** The shelter's whole footprint, for siting anything ELSE (the campfire)
 *  well clear of it. Not what the player collides with — see
 *  `wallObstacles`/`doorObstacle` on `ShelterFx` for that. */
export function shelterObstacle(s: Shelter): Circle {
  return { x: s.x, z: s.z, radius: SHELTER_RADIUS }
}

/** A local (pre-rotation, pre-translation) point turned into this shelter's
 *  own world position — every wall circle and the doorway itself are worked
 *  out in the hut's own local frame (the door always on local -Z) and then
 *  placed the same way `group.rotation.y`/`group.position` place the mesh,
 *  via THREE's own rotation matrix rather than a hand-derived one (see
 *  CLAUDE.md on `orientAlong` for why that trust is not automatic). */
function toWorld(s: Shelter, localX: number, localZ: number): { x: number; z: number } {
  const v = new THREE.Vector3(localX, 0, localZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rotationY)
  return { x: s.x + v.x, z: s.z + v.z }
}

/** Small circles along one straight run of wall, close enough together that
 *  `game/player.ts`'s circle-based collision cannot let a player slip
 *  between two of them — the closest thing to a straight wall that
 *  `Obstacle` (a circle, nothing else) can represent. */
function wallRunCircles(s: Shelter, x0: number, z0: number, x1: number, z1: number): Circle[] {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.round(len / WALL_CIRCLE_SPACING))
  const out: Circle[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const { x, z } = toWorld(s, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
    out.push({ x, z, radius: WALL_CIRCLE_RADIUS })
  }
  return out
}

/**
 * The hut's own walls as the player actually collides with them: a ring of
 * small circles around the footprint, open at the doorway — unlike
 * `shelterObstacle`'s single big circle, this is what lets a player actually
 * walk in. Static (never changes after the hut is built), unlike
 * `doorObstacle`, which is the one part of this collision that toggles.
 */
export function wallObstacles(s: Shelter): Circle[] {
  const hw = WIDTH / 2
  const hd = DEPTH / 2
  const hdoor = DOOR_WIDTH / 2
  // Each wall circle blocks out to WALL_CIRCLE_RADIUS beyond its own centre
  // — stopping the front-wall runs exactly at the visual doorway edge
  // (±hdoor) would put that whole radius INSIDE the opening, on top of the
  // player's own radius, narrowing a 0.95m doorway to a few centimetres of
  // actually passable width. Stopping one wall-circle-radius short of the
  // edge instead keeps the circle's own blocking surface, not its centre, at
  // the doorway's real edge.
  const gapHalf = hdoor + WALL_CIRCLE_RADIUS
  return [
    // Front wall, split by the doorway gap at its centre.
    ...wallRunCircles(s, -hw, -hd, -gapHalf, -hd),
    ...wallRunCircles(s, gapHalf, -hd, hw, -hd),
    // Back, left and right — no gap.
    ...wallRunCircles(s, -hw, hd, hw, hd),
    ...wallRunCircles(s, -hw, -hd, -hw, hd),
    ...wallRunCircles(s, hw, -hd, hw, hd),
  ]
}

/** The doorway's own blocker — closed by default. `ShelterFx.toggleDoor()`
 *  zeroes its radius when open; `game/scene.ts` adds this SAME object to
 *  `extraObstacles` once, so the mutation is what `stepPlayer` sees every
 *  frame after (obstacles are read live, by reference, not copied). */
export function doorObstacle(s: Shelter): Circle {
  const { x, z } = toWorld(s, 0, -DEPTH / 2)
  return { x, z, radius: DOOR_CLOSED_RADIUS }
}

/** Where the doorway itself is, in world space — `main.ts` checks the
 *  player's plain distance to this against `DOOR_INTERACT_RADIUS` to decide
 *  whether `E` should open/close the door rather than examine a mushroom. */
export function doorPosition(s: Shelter): { x: number; z: number } {
  return toWorld(s, 0, -DEPTH / 2)
}

// Interior furniture layout — local (pre-rotation) coordinates, worked out
// once and shared between the mesh (below) and the two collision circles a
// player can actually bump into. Both pieces hug a side wall, leaving the
// straight line from the doorway to the back wall (x≈0) clear to walk.
const BED_WIDTH = 0.9
const BED_LENGTH = 1.9
const BED_X = WIDTH / 2 - WALL_THICKNESS - BED_WIDTH / 2 - 0.03
const BED_Z = -0.15
const BED_OBSTACLE_RADIUS = 0.55
const TABLE_SIZE = 0.6
const TABLE_X = -(WIDTH / 2 - WALL_THICKNESS - TABLE_SIZE / 2 - 0.15)
const TABLE_Z = 0.35
const TABLE_OBSTACLE_RADIUS = 0.4
const PAINTING_X = -0.7
const PAINTING_Y = 1.55
const PAINTING_Z = DEPTH / 2 - WALL_THICKNESS - 0.02
/** Just to the wall side of the table, along the same wall it already hugs
 *  — reads as "leaned there in passing", not centred like the cup/lamp are
 *  on the table itself. */
const ROD_X = -(WIDTH / 2 - WALL_THICKNESS - 0.05)
const ROD_Z = TABLE_Z - TABLE_SIZE / 2 - 0.35
/** The four outer walls the bicycle can be left against. */
export type ShelterWall = 'front' | 'back' | 'left' | 'right'
export const SHELTER_WALLS: ShelterWall[] = ['front', 'back', 'left', 'right']

/** Where the bicycle was left: which wall, and how far along it from the
 *  wall's middle, metres (see `wallFrame` for which way is positive). */
export interface BikeSpot {
  wall: ShelterWall
  along: number
}

/** The side wall — the bike is over 1.6 m long with its wheels and the front
 *  wall has room for only 1.25 m of it beside the door, so this is the spot a
 *  bike gets before the player has chosen one (and for a save from before
 *  they could). */
export const DEFAULT_BIKE_SPOT: BikeSpot = { wall: 'right', along: 0 }

/** Half the parked bike's overall length, wheels included (`buildBikeModel`
 *  measures 1.69 m). */
const BIKE_HALF_LENGTH = 0.85
/** How far off the wall's face the bike's centre plane stands. */
const BIKE_WALL_GAP = 0.32
/** Clear air kept between the bike and the doorway's own edge. */
const BIKE_DOOR_CLEARANCE = 0.15
/** Leaned a few degrees toward the wall, not standing perfectly upright — an
 *  unridden bike propped on a wall always sits a little off true. */
const BIKE_LEAN = Math.PI * 0.05
/** Half the distance between the parked bike's two wheel contacts. */
const BIKE_HALF_WHEELBASE = 0.5
/** How far to either side of a wheel's own plane the ground is checked. */
const BIKE_WHEEL_HALF_WIDTH = 0.08
/** The steepest slope, radians, the parked bike will tilt to follow. */
const BIKE_MAX_PITCH = 0.5

/** One wall in the hut's own local frame: its outward normal `n` and the
 *  direction `t` that `BikeSpot.along` counts in (`t` = `n` turned a quarter
 *  turn, so it runs the same rotational way round the hut for every wall),
 *  and half the wall's length. */
function wallFrame(wall: ShelterWall): { nx: number; nz: number; tx: number; tz: number; halfLength: number } {
  const [nx, nz] = wall === 'front' ? [0, -1] : wall === 'back' ? [0, 1] : wall === 'left' ? [-1, 0] : [1, 0]
  const halfLength = wall === 'front' || wall === 'back' ? WIDTH / 2 : DEPTH / 2
  return { nx, nz, tx: -nz, tz: nx, halfLength }
}

/** `along`, made a place the bike can actually stand: kept along the wall's own
 *  length, and — on the front wall — off the doorway, on whichever side the
 *  player was on (the bike then overhangs the wall's end, which reads fine:
 *  it is leaning at a corner). */
function usableAlong(wall: ShelterWall, along: number): number {
  if (wall === 'front') {
    return (along < 0 ? -1 : 1) * (DOOR_WIDTH / 2 + BIKE_DOOR_CLEARANCE + BIKE_HALF_LENGTH)
  }
  const limit = wallFrame(wall).halfLength - BIKE_HALF_LENGTH
  return Math.max(-limit, Math.min(limit, along))
}

/** Where a bike left at `spot` stands, in the hut's local space: its centre,
 *  and the yaw that lays its length along the wall with its side toward it. */
export function bikeSpotLocal(spot: BikeSpot): { x: number; z: number; yaw: number } {
  const f = wallFrame(spot.wall)
  const along = usableAlong(spot.wall, spot.along)
  const out = (f.nx !== 0 ? WIDTH : DEPTH) / 2 + BIKE_WALL_GAP
  return {
    x: f.nx * out + f.tx * along,
    z: f.nz * out + f.tz * along,
    yaw: Math.atan2(-f.nx, -f.nz),
  }
}

/** The wall of the hut nearest `p`, the spot along it that is nearest, and
 *  the point on the hut's outline that is — what "leave it against the wall I
 *  am standing at" needs: which wall, where on it, and how far the player is
 *  (`point`, for the usual delivery range check). */
export function nearestBikeSpot(
  s: Shelter, p: { x: number; z: number },
): { spot: BikeSpot; point: { x: number; z: number } } {
  const local = new THREE.Vector3(p.x - s.x, 0, p.z - s.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -s.rotationY)
  const hw = WIDTH / 2
  const hd = DEPTH / 2
  // How far past each wall's own plane the player is (negative: inside it).
  const past: Record<ShelterWall, number> = {
    front: -local.z - hd, back: local.z - hd, left: -local.x - hw, right: local.x - hw,
  }
  const wall = SHELTER_WALLS.reduce((best, w) => (past[w] > past[best] ? w : best))
  const f = wallFrame(wall)
  let cx = Math.max(-hw, Math.min(hw, local.x))
  let cz = Math.max(-hd, Math.min(hd, local.z))
  if (cx === local.x && cz === local.z) {
    // Inside the hut: the nearest point on the outline is on that wall.
    if (f.nx !== 0) cx = f.nx * hw
    else cz = f.nz * hd
  }
  return { spot: { wall, along: cx * f.tx + cz * f.tz }, point: toWorld(s, cx, cz) }
}

/**
 * The height and pitch a bike standing at `local` (the hut's own space) with
 * `yaw` needs so both wheels meet the real ground beneath them. The hut is
 * built at one ground sample (`Shelter.y`, its centre) with a foundation skirt
 * to swallow the local bump; anything parked OUTSIDE it, on the slope, has no
 * such skirt, and at local y = 0 the bike stood half-sunk on a hillside (a
 * live report, 2026-09-19).
 */
function groundContact(
  s: Shelter, ground: ElevationProvider, local: { x: number; z: number }, yaw: number,
): { y: number; pitch: number } {
  // Along the bike's own +x axis, and across it (its +z), turned by its yaw and
  // then by the hut's. A wheel has width and the bike leans, so on a slope
  // ACROSS the bike the tyre's uphill edge is what would sink: take the higher
  // of the two sides.
  const heightAt = (along: number, across: number): number => {
    const w = toWorld(
      s,
      local.x + Math.cos(yaw) * along + Math.sin(yaw) * across,
      local.z - Math.sin(yaw) * along + Math.cos(yaw) * across,
    )
    return ground.heightAt(w.x, w.z) - s.y
  }
  const wheelHeight = (along: number): number =>
    Math.max(heightAt(along, -BIKE_WHEEL_HALF_WIDTH), heightAt(along, BIKE_WHEEL_HALF_WIDTH))
  const front = wheelHeight(BIKE_HALF_WHEELBASE)
  const rear = wheelHeight(-BIKE_HALF_WHEELBASE)
  const pitch = Math.atan2(front - rear, 2 * BIKE_HALF_WHEELBASE)
  return { y: (front + rear) / 2, pitch: Math.max(-BIKE_MAX_PITCH, Math.min(BIKE_MAX_PITCH, pitch)) }
}

/** The bed and table a player can actually bump into — the painting (flat
 *  against the wall) and the cup (a few centimetres, on the table) need
 *  none of their own; `wallObstacles`' own ring already keeps the walls
 *  themselves solid. */
export function interiorObstacles(s: Shelter): Circle[] {
  const bed = toWorld(s, BED_X, BED_Z)
  const table = toWorld(s, TABLE_X, TABLE_Z)
  return [
    { x: bed.x, z: bed.z, radius: BED_OBSTACLE_RADIUS },
    { x: table.x, z: table.z, radius: TABLE_OBSTACLE_RADIUS },
  ]
}

export interface ShelterFx {
  group: THREE.Group
  /** The doorway's own collision circle, closed by default —
   *  `game/scene.ts` adds this SAME object to `extraObstacles` once;
   *  `toggleDoor()` mutates its `radius` in place, which is what
   *  `stepPlayer` sees every frame after (obstacles are read live, not
   *  copied). Identical in shape to the module-level `doorObstacle(s)`
   *  this is built from — that one is for tests and anyone else who wants
   *  the shape without building the whole mesh. */
  doorObstacle: Circle
  /** 0 by day, 1 at full night — drives the window glow and its light. */
  setNight(t: number): void
  /** Drifts the chimney smoke and eases the door toward its target angle —
   *  call every frame. */
  update(dt: number): void
  isDoorOpen(): boolean
  /** Swings the door and flips `doorObstacle`'s own radius so the player can
   *  actually walk through once it is open. */
  toggleDoor(): void
  /** Shows/hides the diamond quest item's trophy, resting on the table —
   *  built once (below) and only toggled, the same "always built, visibility
   *  flips" approach the door's own leaf already uses, rather than adding
   *  and removing a mesh from the scene graph on delivery. */
  setDiamondPlaced(on: boolean): void
  /** Shows/hides the fishing rod, leaned against the wall by the table. */
  setRodPlaced(on: boolean): void
  /** Shows/hides the bicycle, parked outside against a wall — the one in
   *  `spot` (`DEFAULT_BIKE_SPOT` when none is given). */
  setBikePlaced(on: boolean, spot?: BikeSpot): void
}

/**
 * A small log cabin: a hollow box for the walls (not solid — see
 * Architecture in CLAUDE.md on why the two forms of a mushroom differ; the
 * same reasoning applies here, a player now actually stands inside this
 * one), a four-sided pyramid for the roof, plus the details a box on its own
 * never reads as a dwelling without — a swinging door, two windows, a
 * chimney with its own wisp of smoke, and a window glow that only makes
 * sense now that the wood has a day and a night (world/daynight.ts, v0.16.0).
 */
export function buildShelterMesh(s: Shelter, ground?: ElevationProvider): ShelterFx {
  const group = new THREE.Group()
  group.name = 'shelter'

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4429, roughness: 1 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c2f1c, roughness: 1 })

  const width = WIDTH
  const depth = DEPTH
  const wallHeight = WALL_HEIGHT
  const doorWidth = DOOR_WIDTH
  const doorHeight = DOOR_HEIGHT

  // Four panels plus a lintel over the doorway, not one solid box — a player
  // can now walk in through the gap the wall ring below leaves for the door,
  // and a solid box would have shown nothing but its own (culled) inside
  // face from in there. Each panel's OUTER face lines up with the same
  // width x depth footprint the single box used to have.
  const walls = new THREE.Group()
  walls.name = 'walls'
  const panel = (sizeX: number, sizeY: number, sizeZ: number, cx: number, cy: number, cz: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), wallMat)
    mesh.position.set(cx, cy, cz)
    // The hearth light below sits inside these walls. Without shadow casting
    // a three.js PointLight ignores geometry entirely and lights the ground
    // through the floor and walls alike — visible at night as a warm glow
    // leaking out from under the hut, nowhere near a window (2026-09-09 live
    // report). Every panel casts and receives, so the enclosure holds the
    // same way the old single box did.
    mesh.castShadow = true
    mesh.receiveShadow = true
    walls.add(mesh)
  }
  // Any panel that actually reaches the ground goes through this instead of
  // `panel()` directly — extended by FOUNDATION_DEPTH below the hut's own
  // origin (see that constant's own comment) so it keeps touching real,
  // possibly-uneven terrain instead of hanging a fixed height above y=0
  // regardless of what the ground under that particular corner does. The
  // lintel above the door never reaches the ground at all, so it stays on
  // plain `panel()`.
  const groundPanel = (sizeX: number, sizeZ: number, cx: number, cz: number): void => {
    panel(sizeX, wallHeight + FOUNDATION_DEPTH, sizeZ, cx, wallHeight / 2 - FOUNDATION_DEPTH / 2, cz)
  }
  const hw = width / 2
  const hd = depth / 2
  const hdoor = doorWidth / 2
  const frontSegWidth = hw - hdoor
  groundPanel(frontSegWidth, WALL_THICKNESS, -(hdoor + frontSegWidth / 2), -hd)
  groundPanel(frontSegWidth, WALL_THICKNESS, hdoor + frontSegWidth / 2, -hd)
  panel(doorWidth, wallHeight - doorHeight, WALL_THICKNESS, 0, doorHeight + (wallHeight - doorHeight) / 2, -hd) // lintel
  groundPanel(width, WALL_THICKNESS, 0, hd) // back
  groundPanel(WALL_THICKNESS, depth, -hw, 0) // left
  groundPanel(WALL_THICKNESS, depth, hw, 0) // right
  group.add(walls)

  // A plank floor — bare ground showing through a doorway you can now
  // actually walk into read as broken, not rustic. Deepened down to the
  // same FOUNDATION_DEPTH the walls' own skirt reaches (its visible top
  // surface unchanged, still a thin plank at y≈0.02-0.04): the old 0.04m
  // slab left the same open-bottomed gap under uneven terrain the walls did,
  // and closing only the walls' own skirt without deepening the floor too
  // would still have left a flat horizontal seam for light to leak through.
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 })
  const floorThickness = FOUNDATION_DEPTH + 0.04
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width - WALL_THICKNESS * 2, floorThickness, depth - WALL_THICKNESS * 2),
    floorMat,
  )
  floor.position.y = 0.04 - floorThickness / 2
  floor.castShadow = true
  floor.receiveShadow = true
  group.add(floor)

  // A bed, a table with a cup on it, and a painting on the back wall — the
  // first look inside now that a player can actually walk in (a live
  // request, 2026-09-09). Everyday enough that a room with none of it would
  // read as abandoned, not lived-in.
  const bedFrameMat = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 })
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0xcbb98a, roughness: 0.9 })
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc0, roughness: 0.9 })
  const bed = new THREE.Group()
  bed.name = 'bed'
  const bedLegHeight = 0.22
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(BED_WIDTH, 0.1, BED_LENGTH), bedFrameMat)
  bedFrame.position.y = bedLegHeight
  bed.add(bedFrame)
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(BED_WIDTH - 0.06, 0.14, BED_LENGTH - 0.06),
    mattressMat,
  )
  mattress.position.y = bedLegHeight + 0.05 + 0.07
  bed.add(mattress)
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(BED_WIDTH - 0.2, 0.08, 0.28), pillowMat)
  pillow.position.set(0, bedLegHeight + 0.05 + 0.14 + 0.04, -BED_LENGTH / 2 + 0.22)
  bed.add(pillow)
  for (const lx of [-BED_WIDTH / 2 + 0.05, BED_WIDTH / 2 - 0.05]) {
    for (const lz of [-BED_LENGTH / 2 + 0.1, BED_LENGTH / 2 - 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, bedLegHeight, 0.06), bedFrameMat)
      leg.position.set(lx, bedLegHeight / 2, lz)
      bed.add(leg)
    }
  }
  bed.position.set(BED_X, 0, BED_Z)
  group.add(bed)

  const tableMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 1 })
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.5 })
  const table = new THREE.Group()
  table.name = 'table'
  const tableHeight = 0.45
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(TABLE_SIZE, 0.04, TABLE_SIZE), tableMat)
  tableTop.position.y = tableHeight
  table.add(tableTop)
  const tableLegGeo = new THREE.BoxGeometry(0.045, tableHeight - 0.04, 0.045)
  for (const lx of [-TABLE_SIZE / 2 + 0.06, TABLE_SIZE / 2 - 0.06]) {
    for (const lz of [-TABLE_SIZE / 2 + 0.06, TABLE_SIZE / 2 - 0.06]) {
      const leg = new THREE.Mesh(tableLegGeo, tableMat)
      leg.position.set(lx, (tableHeight - 0.04) / 2, lz)
      table.add(leg)
    }
  }
  // A cup, off-centre — dead centre on the table would read as placed by a
  // level, not left there.
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10), cupMat)
  cup.name = 'cup'
  cup.position.set(0.12, tableHeight + 0.02 + 0.03, -0.08)
  table.add(cup)

  // The oil lamp — the room's only light source now sits on a visible
  // object instead of floating at the centre of the room with nothing to
  // explain it (a live report: "свет идёт непонятно откуда"). Opposite
  // corner from the cup, same "not dead centre" reasoning.
  const lamp = new THREE.Group()
  lamp.name = 'lamp'
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.5, metalness: 0.3 })
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.02, 10), lampMat)
  const baseY = tableHeight + 0.02 + 0.01
  lampBase.position.y = baseY
  lamp.add(lampBase)
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8), lampMat)
  lampPole.position.y = baseY + 0.065
  lamp.add(lampPole)
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xffdca0, roughness: 0.4, emissive: 0xffcf8a, emissiveIntensity: 0, side: THREE.DoubleSide,
  })
  const shadeY = baseY + 0.12 + 0.045
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.09, 10, 1, true), shadeMat)
  lampShade.position.y = shadeY
  lamp.add(lampShade)
  // The bulb itself, inside the shade — where the light actually comes from,
  // same "physically-correct falloff needs tens, not units" note the old
  // hearth light and the flashlight (game/scene.ts) both already learned.
  const lampLight = new THREE.PointLight(0xffcf8a, 0, 4)
  lampLight.position.y = shadeY - 0.01
  lampLight.castShadow = true
  // A cube shadow map this small only has to hide one room's worth of
  // furniture from itself — nowhere near what a scene-wide light would need.
  lampLight.shadow.mapSize.set(256, 256)
  lampLight.shadow.bias = -0.002
  lamp.add(lampLight)
  lamp.position.set(-0.14, 0, 0.1)
  table.add(lamp)

  // The diamond quest's own trophy — opposite corner from the cup and clear
  // of the lamp, so it reads as set down there rather than colliding with
  // either. Hidden until the quest delivers it (setDiamondPlaced, below);
  // built once regardless, the same "always built, toggled" choice the
  // door's own leaf already made.
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.045),
    new THREE.MeshStandardMaterial({
      color: 0xdff6ff, roughness: 0.05, metalness: 0.1, emissive: 0x9fd8e0, emissiveIntensity: 0.15,
    }),
  )
  diamond.name = 'diamond'
  diamond.position.set(0.14, tableHeight + 0.02 + 0.045, 0.09)
  diamond.visible = false
  table.add(diamond)

  table.position.set(TABLE_X, 0, TABLE_Z)
  group.add(table)

  // The fishing rod — leaned against the wall the table already hugs, tilted
  // a few degrees so its top rests on the wall rather than floating clear of
  // it. Hidden until the rod quest delivers it. Same model
  // (`world/questItemModels.ts`) the wood's own pickup mesh uses, so the rod
  // never looks like two different objects depending on where you see it.
  const rod = buildRodModel()
  rod.name = 'rod'
  // Tilts the top toward the wall (local -x, where this hut's left wall
  // sits) just enough that a 1.5m pole standing on its own base actually
  // touches it, rather than leaning at an angle that visibly clears it.
  rod.rotation.z = Math.PI * 0.06
  rod.position.set(ROD_X, 0, ROD_Z)
  rod.visible = false
  group.add(rod)

  // The bicycle — left outside against a wall, not ridden or mounted (see
  // docs/superpowers/specs/2026-09-13-quest-items-design.md's own decision
  // on the bike being a passive stat). Same model the wood's own pickup mesh
  // uses (`world/questItemModels.ts`). `parkedBike` is where it stands and which
  // way it faces along the wall; the model inside it leans and pitches in its
  // own frame.
  const parkedBike = new THREE.Group()
  parkedBike.name = 'bike'
  const bike = buildBikeModel()
  parkedBike.add(bike)
  const placeBike = (spot: BikeSpot): void => {
    const at = bikeSpotLocal(spot)
    parkedBike.position.set(at.x, 0, at.z)
    parkedBike.rotation.y = at.yaw
    bike.rotation.x = BIKE_LEAN // its own side is toward the wall (see bikeSpotLocal)
    bike.rotation.z = 0
    if (ground) {
      const contact = groundContact(s, ground, at, at.yaw)
      parkedBike.position.y = contact.y
      bike.rotation.z = contact.pitch
    }
  }
  placeBike(DEFAULT_BIKE_SPOT)
  parkedBike.visible = false
  group.add(parkedBike)

  // A small painted scene on the back wall — the whole project draws without
  // pictures (see CLAUDE.md's Conventions), so this is a handful of flat
  // shapes, not an image: sky, a strip of ground, a sun, two stylised
  // conifers. DoubleSide throughout, the same defensive choice the windows
  // already made — a live-reported "invisible from one side" bug is not
  // worth risking twice for a plane this small to eyeball the correct
  // rotation sign on.
  const painting = new THREE.Group()
  painting.name = 'painting'
  const paintingFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1, side: THREE.DoubleSide })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.03), paintingFrameMat)
  painting.add(frame)
  const skyMat = new THREE.MeshBasicMaterial({ color: 0xbfe0e6, side: THREE.DoubleSide })
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), skyMat)
  sky.position.set(0, 0.05, 0.02)
  painting.add(sky)
  const groundMatSmall = new THREE.MeshBasicMaterial({ color: 0x4a7a3a, side: THREE.DoubleSide })
  const groundStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), groundMatSmall)
  groundStrip.position.set(0, -0.12, 0.021)
  painting.add(groundStrip)
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xf2d060, side: THREE.DoubleSide })
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), sunMat)
  sun.position.set(0.13, 0.09, 0.022)
  painting.add(sun)
  const treeMatSmall = new THREE.MeshBasicMaterial({ color: 0x2e5a28, side: THREE.DoubleSide })
  const treeSpots: [number, number, number][] = [
    [-0.12, -0.04, 0.1],
    [-0.05, -0.055, 0.08],
  ]
  for (const [tx, ty, size] of treeSpots) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(size * 0.3, size, 3), treeMatSmall)
    tree.position.set(tx, ty, 0.022)
    painting.add(tree)
  }
  painting.position.set(PAINTING_X, PAINTING_Y, PAINTING_Z)
  group.add(painting)

  const roofSpan = Math.hypot(width, depth) * 0.62
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofSpan, 1.1, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = wallHeight + 0.55
  group.add(roof)

  // The door: a real swinging leaf, hinged on its own left edge (local x=0),
  // its body spanning local x 0..doorWidth — swapped from a fixed slab set
  // into the wall (a live request, 2026-09-09: being able to walk in at
  // all needs a door that can actually open). Two darker grooves mark it as
  // individual planks rather than one flat monolith, and a handle near the
  // free edge (not the hinge) is what actually reads as "door" at a glance.
  const doorHinge = new THREE.Group()
  doorHinge.name = 'doorHinge'
  doorHinge.position.set(-hdoor, doorHeight / 2, -hd - 0.02)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 })
  const doorFace = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.06), doorMat)
  doorFace.position.x = doorWidth / 2
  doorHinge.add(doorFace)
  // Both faces get the plank grooves and a handle — a live report caught
  // the original as inside-only (relief and handle both sat at z=+0.035/
  // +0.05, the hut-interior side of the 0.06-thick slab): a door walked up
  // to from outside showed a blank back, which does not read as a door at
  // all until you are already through it. Mirrored at z=-0.035/-0.05 for
  // the outside face, same x placement both sides.
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x1f150c, roughness: 1 })
  for (const gz of [0.035, -0.035]) {
    for (const gx of [doorWidth / 2 - 0.17, doorWidth / 2 + 0.17]) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorHeight * 0.96, 0.01), grooveMat)
      groove.position.set(gx, 0, gz)
      doorHinge.add(groove)
    }
  }
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.4, metalness: 0.3 })
  for (const hz of [0.05, -0.05]) {
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), handleMat)
    handle.position.set(doorWidth - 0.15, -0.05, hz)
    doorHinge.add(handle)
  }
  group.add(doorHinge)

  let doorOpen = false
  let doorAngle = 0
  let doorTargetAngle = 0

  // Two windows, one per side wall — a pale, faintly blue "glass" pane on a
  // darker wooden frame, so it reads as a window by day (not just a same-
  // colour patch on the wall) and glows amber once setNight() says it is
  // dark outside. DoubleSide on both: a PlaneGeometry only has one true
  // front face, and getting each window's own rotation to point that face
  // outward by hand is exactly the kind of sign error that had a window
  // invisible from outside the hut and fine from in.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 1, side: THREE.DoubleSide })
  // A live report: the glass read as small and opaque — a flat colour patch,
  // not something you could see through even faintly. It never set
  // `transparent`/`opacity` at all (a MeshStandardMaterial defaults to fully
  // opaque), so "glass" was just a pale square that happened to glow at
  // night. Real window glass is never perfectly clear either, so this stays
  // short of fully see-through — enough tint/reflection to read as glass,
  // not a hole in the wall.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fa8ac,
    roughness: 0.3,
    transparent: true,
    opacity: 0.4,
    emissive: 0xffcf8a,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  })
  // Grown from 0.5x0.5 (frame) / 0.38x0.38 (glass) — on a 2.6m-tall wall
  // that read as a tiny porthole, not a cottage window.
  const frameGeo = new THREE.PlaneGeometry(0.85, 0.95)
  const glassGeo = new THREE.PlaneGeometry(0.71, 0.81)
  // A cross-shaped muntin bar over the glass — real boxes, not planes, so
  // they read as wood from every angle without the same one-sided-plane
  // trap the glass itself already ran into once. A flat frame with plain
  // glass behind it (the original shape) never stopped looking like one
  // pale, borderless patch on the wall — a real cottage window is panes
  // separated by a bar, and that bar is most of what the eye recognises.
  const muntinMat = frameMat
  const muntinThickness = 0.032
  const vMuntinGeo = new THREE.BoxGeometry(muntinThickness, 0.75, 0.03)
  const hMuntinGeo = new THREE.BoxGeometry(0.75, muntinThickness, 0.03)
  const buildWindow = (x: number, faceOut: number): THREE.Group => {
    const win = new THREE.Group()
    const frame = new THREE.Mesh(frameGeo, frameMat)
    win.add(frame)
    // Two glass panes, one just in front of the frame each way (+Z and -Z),
    // not one — a single pane offset only toward +Z sat behind the frame
    // (which is bigger than the glass, so fully covers it) as seen from
    // whichever side turned out to be -Z, which is exactly what made a
    // window look like solid wall from outside and fine from in.
    for (const dz of [0.006, -0.006]) {
      const glass = new THREE.Mesh(glassGeo, glassMat)
      glass.name = 'glass'
      glass.position.z = dz
      win.add(glass)
    }
    win.add(new THREE.Mesh(vMuntinGeo, muntinMat))
    win.add(new THREE.Mesh(hMuntinGeo, muntinMat))
    win.position.set(x, wallHeight * 0.58, 0)
    win.rotation.y = faceOut
    return win
  }
  // Same clearance reasoning as the door: has to clear the log-course bump.
  const winLeft = buildWindow(-width / 2 - 0.08, Math.PI / 2)
  const winRight = buildWindow(width / 2 + 0.08, -Math.PI / 2)
  group.add(winLeft, winRight)

  const setNight = (t: number): void => {
    glassMat.emissiveIntensity = t * 2.2
    shadeMat.emissiveIntensity = t * 2.2
    lampLight.intensity = t * 14
  }

  // A stacked armful of firewood against one side of the hut — the wall
  // itself never explained where the hearth's own fuel comes from.
  const firewoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  const logEndMat = new THREE.MeshStandardMaterial({ color: 0xcbb384, roughness: 0.9 })
  const logRadius = 0.09
  const logLength = 0.5
  const logGeo = new THREE.CylinderGeometry(logRadius, logRadius, logLength, 8)
  const logEndGeo = new THREE.CircleGeometry(logRadius, 8)
  const firewood = new THREE.Group()
  firewood.name = 'firewood'
  const firewoodRows = [4, 3]
  for (let row = 0; row < firewoodRows.length; row++) {
    const count = firewoodRows[row]
    const offset = (count - 1) / 2
    const y = logRadius + row * logRadius * 2
    for (let i = 0; i < count; i++) {
      const log = new THREE.Mesh(logGeo, firewoodMat)
      // rotation.z lays each log on its side, its own length now running
      // along local X — a live report (2026-09-09) found logs visibly
      // poking through the wall, because the row itself was ALSO spaced
      // along that same X: a 0.5m log offset only ~0.2m from its neighbour
      // overlaps almost its whole length, and the pile as a whole reached
      // back across the wall face despite its own anchor point (below)
      // sitting outside it. The row now spaces along Z instead — side by
      // side along the wall, each log still the same fixed distance out
      // from it, none reaching back any further than the others.
      log.rotation.z = Math.PI / 2
      log.position.set(0, y, (i - offset) * (logRadius * 2 + 0.015))
      firewood.add(log)
      // The cylinder's own caps carry the trunk colour; a paler disc facing
      // the viewer is what actually reads as "cut log end" from outside.
      const endCap = new THREE.Mesh(logEndGeo, logEndMat)
      endCap.rotation.y = Math.PI / 2
      endCap.position.set(logLength / 2 + 0.001, y, log.position.z)
      firewood.add(endCap)
    }
  }
  firewood.position.set(width / 2 + 0.45, 0, depth / 2 - 0.3)
  group.add(firewood)

  // A small well: a stone-ringed shaft, a crossbeam on two posts, and a
  // bucket hanging from it — the other everyday fixture a lived-in
  // clearing has next to a hearth, not just a place to sleep.
  const wellStoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 1 })
  const wellWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1 })
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.6, metalness: 0.15 })
  const well = new THREE.Group()
  well.name = 'well'
  const wellRadius = 0.45
  // A live report (2026-09-09) found this "not looking like a well" — at the
  // old 0.32m the stone ring sat barely knee-high, dwarfed by the posts and
  // roof above it, and read as two sticks over a stone puddle rather than a
  // wellhead. Waist-high now, the way a real one needs to be to lean a
  // bucket on the rim without falling in. postHeight below is a formula off
  // this, so the posts/beam/roof/rope/bucket stay in proportion to it.
  const wellWallHeight = 0.55
  // Open-ended — a capped cylinder would read as a solid stone drum, not a
  // shaft with anything down it.
  const wellWall = new THREE.Mesh(
    new THREE.CylinderGeometry(wellRadius, wellRadius, wellWallHeight, 12, 1, true),
    wellStoneMat,
  )
  wellWall.position.y = wellWallHeight / 2
  well.add(wellWall)
  const postHeight = 1.05
  const postGeo = new THREE.BoxGeometry(0.06, postHeight, 0.06)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, wellWoodMat)
    post.position.set(0, postHeight / 2, side * wellRadius * 0.85)
    well.add(post)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, wellRadius * 2.1), wellWoodMat)
  beam.position.set(0, postHeight, 0)
  well.add(beam)
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(wellRadius * 0.95, 0.32, 4), roofMat)
  wellRoof.rotation.y = Math.PI / 4
  wellRoof.position.set(0, postHeight + 0.18, 0)
  well.add(wellRoof)
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6), wellWoodMat)
  rope.position.set(0, postHeight - 0.16, 0)
  well.add(rope)
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), bucketMat)
  bucket.position.set(0, postHeight - 0.32 - 0.08, 0)
  well.add(bucket)
  well.position.set(-(width / 2 + 1.3), 0, -(depth / 2 + 1.4))
  group.add(well)

  // The chimney and its smoke, both offset toward one corner of the roof —
  // centring it over the ridge would look planted, not built.
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 1 })
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), chimneyMat)
  const chimneyTop = new THREE.Vector3(width * 0.22, wallHeight + 1.05, depth * 0.15)
  chimney.position.copy(chimneyTop).setY(wallHeight + 0.7)
  group.add(chimney)

  const SMOKE_N = 5
  const smokeMat = new THREE.SpriteMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0, depthWrite: false })
  const smoke: THREE.Sprite[] = []
  for (let i = 0; i < SMOKE_N; i++) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    sprite.userData.phase = i / SMOKE_N
    sprite.scale.setScalar(0.001)
    group.add(sprite)
    smoke.push(sprite)
  }

  let elapsed = 0
  const update = (dt: number): void => {
    elapsed += dt
    for (const sprite of smoke) {
      // Each wisp loops through 0..1 offset by its own phase, so the chimney
      // never puffs all five at once.
      const t = (elapsed * 0.12 + sprite.userData.phase) % 1
      sprite.position.set(
        chimneyTop.x + Math.sin(t * Math.PI * 2 + sprite.userData.phase * 7) * 0.08,
        chimneyTop.y + t * 1.4,
        chimneyTop.z + Math.cos(t * Math.PI * 2 + sprite.userData.phase * 5) * 0.08,
      )
      sprite.scale.setScalar(0.15 + t * 0.4)
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.3 * (1 - t)
    }
    // Eases toward whichever angle toggleDoor() last set — the same feel
    // whether the door is swinging fully open or just easing the last bit
    // shut, since this always closes a fraction of the remaining distance
    // rather than moving a fixed amount per frame.
    doorAngle += (doorTargetAngle - doorAngle) * Math.min(1, dt * DOOR_SWING_RATE)
    doorHinge.rotation.y = doorAngle
  }

  const doorObstacleObj = doorObstacle(s)

  group.position.set(s.x, s.y, s.z)
  group.rotation.y = s.rotationY
  return {
    group,
    doorObstacle: doorObstacleObj,
    setNight,
    update,
    isDoorOpen: () => doorOpen,
    toggleDoor: () => {
      doorOpen = !doorOpen
      doorTargetAngle = doorOpen ? DOOR_OPEN_ANGLE : 0
      // Collision follows the toggle immediately, not the swing's own ease —
      // a player pressing E to walk in should never feel blocked by a door
      // that reads as already open.
      doorObstacleObj.radius = doorOpen ? 0 : DOOR_CLOSED_RADIUS
    },
    setDiamondPlaced: (on: boolean) => {
      diamond.visible = on
    },
    setRodPlaced: (on: boolean) => {
      rod.visible = on
    },
    setBikePlaced: (on: boolean, spot?: BikeSpot) => {
      if (on) placeBike(spot ?? DEFAULT_BIKE_SPOT)
      parkedBike.visible = on
    },
  }
}
