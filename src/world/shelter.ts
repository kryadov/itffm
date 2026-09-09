import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

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
 *  ~1.99m at the wall dimensions below). NOT what the player collides with
 *  any more (see `wallObstacles`/`doorObstacle` below) — a circle this size
 *  would block the doorway along with everything else. */
const SHELTER_RADIUS = 2.1

// Wall/door dimensions, shared between the mesh (buildShelterMesh) and the
// player's own collision (wallObstacles/doorObstacle) — kept as one set of
// module constants rather than two copies, so the two can never drift apart
// the way the firewood pile once quietly did (see TODO.md, 2026-09-09).
const WIDTH = 3.0
const DEPTH = 2.6
// A live report (2026-09-09) found the hut reading as toy-sized, with the
// player's own eye level (game/player.ts's STAND_EYE, 1.65m) sitting above
// the door — the old 1.7m wall was barely taller than the player, let alone
// the door cut into it. Tall enough now for real headroom above STAND_EYE.
const WALL_HEIGHT = 2.3
const WALL_THICKNESS = 0.12
// A real human doorway, not the 0.7x1.25m child-sized slab a live report
// (2026-09-09) caught — that made the player's own eye level sit above the
// door entirely, part of the same "toy house" bug as the wall height above.
const DOOR_WIDTH = 0.95
const DOOR_HEIGHT = 2.0

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
export function buildShelterMesh(s: Shelter): ShelterFx {
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
  const hw = width / 2
  const hd = depth / 2
  const hdoor = doorWidth / 2
  const frontSegWidth = hw - hdoor
  panel(frontSegWidth, wallHeight, WALL_THICKNESS, -(hdoor + frontSegWidth / 2), wallHeight / 2, -hd)
  panel(frontSegWidth, wallHeight, WALL_THICKNESS, hdoor + frontSegWidth / 2, wallHeight / 2, -hd)
  panel(doorWidth, wallHeight - doorHeight, WALL_THICKNESS, 0, doorHeight + (wallHeight - doorHeight) / 2, -hd) // lintel
  panel(width, wallHeight, WALL_THICKNESS, 0, wallHeight / 2, hd) // back
  panel(WALL_THICKNESS, wallHeight, depth, -hw, wallHeight / 2, 0) // left
  panel(WALL_THICKNESS, wallHeight, depth, hw, wallHeight / 2, 0) // right
  group.add(walls)

  // A plank floor — bare ground showing through a doorway you can now
  // actually walk into read as broken, not rustic.
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 })
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width - WALL_THICKNESS * 2, 0.04, depth - WALL_THICKNESS * 2),
    floorMat,
  )
  floor.position.y = 0.02
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
  table.position.set(TABLE_X, 0, TABLE_Z)
  group.add(table)

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
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x1f150c, roughness: 1 })
  for (const gx of [doorWidth / 2 - 0.17, doorWidth / 2 + 0.17]) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorHeight * 0.96, 0.01), grooveMat)
    groove.position.set(gx, 0, 0.035)
    doorHinge.add(groove)
  }
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.4, metalness: 0.3 })
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), handleMat)
  handle.position.set(doorWidth - 0.15, -0.05, 0.05)
  doorHinge.add(handle)
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
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fa8ac,
    roughness: 0.3,
    emissive: 0xffcf8a,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  })
  const frameGeo = new THREE.PlaneGeometry(0.5, 0.5)
  const glassGeo = new THREE.PlaneGeometry(0.38, 0.38)
  // A cross-shaped muntin bar over the glass — real boxes, not planes, so
  // they read as wood from every angle without the same one-sided-plane
  // trap the glass itself already ran into once. A flat frame with plain
  // glass behind it (the original shape) never stopped looking like one
  // pale, borderless patch on the wall — a real cottage window is panes
  // separated by a bar, and that bar is most of what the eye recognises.
  const muntinMat = frameMat
  const muntinThickness = 0.028
  const vMuntinGeo = new THREE.BoxGeometry(muntinThickness, 0.4, 0.03)
  const hMuntinGeo = new THREE.BoxGeometry(0.4, muntinThickness, 0.03)
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

  // A point light at the hearth: physically-correct falloff (three r150+)
  // means it needs tens, not units, to read from a few metres out — see the
  // same lesson the flashlight already learned (game/scene.ts).
  const hearthLight = new THREE.PointLight(0xffcf8a, 0, 5)
  hearthLight.position.set(0, wallHeight * 0.5, 0)
  hearthLight.castShadow = true
  // A cube shadow map this small only has to hide one box from itself —
  // nowhere near what a scene-wide light would need.
  hearthLight.shadow.mapSize.set(256, 256)
  hearthLight.shadow.bias = -0.002
  group.add(hearthLight)

  const setNight = (t: number): void => {
    glassMat.emissiveIntensity = t * 2.2
    hearthLight.intensity = t * 18
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
  }
}
