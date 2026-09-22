import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import { mulberry32 } from '../util/rng'

/**
 * Fading ground marks left behind the player and ground-dwelling wildlife —
 * see docs' player-facing note and `src/save/store.ts`'s `groundTracks` pref.
 * Not asphalt skid marks (`race-the-city`'s `driftfx.ts`, which this module's
 * instanced-ring-buffer-with-fade technique is ported from): these are
 * pressed into soil and litter, so they read as a dark, desaturated earth
 * tone rather than a black smear, and they sit low and flat rather than
 * riding above the ground the way a 0.2 m road mark does.
 */

// ---------------------------------------------------------------------------
// Pure helpers — no THREE, no scene, no clock. Each has a determinism test.
// ---------------------------------------------------------------------------

export type FootSide = 'left' | 'right'
export type AnimalKind = 'hare' | 'squirrel' | 'snake'
export type TrackKind = 'foot' | 'bike' | AnimalKind

/**
 * Which foot touched down, from `game/player.ts`'s `bobPhase` — it bounces
 * twice per full 2·PI (`cameraBob`, `audio/footsteps.ts`'s `crossedFootstep`
 * doc comment), touching down at each multiple of PI. Even multiples are one
 * foot, odd the other — this is the only place that assigns which is which,
 * so a footprint and the camera bob it corresponds to never disagree.
 */
export function footSide(bobPhase: number): FootSide {
  return Math.floor(bobPhase / Math.PI) % 2 === 0 ? 'left' : 'right'
}

/**
 * The lateral offset (world metres, x/z) a footprint sits at from the
 * player's own (centreline) position: `spacing` to one side of straight
 * ahead (`heading`), sign picked by `side` — a left/right print pair either
 * side of the line of travel, not stacked on top of each other.
 */
export function footOffset(heading: number, side: FootSide, spacing: number): { dx: number; dz: number } {
  const sign = side === 'left' ? 1 : -1
  // Perpendicular to heading: (cos, sin) rotated 90°.
  return { dx: -Math.sin(heading) * spacing * sign, dz: Math.cos(heading) * spacing * sign }
}

/** How long each kind of mark lingers before it has fully faded, seconds. */
export const TRACK_LIFETIME: Record<TrackKind, number> = {
  foot: 45,
  bike: 55,
  hare: 25,
  squirrel: 20,
  snake: 30,
}

/** Fraction of a mark's life, at the end, spent shrinking to nothing rather
 *  than vanishing outright — the same "fade near the end" shape
 *  `race-the-city`'s `driftfx.ts` smoke puffs use, applied to scale (an
 *  InstancedMesh has no per-instance opacity) instead of alpha. */
const FADE_FRACTION = 0.35

/**
 * 1 while freshly laid, ramping down to 0 over the mark's last
 * `FADE_FRACTION` of its life — never negative, never above 1. `life` counts
 * down from `maxLife` to 0.
 */
export function fadeScale(life: number, maxLife: number): number {
  if (maxLife <= 0) return 0
  const l01 = Math.max(0, Math.min(1, life / maxLife))
  const fadeAt = FADE_FRACTION
  return l01 >= fadeAt ? 1 : l01 / fadeAt
}

/** Not black: a dark, desaturated earth tone per kind, distinct enough that
 *  a footprint doesn't read as the same mark as a paw print, but all cousins
 *  of the litter/ground colours `world/ground.ts` already uses. */
export const TRACK_COLOR: Record<TrackKind, number> = {
  foot: 0x362b1c, // packed earth, boot-shaped
  bike: 0x2c2417, // thinner tyre track, slightly darker
  hare: 0x4a3b22, // a light paw imprint
  squirrel: 0x4a3b22,
  snake: 0x3a4429, // a pressed streak through litter, faintly green
}

export const TRACK_OPACITY: Record<TrackKind, number> = {
  foot: 0.45,
  bike: 0.4,
  hare: 0.32,
  squirrel: 0.28,
  snake: 0.3,
}

/** Plan-view footprint/paw/segment size (length × width, metres). */
export const TRACK_SIZE: Record<TrackKind, { length: number; width: number }> = {
  foot: { length: 0.24, width: 0.1 },
  bike: { length: 0.5, width: 0.045 },
  hare: { length: 0.06, width: 0.045 },
  squirrel: { length: 0.04, width: 0.03 },
  snake: { length: 0.05, width: 0.05 },
}

/** A small deterministic size wobble (0.85–1.15×) so a run of prints doesn't
 *  look machine-stamped — drawn from `mulberry32`, never `Math.random`. */
export function sizeJitter(rand: () => number): number {
  return 0.85 + rand() * 0.3
}

// ---------------------------------------------------------------------------
// Runtime: one InstancedMesh ring buffer per kind, instanced (never one mesh
// per mark) — same shape as `race-the-city`'s driftfx.ts, adapted to itffm's
// ground tones and to five kinds of mark instead of one.
// ---------------------------------------------------------------------------

const POOL_SIZE: Record<TrackKind, number> = {
  foot: 160,
  bike: 240,
  hare: 70,
  squirrel: 70,
  snake: 90,
}

interface Pool {
  mesh: THREE.InstancedMesh
  x: Float32Array
  y: Float32Array
  z: Float32Array
  rotY: Float32Array
  sx: Float32Array
  sz: Float32Array
  life: Float32Array
  maxLife: Float32Array
  next: number
}

function markGeometry(kind: TrackKind): THREE.BufferGeometry {
  const { length, width } = TRACK_SIZE[kind]
  const geo = new THREE.PlaneGeometry(length, width)
  geo.rotateX(-Math.PI / 2)
  return geo
}

function createPool(scene: THREE.Scene, kind: TrackKind): Pool {
  const count = POOL_SIZE[kind]
  const mat = new THREE.MeshBasicMaterial({
    color: TRACK_COLOR[kind],
    transparent: true,
    opacity: TRACK_OPACITY[kind],
    depthWrite: false,
  })
  const mesh = new THREE.InstancedMesh(markGeometry(kind), mat, count)
  mesh.name = `tracks-${kind}`
  mesh.frustumCulled = false
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero)
  scene.add(mesh)
  return {
    mesh,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    rotY: new Float32Array(count),
    sx: new Float32Array(count),
    sz: new Float32Array(count),
    life: new Float32Array(count),
    maxLife: new Float32Array(count),
    next: 0,
  }
}

const GROUND_OFFSET = 0.015 // just above the litter, not floating above it like a road mark
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const pos = new THREE.Vector3()
const scl = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

function place(pool: Pool, x: number, y: number, z: number, heading: number, scale: number, maxLife: number): void {
  const i = pool.next
  pool.next = (pool.next + 1) % pool.x.length
  pool.x[i] = x
  pool.y[i] = y + GROUND_OFFSET
  pool.z[i] = z
  pool.rotY[i] = heading
  pool.sx[i] = scale
  pool.sz[i] = scale
  pool.life[i] = maxLife
  pool.maxLife[i] = maxLife
}

function stepPool(pool: Pool, dt: number): void {
  let dirty = false
  const n = pool.x.length
  for (let i = 0; i < n; i++) {
    if (pool.life[i] <= 0) continue
    pool.life[i] -= dt
    dirty = true
    if (pool.life[i] <= 0) {
      pool.mesh.setMatrixAt(i, m.compose(pos.set(0, -1000, 0), q.identity(), scl.set(0, 0, 0)))
      continue
    }
    const f = fadeScale(pool.life[i], pool.maxLife[i])
    q.setFromAxisAngle(UP, -pool.rotY[i])
    pos.set(pool.x[i], pool.y[i], pool.z[i])
    scl.set(pool.sx[i] * f, 1, pool.sz[i] * f)
    pool.mesh.setMatrixAt(i, m.compose(pos, q, scl))
  }
  if (dirty) pool.mesh.instanceMatrix.needsUpdate = true
}

function resetPool(pool: Pool): void {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < pool.life.length; i++) {
    pool.life[i] = 0
    pool.mesh.setMatrixAt(i, zero)
  }
  pool.mesh.instanceMatrix.needsUpdate = true
  pool.next = 0
}

export interface TrackFx {
  /** Lays one footprint at (x, z) — the ground under it is sampled here, so
   *  callers never have to. */
  layFoot(provider: ElevationProvider, x: number, z: number, heading: number, side: FootSide): void
  layBike(provider: ElevationProvider, x: number, z: number, heading: number): void
  layAnimal(provider: ElevationProvider, kind: AnimalKind, x: number, z: number, heading: number): void
  /** Ages every mark and recomposes the pools' matrices — call every frame. */
  update(dt: number): void
  setEnabled(on: boolean): void
  reset(): void
}

/**
 * Five instanced ring buffers (2 draw calls short of `driftfx.ts`'s own
 * two-pool count, one per kind of mark) — never one mesh per footprint, the
 * same "arithmetic" CLAUDE.md's mushroom note warns about.
 */
export function createTrackFx(scene: THREE.Scene, seed = 1): TrackFx {
  const pools: Record<TrackKind, Pool> = {
    foot: createPool(scene, 'foot'),
    bike: createPool(scene, 'bike'),
    hare: createPool(scene, 'hare'),
    squirrel: createPool(scene, 'squirrel'),
    snake: createPool(scene, 'snake'),
  }
  const rand = mulberry32(seed)
  let enabled = true

  const lay = (kind: TrackKind, provider: ElevationProvider, x: number, z: number, heading: number): void => {
    if (!enabled) return
    place(pools[kind], x, provider.heightAt(x, z), z, heading, sizeJitter(rand), TRACK_LIFETIME[kind])
  }

  return {
    layFoot(provider, x, z, heading, side) {
      const { dx, dz } = footOffset(heading, side, TRACK_SIZE.foot.width * 1.1)
      lay('foot', provider, x + dx, z + dz, heading)
    },
    layBike(provider, x, z, heading) {
      lay('bike', provider, x, z, heading)
    },
    layAnimal(provider, kind, x, z, heading) {
      lay(kind, provider, x, z, heading)
    },
    update(dt) {
      if (!enabled) return
      for (const kind of Object.keys(pools) as TrackKind[]) stepPool(pools[kind], dt)
    },
    setEnabled(on) {
      enabled = on
      if (!on) for (const kind of Object.keys(pools) as TrackKind[]) resetPool(pools[kind])
    },
    reset() {
      for (const kind of Object.keys(pools) as TrackKind[]) resetPool(pools[kind])
    },
  }
}
