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

/** All the pure measuring below needs of a line is where it runs on the ground; a
 *  height, when it has one, is used and otherwise taken as zero. */
export interface PlanLine {
  points: { x: number; z: number; y?: number }[]
}

/** The seed offset `game/scene.ts` uses for `placeRailLine`, exported so
 *  `game/loadForest.ts` can compute the very same line — the one that
 *  actually gets rendered and shuttled along — early enough to keep trees
 *  off it (`world/osmTrees.ts`'s `RAIL_CLEARANCE`), rather than each of the
 *  two call sites carrying its own copy of the same magic number. */
export const RAIL_SEED_OFFSET = 29

// ---- the train's own dimensions live here: the stations are sized from them ----

/** The locomotive and every wagon behind it, metres. */
export const LOCO_LENGTH = 2.7
export const WAGON_LENGTH = 2.1
export const CAR_GAP = 0.35
/** The locomotive and five wagons. */
export const TRAIN_CARS = 6
/** From the locomotive's centre to its nose. */
export const HEAD_TO_FRONT = LOCO_LENGTH / 2
/** From the locomotive's centre to the centre of each car behind it. */
export const CAR_OFFSETS: number[] = (() => {
  const out = [0]
  let at = LOCO_LENGTH / 2 + CAR_GAP + WAGON_LENGTH / 2
  for (let i = 1; i < TRAIN_CARS; i++) {
    out.push(at)
    at += WAGON_LENGTH + CAR_GAP
  }
  return out
})()
/** From the locomotive's centre to the rear of the last wagon. */
export const HEAD_TO_REAR = CAR_OFFSETS[TRAIN_CARS - 1] + WAGON_LENGTH / 2
/** The whole train, nose to tail. */
export const TRAIN_TOTAL = HEAD_TO_FRONT + HEAD_TO_REAR

// ---- the line's layout, measured along it from either end ----

/** Where the rails go into the hill: the portal's mouth stands this far from the
 *  line's own end, so the last stretch of track is inside the mound. */
export const PORTAL_MOUTH = 7
/** From the mouth to where a platform begins. */
const PLATFORM_APPROACH = 5
/** How far a platform reaches past the train's nose and tail when it stands. */
export const STATION_OVERHANG = 1.5
export const PLATFORM_LENGTH = TRAIN_TOTAL + 2 * STATION_OVERHANG
/** Straight track at each end: the portal, the platform, and a run-out past it. */
export const END_STRAIGHT = PORTAL_MOUTH + PLATFORM_APPROACH + PLATFORM_LENGTH + 6

/** How far apart ground-height samples sit along the line, metres — dense
 *  enough to follow the ground, not cut a chord over it. */
const RAIL_STEP = 3
/** How far out toward the plot's edge the line reaches, as a fraction of halfSize. */
const SPAN_FRAC = 0.9
/** The tightest bend a candidate line may have, metres of radius: the track is a
 *  chain of 3 m chords, and a tighter turn would show as kinks. */
const MIN_RADIUS = 14
const CANDIDATES = 90

interface V2 {
  x: number
  z: number
}

function hermite(p0: V2, p1: V2, m0: V2, m1: V2, t: number): V2 {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return {
    x: h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
    z: h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z,
  }
}

/** One candidate centre line: straight at both ends, a smooth S-shaped run between. */
function candidateLine(halfSize: number, rng: () => number): V2[] {
  const lim = halfSize * SPAN_FRAC
  const theta = rng() * Math.PI
  const d = { x: Math.cos(theta), z: Math.sin(theta) }
  const n = { x: -d.z, z: d.x }
  const off = (rng() < 0.5 ? -1 : 1) * halfSize * (0.2 + rng() * 0.4)
  const c = { x: n.x * off, z: n.z * off }
  let reach = Infinity
  for (const [cc, dd] of [[c.x, d.x], [c.z, d.z]] as const) {
    if (Math.abs(dd) > 1e-6) reach = Math.min(reach, (lim - Math.abs(cc)) / Math.abs(dd))
  }
  reach = Math.max(reach, 10)
  const a = { x: c.x - d.x * reach, z: c.z - d.z * reach }
  const b = { x: c.x + d.x * reach, z: c.z + d.z * reach }
  const chord = 2 * reach
  const stub = Math.min(END_STRAIGHT, chord * 0.3)

  const at = (u: number, w: number): V2 => ({
    x: a.x + d.x * u + n.x * w,
    z: a.z + d.z * u + n.z * w,
  })
  const middle = chord - 2 * stub
  // Few, broad bends: a bend's sideways swing is limited by the room it has to make it in.
  const bends = 1 + Math.floor(rng() * 2)
  const room = middle / (bends + 1)
  const amp = Math.min(halfSize * (0.12 + rng() * 0.12), (0.85 * room * room) / (Math.PI * Math.PI * MIN_RADIUS))
  const ctrl: V2[] = [at(stub, 0)]
  const sign0 = rng() < 0.5 ? -1 : 1
  for (let j = 1; j <= bends; j++) {
    const u = stub + (middle * (j + (rng() - 0.5) * 0.3)) / (bends + 1)
    ctrl.push(at(u, sign0 * (j % 2 === 0 ? 1 : -1) * amp * (0.5 + rng() * 0.5)))
  }
  ctrl.push(at(chord - stub, 0))

  // Straight stubs, then a Hermite spline through the middle that leaves each
  // stub along its own direction, so the platform's straight really is straight.
  const fine: V2[] = [a, ctrl[0]]
  const m: V2[] = ctrl.map((p, i) => {
    if (i === 0) return { x: d.x * Math.hypot(ctrl[1].x - p.x, ctrl[1].z - p.z), z: d.z * Math.hypot(ctrl[1].x - p.x, ctrl[1].z - p.z) }
    if (i === ctrl.length - 1) {
      const len = Math.hypot(p.x - ctrl[i - 1].x, p.z - ctrl[i - 1].z)
      return { x: d.x * len, z: d.z * len }
    }
    return { x: (ctrl[i + 1].x - ctrl[i - 1].x) / 2, z: (ctrl[i + 1].z - ctrl[i - 1].z) / 2 }
  })
  for (let i = 0; i < ctrl.length - 1; i++) {
    for (let k = 1; k <= 24; k++) fine.push(hermite(ctrl[i], ctrl[i + 1], m[i], m[i + 1], k / 24))
  }
  fine.push(b)
  return fine
}

/** The polyline resampled to points a fixed arc-length step apart. */
function resample(fine: V2[], step: number): V2[] {
  const cum = [0]
  for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].z - fine[i - 1].z))
  const total = cum[cum.length - 1]
  const count = Math.max(2, Math.round(total / step))
  const out: V2[] = []
  let seg = 1
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * total
    while (seg < fine.length - 1 && cum[seg] < s) seg++
    const span = cum[seg] - cum[seg - 1] || 1
    const t = Math.min(1, Math.max(0, (s - cum[seg - 1]) / span))
    out.push({ x: fine[seg - 1].x + (fine[seg].x - fine[seg - 1].x) * t, z: fine[seg - 1].z + (fine[seg].z - fine[seg - 1].z) * t })
  }
  return out
}

/** Lower is better: what makes a candidate line a poor place for a railway. */
function lineCost(pts: V2[], halfSize: number, ground: ElevationProvider, avoid?: (x: number, z: number) => boolean): number {
  let cost = 0
  // A line that is all but straight is not what was asked for.
  const first = pts[0]
  const last = pts[pts.length - 1]
  const chord = Math.hypot(last.x - first.x, last.z - first.z) || 1
  let swing = 0
  for (const p of pts) swing = Math.max(swing, Math.abs((last.x - first.x) * (first.z - p.z) - (first.x - p.x) * (last.z - first.z)) / chord)
  if (swing < halfSize * 0.07) cost += 20
  const limit = halfSize * 0.96
  let prevY = ground.heightAt(pts[0].x, pts[0].z)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (avoid && avoid(p.x, p.z)) cost += 50
    if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) cost += 40
    if (Math.hypot(p.x, p.z) < halfSize * 0.22) cost += 25 // the hut's clearing
    if (i > 0) {
      const y = ground.heightAt(p.x, p.z)
      const grade = Math.abs(y - prevY) / RAIL_STEP
      if (grade > 0.22) cost += (grade - 0.22) * 60
      prevY = y
    }
    if (i > 0 && i < pts.length - 1) {
      const a = Math.atan2(p.z - pts[i - 1].z, p.x - pts[i - 1].x)
      const b = Math.atan2(pts[i + 1].z - p.z, pts[i + 1].x - p.x)
      let turn = Math.abs(b - a)
      if (turn > Math.PI) turn = 2 * Math.PI - turn
      if (turn > RAIL_STEP / MIN_RADIUS) cost += 30 + turn * 40
    }
  }
  return cost
}

/**
 * Sites the railway: a winding line right across the wood, straight for a stretch
 * at each end (a portal into the hillside, then a platform) and curving between —
 * so it reads as a line that comes from somewhere and goes on somewhere, not a
 * bar laid on the ground. Of ninety candidate routes it takes the one that keeps
 * out of the water (`avoid`, when given), off steep ground and out of the hut's
 * clearing, and has no bend tighter than a small railway could take.
 */
export function placeRailLine(
  ground: ElevationProvider, halfSize: number, seed: number, avoid?: (x: number, z: number) => boolean,
): RailLine {
  const rng = mulberry32(seed)
  let best: V2[] | null = null
  let bestCost = Infinity
  for (let k = 0; k < CANDIDATES; k++) {
    const pts = resample(candidateLine(halfSize, rng), RAIL_STEP)
    const cost = lineCost(pts, halfSize, ground, avoid)
    if (cost < bestCost) {
      best = pts
      bestCost = cost
      if (cost === 0) break
    }
  }
  return { points: best!.map((p) => ({ x: p.x, z: p.z, y: ground.heightAt(p.x, p.z) })) }
}

// ---- measuring along the line ----

const cumulativeCache = new WeakMap<PlanLine['points'], number[]>()

/** Distance along the line to each of its points, from the first. */
function cumulative(points: PlanLine['points']): number[] {
  let cum = cumulativeCache.get(points)
  if (!cum) {
    cum = [0]
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
    }
    cumulativeCache.set(points, cum)
  }
  return cum
}

/** The line's length, metres. */
export function lineLength(line: PlanLine): number {
  const cum = cumulative(line.points)
  return cum[cum.length - 1]
}

export interface RailSample {
  x: number
  y: number
  z: number
  /** Unit direction of travel along the line, in the ground plane. */
  tx: number
  tz: number
}

/**
 * The point `s` metres along the line, with its direction. Past either end it
 * carries straight on, so a car that has not yet come out of its tunnel still
 * has somewhere to stand.
 */
export function pointAt(line: PlanLine, s: number): RailSample {
  const pts = line.points
  const cum = cumulative(pts)
  const last = pts.length - 1
  let i: number
  if (s <= 0) i = 1
  else if (s >= cum[last]) i = last
  else {
    let lo = 1
    let hi = last
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < s) lo = mid + 1
      else hi = mid
    }
    i = lo
  }
  const a = pts[i - 1]
  const b = pts[i]
  const span = cum[i] - cum[i - 1] || 1
  const tx = (b.x - a.x) / span
  const tz = (b.z - a.z) / span
  const u = s - cum[i - 1] // may be negative or beyond the span: straight on
  const yT = Math.min(1, Math.max(0, u / span))
  return { x: a.x + tx * u, z: a.z + tz * u, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * yT, tx, tz }
}

/**
 * Ground height along the line, `s` metres from its start — piecewise-linear
 * between the sampled points. Shared by the mesh and the train so a car's own
 * wheels never float above or sink into the rails it just rode over.
 */
export function railHeightAt(line: PlanLine, s: number): number {
  return pointAt(line, s).y
}

/** The way the line faces at `s`, as a yaw for a thing whose own +x points along it. */
export function yawOf(tx: number, tz: number): number {
  return Math.atan2(-tz, tx)
}

export const RAIL_GAUGE = 0.7 // narrow-gauge, forest-logging scale — not a mainline
export const RAIL_HEIGHT = 0.08
const SLEEPER_SPACING = 1.4
const SLEEPER_LENGTH = 1.1
const SLEEPER_WIDTH = 0.22
const SLEEPER_HEIGHT = 0.1
const BALLAST_HALF_WIDTH = 0.8

/** A box's own +x along `f`, +y as close to world up as `f` allows, at `at`. */
function alongMatrix(f: THREE.Vector3, at: THREE.Vector3): THREE.Matrix4 {
  const x = f.clone().normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const y = up.sub(x.clone().multiplyScalar(up.dot(x))).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(at)
}

/** The track bed itself — a ballast strip, two rails and their sleepers, all
 *  following the line's bends and the ground's slope. Static geometry, three
 *  draw calls in all. */
export function buildRailMesh(line: RailLine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'railway'
  const pts = line.points
  const half = RAIL_GAUGE / 2

  const railMat = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.6, metalness: 0.3 })
  for (const side of [-1, 1]) {
    const segments: THREE.BufferGeometry[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const flat = Math.hypot(dx, dz) || 1
      // The rail lies to the side of the chord, level with the ground under it.
      const ox = (-dz / flat) * side * half
      const oz = (dx / flat) * side * half
      const from = new THREE.Vector3(a.x + ox, a.y + RAIL_HEIGHT / 2, a.z + oz)
      const to = new THREE.Vector3(b.x + ox, b.y + RAIL_HEIGHT / 2, b.z + oz)
      const dir = to.clone().sub(from)
      const seg = new THREE.BoxGeometry(dir.length() + 0.1, RAIL_HEIGHT, 0.07)
      seg.applyMatrix4(alongMatrix(dir, from.clone().add(to).multiplyScalar(0.5)))
      segments.push(seg)
    }
    const merged = mergeGeometries(segments, false)
    merged.computeVertexNormals()
    group.add(new THREE.Mesh(merged, railMat))
  }

  const length = lineLength(line)
  const sleeperCount = Math.max(1, Math.floor(length / SLEEPER_SPACING))
  const sleepers: THREE.BufferGeometry[] = []
  for (let i = 0; i <= sleeperCount; i++) {
    const s = (i / sleeperCount) * length
    const p = pointAt(line, s)
    const g = new THREE.BoxGeometry(SLEEPER_WIDTH, SLEEPER_HEIGHT, SLEEPER_LENGTH)
    g.rotateY(yawOf(p.tx, p.tz))
    g.translate(p.x, p.y - SLEEPER_HEIGHT / 2 + RAIL_HEIGHT * 0.3, p.z)
    sleepers.push(g)
  }
  group.add(new THREE.Mesh(mergeGeometries(sleepers, false), new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 })))

  // Ballast: a low strip of gravel under it all, so the track sits on something.
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pointAt(line, cumulative(pts)[i])
    verts.push(
      p.x + p.tz * BALLAST_HALF_WIDTH, p.y + 0.03, p.z - p.tx * BALLAST_HALF_WIDTH,
      p.x - p.tz * BALLAST_HALF_WIDTH, p.y + 0.03, p.z + p.tx * BALLAST_HALF_WIDTH,
    )
    if (i > 0) {
      const k = (i - 1) * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const ballastGeo = new THREE.BufferGeometry()
  ballastGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  ballastGeo.setIndex(idx)
  ballastGeo.computeVertexNormals()
  const ballast = new THREE.Mesh(ballastGeo, new THREE.MeshStandardMaterial({ color: 0x6b665c, roughness: 1, side: THREE.DoubleSide }))
  ballast.name = 'ballast'
  group.add(ballast)

  return group
}

// ---- stations and portals ----

/** A platform beside the track, at one of the line's two ends — where the train
 *  dwells. It lies along a straight stretch of the line: `(cx, cz)` is its
 *  middle on the track's own centre line, `(tx, tz)` the direction of increasing
 *  `s`, `side` which side of the track it lies on (+1 the left of `(tx, tz)`
 *  turned a quarter, -1 the other), `s0..s1` its length along the line. */
export interface Station {
  cx: number
  cz: number
  tx: number
  tz: number
  side: 1 | -1
  half: number
  s0: number
  s1: number
  /** 0 the end where the line starts, 1 the end where it finishes. */
  end: 0 | 1
}

/** From the track's centre line to the platform's near edge: the car's side (0.5)
 *  and a small gap, and clear of the sleepers' ends (0.55). */
export const STATION_PLATFORM_GAP = 0.7
export const STATION_PLATFORM_WIDTH = 2.2
/** How far the platform's top stands above the rail line's own ground profile:
 *  a step up, a little above the rail heads (`RAIL_HEIGHT`). */
export const STATION_PLATFORM_HEIGHT = 0.13
/** How far the ground beside the track is kept clear of trees and scatter,
 *  measured across the line on the side away from the platform. */
const STATION_CLEAR_TRACKSIDE = 1.8

/** A station's local frame to world: `u` along the track from its middle, `v`
 *  across it toward the platform's own side. */
export function stationToWorld(st: Station, u: number, v: number): { x: number; z: number } {
  // Local +z is the track's left; the platform's side may be either.
  return {
    x: st.cx + u * st.tx + v * st.side * -st.tz,
    z: st.cz + u * st.tz + v * st.side * st.tx,
  }
}

/**
 * The line's two stops, one near each end: the platform lies exactly along the
 * whole train as it stands during its dwell (`train.ts` stops the nose
 * `STATION_OVERHANG` short of the platform's far end in either direction), on the
 * side of the track that faces the middle of the wood, where a player is.
 *
 * Pure and derived from the line alone (only x and z of its points are read),
 * so the mesh, the clearing of trees and the minimap all agree on where a stop is.
 */
export function stationsFor(line: PlanLine): Station[] {
  const length = lineLength(line)
  const out: Station[] = []
  for (const end of [0, 1] as const) {
    const startFromEnd = Math.min(PORTAL_MOUTH + PLATFORM_APPROACH, length * 0.25)
    const s0 = end === 0 ? startFromEnd : length - startFromEnd - PLATFORM_LENGTH
    const s1 = s0 + PLATFORM_LENGTH
    const mid = pointAt(line, (s0 + s1) / 2)
    // Toward the middle of the wood: the side whose normal has the smaller distance to the origin.
    const left = { x: -mid.tz, z: mid.tx }
    const toCentre = -(mid.x * left.x + mid.z * left.z)
    out.push({
      cx: mid.x, cz: mid.z, tx: mid.tx, tz: mid.tz,
      side: toCentre >= 0 ? 1 : -1, half: PLATFORM_LENGTH / 2, s0, s1, end,
    })
  }
  return out
}

/**
 * Whether (x, z) lies on a station: along its length, from just clear of the
 * track on the far side to the platform's far edge, widened by `margin` on
 * every side. What trees, scatter and mushrooms are kept off.
 */
export function stationOccupies(stations: Station[], x: number, z: number, margin = 0): boolean {
  return stations.some((s) => {
    const dx = x - s.cx
    const dz = z - s.cz
    const u = dx * s.tx + dz * s.tz
    if (Math.abs(u) > s.half + margin) return false
    const across = (dx * -s.tz + dz * s.tx) * s.side // >0 on the platform's side of the track
    return across >= -STATION_CLEAR_TRACKSIDE - margin && across <= STATION_PLATFORM_GAP + STATION_PLATFORM_WIDTH + margin
  })
}

/** A tunnel portal: the mouth on the track, and the direction into the hill. */
export interface PortalSite {
  x: number
  y: number
  z: number
  /** Unit direction from the mouth into the hill, along the line's own extension. */
  ox: number
  oz: number
  end: 0 | 1
}

/** The two portals, one at each end of the line. */
export function portalSites(line: PlanLine): PortalSite[] {
  const length = lineLength(line)
  const a = pointAt(line, PORTAL_MOUTH)
  const b = pointAt(line, length - PORTAL_MOUTH)
  return [
    { x: a.x, y: a.y, z: a.z, ox: -a.tx, oz: -a.tz, end: 0 },
    { x: b.x, y: b.y, z: b.z, ox: b.tx, oz: b.tz, end: 1 },
  ]
}

/** How far the mound's middle is from the mouth, and its clearing radius. */
const MOUND_CENTRE = 3.2
export const MOUND_CLEAR_RADIUS = 6

/** Whether (x, z) is on a portal's mound, widened by `margin`. */
export function portalOccupies(line: PlanLine, x: number, z: number, margin = 0): boolean {
  return portalSites(line).some((p) =>
    Math.hypot(x - (p.x + p.ox * MOUND_CENTRE), z - (p.z + p.oz * MOUND_CENTRE)) < MOUND_CLEAR_RADIUS + margin)
}
