import * as THREE from 'three'
import type { TreePerch } from './trees'
import type { ElevationProvider } from '../terrain/provider'

export interface Birds {
  update(dt: number, playerX: number, playerZ: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** A flock this size reads as birds; one bird crossing the sky reads as a bug. */
const COUNT = 8

/**
 * Cruising height above the ground, metres, for the ordinary low pass over
 * the canopy. The tallest genera (world/trees.ts's LOOK) top out around 30m,
 * so this sits just above a typical mid-height crown, not the tallest
 * outlier tree — a bird skimming the actual canopy, not clearing every pine
 * in the wood with room to spare.
 */
const ALT_LOW = 24
const ALT_VARY = 3 // per-bird height offset, so the flock isn't a flat disc
const ALT_BOB = 1.2 // slow rise and fall, so level flight doesn't look painted on
/** How high a "climb away" leg reaches — a soar well above the canopy. */
const ALT_CLIMB = 42
const CLIMB_CHANCE = 0.3 // fraction of outbound legs that climb instead of staying low
const CLIMB_EXTRA_LEN = 25 // a climbing leg also runs longer, to give the arc room

/** Straight-line flight: how far a cruise leg covers, and how fast. Scaled to
 *  a wood's own size (halfSize 90..180m), not a city block. */
const LEG_LEN_MIN = 40
const LEG_LEN_MAX = 90
const CRUISE_SPEED = 9 // m/s — a real bird's pace, independent of world scale
/**
 * How far a bird climbs out along its heading while it leaves the perch, and
 * how far it glides in while it lands — metres.
 *
 * Nothing alive goes straight up or straight down. It rose like a lift and its
 * landing was a lerp to a point, so it dropped like a leaf. A bird trades
 * height for distance at both ends.
 */
const CLIMB_OUT = 12
const GLIDE_IN = 18
/**
 * How far a leg bends, in radians of heading across the whole cruise. A bird
 * does not fly a ruled line — a lazy arc is the difference between a flight
 * path and a projectile.
 */
const LEG_BEND = 0.9

/** Vertical liftoff from a perch, and the touchdown that follows a leg. */
const TAKEOFF_DUR = 3 // seconds, perch to cruising altitude
const LAND_SPEED = 10 // m/s, sets how long the final approach takes
const LAND_DUR_MIN = 2
const LAND_DUR_MAX = 6

/** How long a bird stays down before its next flight. */
const PERCH_MIN = 8
const PERCH_MAX = 20
/**
 * A wave leaves within this many seconds of each other — enough that eight
 * birds don't flip state in perfect unison, tight enough that the flight
 * line doesn't string them out across the sky one by one. Flock, not queue.
 */
const STAGGER_MAX = 2.5
/** How wide to scatter a recycled bird's fresh perch around the player, metres. */
const RESEED_SPREAD = 50

/**
 * The flock's shared anchor wanders its own slow circle while following the
 * player — holding position would look like a decal stuck on the sky. It is
 * not itself a bird's position; it is where new flights are planned from and
 * where landings are re-aimed, so however far a leg's fixed path drifts from
 * the player, the flock always comes back down close by.
 */
const DRIFT_RADIUS = 20
const DRIFT_SPEED = 0.08 // rad/s
const FOLLOW_RATE = 1.0 // how eagerly the anchor closes on the player, per second
/** Hard cap on anchor-to-player distance, however far the player wanders. */
const LEASH_MAX = 45
/**
 * Past this from the player a bird is recycled to a fresh perch nearby, in
 * metres — whatever it was doing. A slow walk never outruns the flock the
 * way a car would; this only catches a bird whose planned leg happened to
 * carry it well off into the wood while the player wandered elsewhere.
 */
const FAR = 90

/** How far from the shared flight line each bird sits — a formation, not a stack. */
const FORMATION_SPREAD = 3.5

/**
 * Per-bird scatter of the landing point itself, as a multiple of the bird's
 * formation offset. Aiming every landing at one spot piles the flock up on
 * it — fine as flat diamonds, a heap once the birds grew bodies. Each bird
 * now aims a little way off, so on open ground they spread out to land; near
 * trees they still snap to a canopy, where a cluster reads fine.
 */
const PERCH_SCATTER = 3

/**
 * A walker this close to a perched bird flushes it: it springs up at once and
 * flees straight away instead of waiting out its rest. Measured to the
 * bird's rendered spot, not the shared perch it hangs off — and tighter than
 * a car's warning distance would need, since a footstep gives less warning
 * than an engine but also covers far less ground per second.
 */
const FLUSH_RADIUS = 10
const FLUSH_R2 = FLUSH_RADIUS * FLUSH_RADIUS

/** How far a perch search looks from the anchor for a tree to land in. */
const PERCH_SEARCH_RADIUS = 90
/**
 * How far from a tree's trunk a perched bird may sit — a canopy radius,
 * metres. A landing snaps a bird to a tree's own point (`findPerch`), but the
 * bird's fixed formation offset (up to ±FORMATION_SPREAD, nearly 5m out)
 * lands at render time; on open ground that is what spreads the flock out,
 * over a trunk it would fling the bird clear of the canopy into open air.
 * Clamping the offset to this radius keeps a tree-perched bird among the
 * leaves.
 */
const CANOPY_R = 2.2
/** Clearance above bare ground, so a grounded bird doesn't clip into it. */
const GROUND_PERCH_H = 0.3

const FLAP_SPEED_MIN = 7 // rad/s
const FLAP_SPEED_MAX = 11
const FLAP_AMPLITUDE = 0.85 // radians: a shallow shiver doesn't read as a flap

/**
 * Grounded look. A perched bird is not a flying one holding still: its wings
 * fold in against the body instead of staying spread — spread wings on the
 * ground read as a flat diamond — the body sits plumper, and it gains the
 * head, neck and tail a distant flying silhouette does without. All of it is
 * only ever drawn perched; in the air it folds away to nothing (zero scale),
 * so takeoff and cruise are left exactly as they were. The body geometry is
 * shared across the whole flock, so every difference from the flight shape
 * is a per-instance transform, not a second mesh.
 */
const WING_FOLD = 0.7 // radians the wings tuck up against the body when grounded
const GROUND_WING_SCALE = new THREE.Vector3(1, 1, 0.55) // span pulled in — a closed wing, not an open one
const GROUND_BODY_SCALE = new THREE.Vector3(0.9, 1.35, 1.0) // shorter and rounder than the flight spindle
// Head, neck and tail placement, in body-local metres — local +x is the way the
// bird faces, +y is up.
const HEAD_FWD = 1.05 // how far ahead of body-centre the head rests
const HEAD_UP = 0.5 // how high it rides — the neck's worth of lift
const NECK_LEN = 0.55
const NECK_MID_FWD = 0.78 // the neck stub sits at the shoulder-to-head midpoint
const NECK_MID_UP = 0.3
const NECK_TILT = 0.9 // radians the neck leans forward, shoulder up to head
const TAIL_BACK = 1.2 // how far behind body-centre the tail roots
const TAIL_UP = 0.2
const TAIL_TILT = 0.5 // radians the tail cocks up off flat

/**
 * Grounded motion. Small and slow on purpose — a bird pottering about, not a
 * frantic one. Every term is a pure function of `time` and the bird's own
 * fixed phases, exactly the way the flap and the altitude bob already are, so
 * nothing accumulates frame to frame, no two birds move in step, and there
 * is no per-frame randomness.
 */
const GROUND_TURN = 0.9 // radians the heading swings either side as it looks about
const GROUND_TURN_SLOW = 0.5 // rad/s of the main look-around
const GROUND_TURN_FIDGET = 0.17 // rad/s of the smaller twitch over it — incommensurate, so it never just ticks to and fro
const GAIT_SPEED = 2.0 // rad/s of the step-and-bob cycle
const STEP_ROCK = 0.6 // metres the body shuffles forward along its facing and back — a step in place
const HOP_HEIGHT = 0.35 // metres the body lifts on each step
const PECK_WINDOW = 0.35 // rad/s of the slow gate that opens now and then for a bout of pecking
const PECK_RATE = 5 // rad/s of the quick head dips within a bout
const PECK_DROP = 0.3 // metres the head drops at the bottom of a peck
const PECK_REACH = 0.15 // metres the head reaches forward as it dips

/**
 * A varied but natural flock palette — sparrows, starlings, crows and the
 * like. Enough spread that no two neighbours read as stamped from the same
 * die, but every tone is one a real bird wears.
 */
const COLORS = [
  0x4a3b2a, // sparrow brown
  0x6b5a42, // warm tan (house sparrow back)
  0x5b5f66, // slate grey (pigeon)
  0x3c4653, // muted blue-grey (jay wash)
  0x2a2a2c, // crow black
  0x232526, // near-black (raven)
  0x463b30, // starling dark-brown
  0x776b57, // dun / dove
]
/** Odds any one bird is a white crow — a rare pale standout in a dark flock. */
const WHITE_CROW_CHANCE = 0.045
/** Near-white plumage for that white crow: off-white, not printer paper. */
const WHITE_CROW = 0xe9e6dd

/**
 * A bird's fixed plumage colour, as a hex: a natural tone from the palette,
 * or — rarely — the near-white of a white crow. A pure function of a single
 * rand() draw, so plumage stays deterministic per bird and the flock's
 * random stream is unshifted: the white roll takes the low slice of [0,1),
 * and the rest of the range is rescaled to a palette index.
 */
export function pickPlumage(rand: () => number): number {
  const r = rand()
  if (r < WHITE_CROW_CHANCE) return WHITE_CROW
  const idx = Math.floor(((r - WHITE_CROW_CHANCE) / (1 - WHITE_CROW_CHANCE)) * COLORS.length)
  return COLORS[Math.min(idx, COLORS.length - 1)]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * Nearest perch to (x, z) within PERCH_SEARCH_RADIUS, or null if the list is
 * empty or nothing is close enough. Linear scan: called a couple of times a
 * minute per bird, not per frame, so a list of a few hundred trees is nothing.
 */
function findPerch(x: number, z: number, perches: TreePerch[]): TreePerch | null {
  let best: TreePerch | null = null
  let bestD2 = PERCH_SEARCH_RADIUS * PERCH_SEARCH_RADIUS
  for (const s of perches) {
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = s
    }
  }
  return best
}

/**
 * One triangle per wing, hinged at the shared root vertex (the body). Two of
 * these, instanced per bird and animated apart, is the cheapest shape that
 * still reads as a bird — a flat triangle is a glider, a hinge that opens and
 * closes is a wingbeat.
 */
function wingGeometry(mirror: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const tip: [number, number, number] = [-0.5, 0, mirror * 1.2]
  const trail: [number, number, number] = [-1.0, 0, mirror * 0.35]
  // Winding kept the same handedness on both the right wing and its mirror,
  // or the left wing's face normal would point into the ground.
  const verts = mirror > 0 ? [0, 0, 0, ...tip, ...trail] : [0, 0, 0, ...trail, ...tip]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * The bird's body — a low-poly spindle the wings hinge on. Two flat triangles
 * with nothing between them read as a paper dart, not a bird; a body gives
 * them volume. A faceted octahedron stretched long and slim is symmetric
 * front-to-back and side-to-side, so it reads right whichever way heading
 * points it.
 */
function bodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(1, 0)
  geo.scale(1.5, 0.42, 0.42) // long along travel (x), slim in section — a body, not a ball
  return geo
}

/**
 * The head — a small, slightly squashed low-poly ball that rides up front on
 * the neck of a grounded bird, the detail a distant flying silhouette does
 * without.
 */
function headGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.45, 0)
  geo.scale(0.95, 0.85, 0.85) // a touch longer than tall — a head, not a marble
  return geo
}

/**
 * The neck — a short, thin stub that carries the head clear of the shoulders,
 * so a perched bird reads as head-up-on-a-neck rather than headless.
 */
function neckGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.13, 0.16, NECK_LEN, 5, 1)
}

/**
 * The tail — one flat triangle fanning out behind the body. A single
 * triangle is all a tail needs at this distance.
 */
function tailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  // Root at the body (origin), widening to a fork at the back — local -x is aft.
  const verts = [0, 0, 0, -0.9, 0, 0.4, -0.9, 0, -0.4]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

type State = 'perched' | 'takeoff' | 'cruise' | 'landing'

interface Bird {
  state: State
  stateT: number // seconds spent in the current state

  // Fixed per-bird look: not re-rolled between flights.
  ox: number
  oz: number // a small, constant offset from the shared line/perch — a formation, not a stack
  altOffset: number
  bobPhase: number
  bobSpeed: number
  flapPhase: number
  flapSpeed: number
  stagger: number // this bird's fixed lag behind the rest of the wave

  // The perch a bird currently occupies, or is heading for. Core coordinates:
  // ox/oz are added only at render time.
  perchX: number
  perchY: number
  perchZ: number
  /**
   * How far the current (or target) perch actually supports the bird from its
   * core point: Infinity over open ground (the formation offset is
   * unclamped, so the flock spreads out), CANOPY_R in a tree (the offset is
   * reined in, so the bird stays over the foliage instead of floating past
   * it).
   */
  perchR: number

  // This bird's current (or most recent) outbound leg — copied out of the
  // shared plan at takeoff so a later bird replanning mid-flight can't reach
  // back and change a leg already underway.
  legHeading: number
  legBend: number
  legClimb: boolean
  legLen: number
  cruiseDur: number

  // Snapshots taken at each state's start, so its motion is a pure function
  // of stateT and doesn't accumulate error frame to frame.
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  landDur: number
}

/**
 * A flock of birds with somewhere to be: they lift off a perch, fly a
 * straight leg near the player — sometimes low over the canopy, sometimes
 * climbing away high — and come back down to settle, on the ground or in a
 * tree, until the next flight.
 *
 * Ported from race-the-city's app/birds.ts. Nothing about a car chase, a
 * rooftop, or its neon mode survives the crossing — a wood has no roofs to
 * land on and no low-flying aircraft to stay under, and the one thing that
 * scares a bird here is a walker's own approach, not an engine. Every
 * distance is rescaled from city blocks to a wood's own footprint (a
 * hundred-odd metres across, not several); the flight and perching logic
 * itself — states, timing, the grounded gait — is universal and crossed
 * unchanged.
 *
 * @param rand this flock's own deterministic source — no Math.random
 *   anywhere in src/ (see CLAUDE.md)
 * @param provider ground height for landings
 * @param perches candidate tree perches a bird may land in (world/trees.ts's
 *   `treePerches()`) — empty by default: birds land on the ground alone.
 */
export function createBirds(
  scene: THREE.Scene,
  rand: () => number,
  count = COUNT,
  provider: ElevationProvider,
  perches: TreePerch[] = [],
): Birds {
  const group = new THREE.Group()
  group.name = 'birds'
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({
    flatShading: true,
    side: THREE.DoubleSide, // seen from below as often as from above
    // A bird out near the leash edge is a thing in clear air, not haze in
    // front of the camera — skip the fog the same way the sky dome does.
    fog: false,
  })
  const n = Math.max(1, count)
  const body = new THREE.InstancedMesh(bodyGeometry(), mat, n)
  const rightWing = new THREE.InstancedMesh(wingGeometry(1), mat, n)
  const leftWing = new THREE.InstancedMesh(wingGeometry(-1), mat, n)
  // Grounded-only detail: added after the body and wings so their child indices
  // (0..2) stay put, and folded to a point (zero scale) whenever a bird is airborne.
  const head = new THREE.InstancedMesh(headGeometry(), mat, n)
  const neck = new THREE.InstancedMesh(neckGeometry(), mat, n)
  const tail = new THREE.InstancedMesh(tailGeometry(), mat, n)
  group.add(body, rightWing, leftWing, head, neck, tail)
  // The flock is always near the player and constantly moving, and three only
  // computes an InstancedMesh's bounding sphere once — so without this the
  // whole flock gets frustum-culled as one the moment it drifts from wherever
  // that first sphere happened to land.
  body.frustumCulled = false
  rightWing.frustumCulled = false
  leftWing.frustumCulled = false
  head.frustumCulled = false
  neck.frustumCulled = false
  tail.frustumCulled = false

  const birds: Bird[] = []
  const col = new THREE.Color()
  for (let i = 0; i < n; i++) {
    birds.push({
      state: 'perched',
      stateT: 0,
      ox: (rand() - 0.5) * 2 * FORMATION_SPREAD,
      oz: (rand() - 0.5) * 2 * FORMATION_SPREAD,
      altOffset: (rand() - 0.5) * 2 * ALT_VARY,
      bobPhase: rand() * Math.PI * 2,
      bobSpeed: 0.5 + rand() * 0.5,
      flapPhase: rand() * Math.PI * 2,
      flapSpeed: FLAP_SPEED_MIN + rand() * (FLAP_SPEED_MAX - FLAP_SPEED_MIN),
      stagger: rand() * STAGGER_MAX,
      perchX: 0,
      perchY: 0,
      perchZ: 0,
      perchR: Infinity, // corrected to the real support the instant a perch is assigned
      legHeading: rand() * Math.PI * 2,
      legBend: 0,
      legClimb: false,
      legLen: 0,
      cruiseDur: 1,
      fromX: 0,
      fromY: 0,
      fromZ: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      landDur: 1,
    })
    col.setHex(pickPlumage(rand))
    body.setColorAt(i, col)
    rightWing.setColorAt(i, col)
    leftWing.setColorAt(i, col)
    head.setColorAt(i, col)
    neck.setColorAt(i, col)
    tail.setColorAt(i, col)
  }
  if (body.instanceColor) body.instanceColor.needsUpdate = true
  if (rightWing.instanceColor) rightWing.instanceColor.needsUpdate = true
  if (leftWing.instanceColor) leftWing.instanceColor.needsUpdate = true
  if (head.instanceColor) head.instanceColor.needsUpdate = true
  if (neck.instanceColor) neck.instanceColor.needsUpdate = true
  if (tail.instanceColor) tail.instanceColor.needsUpdate = true

  let time = 0
  let driftAngle = rand() * Math.PI * 2
  let anchorX = 0
  let anchorZ = 0
  let started = false

  /**
   * The leg every bird currently taking off shares, so a flock flies one
   * direction at a time instead of eight. Cleared once nothing is left
   * flying it, so the next bird to leave its perch rolls a fresh one.
   */
  let plan: { heading: number; climb: boolean; legLen: number; cruiseDur: number; bend: number } | null = null
  /**
   * How long the flock rests before its next flight, shared by the whole
   * wave (each bird adds its own small stagger on top) — rolled fresh once
   * everyone has landed, from PERCH_MIN..PERCH_MAX.
   */
  let restDur = PERCH_MIN

  const m = new THREE.Matrix4()
  const qHeading = new THREE.Quaternion()
  const qFlap = new THREE.Quaternion()
  const qTotal = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  // Fixed forward leans for the neck stub and the cocked-up tail, and scratch
  // objects for placing the grounded head/neck/tail each frame.
  const qNeckTilt = new THREE.Quaternion().setFromAxisAngle(zAxis, -NECK_TILT)
  const qTailTilt = new THREE.Quaternion().setFromAxisAngle(zAxis, -TAIL_TILT)
  const partQuat = new THREE.Quaternion()
  const off = new THREE.Vector3()
  const partPos = new THREE.Vector3()
  const zeroScale = new THREE.Vector3(0, 0, 0)

  /**
   * A landing spot near (x, z): a nearby tree if one is close, else the
   * ground. `r` is how far the spot supports a bird from its core point — a
   * canopy radius in a tree, unbounded on open ground.
   */
  function pickLanding(x: number, z: number): { x: number; y: number; z: number; r: number } {
    const spot = findPerch(x, z, perches)
    // A tree perch carries the crown height of that exact tree
    // (treePerches() derives it from the tree's own drawn height), so sit
    // the bird at that y — not a fixed guess, which would float a bird
    // above a short tree's canopy.
    if (spot) return { x: spot.x, y: spot.y, z: spot.z, r: CANOPY_R }
    return { x, y: provider.heightAt(x, z) + GROUND_PERCH_H, z, r: Infinity }
  }

  /**
   * The scale to apply to a bird's fixed ox/oz so its render offset never
   * overhangs the perch it sits on: 1 over open ground (perchR = Infinity),
   * and CANOPY_R / |offset| in a tree.
   */
  function offsetScale(b: Bird): number {
    const len = Math.hypot(b.ox, b.oz)
    return len > b.perchR ? b.perchR / len : 1
  }

  function settle(b: Bird): void {
    b.perchX = b.toX
    b.perchY = b.toY
    b.perchZ = b.toZ
    b.state = 'perched'
    b.stateT = 0
    // Free the shared plan and roll a fresh rest once nothing else is still
    // flying, so the next departure is a new wave — a new direction, not
    // every bird repeating the last leg forever.
    if (!birds.some((o) => o !== b && (o.state === 'takeoff' || o.state === 'cruise'))) {
      plan = null
      restDur = PERCH_MIN + rand() * (PERCH_MAX - PERCH_MIN)
    }
  }

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      body.geometry.dispose()
      rightWing.geometry.dispose()
      leftWing.geometry.dispose()
      head.geometry.dispose()
      neck.geometry.dispose()
      tail.geometry.dispose()
      mat.dispose()
      birds.length = 0
    },
    update(dt, playerX, playerZ) {
      if (!started) {
        // Start on top of the player rather than easing in from wherever the
        // anchor's zero value happened to be — otherwise the flock's first
        // sighting is it flying in from the world origin.
        anchorX = playerX
        anchorZ = playerZ
        started = true
        restDur = PERCH_MIN + rand() * (PERCH_MAX - PERCH_MIN)
        for (const b of birds) {
          const spot = pickLanding(playerX + (rand() - 0.5) * 30, playerZ + (rand() - 0.5) * 30)
          b.perchX = spot.x
          b.perchY = spot.y
          b.perchZ = spot.z
          b.perchR = spot.r
          // stateT starts at 0, same as after any other landing: the whole
          // flock rests together and leaves as one wave (offset only by its
          // own small stagger) — not scattered across a full rest period's
          // worth of desync on the very first cycle.
        }
      }
      time += dt
      driftAngle += DRIFT_SPEED * dt
      const targetX = playerX + Math.cos(driftAngle) * DRIFT_RADIUS
      const targetZ = playerZ + Math.sin(driftAngle) * DRIFT_RADIUS
      const closeFrac = Math.min(1, FOLLOW_RATE * dt)
      anchorX += (targetX - anchorX) * closeFrac
      anchorZ += (targetZ - anchorZ) * closeFrac
      // However far the player wanders, the anchor must never be left
      // visibly behind — a hard leash on top of the chase.
      const dx = anchorX - playerX
      const dz = anchorZ - playerZ
      const dist = Math.hypot(dx, dz)
      if (dist > LEASH_MAX) {
        const s = LEASH_MAX / dist
        anchorX = playerX + dx * s
        anchorZ = playerZ + dz * s
      }

      for (let i = 0; i < n; i++) {
        const b = birds[i]
        b.stateT += dt

        // Wandered off: put it back where it can be seen. Rare for a slow
        // walker, but a bird's own planned leg can still carry it well past
        // where the player ends up while it flies.
        if (b.state !== 'perched' || b.stateT < restDur) {
          const away = Math.hypot(b.perchX - playerX, b.perchZ - playerZ)
          if (away > FAR) {
            const spot = pickLanding(
              playerX + (rand() - 0.5) * RESEED_SPREAD,
              playerZ + (rand() - 0.5) * RESEED_SPREAD,
            )
            b.perchX = spot.x
            b.perchY = spot.y
            b.perchZ = spot.z
            b.perchR = spot.r
            b.state = 'perched'
            b.stateT = rand() * restDur // don't launch the whole flock at once
          }
        }

        if (b.state === 'perched') {
          // A walker closing in flushes the bird: up at once, fleeing away
          // from them. Measured to where the bird actually sits — the
          // offset clamped to its perch, the same as the render below — not
          // the raw formation offset.
          const os = offsetScale(b)
          const rx = b.perchX + b.ox * os
          const rz = b.perchZ + b.oz * os
          const spooked = (rx - playerX) * (rx - playerX) + (rz - playerZ) * (rz - playerZ) < FLUSH_R2
          if (spooked || b.stateT >= restDur + b.stagger) {
            if (!plan) {
              const climb = rand() < CLIMB_CHANCE
              const legLen = LEG_LEN_MIN + rand() * (LEG_LEN_MAX - LEG_LEN_MIN) + (climb ? CLIMB_EXTRA_LEN : 0)
              plan = {
                heading: rand() * Math.PI * 2,
                climb,
                legLen,
                cruiseDur: legLen / CRUISE_SPEED,
                bend: (rand() * 2 - 1) * LEG_BEND,
              }
            }
            const leg = plan
            // Startled birds break away from the walker; unhurried ones
            // follow the plan.
            b.legHeading = spooked ? Math.atan2(rz - playerZ, rx - playerX) : leg.heading
            b.legClimb = leg.climb
            b.legLen = leg.legLen
            b.cruiseDur = leg.cruiseDur
            b.legBend = leg.bend
            b.fromX = b.perchX
            b.fromY = b.perchY
            b.fromZ = b.perchZ
            b.toX = b.perchX
            // Climb to ALT_LOW ABOVE THE GROUND, not to an absolute height:
            // on terrain higher than ALT_LOW the bird would otherwise
            // "climb" DOWN into the ground and vanish.
            b.toY = provider.heightAt(b.perchX, b.perchZ) + ALT_LOW + b.altOffset
            b.toZ = b.perchZ
            b.state = 'takeoff'
            b.stateT = 0
          }
        } else if (b.state === 'takeoff') {
          if (b.stateT >= TAKEOFF_DUR) {
            b.fromX = b.toX + Math.cos(b.legHeading) * CLIMB_OUT
            b.fromY = b.toY
            b.fromZ = b.toZ + Math.sin(b.legHeading) * CLIMB_OUT
            b.state = 'cruise'
            b.stateT = 0
          }
        } else if (b.state === 'cruise') {
          if (b.stateT >= b.cruiseDur) {
            // Re-aim at the player, not at wherever the leg's fixed path
            // ended up: they have been moving the whole flight, and the one
            // thing that must land near them is the landing itself.
            const legEndX = b.fromX + Math.cos(b.legHeading) * b.legLen
            const legEndZ = b.fromZ + Math.sin(b.legHeading) * b.legLen
            const land = pickLanding(anchorX + b.ox * PERCH_SCATTER, anchorZ + b.oz * PERCH_SCATTER)
            b.fromX = legEndX
            b.fromY = provider.heightAt(legEndX, legEndZ) + ALT_LOW + b.altOffset // above the ground here, not absolute
            b.fromZ = legEndZ
            b.toX = land.x
            b.toY = land.y
            b.toZ = land.z
            // Commit the target's offset clamp now, for the glide-in and the
            // perch that follows: a tree reins the offset in to its canopy
            // so touchdown lands among the leaves, not floating out past
            // them.
            b.perchR = land.r
            const d = Math.hypot(b.toX - b.fromX, b.toZ - b.fromZ)
            b.landDur = Math.min(LAND_DUR_MAX, Math.max(LAND_DUR_MIN, d / LAND_SPEED))
            b.state = 'landing'
            b.stateT = 0
          }
        } else if (b.state === 'landing') {
          if (b.stateT >= b.landDur) settle(b)
        }

        // Position: a pure function of state + stateT, so nothing here
        // accumulates drift frame to frame.
        let coreX: number, coreY: number, coreZ: number, heading: number
        let peck = 0
        if (b.state === 'perched') {
          // Grounded idle: a bird pottering on its perch, not a frozen
          // decal. Heading drifts as it looks about — a slow swing with a
          // smaller, off-beat twitch laid over it, at incommensurate rates
          // so it keeps facing new ways instead of ticking to and fro. The
          // body shuffles a step forward and back along that facing with a
          // low bob, and now and then it dips its head to peck.
          const gh =
            b.legHeading +
            (Math.sin(time * GROUND_TURN_SLOW + b.flapPhase) +
              0.5 * Math.sin(time * GROUND_TURN_FIDGET + b.bobPhase)) *
              GROUND_TURN
          const gait = Math.sin(time * GAIT_SPEED + b.bobPhase)
          // Step along the way the bird faces (heading turns local +x to
          // (cos, -sin) in world), so it shuffles where it looks, not sideways.
          coreX = b.perchX + Math.cos(gh) * STEP_ROCK * gait
          coreY = b.perchY + (0.5 - 0.5 * Math.cos(time * GAIT_SPEED + b.bobPhase)) * HOP_HEIGHT
          coreZ = b.perchZ - Math.sin(gh) * STEP_ROCK * gait
          // Peck: a slow gate opens now and then, and while it is open the
          // head dips a few quick times — a bout of feeding, not a metronome.
          const gate = Math.max(0, Math.sin(time * PECK_WINDOW + b.flapPhase))
          peck = gate * (0.5 - 0.5 * Math.cos(time * PECK_RATE + b.bobPhase))
          heading = gh
        } else if (b.state === 'takeoff') {
          const p = smoothstep(b.stateT / TAKEOFF_DUR)
          // Climbing out along the heading, not rising off it: a bird
          // leaves a branch forwards and buys its height with distance.
          coreX = b.fromX + Math.cos(b.legHeading) * CLIMB_OUT * p
          coreY = lerp(b.fromY, b.toY, p)
          coreZ = b.fromZ + Math.sin(b.legHeading) * CLIMB_OUT * p
          heading = b.legHeading
        } else if (b.state === 'cruise') {
          const p = Math.min(1, b.stateT / b.cruiseDur)
          // A lazy arc rather than a ruled line: the heading swings across
          // the leg by `bend`, so the path curves and the bird banks
          // through it.
          const along = b.legLen * p
          // Integrating the swing exactly is not worth it — sampling the
          // mean heading over the distance covered is a curve either way.
          const mean = b.legHeading + b.legBend * (p / 2 - 0.5)
          coreX = b.fromX + Math.cos(mean) * along
          coreZ = b.fromZ + Math.sin(mean) * along
          // Both cruise heights ride ABOVE THE GROUND under the bird, so it
          // never flies into a hillside — sampled once per frame per
          // airborne bird (few).
          const ground = provider.heightAt(coreX, coreZ)
          const altLow = ground + ALT_LOW + b.altOffset
          const altHigh = ground + ALT_CLIMB + b.altOffset
          const alt = b.legClimb ? altLow + (altHigh - altLow) * Math.sin(Math.PI * p) : altLow
          coreY = alt + Math.sin(time * b.bobSpeed + b.bobPhase) * ALT_BOB
          heading = b.legHeading + b.legBend * (p - 0.5)
        } else {
          // A glide slope, flown in along the final heading. Straight-lining
          // to the perch drops the bird onto it from wherever it happened to
          // be — which is what fell like a leaf. It flies AT the perch
          // instead: the approach turns onto the run-in early and the
          // height comes off over the last GLIDE_IN metres, so it arrives
          // travelling, and level.
          const p = smoothstep(b.stateT / b.landDur)
          const ddx = b.toX - b.fromX
          const ddz = b.toZ - b.fromZ
          const runIn = Math.hypot(ddx, ddz) > 0.01 ? Math.atan2(ddz, ddx) : b.legHeading
          // The gate: a point GLIDE_IN short of the perch, at cruising height.
          const gateX = b.toX - Math.cos(runIn) * GLIDE_IN
          const gateZ = b.toZ - Math.sin(runIn) * GLIDE_IN
          const TURN = 0.55 // share of the approach spent getting onto the run-in
          if (p < TURN) {
            const q = p / TURN
            coreX = lerp(b.fromX, gateX, q)
            coreY = b.fromY
            coreZ = lerp(b.fromZ, gateZ, q)
          } else {
            const q = (p - TURN) / (1 - TURN)
            coreX = lerp(gateX, b.toX, q)
            coreY = lerp(b.fromY, b.toY, q * q) // shed height late: a flare, not a dive
            coreZ = lerp(gateZ, b.toZ, q)
          }
          heading = runIn
        }

        // The formation offset, reined in to whatever the perch supports:
        // full spread over open ground, no wider than the canopy in a tree,
        // so a perched bird is never flung out past the foliage to hang in
        // clear air.
        const os = offsetScale(b)
        const bx = coreX + b.ox * os
        const bz = coreZ + b.oz * os
        const by = coreY
        const grounded = b.state === 'perched'
        qHeading.setFromAxisAngle(yAxis, heading)
        pos.set(bx, by, bz)

        // The body carries no flap — just heading. Grounded it stands
        // plumper than the flight spindle (a per-instance scale of the
        // shared geometry, not a second mesh); airborne it is left exactly
        // as it was. Set it first, then the wings hinge around it.
        m.compose(pos, qHeading, grounded ? GROUND_BODY_SCALE : one)
        body.setMatrixAt(i, m)

        // Wings: a live wingbeat in the air, folded in against the body on
        // the ground — spread wings on a perched bird read as a flat
        // diamond. The fold is a fixed, negative angle through the very
        // same hinge, lifting the tips up and in, with the span pulled in
        // by scale so the wing closes rather than sticks out. Flap first,
        // in the wing's own local frame, then orient the whole bird by
        // heading — the opposite order would swing the wingtip through the
        // ground on a bird flying north.
        const flap = grounded ? -WING_FOLD : Math.sin(time * b.flapSpeed + b.flapPhase) * FLAP_AMPLITUDE
        const wingScale = grounded ? GROUND_WING_SCALE : one
        qFlap.setFromAxisAngle(xAxis, flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, wingScale)
        rightWing.setMatrixAt(i, m)

        // Mirrored sign, so both wings rise and fall (or fold) together — a
        // real wingbeat is symmetric; matching signs would look like scissors.
        qFlap.setFromAxisAngle(xAxis, -flap)
        qTotal.copy(qHeading).multiply(qFlap)
        m.compose(pos, qTotal, wingScale)
        leftWing.setMatrixAt(i, m)

        // Head, neck and tail are a grounded bird's alone. In the air they
        // fold away to a point (zero scale). Offsets are in the body's own
        // frame, applied through qHeading, so a turn carries them along
        // with it.
        if (grounded) {
          // Head: raised and forward on the neck, dropping and reaching a
          // little on a peck.
          off.set(HEAD_FWD + peck * PECK_REACH, HEAD_UP - peck * PECK_DROP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          m.compose(partPos, qHeading, one)
          head.setMatrixAt(i, m)

          // Neck: a short stub at the shoulder-to-head midpoint, leaning forward.
          off.set(NECK_MID_FWD, NECK_MID_UP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          partQuat.copy(qHeading).multiply(qNeckTilt)
          m.compose(partPos, partQuat, one)
          neck.setMatrixAt(i, m)

          // Tail: rooted behind the body and cocked up a touch off flat.
          off.set(-TAIL_BACK, TAIL_UP, 0).applyQuaternion(qHeading)
          partPos.copy(pos).add(off)
          partQuat.copy(qHeading).multiply(qTailTilt)
          m.compose(partPos, partQuat, one)
          tail.setMatrixAt(i, m)
        } else {
          m.compose(pos, qHeading, zeroScale)
          head.setMatrixAt(i, m)
          neck.setMatrixAt(i, m)
          tail.setMatrixAt(i, m)
        }
      }
      body.instanceMatrix.needsUpdate = true
      rightWing.instanceMatrix.needsUpdate = true
      leftWing.instanceMatrix.needsUpdate = true
      head.instanceMatrix.needsUpdate = true
      neck.instanceMatrix.needsUpdate = true
      tail.instanceMatrix.needsUpdate = true
    },
  }
}
