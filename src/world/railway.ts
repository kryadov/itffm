import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, randRange } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'

export interface RailPoint {
  x: number
  z: number
  y: number
}

export interface RailLine {
  points: RailPoint[]
}

/** The seed offset `game/scene.ts` uses for `placeRailLine`, exported so
 *  `game/loadForest.ts` can compute the very same line — the one that
 *  actually gets rendered and shuttled along — early enough to keep trees
 *  off it (`world/osmTrees.ts`'s `RAIL_CLEARANCE`), rather than each of the
 *  two call sites carrying its own copy of the same magic number. */
export const RAIL_SEED_OFFSET = 29

/** How far apart ground-height samples sit along the line, metres — the same
 *  "dense enough to follow the ground, not cut a chord over it" reasoning
 *  `world/paths.ts`'s `RIBBON_STEP` uses (and `util/geometry.ts`'s
 *  `densify`), tightened a little further: a live report found a fixed
 *  12-sample line (regardless of length) visibly sagging into or floating
 *  above real, bumpy procedural terrain — a rail sitting 8cm above its own
 *  sleepers (RAIL_HEIGHT) shows a mismatch tenths-of-a-metre wide that a
 *  wider path ribbon can shrug off. */
const RAIL_STEP = 3
/** How far out along its own straight bearing the line reaches, as a
 *  fraction of halfSize either way — short of the true edge, the same
 *  "leave the plot's own boundary alone" margin the shelter search uses. */
const SPAN_FRAC = 0.9
/** How far from the centre line, as a fraction of halfSize, the track
 *  crosses the wood — clear of the hut/campfire clearing near the middle,
 *  never through it. */
const OFFSET_MIN = 0.55
const OFFSET_MAX = 0.8

/**
 * Sites a single straight rail line across the wood — a real, honest scope
 * cut from the "a rail line and a passing train" ask: a curving branch line
 * with points, sidings and level crossings is race-the-city's own city-scale
 * problem (see CLAUDE.md's donor-code note), not a wood's. One straight run,
 * offset from the middle so it never threads the hut's own clearing, still
 * reads as a real thing passing through rather than a toy loop.
 */
export function placeRailLine(ground: ElevationProvider, halfSize: number, seed: number): RailLine {
  const rng = mulberry32(seed)
  const side = rng() < 0.5 ? -1 : 1
  const z = side * halfSize * (OFFSET_MIN + rng() * (OFFSET_MAX - OFFSET_MIN))
  const x0 = -halfSize * SPAN_FRAC
  const x1 = halfSize * SPAN_FRAC
  const segments = Math.max(1, Math.ceil((x1 - x0) / RAIL_STEP))
  const points: RailPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const x = x0 + (i / segments) * (x1 - x0)
    points.push({ x, z, y: ground.heightAt(x, z) })
  }
  return { points }
}

/**
 * Ground height along the line at any x within its span — piecewise-linear
 * between whichever two sampled points bracket it, the same "enough points,
 * lerp between them" the line itself is built from. Shared by the mesh and
 * the train so a car's own wheels never float above or sink into the rails
 * it just rode over.
 */
export function railHeightAt(line: RailLine, x: number): number {
  const pts = line.points
  if (x <= pts[0].x) return pts[0].y
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const a = pts[i - 1]
      const b = pts[i]
      const t = (x - a.x) / (b.x - a.x)
      return a.y + (b.y - a.y) * t
    }
  }
  return pts[pts.length - 1].y
}

/**
 * One tick of the train's back-and-forth run: advances `t` (0..1 along the
 * line) by however far `speed` carries it over `dt`, bouncing off either end
 * instead of running past it — a shuttle on a dead-end spur, not a loop.
 */
export function stepTrainT(
  t: number, dir: 1 | -1, dt: number, speed: number, lineLength: number,
): { t: number; dir: 1 | -1 } {
  let nt = t + (dir * speed * dt) / lineLength
  let ndir = dir
  if (nt >= 1) {
    nt = 1
    ndir = -1
  } else if (nt <= 0) {
    nt = 0
    ndir = 1
  }
  return { t: nt, dir: ndir }
}

const RAIL_GAUGE = 0.7 // narrow-gauge, forest-logging scale — not a mainline
const RAIL_HEIGHT = 0.08
const SLEEPER_SPACING = 1.4
const SLEEPER_LENGTH = 1.1
const SLEEPER_WIDTH = 0.22
const SLEEPER_HEIGHT = 0.1

/** The track bed itself — two rails and their sleepers, ground-following
 *  along the line's own span. Static geometry, never updated once built.
 *
 *  A live report caught the rails detached from both their own sleepers and
 *  the ground under a slope: each rail used to be ONE rigid box spanning the
 *  whole line, positioned at a single height sampled at the line's own
 *  midpoint — dead flat regardless of how much the terrain actually climbs
 *  or drops along the way, while the sleepers (already built per sampled
 *  point) correctly followed it. Now each rail is a chain of short segments,
 *  one per pair of consecutive `line.points` (the same `RAIL_STEP`-spaced
 *  samples the sleepers and the train already read off `railHeightAt`),
 *  each tilted to match its own local slope and merged into one mesh per
 *  side — still two draw calls, not one per segment. */
export function buildRailMesh(line: RailLine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'railway'
  const pts = line.points
  const z = pts[0].z
  const x0 = pts[0].x
  const x1 = pts[pts.length - 1].x
  const length = x1 - x0

  const railMat = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.6, metalness: 0.3 })
  const half = RAIL_GAUGE / 2
  for (const side of [-1, 1]) {
    const segments: THREE.BufferGeometry[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const seg = new THREE.BoxGeometry(Math.hypot(dx, dy), RAIL_HEIGHT, 0.07)
      seg.rotateZ(Math.atan2(dy, dx))
      seg.translate((a.x + b.x) / 2, (a.y + b.y) / 2 + RAIL_HEIGHT / 2, z + side * half)
      segments.push(seg)
    }
    const merged = mergeGeometries(segments, false)
    merged.computeVertexNormals()
    group.add(new THREE.Mesh(merged, railMat))
  }

  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 })
  const sleeperCount = Math.max(1, Math.floor(length / SLEEPER_SPACING))
  for (let i = 0; i <= sleeperCount; i++) {
    const x = x0 + (i / sleeperCount) * length
    const sleeper = new THREE.Mesh(
      new THREE.BoxGeometry(SLEEPER_WIDTH, SLEEPER_HEIGHT, SLEEPER_LENGTH), sleeperMat,
    )
    sleeper.position.set(x, railHeightAt(line, x) - SLEEPER_HEIGHT / 2 + RAIL_HEIGHT * 0.3, z)
    group.add(sleeper)
  }

  return group
}

export interface Train {
  update(dt: number): void
  /** 0 by day, 1 at full night — the locomotive's headlight and every
   *  wagon's windows glow, the same day/night rule the shelter's own
   *  windows and lamp already follow (`world/shelter.ts`'s `setNight`). */
  setNight(t: number): void
  dispose(): void
}

/** Toy/logging-railway pace, not a mainline train's — the whole line is
 *  under 200m, and a train crossing it in seconds would read as a blur, not
 *  something you watch pass. */
const TRAIN_SPEED = 2.5
/** How long the train sits at each end of the line before heading back —
 *  a real request (2026-09-15): the line's own dead-end spurs already read
 *  as stations, they just used to reverse instantly instead of stopping
 *  there like a train actually would. */
const STATION_DWELL_RANGE: [number, number] = [60, 120]
const CAR_COUNT = 3
/** Every car — the locomotive included — occupies the same length of track,
 *  so the lead-car-plus-fixed-offset spacing below stays one simple formula
 *  regardless of what any one slot actually looks like. */
const CAR_LENGTH = 2.0
const CAR_GAP = 0.35
const CAR_WIDTH = 1.0
const CAR_HEIGHT = 1.05

/** One colour per wagon (the locomotive has its own, below), cycling if
 *  there are ever more wagons than colours — distinct cars, not one long
 *  slab in a single random colour like the old build gave every car alike. */
const CAR_COLORS = [0x7a4a32, 0x5f6b52, 0x8a3b34, 0x4a5a6b]

const LOCO_COLOR = 0x2e3330
const LOCO_CAB_COLOR = 0x232725
/** Taller than a wagon — the cab needs headroom over the body it sits on,
 *  and the height difference alone reads as "this one is different" even
 *  before its colour or the stack/headlight register. */
const LOCO_HEIGHT = CAR_HEIGHT * 1.3
const LOCO_CAB_LENGTH = CAR_LENGTH * 0.4
const LOCO_CAB_HEIGHT = CAR_HEIGHT * 0.55
const STACK_RADIUS = 0.08
const STACK_HEIGHT = 0.3

const WINDOW_COLOR = 0xbfe0e6
const WINDOW_EMISSIVE = 0xffcf8a
const WINDOW_COUNT = 3
const WINDOW_WIDTH = 0.26
const WINDOW_HEIGHT = 0.32

const SMOKE_N = 4

/** Builds the lead car — a boxy diesel locomotive: a taller body, a cab set
 *  back toward the rear (the smoke needs the front clear), an exhaust stack
 *  puffing the same kind of drifting sprite smoke `world/shelter.ts`'s
 *  chimney already uses, and a real headlight (`THREE.SpotLight`, off by
 *  day) aimed along local +x — `pose()` below flips the whole group's own
 *  `rotation.y` between 0 and π as the train reverses, which already aims
 *  this correctly in world space without the light's own local aim ever
 *  needing to change.
 */
function buildLocomotive(): {
  group: THREE.Group
  setNight: (t: number) => void
  updateSmoke: (elapsed: number) => void
} {
  const group = new THREE.Group()
  group.name = 'locomotive'

  const bodyMat = new THREE.MeshStandardMaterial({ color: LOCO_COLOR, flatShading: true })
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_LENGTH, LOCO_HEIGHT, CAR_WIDTH), bodyMat)
  body.name = 'body'
  body.position.y = LOCO_HEIGHT / 2
  group.add(body)

  const cabMat = new THREE.MeshStandardMaterial({ color: LOCO_CAB_COLOR, flatShading: true })
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(LOCO_CAB_LENGTH, LOCO_CAB_HEIGHT, CAR_WIDTH * 0.92), cabMat,
  )
  cab.name = 'cab'
  cab.position.set(-CAR_LENGTH / 2 + LOCO_CAB_LENGTH / 2 + 0.08, LOCO_HEIGHT + LOCO_CAB_HEIGHT / 2, 0)
  group.add(cab)

  const stackMat = new THREE.MeshStandardMaterial({ color: 0x1c1e1c, roughness: 0.9 })
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(STACK_RADIUS, STACK_RADIUS * 1.2, STACK_HEIGHT, 8), stackMat)
  const stackLocal = new THREE.Vector3(CAR_LENGTH * 0.12, LOCO_HEIGHT + STACK_HEIGHT / 2, 0)
  stack.position.copy(stackLocal)
  group.add(stack)

  // Small puffs drifting up and fading, looping through their own phase —
  // the same recipe world/shelter.ts's chimney smoke uses, but in the
  // locomotive's own local space: being a child of `group` (which `pose()`
  // repositions/rotates every frame), each sprite's world position follows
  // the moving, turning train for free.
  const smokeMat = new THREE.SpriteMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0, depthWrite: false })
  const smoke: THREE.Sprite[] = []
  for (let i = 0; i < SMOKE_N; i++) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    sprite.userData.phase = i / SMOKE_N
    sprite.scale.setScalar(0.001)
    group.add(sprite)
    smoke.push(sprite)
  }
  const updateSmoke = (elapsed: number): void => {
    for (const sprite of smoke) {
      const t = (elapsed * 0.5 + sprite.userData.phase) % 1
      sprite.position.set(
        stackLocal.x + Math.sin(t * Math.PI * 2 + sprite.userData.phase * 6) * 0.05,
        stackLocal.y + STACK_HEIGHT / 2 + t * 0.9,
        stackLocal.z + Math.cos(t * Math.PI * 2 + sprite.userData.phase * 4) * 0.05,
      )
      sprite.scale.setScalar(0.1 + t * 0.3)
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - t)
    }
  }

  // A visible lens even by day, and the actual light source at night — the
  // same split the shelter's own lamp shade/bulb pair already makes.
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8, roughness: 0.3, emissive: 0xffcf8a, emissiveIntensity: 0,
  })
  const headlightGlow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), headlightMat)
  headlightGlow.name = 'headlightGlow'
  headlightGlow.position.set(CAR_LENGTH / 2 + 0.01, LOCO_HEIGHT * 0.62, 0)
  headlightGlow.rotation.y = Math.PI / 2
  group.add(headlightGlow)

  // Intensity/distance mirror the player's own flashlight (game/scene.ts) —
  // three's physically-correct lighting makes that tuning read as a real
  // headlamp a few tens of metres out, not a floodlight.
  const headlight = new THREE.SpotLight(0xfff2cc, 500, 25, 0.3, 0.4, 2)
  headlight.position.set(CAR_LENGTH / 2, LOCO_HEIGHT * 0.62, 0)
  const headlightTarget = new THREE.Object3D()
  headlightTarget.position.set(CAR_LENGTH / 2 + 5, LOCO_HEIGHT * 0.62, 0)
  group.add(headlight, headlightTarget)
  headlight.target = headlightTarget
  headlight.visible = false

  const setNight = (t: number): void => {
    headlightMat.emissiveIntensity = t * 2.2
    headlight.visible = t > 0.02
    headlight.intensity = 500 * t
  }

  return { group, setNight, updateSmoke }
}

/** Builds one wagon — a plain boxy car in its own colour, with a row of
 *  windows along each side that glow amber at night (the shared
 *  `windowMat` this returns lets `createTrain` drive every wagon's windows,
 *  across the whole train, with one `emissiveIntensity` write instead of
 *  one per car).
 */
function buildWagon(color: number): { group: THREE.Group; windowMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group()
  group.name = 'wagon'
  const bodyMat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_LENGTH, CAR_HEIGHT, CAR_WIDTH), bodyMat)
  body.name = 'body'
  body.position.y = CAR_HEIGHT / 2
  group.add(body)

  const windowMat = new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR, roughness: 0.3, emissive: WINDOW_EMISSIVE, emissiveIntensity: 0, side: THREE.DoubleSide,
  })
  const windowGeo = new THREE.PlaneGeometry(WINDOW_WIDTH, WINDOW_HEIGHT)
  for (const side of [-1, 1]) {
    for (let i = 0; i < WINDOW_COUNT; i++) {
      const x = (i / (WINDOW_COUNT - 1) - 0.5) * (CAR_LENGTH - WINDOW_WIDTH * 1.6)
      const win = new THREE.Mesh(windowGeo, windowMat)
      win.name = 'window'
      win.position.set(x, CAR_HEIGHT * 0.6, (side * CAR_WIDTH) / 2 + 0.005 * side)
      win.rotation.y = side > 0 ? 0 : Math.PI
      group.add(win)
    }
  }

  return { group, windowMat }
}

/**
 * A short train that shuttles back and forth along `line` — a dead-end
 * spur, not a loop, the same honest scope cut `placeRailLine` explains.
 * The lead car (index 0 — always the front, regardless of which way the
 * train is currently heading, since every other car trails it by a fixed
 * offset toward the rear) is a locomotive; the rest are wagons, each in
 * their own colour. Cars trail the lead car by a fixed offset along the
 * line's own x, so the whole train reverses direction as one piece at
 * either end rather than each car turning around where it stands.
 */
export function createTrain(scene: THREE.Scene, line: RailLine, seed: number): Train {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'train'

  const loco = buildLocomotive()
  group.add(loco.group)
  const cars: THREE.Object3D[] = [loco.group]
  const windowMats: THREE.MeshStandardMaterial[] = []
  const colorStart = Math.floor(rng() * CAR_COLORS.length)
  for (let i = 1; i < CAR_COUNT; i++) {
    const color = CAR_COLORS[(colorStart + i - 1) % CAR_COLORS.length]
    const wagon = buildWagon(color)
    group.add(wagon.group)
    cars.push(wagon.group)
    windowMats.push(wagon.windowMat)
  }
  scene.add(group)

  const x0 = line.points[0].x
  const x1 = line.points[line.points.length - 1].x
  const z = line.points[0].z
  const length = x1 - x0

  let t = rng()
  let dir: 1 | -1 = rng() < 0.5 ? 1 : -1

  function pose(): void {
    const headX = x0 + t * length
    for (let i = 0; i < cars.length; i++) {
      const carX = Math.max(x0, Math.min(x1, headX - i * (CAR_LENGTH + CAR_GAP) * dir))
      const y = railHeightAt(line, carX) + RAIL_HEIGHT
      cars[i].position.set(carX, y, z)
      cars[i].rotation.y = dir > 0 ? 0 : Math.PI
    }
  }
  pose()

  let elapsed = 0
  // >0 while stopped at a station (an end of the line) — set the instant it
  // arrives, counted down instead of advancing t, so the train actually
  // waits there rather than bouncing straight back.
  let stationWait = 0

  return {
    update(dt) {
      if (stationWait > 0) {
        stationWait = Math.max(0, stationWait - dt)
      } else {
        const before = t
        ;({ t, dir } = stepTrainT(t, dir, dt, TRAIN_SPEED, length))
        if (t !== before && (t === 0 || t === 1)) stationWait = randRange(rng, STATION_DWELL_RANGE)
      }
      pose()
      elapsed += dt
      loco.updateSmoke(elapsed)
    },
    setNight(nt) {
      loco.setNight(nt)
      for (const mat of windowMats) mat.emissiveIntensity = nt * 2.2
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          if (!Array.isArray(o.material)) o.material.dispose()
        }
        if (o instanceof THREE.Sprite) o.material.dispose()
      })
    },
  }
}
