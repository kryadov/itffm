import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import { caveSdf, TUNNEL_HEIGHT, type Mine, type MineSegment } from './mine'

/**
 * Bats in the mine: a few colonies hanging head down from the ceiling at the
 * dead ends, a pale shape in the lamp's light. Walk up to one and it takes
 * wing — the whole colony flickers round the passage in quick figure-eights
 * for a few seconds, then settles back where it was.
 *
 * Everything is in the mine's own local frame (x along the entrance axis,
 * `mine.ts`), and the meshes are added to the mine's group, which is rotated
 * the same way `localToWorld` rotates the collision.
 */

export interface BatRoost {
  /** Local metres: the colony's spot on the ceiling. */
  lx: number
  lz: number
  /** World height of the ceiling there. */
  ceiling: number
  /** Floor height (world). */
  floor: number
  /** Unit direction of the passage, local — the colony flies up and down it. */
  ax: number
  az: number
  /** How far along the passage either way the flight may reach, metres. */
  reach: number
  count: number
  seed: number
}

/** How long a flushed colony stays up, seconds. */
export const BAT_FLIGHT_SECONDS = 7
/** How near the player comes before a colony takes wing, metres. */
const FLUSH_DISTANCE = 5
/** Seconds to drop off the ceiling into flight, and to settle back. */
const TAKE_OFF = 0.5
const SETTLE = 0.8
/** Across the passage a bat keeps this far from its centre line, metres. */
const ACROSS = 0.5
const COLONIES = 3

/** Tunnel length from the mouth to the far end of `s`. */
function depthOf(s: MineSegment, byId: Map<number, MineSegment>): number {
  let d = 0
  for (let c: MineSegment | undefined = s; c; c = c.parentId === null ? undefined : byId.get(c.parentId)) {
    d += Math.hypot(c.x1 - c.x0, c.z1 - c.z0)
  }
  return d
}

/**
 * Where the colonies hang: up to three dead ends (never the diamond's own
 * chamber), each some way down its passage, on the ceiling over the middle.
 * Pure and deterministic.
 */
export function placeBatRoosts(m: Mine, seed: number): BatRoost[] {
  const rng = mulberry32((seed ^ 0xba7) >>> 0)
  const byId = new Map(m.segments.map((s) => [s.id, s]))
  const leaves = m.segments
    .filter((s) => s.isLeaf && !s.isDiamondChamber && s.parentId !== null)
    .sort((a, b) => depthOf(b, byId) - depthOf(a, byId))
  // A shuffle of the deeper half, so they are not always the same three.
  const pool = leaves.slice(0, Math.max(COLONIES, Math.ceil(leaves.length * 0.7)))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const out: BatRoost[] = []
  for (const s of pool.slice(0, COLONIES)) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0)
    if (len < 2) continue
    const ax = (s.x1 - s.x0) / len
    const az = (s.z1 - s.z0) / len
    const at = 0.55 + rng() * 0.2
    const lx = s.x0 + (s.x1 - s.x0) * at
    const lz = s.z0 + (s.z1 - s.z0) * at
    if (caveSdf(m, lx, lz) > -0.8) continue
    out.push({
      lx,
      lz,
      ceiling: m.y + TUNNEL_HEIGHT - 0.05 - rng() * 0.2,
      floor: m.y,
      ax,
      az,
      reach: Math.min(2.2, len * 0.3),
      count: 4 + Math.floor(rng() * 6),
      seed: Math.floor(rng() * 0xffffff),
    })
  }
  return out
}

export interface BatPose {
  lx: number
  lz: number
  y: number
  /** Rotation about +y (the bat's nose is local +x). */
  heading: number
  /** -1..1: where the wing beat is. */
  flap: number
  hanging: boolean
}

/** Bat `k` of a colony, hanging: a little cluster on the ceiling. */
function hangSpot(r: BatRoost, k: number): { lx: number; lz: number; y: number; heading: number } {
  const rng = mulberry32((r.seed + k * 7919) >>> 0)
  const a = rng() * Math.PI * 2
  const d = 0.08 + rng() * 0.22
  return { lx: r.lx + Math.cos(a) * d, lz: r.lz + Math.sin(a) * d, y: r.ceiling - 0.02, heading: rng() * Math.PI * 2 }
}

/**
 * Where bat `k` of colony `r` is at time `t`, given when the colony was last
 * flushed (`-Infinity` if never). Pure: flying is a figure-eight up and down
 * the passage, at the bat's own pace and phase, never leaving the ellipse
 * `reach` long and `ACROSS` wide that fits inside the passage.
 */
export function batPose(r: BatRoost, k: number, t: number, flushedAt: number): BatPose {
  const home = hangSpot(r, k)
  const since = t - flushedAt
  if (!(since >= 0 && since < BAT_FLIGHT_SECONDS)) {
    return { ...home, flap: 0, hanging: true }
  }
  const rng = mulberry32((r.seed + k * 104729 + 1) >>> 0)
  const phase = rng() * Math.PI * 2
  const omega = (2.4 + rng() * 1.4) / Math.max(1, r.reach)
  const dir = rng() < 0.5 ? 1 : -1
  const mid = r.floor + 1.55 + (rng() - 0.5) * 0.3
  const phi = phase + dir * omega * since
  const along = r.reach * Math.cos(phi)
  const across = ACROSS * Math.sin(2 * phi)
  const y = Math.min(r.ceiling - 0.15, mid + 0.45 * Math.sin(3 * phi + phase))
  let lx = r.lx + r.ax * along - r.az * across
  let lz = r.lz + r.az * along + r.ax * across
  // Velocity for the heading.
  const dAlong = -r.reach * Math.sin(phi) * dir
  const dAcross = 2 * ACROSS * Math.cos(2 * phi) * dir
  const vx = r.ax * dAlong - r.az * dAcross
  const vz = r.az * dAlong + r.ax * dAcross
  let heading = Math.atan2(-vz, vx)
  let py = y
  // Dropping off the ceiling, and settling back on it.
  const w = since < TAKE_OFF
    ? since / TAKE_OFF
    : since > BAT_FLIGHT_SECONDS - SETTLE ? (BAT_FLIGHT_SECONDS - since) / SETTLE : 1
  if (w < 1) {
    const e = w * w * (3 - 2 * w)
    lx = home.lx + (lx - home.lx) * e
    lz = home.lz + (lz - home.lz) * e
    py = home.y + (y - home.y) * e
    if (e < 0.3) heading = home.heading
  }
  return { lx, lz, y: py, heading, flap: Math.sin(since * 34 + phase), hanging: false }
}

/** Whether a quiet colony takes wing now: the player is in the mine and near. */
export function shouldFlush(
  r: BatRoost, player: { lx: number; lz: number } | null, inside: boolean, t: number, flushedAt: number,
): boolean {
  if (!player || !inside) return false
  if (t - flushedAt < BAT_FLIGHT_SECONDS) return false
  return Math.hypot(player.lx - r.lx, player.lz - r.lz) < FLUSH_DISTANCE
}

/** A geometry painted one colour per vertex (the cave material reads `color`). */
function painted(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const n = geo.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** Drawn a little over life size (a pipistrelle is a thumb long): at lamp
 *  range in the dark a true-size one is a speck. */
const SCALE = 1.5

function bodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 8, 6)
  body.scale(0.045, 0.022, 0.024)
  const head = new THREE.SphereGeometry(1, 6, 5)
  head.scale(0.018, 0.016, 0.016)
  head.translate(0.05, 0.004, 0)
  const ears = [1, -1].map((s) => {
    const ear = new THREE.ConeGeometry(0.008, 0.024, 4)
    ear.translate(0.052, 0.022, s * 0.008)
    return ear.toNonIndexed()
  })
  const parts = [body.toNonIndexed(), head.toNonIndexed(), ...ears]
  const merged = new THREE.BufferGeometry()
  const positions: number[] = []
  for (const p of parts) positions.push(...(p.getAttribute('position').array as Float32Array))
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.computeVertexNormals()
  merged.scale(SCALE, SCALE, SCALE)
  return painted(merged, 0x4a382c)
}

/** One wing: a membrane from the body's side out to the tip, its trailing
 *  edge scalloped between the fingers. Hinged at the origin, spanning +z. */
function wingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.03, 0], [0.05, 0.06], [0.03, 0.13], [0.0, 0.17], [-0.01, 0.12], [-0.025, 0.1], [-0.02, 0.06], [-0.035, 0.035], [-0.03, 0],
  ]
  const shape = new THREE.Shape()
  shape.moveTo(pts[0][0], pts[0][1])
  for (const [x, z] of pts.slice(1)) shape.lineTo(x, z)
  const geo = new THREE.ShapeGeometry(shape)
  // Shape space is x/y; lay it into x/z, spanning +z (or -z for the left wing).
  geo.rotateX(Math.PI / 2)
  if (side === -1) geo.scale(1, 1, -1)
  geo.scale(SCALE, SCALE, SCALE)
  return painted(geo, 0x2e231d)
}

export interface Bats {
  group: THREE.Group
  /**
   * @param t seconds
   * @param player the player's position in the mine's local frame, or null
   * @param inside whether the player is in the tunnels
   */
  update(t: number, player: { lx: number; lz: number } | null, inside: boolean): void
}

/**
 * The colonies as three instanced meshes (bodies, right wings, left wings)
 * in the given material — the cave's own (`mineMesh.ts`'s `caveLitMaterial`),
 * so a bat is lit by the lamp and not by a sun it could never see.
 */
export function buildBats(roosts: BatRoost[], material: THREE.Material): Bats {
  const group = new THREE.Group()
  group.name = 'bats'
  const total = roosts.reduce((n, r) => n + r.count, 0)
  const bodies = new THREE.InstancedMesh(bodyGeometry(), material, total)
  const right = new THREE.InstancedMesh(wingGeometry(1), material, total)
  const left = new THREE.InstancedMesh(wingGeometry(-1), material, total)
  for (const mesh of [bodies, right, left]) {
    mesh.frustumCulled = false
    group.add(mesh)
  }
  const flushed = roosts.map(() => -Infinity)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const wingM = new THREE.Matrix4()
  const foldM = new THREE.Matrix4()
  const worldM = new THREE.Matrix4()

  const update = (t: number, player: { lx: number; lz: number } | null, inside: boolean): void => {
    let i = 0
    roosts.forEach((r, ri) => {
      if (shouldFlush(r, player, inside, t, flushed[ri])) flushed[ri] = t
      for (let k = 0; k < r.count; k++, i++) {
        const p = batPose(r, k, t, flushed[ri])
        pos.set(p.lx, p.y, p.lz)
        // Hanging: nose (local +x) turned to the floor. Flying: level, nose along.
        e.set(0, p.heading, p.hanging ? -Math.PI / 2 : 0, 'YXZ')
        q.setFromEuler(e)
        m.compose(pos, q, one)
        bodies.setMatrixAt(i, m)
        // Folded along the body while hanging; beating while flying.
        const fold = p.hanging ? 0.25 : 1
        const beat = p.hanging ? 1.3 : 0.9 * p.flap
        for (const [mesh, side] of [[right, 1], [left, -1]] as const) {
          // The wing's own frame: folded (scaled across), then swung on its hinge.
          wingM.makeRotationX(side * beat).multiply(foldM.makeScale(1, 1, fold))
          mesh.setMatrixAt(i, worldM.multiplyMatrices(m, wingM))
        }
      }
    })
    for (const mesh of [bodies, right, left]) mesh.instanceMatrix.needsUpdate = true
  }
  update(0, null, false)
  return { group, update }
}
