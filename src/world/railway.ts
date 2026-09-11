import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../util/rng'
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
  dispose(): void
}

/** Toy/logging-railway pace, not a mainline train's — the whole line is
 *  under 200m, and a train crossing it in seconds would read as a blur, not
 *  something you watch pass. */
const TRAIN_SPEED = 2.5
const CAR_COUNT = 3
const CAR_LENGTH = 2.0
const CAR_GAP = 0.35
const CAR_WIDTH = 1.0
const CAR_HEIGHT = 1.05

const CAR_COLORS = [0x7a4a32, 0x5f6b52, 0x8a3b34, 0x4a5a6b]

/**
 * A short train that shuttles back and forth along `line` — a dead-end
 * spur, not a loop, the same honest scope cut `placeRailLine` explains.
 * Cars trail the lead car by a fixed offset along the line's own x, so the
 * whole train reverses direction as one piece at either end rather than
 * each car turning around where it stands.
 */
export function createTrain(scene: THREE.Scene, line: RailLine, seed: number): Train {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'train'
  const mat = new THREE.MeshStandardMaterial({
    color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length) % CAR_COLORS.length],
    flatShading: true,
  })
  const cars: THREE.Mesh[] = []
  for (let i = 0; i < CAR_COUNT; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(CAR_LENGTH, CAR_HEIGHT, CAR_WIDTH), mat)
    group.add(car)
    cars.push(car)
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
      const y = railHeightAt(line, carX) + RAIL_HEIGHT + CAR_HEIGHT / 2
      cars[i].position.set(carX, y, z)
      cars[i].rotation.y = dir > 0 ? 0 : Math.PI
    }
  }
  pose()

  return {
    update(dt) {
      ;({ t, dir } = stepTrainT(t, dir, dt, TRAIN_SPEED, length))
      pose()
    },
    dispose() {
      scene.remove(group)
      for (const car of cars) car.geometry.dispose()
      mat.dispose()
    },
  }
}
