import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * What the ground animals look like, and how they move their legs and heads —
 * the drawing half of `world/critters.ts`, which owns where they are and what
 * they are doing.
 *
 * Every animal is a handful of InstancedMeshes (one draw call each, however
 * many animals): a torso, a head on a neck pivot, four legs on hip pivots, and
 * sometimes an extra (a bull moose's antlers). Each part is several primitives
 * merged into one geometry with its colours baked into the vertices — a moose's
 * pale legs, a bear's lighter muzzle, a boar's snout disc — so one material
 * serves the whole animal. The first version was one colour and a diamond per
 * body with no legs at all, and read as "not an animal" (a live report,
 * 2026-09-23).
 *
 * Model space: the animal faces +x, y is up, z is across it, the ground is
 * y = 0. Metres throughout, real-animal sizes.
 */

type V3 = readonly [number, number, number]

const tmpColor = new THREE.Color()

/** Non-indexed, uv-less, with a flat vertex colour: every primitive is made
 *  the same shape so they all merge. */
function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  tmpColor.setHex(color)
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** An ellipsoid centred at `c` with radii `r`, optionally turned by Euler `rot`
 *  (radians, applied before it is moved to `c`). */
export function ellipsoid(c: V3, r: V3, color: number, rot: V3 = [0, 0, 0], seg: [number, number] = [9, 6]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1])
  g.scale(r[0], r[1], r[2])
  g.rotateX(rot[0])
  g.rotateY(rot[1])
  g.rotateZ(rot[2])
  g.translate(c[0], c[1], c[2])
  return paint(g, color)
}

const up = new THREE.Vector3(0, 1, 0)
const dir = new THREE.Vector3()
const quat = new THREE.Quaternion()

/** A tapered round limb from `a` (radius `ra`) to `b` (radius `rb`). */
export function limb(a: V3, b: V3, ra: number, rb: number, color: number, sides = 6): THREE.BufferGeometry {
  dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = dir.length()
  const g = new THREE.CylinderGeometry(rb, ra, len, sides, 1)
  g.translate(0, len / 2, 0)
  quat.setFromUnitVectors(up, dir.normalize())
  g.applyQuaternion(quat)
  g.translate(a[0], a[1], a[2])
  return paint(g, color)
}

/** A cone from a round base at `a` (radius `r`) to a point at `b`. */
export function cone(a: V3, b: V3, r: number, color: number, sides = 5): THREE.BufferGeometry {
  return limb(a, b, r, 0.0001, color, sides)
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  return g
}

/** Mirrors a part across the animal's own midline (z → -z) — for a pair of
 *  ears, tusks, antlers. */
function mirrorZ(p: V3): V3 {
  return [p[0], p[1], -p[2]]
}

function pair(build: (side: 1 | -1) => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return [...build(1), ...build(-1)]
}

/** What `critters.ts` tells a rig about one animal this frame. */
export interface PoseInput {
  x: number
  /** Ground height under it. */
  y: number
  z: number
  /** The way it faces, radians: 0 is +x, and it grows toward +z — the same
   *  sense as the direction it moves in (`cos`, `sin` of it on x, z). */
  heading: number
  /** m/s it is actually moving. */
  speed: number
  /** Radians of its own stride cycle — advances with distance covered, so the
   *  legs never slide. */
  gait: number
  /** 0..1, how far its head is down at the food. */
  graze: number
  /** Seconds, for the small idle motions (nibbling, a tail flick). */
  time: number
  /** This animal's own fixed 0..1 draw: size, and for a moose bull or cow. */
  variant: number
  /** The ground, for a body that lies along it (the snake). */
  heightAt: (x: number, z: number) => number
}

export interface Rig {
  /** Makes the parts for `n` animals, all sharing `material`. */
  build(material: THREE.Material, n: number): THREE.InstancedMesh[]
  pose(parts: THREE.InstancedMesh[], i: number, p: PoseInput): void
  /** Metres covered in one full stride cycle, at a walk. */
  stride: number
}

// ---------------------------------------------------------------------------
// Four-legged animals: one shared rig, a species is a set of shapes and numbers.
// ---------------------------------------------------------------------------

interface QuadDef {
  torso: () => THREE.BufferGeometry
  /** In its own frame, origin at the neck pivot, facing +x. */
  head: () => THREE.BufferGeometry
  neck: V3
  /** In their own frames, origin at the hip, hanging down to y = -hip height. */
  foreLeg: () => THREE.BufferGeometry
  hindLeg: () => THREE.BufferGeometry
  /** The left (+z) shoulder and hip joints; the right ones mirror them. */
  fore: V3
  hind: V3
  /** An extra part carried on the head (antlers), shown where `show` says so. */
  headExtra?: { geo: () => THREE.BufferGeometry; show: (variant: number) => boolean }
  /** 'walk' moves the legs one after another; 'bound' throws both forelegs
   *  and then both hind legs together, the way a hare or a squirrel runs. */
  gait: 'walk' | 'bound'
  stride: number
  /** Leg swing either side at full stride, radians. */
  swing: number
  /** How far the body lifts at each step (a bound's whole leap), metres. */
  bob: number
  /** The speed at which the legs reach their full swing, m/s. */
  fullSwingAt: number
  /** How far the head drops to graze, radians. */
  grazePitch: number
  /** A small fast nod while grazing (chewing, rooting), radians. */
  nibble: number
  /** How much one animal's size may differ from the next, ±. */
  sizeSpread: number
}

const m = new THREE.Matrix4()
const base = new THREE.Matrix4()
const local = new THREE.Matrix4()
const headM = new THREE.Matrix4()
const pos = new THREE.Vector3()
const q = new THREE.Quaternion()
const scale = new THREE.Vector3()
const yAxis = new THREE.Vector3(0, 1, 0)
const zAxis = new THREE.Vector3(0, 0, 1)
const zero = new THREE.Vector3(0, 0, 0)
const rot = new THREE.Quaternion()

/** Leg phase offsets, in the order fore-left, fore-right, hind-left, hind-right. */
const WALK_PHASES = [Math.PI / 2, (3 * Math.PI) / 2, 0, Math.PI]
const BOUND_PHASES = [0, 0.25, Math.PI, Math.PI + 0.25]

function quadRig(def: QuadDef): Rig {
  const hips: V3[] = [def.fore, mirrorZ(def.fore), def.hind, mirrorZ(def.hind)]
  const phases = def.gait === 'walk' ? WALK_PHASES : BOUND_PHASES
  return {
    stride: def.stride,
    build(material, n) {
      const torso = new THREE.InstancedMesh(def.torso(), material, n)
      torso.name = 'torso'
      const head = new THREE.InstancedMesh(def.head(), material, n)
      head.name = 'head'
      const foreGeo = def.foreLeg()
      const hindGeo = def.hindLeg()
      const legs = [foreGeo, foreGeo, hindGeo, hindGeo].map((g, k) => {
        const leg = new THREE.InstancedMesh(g, material, n)
        leg.name = `leg${k}`
        return leg
      })
      const parts = [torso, head, ...legs]
      if (def.headExtra) {
        const extra = new THREE.InstancedMesh(def.headExtra.geo(), material, n)
        extra.name = 'headExtra'
        parts.push(extra)
      }
      return parts
    },
    pose(parts, i, p) {
      const [torso, head, ...rest] = parts
      const size = 1 + (p.variant * 2 - 1) * def.sizeSpread
      const moving = Math.min(1.4, p.speed / def.fullSwingAt)
      let lift: number
      let pitch = 0
      if (def.gait === 'walk') {
        lift = def.bob * moving * (0.5 - 0.5 * Math.cos(2 * p.gait))
      } else {
        lift = def.bob * moving * Math.max(0, Math.sin(p.gait))
        pitch = 0.18 * Math.min(1, moving) * Math.cos(p.gait)
      }
      // The heading turns +x toward +z, which is a NEGATIVE turn about y in
      // three's right-handed frame. Getting this sign wrong once had every
      // animal run sideways or tail-first at most headings.
      q.setFromAxisAngle(yAxis, -p.heading)
      rot.setFromAxisAngle(zAxis, pitch)
      q.multiply(rot)
      pos.set(p.x, p.y + lift * size, p.z)
      scale.setScalar(size)
      base.compose(pos, q, scale)
      torso.setMatrixAt(i, base)

      // The head drops toward the food and nods a little while it eats; at a
      // walk it bobs with the stride.
      const nod = p.graze * def.nibble * Math.sin(p.time * 7 + p.variant * 20)
      const walkNod = def.gait === 'walk' ? 0.05 * Math.min(1, moving) * Math.sin(2 * p.gait) : 0
      rot.setFromAxisAngle(zAxis, -p.graze * def.grazePitch + nod + walkNod)
      local.compose(pos.set(def.neck[0], def.neck[1], def.neck[2]), rot, scale.setScalar(1))
      headM.multiplyMatrices(base, local)
      head.setMatrixAt(i, headM)

      for (let k = 0; k < 4; k++) {
        const hip = hips[k]
        const swing = def.swing * Math.min(1.2, moving) * Math.sin(p.gait + phases[k])
        rot.setFromAxisAngle(zAxis, swing)
        local.compose(pos.set(hip[0], hip[1], hip[2]), rot, scale.setScalar(1))
        m.multiplyMatrices(base, local)
        rest[k].setMatrixAt(i, m)
      }
      if (def.headExtra) {
        if (def.headExtra.show(p.variant)) rest[4].setMatrixAt(i, headM)
        else rest[4].setMatrixAt(i, m.compose(zero, q, zero))
      }
    },
  }
}

/** A leg: upper and lower in two colours, ending in a hoof or a paw. */
function legGeo(
  length: number, rTop: number, rBottom: number, upper: number, lower: number, foot: number,
  footShape: 'hoof' | 'paw', kneeAt = 0.45,
): THREE.BufferGeometry {
  const knee = -length * kneeAt
  const rKnee = rTop * 0.7 + rBottom * 0.3
  const parts = [
    limb([0, 0, 0], [0, knee, 0], rTop, rKnee, upper),
    limb([0, knee, 0], [0, -length + (footShape === 'hoof' ? 0.06 : rBottom * 0.8), 0], rKnee, rBottom, lower),
  ]
  if (footShape === 'hoof') parts.push(limb([0, -length + 0.06, 0], [0.01, -length, 0], rBottom, rBottom * 1.25, foot))
  else parts.push(ellipsoid([rBottom * 0.5, -length + rBottom * 0.6, 0], [rBottom * 1.6, rBottom * 0.7, rBottom * 1.2], foot))
  return merge(parts)
}

// --- Moose ------------------------------------------------------------------

const MOOSE_BODY = 0x3b2a1f
const MOOSE_DARK = 0x2a1d15
const MOOSE_MUZZLE = 0x4d3a2b
const MOOSE_LEG = 0x9a8a74
const MOOSE_ANTLER = 0xcdb68c
const HOOF = 0x1c1a18
const EYE = 0x0c0b0a

/** The share of moose that are bulls, carrying antlers. */
export const MOOSE_BULL_SHARE = 0.55

/** A moose's palmate antlers: a short beam out to each side of the skull, then
 *  a broad flat palm reaching outward, its outer edge raised, with a row of
 *  short tines standing up along that edge. Built in the palm's own plane —
 *  `across` (outward and up) and `along` (front to back) — so the tines sit on
 *  the rim instead of floating off it. */
function mooseAntlers(): THREE.BufferGeometry {
  const LIFT = 0.6 // radians the palm's outer edge is raised above level
  return merge(
    pair((s) => {
      const root: V3 = [0.36, 0.13, 0.07 * s]
      const beamEnd: V3 = [0.33, 0.2, 0.24 * s]
      const across = [0, Math.sin(LIFT), Math.cos(LIFT) * s] as const
      const at = (u: number, v: number, lift = 0): V3 => [
        beamEnd[0] + u,
        beamEnd[1] + across[1] * v + lift,
        beamEnd[2] + across[2] * v,
      ]
      const parts = [
        limb(root, beamEnd, 0.05, 0.045, MOOSE_ANTLER),
        // The palm: wide along the head, reaching out 0.44 m.
        ellipsoid(at(-0.06, 0.22), [0.3, 0.035, 0.22], MOOSE_ANTLER, [-LIFT * s, 0, 0]),
        // The brow tine group, forward and lower.
        limb(beamEnd, at(0.22, 0.1, -0.02), 0.035, 0.025, MOOSE_ANTLER),
      ]
      // Tines along the rim, from the front round to the back.
      for (let k = 0; k < 7; k++) {
        const u = -0.3 + k * 0.09
        const rim = 0.22 + 0.21 * Math.sqrt(Math.max(0, 1 - ((u + 0.06) / 0.33) ** 2))
        const base = at(u, rim - 0.03)
        const tip: V3 = [base[0] + 0.02, base[1] + 0.13 + (k % 2) * 0.03, base[2] + across[2] * 0.05]
        parts.push(cone(base, tip, 0.028, MOOSE_ANTLER, 4))
      }
      return parts
    }),
  )
}

export const MOOSE_RIG: Rig = quadRig({
  torso: () =>
    merge([
      ellipsoid([0, 1.42, 0], [0.95, 0.4, 0.34], MOOSE_BODY),
      // The hump over the shoulders a moose carries, and its deep chest.
      ellipsoid([0.42, 1.66, 0], [0.5, 0.3, 0.28], MOOSE_DARK),
      ellipsoid([0.5, 1.32, 0], [0.42, 0.36, 0.31], MOOSE_DARK),
      ellipsoid([-0.62, 1.42, 0], [0.42, 0.36, 0.32], MOOSE_BODY),
      cone([-0.98, 1.5, 0], [-1.08, 1.34, 0], 0.05, MOOSE_BODY, 4),
    ]),
  neck: [0.8, 1.62, 0],
  head: () =>
    merge([
      // A short thick neck, carried low and forward.
      limb([0, 0, 0], [0.42, 0.02, 0], 0.26, 0.19, MOOSE_DARK, 7),
      // The long head and the heavy overhanging muzzle a moose is known by.
      ellipsoid([0.58, -0.06, 0], [0.3, 0.15, 0.13], MOOSE_BODY, [0, 0, -0.55]),
      ellipsoid([0.8, -0.24, 0], [0.19, 0.15, 0.12], MOOSE_MUZZLE, [0, 0, -0.5]),
      ellipsoid([0.9, -0.3, 0.05], [0.03, 0.03, 0.02], EYE),
      ellipsoid([0.9, -0.3, -0.05], [0.03, 0.03, 0.02], EYE),
      // The bell hanging under the throat.
      cone([0.45, -0.14, 0], [0.4, -0.5, 0], 0.06, MOOSE_DARK, 4),
      ...pair((s) => [
        ellipsoid([0.5, 0.12, 0.12 * s], [0.06, 0.13, 0.04], MOOSE_BODY, [0.5 * s, 0, -0.3]),
        ellipsoid([0.58, 0.02, 0.1 * s], [0.025, 0.025, 0.02], EYE),
      ]),
    ]),
  headExtra: { geo: mooseAntlers, show: (v) => v < MOOSE_BULL_SHARE },
  foreLeg: () => legGeo(1.25, 0.12, 0.05, MOOSE_DARK, MOOSE_LEG, HOOF, 'hoof'),
  hindLeg: () => legGeo(1.25, 0.14, 0.05, MOOSE_BODY, MOOSE_LEG, HOOF, 'hoof', 0.5),
  fore: [0.52, 1.25, 0.18],
  hind: [-0.72, 1.25, 0.18],
  gait: 'walk',
  stride: 2.4,
  swing: 0.42,
  bob: 0.05,
  fullSwingAt: 1.4,
  grazePitch: 0.75,
  nibble: 0.06,
  sizeSpread: 0.08,
})

// --- Brown bear -------------------------------------------------------------

const BEAR_FUR = 0x5a3c24
const BEAR_DARK = 0x3f2a18
const BEAR_MUZZLE = 0x8b6a47
const NOSE = 0x141210

export const BEAR_RIG: Rig = quadRig({
  torso: () =>
    merge([
      ellipsoid([0, 0.86, 0], [0.9, 0.42, 0.42], BEAR_FUR),
      // The muscle hump over the shoulders a brown bear is told apart by.
      ellipsoid([0.42, 1.08, 0], [0.42, 0.28, 0.33], BEAR_DARK),
      ellipsoid([-0.5, 0.9, 0], [0.46, 0.42, 0.41], BEAR_FUR),
      ellipsoid([-0.95, 0.92, 0], [0.07, 0.06, 0.06], BEAR_DARK),
    ]),
  neck: [0.78, 1.0, 0],
  head: () =>
    merge([
      limb([0, 0, 0], [0.26, -0.02, 0], 0.3, 0.25, BEAR_FUR, 8),
      ellipsoid([0.36, 0.0, 0], [0.24, 0.22, 0.23], BEAR_FUR),
      ellipsoid([0.58, -0.07, 0], [0.16, 0.11, 0.12], BEAR_MUZZLE),
      ellipsoid([0.73, -0.05, 0], [0.04, 0.04, 0.05], NOSE),
      ...pair((s) => [
        ellipsoid([0.32, 0.2, 0.15 * s], [0.05, 0.07, 0.07], BEAR_DARK),
        ellipsoid([0.52, 0.06, 0.1 * s], [0.025, 0.025, 0.02], EYE),
      ]),
    ]),
  foreLeg: () => legGeo(0.64, 0.16, 0.11, BEAR_FUR, BEAR_DARK, BEAR_DARK, 'paw'),
  hindLeg: () => legGeo(0.64, 0.18, 0.11, BEAR_FUR, BEAR_DARK, BEAR_DARK, 'paw', 0.5),
  fore: [0.5, 0.64, 0.24],
  hind: [-0.6, 0.64, 0.24],
  gait: 'walk',
  stride: 1.5,
  swing: 0.45,
  bob: 0.04,
  fullSwingAt: 1.0,
  grazePitch: 0.85,
  nibble: 0.12,
  sizeSpread: 0.1,
})

// --- Wild boar --------------------------------------------------------------

const BOAR_COAT = 0x463c34
const BOAR_DARK = 0x2c2520
const BOAR_SNOUT = 0x6e5650
const TUSK = 0xe8e0cc

export const BOAR_RIG: Rig = quadRig({
  torso: () =>
    merge([
      // Wedge-shaped: deep and high at the shoulders, falling away to the rump.
      ellipsoid([0.02, 0.6, 0], [0.62, 0.3, 0.24], BOAR_COAT),
      ellipsoid([0.3, 0.72, 0], [0.34, 0.26, 0.23], BOAR_DARK),
      // The bristly crest along the spine.
      ellipsoid([0.12, 0.84, 0], [0.4, 0.09, 0.07], BOAR_DARK, [0, 0, -0.08]),
      ellipsoid([-0.38, 0.58, 0], [0.3, 0.26, 0.22], BOAR_COAT),
      limb([-0.66, 0.66, 0], [-0.72, 0.42, 0], 0.025, 0.015, BOAR_DARK, 4),
    ]),
  neck: [0.55, 0.7, 0],
  head: () =>
    merge([
      // A long wedge of a head running down to the snout.
      ellipsoid([0.18, -0.06, 0], [0.3, 0.19, 0.16], BOAR_DARK, [0, 0, -0.4]),
      limb([0.36, -0.14, 0], [0.56, -0.24, 0], 0.09, 0.07, BOAR_COAT, 7),
      ellipsoid([0.57, -0.245, 0], [0.02, 0.07, 0.075], BOAR_SNOUT, [0, 0, 0.45]),
      ...pair((s) => [
        cone([0.1, 0.1, 0.08 * s], [0.06, 0.28, 0.13 * s], 0.05, BOAR_DARK, 4),
        cone([0.48, -0.24, 0.06 * s], [0.52, -0.14, 0.11 * s], 0.018, TUSK, 4),
        ellipsoid([0.3, 0.0, 0.1 * s], [0.02, 0.02, 0.015], EYE),
      ]),
    ]),
  foreLeg: () => legGeo(0.44, 0.07, 0.03, BOAR_DARK, BOAR_DARK, HOOF, 'hoof'),
  hindLeg: () => legGeo(0.44, 0.09, 0.03, BOAR_COAT, BOAR_DARK, HOOF, 'hoof', 0.5),
  fore: [0.32, 0.44, 0.12],
  hind: [-0.4, 0.44, 0.12],
  gait: 'walk',
  stride: 0.9,
  swing: 0.5,
  bob: 0.03,
  fullSwingAt: 1.0,
  grazePitch: 0.75,
  nibble: 0.14,
  sizeSpread: 0.14,
})

// --- Beaver -----------------------------------------------------------------

const BEAVER_FUR = 0x5e3d25
const BEAVER_DARK = 0x3d2819
const BEAVER_TAIL = 0x2f2b29
const INCISOR = 0xd9832b

export const BEAVER_RIG: Rig = quadRig({
  torso: () =>
    merge([
      // Heavy and low, the hindquarters the widest part.
      ellipsoid([0, 0.22, 0], [0.34, 0.19, 0.19], BEAVER_FUR),
      ellipsoid([-0.14, 0.2, 0], [0.24, 0.2, 0.21], BEAVER_FUR),
      // The flat, scaly paddle of a tail.
      ellipsoid([-0.5, 0.07, 0], [0.22, 0.025, 0.1], BEAVER_TAIL, [0, 0, 0.12]),
    ]),
  neck: [0.26, 0.28, 0],
  head: () =>
    merge([
      ellipsoid([0.08, 0, 0], [0.14, 0.11, 0.11], BEAVER_FUR),
      ellipsoid([0.2, -0.03, 0], [0.07, 0.06, 0.07], BEAVER_DARK),
      // The orange front teeth it fells trees with.
      limb([0.24, -0.07, 0], [0.245, -0.12, 0], 0.018, 0.016, INCISOR, 4),
      ...pair((s) => [
        ellipsoid([0.02, 0.09, 0.07 * s], [0.025, 0.025, 0.02], BEAVER_DARK),
        ellipsoid([0.13, 0.04, 0.07 * s], [0.015, 0.015, 0.012], EYE),
      ]),
    ]),
  foreLeg: () => legGeo(0.12, 0.04, 0.03, BEAVER_FUR, BEAVER_DARK, BEAVER_DARK, 'paw'),
  hindLeg: () => legGeo(0.12, 0.05, 0.035, BEAVER_FUR, BEAVER_DARK, BEAVER_TAIL, 'paw'),
  fore: [0.18, 0.12, 0.1],
  hind: [-0.2, 0.12, 0.13],
  gait: 'walk',
  stride: 0.35,
  swing: 0.6,
  bob: 0.02,
  fullSwingAt: 0.6,
  // Gnawing at a trunk: the head held level, working hard side to side.
  grazePitch: -0.1,
  nibble: 0.2,
  sizeSpread: 0.1,
})

// --- Hare -------------------------------------------------------------------

const HARE_FUR = 0x8c765a
const HARE_BELLY = 0xb8a78e
const HARE_TAIL = 0xeeeae2

export const HARE_RIG: Rig = quadRig({
  torso: () =>
    merge([
      ellipsoid([0, 0.22, 0], [0.22, 0.13, 0.11], HARE_FUR, [0, 0, 0.25]),
      // Big hind haunches, the hare's engine.
      ellipsoid([-0.12, 0.2, 0.04], [0.13, 0.12, 0.07], HARE_FUR),
      ellipsoid([-0.12, 0.2, -0.04], [0.13, 0.12, 0.07], HARE_FUR),
      ellipsoid([0.06, 0.17, 0], [0.12, 0.08, 0.08], HARE_BELLY),
      ellipsoid([-0.25, 0.25, 0], [0.045, 0.045, 0.045], HARE_TAIL),
    ]),
  neck: [0.18, 0.3, 0],
  head: () =>
    merge([
      ellipsoid([0.07, 0.02, 0], [0.085, 0.065, 0.06], HARE_FUR),
      ellipsoid([0.14, -0.005, 0], [0.035, 0.03, 0.035], HARE_BELLY),
      ...pair((s) => [
        // The long ears, laid back, with the black tips a hare carries.
        ellipsoid([0.0, 0.13, 0.025 * s], [0.025, 0.11, 0.015], HARE_FUR, [0.15 * s, 0, 0.45]),
        ellipsoid([-0.06, 0.225, 0.04 * s], [0.017, 0.03, 0.012], NOSE, [0.15 * s, 0, 0.45]),
        ellipsoid([0.09, 0.04, 0.045 * s], [0.016, 0.018, 0.012], EYE),
      ]),
    ]),
  foreLeg: () => legGeo(0.17, 0.028, 0.016, HARE_FUR, HARE_BELLY, HARE_BELLY, 'paw'),
  // The long hind foot flat on the ground.
  hindLeg: () =>
    merge([
      limb([0, 0, 0], [-0.03, -0.08, 0], 0.04, 0.025, HARE_FUR),
      limb([-0.03, -0.08, 0], [0.1, -0.11, 0], 0.022, 0.018, HARE_BELLY),
    ]),
  fore: [0.12, 0.17, 0.05],
  hind: [-0.1, 0.11, 0.07],
  gait: 'bound',
  stride: 0.9,
  swing: 0.7,
  bob: 0.12,
  fullSwingAt: 1.2,
  grazePitch: 0.7,
  nibble: 0.08,
  sizeSpread: 0.08,
})

// --- Red squirrel -----------------------------------------------------------

const SQUIRREL_FUR = 0xa4502a
const SQUIRREL_TAIL = 0x8e4222
const SQUIRREL_BELLY = 0xe8dcc4

/** Drawn a little larger than life (×1.3): a real one is a hand long, and from
 *  a standing eye height it vanished into the litter. */
const SQ = 1.3
const sq = (v: V3): V3 => [v[0] * SQ, v[1] * SQ, v[2] * SQ]

export const SQUIRREL_RIG: Rig = quadRig({
  torso: () =>
    merge([
      ellipsoid(sq([0, 0.1, 0]), sq([0.1, 0.065, 0.055]), SQUIRREL_FUR, [0, 0, 0.3]),
      ellipsoid(sq([0.05, 0.085, 0]), sq([0.05, 0.045, 0.04]), SQUIRREL_BELLY),
      // The big bushy tail in an S up over the back.
      ellipsoid(sq([-0.12, 0.12, 0]), sq([0.045, 0.035, 0.035]), SQUIRREL_TAIL),
      ellipsoid(sq([-0.17, 0.18, 0]), sq([0.045, 0.06, 0.045]), SQUIRREL_TAIL, [0, 0, 0.4]),
      ellipsoid(sq([-0.16, 0.27, 0]), sq([0.05, 0.06, 0.05]), SQUIRREL_TAIL, [0, 0, -0.3]),
      ellipsoid(sq([-0.1, 0.31, 0]), sq([0.045, 0.035, 0.04]), SQUIRREL_TAIL),
    ]),
  neck: sq([0.09, 0.14, 0]),
  head: () =>
    merge([
      ellipsoid(sq([0.04, 0.01, 0]), sq([0.05, 0.042, 0.04]), SQUIRREL_FUR),
      ellipsoid(sq([0.08, -0.005, 0]), sq([0.022, 0.02, 0.022]), SQUIRREL_BELLY),
      ...pair((s) => [
        // Upright ears with the winter tufts.
        cone(sq([0.02, 0.035, 0.022 * s]), sq([0.015, 0.085, 0.026 * s]), 0.012 * SQ, SQUIRREL_TAIL, 4),
        ellipsoid(sq([0.06, 0.02, 0.03 * s]), sq([0.01, 0.011, 0.008]), EYE),
      ]),
    ]),
  foreLeg: () => legGeo(0.06 * SQ, 0.012 * SQ, 0.008 * SQ, SQUIRREL_FUR, SQUIRREL_FUR, SQUIRREL_TAIL, 'paw'),
  hindLeg: () =>
    merge([
      limb([0, 0, 0], [-0.02 * SQ, -0.05 * SQ, 0], 0.025 * SQ, 0.013 * SQ, SQUIRREL_FUR),
      limb([-0.02 * SQ, -0.05 * SQ, 0], [0.045 * SQ, -0.068 * SQ, 0], 0.012 * SQ, 0.01 * SQ, SQUIRREL_TAIL),
    ]),
  fore: sq([0.06, 0.07, 0.03]),
  hind: sq([-0.05, 0.07, 0.04]),
  gait: 'bound',
  stride: 0.5,
  swing: 0.8,
  bob: 0.09,
  fullSwingAt: 1.0,
  grazePitch: 0.5,
  nibble: 0.15,
  sizeSpread: 0.06,
})

// ---------------------------------------------------------------------------
// The adder: a chain of segments along a travelling wave.
// ---------------------------------------------------------------------------

/** How many body segments behind the head. */
export const SNAKE_SEGMENTS = 20
const SNAKE_LENGTH = 0.7
const SNAKE_SPACING = SNAKE_LENGTH / SNAKE_SEGMENTS
const SNAKE_BODY = 0x7a7058
const SNAKE_ZIGZAG = 0x2a2620
const SNAKE_BELLY = 0x4d473c

function snakeRadius(k: number): number {
  const s = k / SNAKE_SEGMENTS
  // Thickest a third of the way down, a short neck, a thin tapering tail.
  return 0.032 * Math.min(1, 0.7 + s * 2.2) * (s > 0.45 ? 1 - (s - 0.45) * 1.55 : 1)
}

function snakeSegment(k: number): THREE.BufferGeometry {
  const r = snakeRadius(k)
  const len = SNAKE_SPACING * 0.78
  // The adder's dark zigzag down the back: a dark patch on top of each
  // segment, pushed out to one side and then the other.
  const side = k % 2 === 0 ? 1 : -1
  return merge([
    ellipsoid([0, 0, 0], [len, r, r * 1.05], SNAKE_BODY, [0, 0, 0], [7, 5]),
    ellipsoid([0, -r * 0.35, 0], [len * 0.95, r * 0.7, r * 0.95], SNAKE_BELLY, [0, 0, 0], [7, 5]),
    ellipsoid([0, r * 0.55, side * r * 0.25], [len * 0.7, r * 0.5, r * 0.55], SNAKE_ZIGZAG, [0, side * 0.5, 0], [6, 4]),
  ])
}

function snakeHead(): THREE.BufferGeometry {
  return merge([
    // Broad, flat, clearly set off from the neck.
    ellipsoid([0.02, 0.005, 0], [0.045, 0.022, 0.034], SNAKE_BODY),
    // The dark V (or X) on top of an adder's head.
    ...pair((s) => [
      ellipsoid([0.0, 0.022, 0.012 * s], [0.025, 0.006, 0.006], SNAKE_ZIGZAG, [0, 0.5 * s, 0]),
      ellipsoid([0.045, 0.012, 0.022 * s], [0.008, 0.008, 0.006], EYE),
    ]),
  ])
}

export const SNAKE_RIG: Rig = {
  // One wavelength of the body wave (11 rad/m): the curve slides along itself.
  stride: (2 * Math.PI) / 11,
  build(material, n) {
    const parts = [new THREE.InstancedMesh(snakeHead(), material, n)]
    parts[0].name = 'head'
    for (let k = 1; k <= SNAKE_SEGMENTS; k++) {
      const seg = new THREE.InstancedMesh(snakeSegment(k), material, n)
      seg.name = `segment${k}`
      parts.push(seg)
    }
    return parts
  },
  pose(parts, i, p) {
    // A wave running back along the body: while it moves, it travels with the
    // distance covered (so the body slides along its own curve, the way a
    // snake really moves); at rest it barely stirs.
    const phase = p.gait + p.time * 0.4
    const lateral = (s: number): number => 0.07 * Math.min(1, s / 0.15) * Math.sin(s * 11 - phase)
    const ch = Math.cos(p.heading)
    const sh = Math.sin(p.heading)
    for (let k = 0; k < parts.length; k++) {
      const s = k * SNAKE_SPACING
      const lx = -s
      const lz = lateral(s)
      // The body's own direction here, from the slope of the wave.
      const ds = 0.01
      const dz = (lateral(s + ds) - lateral(Math.max(0, s - ds))) / (s > ds ? 2 * ds : ds + s)
      const localAngle = Math.atan2(-dz, 1) // facing forward (+x) along the curve
      const wx = p.x + lx * ch - lz * sh
      const wz = p.z + lx * sh + lz * ch
      const r = k === 0 ? 0.02 : snakeRadius(k)
      q.setFromAxisAngle(yAxis, -(p.heading + localAngle))
      pos.set(wx, p.heightAt(wx, wz) + r, wz)
      m.compose(pos, q, scale.setScalar(1))
      parts[k].setMatrixAt(i, m)
    }
  },
}
