import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { FishMorphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres — same convention
 *  as every other kind's build.ts. */
const MM = 0.001

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Rings along the body and vertices around each — enough that bars and
 *  spots, baked into the vertex colours, read as markings and not as blur. */
const RINGS = 64
const AROUND = 28
/** Half-height of the tail stalk (the caudal peduncle), as a fraction of the
 *  body's greatest half-height. */
const PEDUNCLE = 0.2
/** Where the tail fin joins the stalk, nose 0 to tail tip 1. */
const TAIL_AT = 0.97

const rawProfile = (u: number) => Math.pow(u, 0.62) * Math.pow(1 - 0.88 * u, 1.15)
const PROFILE_MAX = (() => {
  let m = 0
  for (let i = 0; i <= 400; i++) m = Math.max(m, rawProfile(i / 400))
  return m
})()

/**
 * The body's side profile: half-height at `u` (nose 0, tail 1) as a fraction
 * of the greatest — a blunt head rising fast to the deepest point about a
 * third of the way back, then narrowing to a stalk that never pinches to
 * nothing, since the tail fin hangs on it.
 */
export function bodyProfile(u: number): number {
  const h = rawProfile(u) / PROFILE_MAX
  return u < 0.4 ? h : Math.max(h, PEDUNCLE)
}

/** Half-width at `u`, as a fraction of the greatest: a fish is widest behind
 *  the head and flattened side to side toward the tail. */
function widthProfile(u: number): number {
  return Math.min(1, bodyProfile(u) * (1.15 - 0.5 * u))
}

/** A deterministic 0..1 for one cell of a spot grid. */
const cellRand = (seed: number, a: number, b: number) => mulberry32((seed ^ (a * 7919) ^ (b * 104729)) >>> 0)

/**
 * The body as one lathe-like surface, in unit coordinates (x −1 nose to +1
 * tail, y and z −1..1), coloured per vertex: a dark back, the flank colour,
 * a pale belly, a darker gill-cover edge, and the species' bars or spots.
 */
function bodyGeometry(m: FishMorphology, seed: number, tint: number): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const body = new THREE.Color(m.bodyColor).offsetHSL(0, 0, tint)
  const back = body.clone().multiplyScalar(0.62)
  const belly = new THREE.Color(m.bellyColor)
  const mark = new THREE.Color(m.patternColor)
  const c = new THREE.Color()

  const ring = (u: number, scale: number) => {
    const h = bodyProfile(u) * scale
    const w = widthProfile(u) * scale
    for (let j = 0; j < AROUND; j++) {
      const a = (j / AROUND) * Math.PI * 2
      const s = Math.sin(a)
      positions.push(-1 + 2 * u, h * s * (s < 0 ? 0.92 : 1), w * Math.cos(a))
      uvs.push(u, j / AROUND)

      // Countershading: back, flank, belly.
      if (s > 0.5) c.copy(body).lerp(back, smooth(0.5, 1, s))
      else c.copy(belly).lerp(body, smooth(-0.62, 0.05, s))
      // Markings stop short of the belly.
      const onFlank = smooth(-0.5, -0.1, s)
      if (m.pattern === 'bars' && u > 0.16 && u < 0.9) {
        const phase = ((u - 0.16) / 0.74) * 6.3
        const bar = smooth(0.45, 0.8, 0.5 + 0.5 * Math.cos(phase * Math.PI * 2))
        c.lerp(mark, bar * onFlank * 0.85 * smooth(0.16, 0.24, u))
      } else if (m.pattern === 'spots' && u > 0.12 && u < 0.95) {
        const cu = u * 18
        const cv = (a / (Math.PI * 2)) * 12
        let near = Infinity
        for (let du = -1; du <= 1; du++) {
          for (let dv = -1; dv <= 1; dv++) {
            const iu = Math.floor(cu) + du
            const iv = ((Math.floor(cv) + dv) % 12 + 12) % 12
            const r = cellRand(seed, iu, iv)
            const pu = iu + 0.5 + (r() - 0.5) * 0.6
            let dvv = Math.abs(Math.floor(cv) + dv + 0.5 + (r() - 0.5) * 0.6 - cv)
            dvv = Math.min(dvv, 12 - dvv)
            near = Math.min(near, Math.hypot(pu - cu, dvv * 0.8))
          }
        }
        c.lerp(mark, (1 - smooth(0.15, 0.27, near)) * onFlank * 0.9)
      }
      // The gill cover's rear edge, a thin darker arc behind the head.
      if (s > -0.6 && Math.abs(u - (0.2 + 0.025 * s)) < 0.012) c.multiplyScalar(0.72)
      colors.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i <= RINGS; i++) ring(i / RINGS, 1)
  ring(1, 0) // closes the stalk's end

  const index: number[] = []
  for (let i = 0; i < RINGS + 1; i++) {
    for (let j = 0; j < AROUND; j++) {
      const a = i * AROUND + j
      const b = i * AROUND + ((j + 1) % AROUND)
      const d = a + AROUND
      const e = b + AROUND
      index.push(a, b, d, b, e, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  // Every part must carry the same attributes for toWorldMesh to merge them.
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * A fish built from its species parameters. Pure and deterministic, the same
 * way every other kind's generator is: one seed gives the same fish
 * everywhere.
 *
 * A real fish's plan, from its species' proportions: a countershaded body
 * with a blunt head and a narrow tail stalk, a forked tail, one or two dorsal
 * fins, an anal fin, paired pectoral and pelvic fins, and eyes — plus the
 * markings that tell a perch from a roach at a glance (bars, spots, red
 * lower fins).
 *
 * @param age 0 young (shorter, slimmer), 1 grown (full length)
 */
export function buildFish(m: FishMorphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  const size = rng()
  const L = lerp(m.length, size) * MM * (0.55 + age * 0.45)
  const H = L * m.bodyDepth * (0.9 + age * 0.1)
  const W = H * 0.55
  const tint = (rng() - 0.5) * 0.06

  const body = new THREE.Mesh(
    bodyGeometry(m, seed, tint),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4 }),
  )
  body.name = 'body'
  body.scale.set(L / 2, H / 2, W / 2)
  group.add(body)

  // Where the body's surface is, in the group's metres.
  const X = (u: number) => (-1 + 2 * u) * (L / 2)
  const top = (u: number) => bodyProfile(u) * (H / 2)
  const bottom = (u: number) => -bodyProfile(u) * (H / 2) * 0.92

  const finMat = new THREE.MeshStandardMaterial({ color: m.finColor, roughness: 0.7, side: THREE.DoubleSide })
  const lowerMat = new THREE.MeshStandardMaterial({ color: m.lowerFinColor, roughness: 0.7, side: THREE.DoubleSide })

  /** A median fin standing on the back (`up`) or hanging under the belly,
   *  from u0 to u1, its base following the body's own curve. `height(v)` is
   *  its height over the base, v 0 front to 1 rear. */
  const medianFin = (name: string, u0: number, u1: number, up: boolean, height: (v: number) => number, mat: THREE.Material) => {
    const shape = new THREE.Shape()
    const n = 16
    const edge = (u: number) => (up ? top(u) * 0.88 : bottom(u) * 0.88)
    shape.moveTo(X(u0), edge(u0))
    for (let k = 1; k <= n; k++) {
      const u = u0 + ((u1 - u0) * k) / n
      shape.lineTo(X(u), edge(u))
    }
    for (let k = n; k >= 0; k--) {
      const v = k / n
      const u = u0 + (u1 - u0) * v
      const h = height(v) * H
      shape.lineTo(X(u), edge(u) + (up ? h : -h))
    }
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat)
    fin.name = name
    group.add(fin)
  }
  const rise = (v: number) => smooth(0, 0.18, v)

  if (m.dorsalFins === 2) {
    // A perch's spiny first dorsal, its edge scalloped between the spines, and
    // a lower, soft second one just behind.
    const d0 = m.dorsalAt
    medianFin('dorsal', d0 - 0.13, d0 + 0.07, true,
      (v) => 0.34 * rise(v) * (1 - 0.55 * v) * (1 - 0.18 * Math.abs(Math.sin(v * Math.PI * 7))), finMat)
    medianFin('dorsal2', d0 + 0.09, d0 + 0.26, true, (v) => 0.26 * rise(v) * (1 - 0.45 * v), finMat)
  } else {
    medianFin('dorsal', m.dorsalAt - 0.1, m.dorsalAt + 0.1, true, (v) => 0.3 * rise(v) * (1 - 0.5 * v), finMat)
  }
  const analAt = Math.max(0.7, m.dorsalAt + 0.02)
  medianFin('anal', analAt - 0.07, analAt + 0.07, false, (v) => 0.26 * rise(v) * (1 - 0.45 * v), lowerMat)

  // The tail: two lobes and a fork, on the end of the stalk.
  const xa = X(TAIL_AT)
  const hp = top(TAIL_AT) * 0.9
  const lt = L * 0.2
  const spread = H * 0.55
  const tailShape = new THREE.Shape()
  tailShape.moveTo(xa, -hp)
  tailShape.quadraticCurveTo(xa + lt * 0.5, -spread * 0.55, xa + lt, -spread)
  tailShape.quadraticCurveTo(xa + lt * 0.7, -spread * 0.35, xa + lt * 0.55, 0)
  tailShape.quadraticCurveTo(xa + lt * 0.7, spread * 0.35, xa + lt, spread)
  tailShape.quadraticCurveTo(xa + lt * 0.5, spread * 0.55, xa, hp)
  tailShape.lineTo(xa, -hp)
  const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape, 6), lowerMat)
  tail.name = 'tail'
  group.add(tail)

  /** A paired fin: a rounded paddle in its own plane, hinged at its front. */
  const paddle = (length: number, width: number) => {
    const s = new THREE.Shape()
    s.moveTo(0, -width * 0.25)
    s.quadraticCurveTo(length * 0.6, -width * 0.6, length, -width * 0.1)
    s.quadraticCurveTo(length * 0.8, width * 0.5, 0, width * 0.25)
    s.lineTo(0, -width * 0.25)
    return new THREE.ShapeGeometry(s, 5)
  }
  for (const side of [1, -1]) {
    const pu = 0.22
    const pectoral = new THREE.Mesh(paddle(L * 0.12, L * 0.06), finMat)
    pectoral.name = 'pectoral'
    pectoral.position.set(X(pu), bottom(pu) * 0.35, side * widthProfile(pu) * (W / 2) * 0.9)
    pectoral.rotation.set(side * 0.55, side * -0.4, -0.2)
    group.add(pectoral)

    const vu = 0.4
    const pelvic = new THREE.Mesh(paddle(L * 0.09, L * 0.045), lowerMat)
    pelvic.name = 'pelvic'
    pelvic.position.set(X(vu), bottom(vu) * 0.85, side * widthProfile(vu) * (W / 2) * 0.35)
    pelvic.rotation.set(side * 0.35, side * -0.3, -0.3)
    group.add(pelvic)
  }

  // Eyes: an iris in the species' colour with a dark pupil, set into the head.
  const eu = 0.1
  const eyeR = Math.max(L * 0.024, 0.002)
  const irisMat = new THREE.MeshStandardMaterial({ color: m.eyeColor, roughness: 0.3 })
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 })
  for (const side of [1, -1]) {
    const eye = new THREE.Group()
    eye.name = 'eye'
    const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 10, 8), irisMat)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.55, 8, 6), pupilMat)
    pupil.name = 'pupil'
    pupil.position.z = side * eyeR * 0.6
    eye.add(iris, pupil)
    const s = 0.28
    eye.position.set(X(eu), top(eu) * s, side * widthProfile(eu) * (W / 2) * Math.sqrt(1 - s * s) * 0.72)
    group.add(eye)
  }

  return group
}
