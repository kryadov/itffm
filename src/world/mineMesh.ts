import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import { fbm2 } from '../util/noise'
import {
  FACE_HALF_EXTRA, FLOOR_LIFT, caveLattice, caveSdf, outcropBoulders, type Mine,
} from './mine'
import type { MineTerrain } from './mineTerrain'

/**
 * Everything the mine draws: the tunnel interior (`buildMineMesh`'s cave
 * mesh, lit only by what the player carries), the mound over it and the rock
 * face with the doorway in it. Built in the mine's own local frame and
 * rotated as one piece by `m.heading`, the same convention `localToWorld`
 * (mine.ts) uses for the collision, so the two can never disagree.
 *
 * Why the interior has its own material: three.js lights every material with
 * every light in the scene, and the scene's sun and sky are on the whole day.
 * A stock material would light the tunnel through solid rock — the interior
 * was visibly lit in the first version. The cave material ignores them and
 * answers only to the player's lamp and flashlight, plus a fading pool of
 * daylight spilling in through the mouth (so the way out is always visible).
 * docs/superpowers/specs/2026-09-15-mine-cave-design.md §7/§9: a mine without
 * the lamp has to read as genuinely dark.
 */

const FLOOR_COLOR = new THREE.Color(0x5e5447)
const WALL_COLOR = new THREE.Color(0x7a7266)
const CEIL_COLOR = new THREE.Color(0x635b4f)
const GRASS_COLOR = new THREE.Color(0x4d5b39)
/** Moss and a warmer, earthier green for the outcrop's top, and the rock's
 *  own strata: a paler band and a darker one either side of `ROCK_COLOR`. */
const MOSS_COLOR = new THREE.Color(0x56683a)
const SOIL_COLOR = new THREE.Color(0x5c5a3a)
const STRATA = [new THREE.Color(0x8c8679) /* the plain rock */, new THREE.Color(0x9a8e76), new THREE.Color(0x77726a), new THREE.Color(0x857d6c)]
/** Rows the rock face is cut into from foot to brink, so it can bulge and
 *  recede and show its strata. */
const FACE_ROWS = 6
/** How far the face can recede into the hill between its edges, metres. */
const FACE_DEPTH = 0.45
/** Grid of the mound's surface mesh, metres. */
const DECK_STEP = 0.5

/** What the player carries, fed to the cave material every frame. */
export interface MineLightState {
  lampOn: boolean
  lampPos: THREE.Vector3
  flashOn: boolean
  flashPos: THREE.Vector3
  flashDir: THREE.Vector3
  /** 0 at night, 1 in full daylight — how much sky spills in at the mouth. */
  day: number
}

interface CaveUniforms {
  [uniform: string]: THREE.IUniform
  uLampOn: { value: number }
  uLampPos: { value: THREE.Vector3 }
  uFlashOn: { value: number }
  uFlashPos: { value: THREE.Vector3 }
  uFlashDir: { value: THREE.Vector3 }
  uDay: { value: number }
  uMouthPos: { value: THREE.Vector3 }
}

const CAVE_VERTEX = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vViewPos;
varying vec3 vWorldPos;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}
`

const CAVE_VERTEX_INSTANCED = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vViewPos;
varying vec3 vWorldPos;
void main() {
  vColor = color;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 mv = modelViewMatrix * p;
  vViewPos = mv.xyz;
  vWorldPos = (modelMatrix * p).xyz;
  gl_Position = projectionMatrix * mv;
}
`

// The lamp is the same 9-candela PointLight the wood outside uses, a little
// over-driven here: a tunnel has no sky, no bounce and no fog to carry light,
// so the same lamp reads dimmer in it than on a night meadow.
const LAMP_CANDELA = 18.0

// Physically-scaled the way three's own point/spot lights are (candela over
// distance squared, a window to zero at the range), so the lamp lights the
// tunnel the way the same lamp lights the wood outside.
const CAVE_FRAGMENT = /* glsl */ `
#define LAMP_CANDELA ${LAMP_CANDELA.toFixed(1)}
uniform float uLampOn;
uniform vec3 uLampPos;
uniform float uFlashOn;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uDay;
uniform vec3 uMouthPos;
varying vec3 vColor;
varying vec3 vViewPos;
varying vec3 vWorldPos;

float windowed(float d, float range) {
  float r = clamp(1.0 - pow(d / range, 4.0), 0.0, 1.0);
  return r * r / max(d * d, 0.01);
}

void main() {
  // A flat normal off the screen-space derivatives, turned to face the
  // viewer: the surface is drawn double-sided, so this is right on either
  // side of any quad whatever its winding.
  vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
  n = faceforward(n, vViewPos, n);
  vec3 nw = normalize((vec4(n, 0.0) * viewMatrix).xyz);

  vec3 lit = vec3(0.012);

  vec3 toLamp = uLampPos - vWorldPos;
  float dl = length(toLamp);
  float cl = max(dot(nw, toLamp / max(dl, 1e-4)), 0.0);
  lit += uLampOn * vec3(1.0, 0.86, 0.63) * LAMP_CANDELA * windowed(dl, 11.0) * cl / 3.14159;

  vec3 toFlash = uFlashPos - vWorldPos;
  float df = length(toFlash);
  vec3 lf = toFlash / max(df, 1e-4);
  float cf = max(dot(nw, lf), 0.0);
  float spot = smoothstep(cos(0.35), cos(0.35 * 0.6), dot(-lf, uFlashDir));
  lit += uFlashOn * vec3(1.0, 0.95, 0.8) * 600.0 * windowed(df, 30.0) * cf * spot / 3.14159;

  vec3 toMouth = uMouthPos - vWorldPos;
  float dm = length(toMouth);
  float cm = 0.5 + 0.5 * dot(nw, toMouth / max(dm, 1e-4));
  lit += uDay * vec3(0.8, 0.86, 0.95) * 26.0 * windowed(dm, 10.0) * cm / 3.14159;

  gl_FragColor = vec4(vColor * lit, 1.0);
  #include <colorspace_fragment>
}
`

function caveMaterial(mouthWorld: THREE.Vector3): { material: THREE.ShaderMaterial; uniforms: CaveUniforms } {
  const uniforms: CaveUniforms = {
    uLampOn: { value: 0 },
    uLampPos: { value: new THREE.Vector3() },
    uFlashOn: { value: 0 },
    uFlashPos: { value: new THREE.Vector3() },
    uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
    uDay: { value: 1 },
    uMouthPos: { value: mouthWorld.clone() },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CAVE_VERTEX,
    fragmentShader: CAVE_FRAGMENT,
    // Both faces: a quad viewed from behind must never vanish into the void
    // (that was the "see the sky through the wall" defect of the first
    // version). The lighting above is side-agnostic.
    side: THREE.DoubleSide,
  })
  material.name = 'mine-cave'
  return { material, uniforms }
}

/**
 * A second material lit exactly as the cave is — the same uniforms, so
 * `setMineLighting` lights it too — for things that live in the tunnels (the
 * bats, world/bats.ts). Instancing-aware; the geometry needs a `color`
 * attribute, like the cave's own.
 */
export function caveLitMaterial(group: THREE.Object3D): THREE.ShaderMaterial {
  const uniforms = group.userData.caveUniforms as CaveUniforms
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CAVE_VERTEX_INSTANCED,
    fragmentShader: CAVE_FRAGMENT,
    side: THREE.DoubleSide,
  })
  material.name = 'mine-cave-lit'
  return material
}

/** Feed the cave material what the player carries. Cheap; call every frame. */
export function setMineLighting(group: THREE.Object3D, s: Partial<MineLightState>): void {
  const u = group.userData.caveUniforms as CaveUniforms | undefined
  if (!u) return
  if (s.lampOn !== undefined) u.uLampOn.value = s.lampOn ? 1 : 0
  if (s.lampPos) u.uLampPos.value.copy(s.lampPos)
  if (s.flashOn !== undefined) u.uFlashOn.value = s.flashOn ? 1 : 0
  if (s.flashPos) u.uFlashPos.value.copy(s.flashPos)
  if (s.flashDir) u.uFlashDir.value.copy(s.flashDir)
  if (s.day !== undefined) u.uDay.value = s.day
}

class Builder {
  positions: number[] = []
  colors: number[] = []
  normals: number[] = []
  /** When set, every vertex takes this (smooth) normal instead of the flat
   *  one — the mound is a hill, not a faceted rock. */
  smooth: ((x: number, y: number, z: number) => [number, number, number]) | null = null

  /** One triangle, wound so its normal points toward `hint`. */
  tri(
    a: [number, number, number], b: [number, number, number], c: [number, number, number],
    hint: [number, number, number], color: THREE.Color,
  ): void {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const cx = (a[0] + b[0] + c[0]) / 3
    const cy = (a[1] + b[1] + c[1]) / 3
    const cz = (a[2] + b[2] + c[2]) / 3
    const facing = nx * (hint[0] - cx) + ny * (hint[1] - cy) + nz * (hint[2] - cz)
    const order = facing >= 0 ? [a, b, c] : [a, c, b]
    for (const p of order) {
      this.positions.push(p[0], p[1], p[2])
      this.colors.push(color.r, color.g, color.b)
      if (this.smooth) this.normals.push(...this.smooth(p[0], p[1], p[2]))
    }
  }

  quad(
    a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number],
    hint: [number, number, number], color: THREE.Color,
  ): void {
    this.tri(a, b, c, hint, color)
    this.tri(a, c, d, hint, color)
  }

  geometry(): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3))
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3))
    if (this.smooth) geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3))
    else geom.computeVertexNormals()
    return geom
  }
}

/** Tunnel interior: floor and vaulted ceiling for every lattice cell, and a
 *  wall for every cell edge that meets rock — all sharing lattice corners, so
 *  the surface is closed everywhere but the doorway. */
function buildInterior(m: Mine, material: THREE.Material): THREE.Mesh {
  const b = new Builder()
  const fy = m.y + FLOOR_LIFT
  const rng = mulberry32((Math.round(m.x * 17) ^ Math.round(m.z * 29) ^ 0x51ed270b) >>> 0)
  const tint = (base: THREE.Color): THREE.Color => base.clone().multiplyScalar(0.85 + rng() * 0.3)

  for (const cell of caveLattice(m).cells) {
    const hint: [number, number, number] = [cell.cx, fy + 1.2, cell.cz]
    const [c0, c1, c2, c3] = cell.corners
    const floorColor = tint(FLOOR_COLOR)
    b.quad([c0.x, fy, c0.z], [c1.x, fy, c1.z], [c2.x, fy, c2.z], [c3.x, fy, c3.z], hint, floorColor)
    const ceilColor = tint(CEIL_COLOR)
    b.quad(
      [c0.x, fy + c0.ceil, c0.z], [c1.x, fy + c1.ceil, c1.z],
      [c2.x, fy + c2.ceil, c2.z], [c3.x, fy + c3.ceil, c3.z], hint, ceilColor,
    )
  }
  for (const w of caveLattice(m).walls) {
    const hint: [number, number, number] = [
      (w.a.x + w.b.x) / 2 + w.nx, fy + 1.2, (w.a.z + w.b.z) / 2 + w.nz,
    ]
    b.quad(
      [w.a.x, fy, w.a.z], [w.b.x, fy, w.b.z],
      [w.b.x, fy + w.b.ceil, w.b.z], [w.a.x, fy + w.a.ceil, w.a.z], hint, tint(WALL_COLOR),
    )
  }
  const mesh = new THREE.Mesh(b.geometry(), material)
  mesh.name = 'mine-interior'
  return mesh
}

/** The mound's own smooth surface normal at (x, z) — the height field's
 *  gradient, central-differenced. Shared by `buildDeck` (every vertex) and
 *  `buildFace` (only its top row, which sits at this same height): giving
 *  both meshes the identical normal exactly on their shared edge is what
 *  makes the two read as one continuous surface instead of a lighting seam
 *  at the join (a live report, 2026-09-22: "some outcrop edges are poorly
 *  glued") — `buildFace`'s own strips are otherwise flat-shaded and would
 *  disagree with the mound's smooth shading right at the boundary they share. */
function deckNormalAt(terrain: MineTerrain, x: number, z: number): [number, number, number] {
  const e = 0.25
  const dx = terrain.deckAt(x + e, z) - terrain.deckAt(x - e, z)
  const dz = terrain.deckAt(x, z + e) - terrain.deckAt(x, z - e)
  const l = Math.hypot(dx, 2 * e, dz)
  return [-dx / l, (2 * e) / l, -dz / l]
}

/** Where the mound meets the levelled apron: one strip of rock face per pair
 *  of neighbouring z stations, doorway left open. Its top edge is the mound's
 *  own front row, so the two share vertices. */
function buildFace(m: Mine, terrain: MineTerrain, material: THREE.Material): THREE.Mesh {
  const b = new Builder()
  const fy = m.y + FLOOR_LIFT
  const tintRng = mulberry32((Math.round(m.x * 19) ^ Math.round(m.z * 37) ^ 0x7f4a7c15) >>> 0)
  const tint = (): number => tintRng()
  const lattice = caveLattice(m)
  // The doorway's own outline: the lattice corners along the mouth plane.
  const portal = lattice.cells
    .filter((c) => c.i === 0)
    .sort((p, q) => p.j - q.j)
  const doorZ: { z: number; ceil: number }[] = []
  for (const c of portal) {
    if (doorZ.length === 0) doorZ.push({ z: c.corners[0].z, ceil: c.corners[0].ceil })
    doorZ.push({ z: c.corners[3].z, ceil: c.corners[3].ceil })
  }
  const zL = doorZ[0]?.z ?? 0
  const zR = doorZ[doorZ.length - 1]?.z ?? 0
  const outer = m.segments[0].width / 2 + Math.max(FACE_HALF_EXTRA, terrain.deckRadius + 0.5)
  const hint = (z: number, y: number): [number, number, number] => [-1, y, z]
  const bottom = (z: number): number => terrain.apronAt(-1e-4, z) - 0.35

  const noiseSeed = (Math.round(m.x * 11) ^ Math.round(m.z * 13) ^ 0x2c1b3c6d) & 0xffff
  const doorEdge = Math.max(Math.abs(zL), Math.abs(zR))
  // How far a point of the face recedes into the hill: nothing at its brink
  // (where it meets the mound) and at the doorway's jambs (where it meets the
  // tunnel), up to FACE_DEPTH in between, lumpy like broken rock.
  const recess = (z: number, y: number, top: number, foot: number): number => {
    const jamb = Math.min(1, Math.max(0, (Math.abs(z) - doorEdge - 0.2) / 1.2))
    const h = top - foot
    const t = h > 1e-3 ? (y - foot) / h : 1
    const brink = Math.min(1, (1 - t) * 4)
    const n = fbm2(z / 1.6, y / 1.1, noiseSeed, 3) * 0.5 + 0.5
    return FACE_DEPTH * n * jamb * brink
  }
  const rockAt = (y: number, z: number): THREE.Color => {
    const band = Math.floor((y - fy) * 1.6 + fbm2(z / 5, y, noiseSeed + 7, 2) * 1.2)
    const c = STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]
    return c.clone().multiplyScalar(0.9 + tint() * 0.18)
  }
  const strip = (z0: number, y0b: number, z1: number, y1b: number): void => {
    const t0 = terrain.deckAt(0, z0)
    const t1 = terrain.deckAt(0, z1)
    if (t0 - y0b < 0.005 && t1 - y1b < 0.005) return
    for (let r = 0; r < FACE_ROWS; r++) {
      const a = r / FACE_ROWS
      const c = (r + 1) / FACE_ROWS
      const ya0 = y0b + (t0 - y0b) * a
      const yc0 = y0b + (t0 - y0b) * c
      const ya1 = y1b + (t1 - y1b) * a
      const yc1 = y1b + (t1 - y1b) * c
      b.quad(
        [recess(z0, ya0, t0, y0b), ya0, z0], [recess(z1, ya1, t1, y1b), ya1, z1],
        [recess(z1, yc1, t1, y1b), yc1, z1], [recess(z0, yc0, t0, y0b), yc0, z0],
        hint((z0 + z1) / 2, (ya0 + yc0) / 2), rockAt((ya0 + yc0) / 2, (z0 + z1) / 2),
      )
    }
  }
  // Above the doorway: from the lintel (the ceiling edge) up to the mound.
  for (let k = 0; k + 1 < doorZ.length; k++) {
    strip(doorZ[k].z, fy + doorZ[k].ceil, doorZ[k + 1].z, fy + doorZ[k + 1].ceil)
  }
  // Either side of it: from the ground up to the mound.
  const stations = (from: number, dir: number): number[] => {
    const out = [from]
    let z = Math.ceil(from / DECK_STEP - 1e-9) * DECK_STEP
    if (dir < 0) z = Math.floor(from / DECK_STEP + 1e-9) * DECK_STEP
    for (; Math.abs(z) <= outer; z += dir * DECK_STEP) if (Math.abs(z - from) > 1e-6) out.push(z)
    return out
  }
  for (const dir of [1, -1]) {
    const zs = stations(dir > 0 ? zR : zL, dir)
    for (let k = 0; k + 1 < zs.length; k++) strip(zs[k], bottom(zs[k]), zs[k + 1], bottom(zs[k + 1]))
  }
  const mesh = new THREE.Mesh(b.geometry(), material)
  mesh.name = 'mine-face'

  // Every strip's top edge is a point on the mound (see `strip`'s own t0/t1,
  // taken straight from `terrain.deckAt`) — overriding just those vertices'
  // normals with the mound's own analytic one (`deckNormalAt`, identical to
  // `buildDeck`'s `b.smooth`) removes the shading discontinuity right at the
  // join, without touching the rest of the face's own flat-shaded rock.
  const facePos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const faceNorm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < facePos.count; i++) {
    const x = facePos.getX(i)
    const z = facePos.getZ(i)
    if (Math.abs(facePos.getY(i) - terrain.deckAt(x, z)) < 0.01) {
      const [nx, ny, nz] = deckNormalAt(terrain, x, z)
      faceNorm.setXYZ(i, nx, ny, nz)
    }
  }
  faceNorm.needsUpdate = true
  return mesh
}

/** The mound over the tunnels: the surface the player walks on above them,
 *  fading from bare rock at the crest into the meadow's own colour at its rim,
 *  where its height falls to the natural ground. */
function buildDeck(m: Mine, terrain: MineTerrain, material: THREE.Material): THREE.Mesh {
  const b = new Builder()
  const rng = mulberry32((Math.round(m.x * 23) ^ Math.round(m.z * 31) ^ 0x1b873593) >>> 0)
  let maxX = 0
  let maxZ = 0
  for (const s of m.segments) {
    maxX = Math.max(maxX, s.x0, s.x1)
    maxZ = Math.max(maxZ, Math.abs(s.z0), Math.abs(s.z1))
  }
  const reachOut = terrain.deckRadius + 1
  const ni = Math.ceil((maxX + reachOut) / DECK_STEP)
  const nj = Math.ceil((maxZ + reachOut) / DECK_STEP)
  const dOut = (x: number, z: number): number => Math.max(0, caveSdf(m, x, z))
  const point = (i: number, j: number): [number, number, number] => {
    const x = i * DECK_STEP
    const z = j * DECK_STEP
    return [x, terrain.deckAt(x, z), z]
  }
  const noiseSeed = (Math.round(m.x * 7) ^ Math.round(m.z * 5) ^ 0x3c6ef372) & 0xffff
  // Moss and grass over the top, bare rock only where it is steep and in the
  // odd patch — not a bare grey table (a live report, 2026-09-24).
  const colorAt = (x: number, z: number): THREE.Color => {
    const t = Math.min(1, dOut(x, z) / terrain.deckRadius)
    const rim = t * t * (3 - 2 * t)
    const steep = 1 - deckNormalAt(terrain, x, z)[1]
    const patch = fbm2(x / 3.5, z / 3.5, noiseSeed, 3)
    const soil = fbm2(x / 2, z / 2, noiseSeed + 3, 2)
    const green = MOSS_COLOR.clone().lerp(GRASS_COLOR, rim).lerp(SOIL_COLOR, Math.max(0, soil) * 0.6)
    green.multiplyScalar(0.92 + rng() * 0.14)
    // Steep ground shows rock only where a patch of it comes through, so a
    // flank is grass broken by outcrops rather than one grey band.
    const steepRock = Math.min(1, (steep - 0.4) * 3) * Math.min(1, Math.max(0, patch + 0.15) * 3)
    const rockiness = Math.max(steepRock, Math.min(1, (patch - 0.35) * 4))
    const rock = STRATA[Math.floor(rng() * STRATA.length)].clone().multiplyScalar(0.9 + rng() * 0.15)
    return green.lerp(rock, Math.max(0, rockiness) * (1 - rim))
  }
  const up: [number, number, number] = [0, 1e4, 0]
  b.smooth = (x, _y, z) => deckNormalAt(terrain, x, z)
  for (let i = 0; i < ni; i++) {
    for (let j = -nj; j < nj; j++) {
      const cx = (i + 0.5) * DECK_STEP
      const cz = (j + 0.5) * DECK_STEP
      const corners = [
        [i * DECK_STEP, j * DECK_STEP], [(i + 1) * DECK_STEP, j * DECK_STEP],
        [(i + 1) * DECK_STEP, (j + 1) * DECK_STEP], [i * DECK_STEP, (j + 1) * DECK_STEP],
      ]
      if (!corners.some(([x, z]) => dOut(x, z) < terrain.deckRadius)) continue
      b.quad(point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j), up, colorAt(cx, cz))
    }
  }
  const mesh = new THREE.Mesh(b.geometry(), material)
  mesh.name = 'mine-deck'
  mesh.receiveShadow = true
  return mesh
}

/**
 * The mine's whole geometry, as one group named 'mine': the tunnel interior,
 * the mound over it and the rock face with the doorway. The group carries the
 * cave material's uniforms (`setMineLighting` reads them off `userData`).
 */
export function buildMineMesh(m: Mine, terrain: MineTerrain): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mine'
  group.position.set(m.x, 0, m.z)
  group.rotation.y = -m.heading

  group.updateMatrixWorld(true)
  const mouth = group.localToWorld(new THREE.Vector3(0, m.y + 1.5, 0))
  const { material, uniforms } = caveMaterial(mouth)
  group.userData.caveUniforms = uniforms

  const surfaceMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    // The mound and the terrain mesh under it are within a few centimetres of
    // each other over the rim; this settles which one wins at any distance.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const faceMat = surfaceMat.clone()
  faceMat.side = THREE.DoubleSide

  group.add(buildInterior(m, material))
  group.add(buildDeck(m, terrain, surfaceMat))
  group.add(buildFace(m, terrain, faceMat))
  group.add(buildOutcropBoulders(m, terrain))
  return group
}

/** The outcrop's boulders (mine.ts's `outcropBoulders`): lumpy, flat-shaded
 *  rocks in the strata's colours, moss on whatever faces up. One mesh. */
function buildOutcropBoulders(m: Mine, terrain: MineTerrain): THREE.Mesh {
  const rng = mulberry32((Math.round(m.x * 53) ^ Math.round(m.z * 59) ^ 0x1f83d9ab) >>> 0)
  const positions: number[] = []
  const colors: number[] = []
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const mat4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (const b of outcropBoulders(m, terrain.deckRadius)) {
    const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    // Lumpy: every corner pushed in or out by its own amount (shared corners
    // agree, keyed by where they sit on the unit sphere).
    const bump = new Map<string, number>()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
      if (!bump.has(key)) bump.set(key, 0.78 + rng() * 0.4)
      v.multiplyScalar(bump.get(key)!)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    const ground = b.at === 'foot' ? terrain.apronAt(-1e-3, b.lz) : terrain.deckAt(b.lx, b.lz)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2)
    mat4.compose(
      new THREE.Vector3(b.lx, ground + b.r * (b.at === 'foot' ? 0.3 : 0.15), b.lz), q,
      new THREE.Vector3(b.r, b.r * (0.62 + rng() * 0.2), b.r * (0.85 + rng() * 0.2)),
    )
    geo.applyMatrix4(mat4)
    geo.computeVertexNormals()
    const p = geo.getAttribute('position') as THREE.BufferAttribute
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute
    const base = STRATA[Math.floor(rng() * STRATA.length)]
    for (let i = 0; i < p.count; i += 3) {
      // One colour per face: moss where it faces the sky.
      n.fromBufferAttribute(nor, i)
      const c = n.y > 0.72 ? MOSS_COLOR.clone().multiplyScalar(0.9 + rng() * 0.2) : base.clone().multiplyScalar(0.85 + rng() * 0.25)
      for (let k = 0; k < 3; k++) {
        positions.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k))
        colors.push(c.r, c.g, c.b)
      }
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geom.computeVertexNormals()
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
  mesh.name = 'mine-boulders'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0)

/**
 * Removes every instance of an instanced scatter group (`world/instanceCulling.ts`
 * names them) whose position satisfies `covered` — the same trick the
 * distance culling uses: the instance's matrix is scaled to nothing, the draw
 * call and buffer stay as they are. For clearing what the scatter put on the
 * ground before the mine reshaped it.
 */
export function clearScatterOnMine(root: THREE.Object3D, covered: (x: number, z: number) => boolean): void {
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  root.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return
    let touched = false
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      // An instance already scaled away (or sitting at the origin of a
      // zeroed matrix) has nothing to clear.
      if (!covered(p.x, p.z)) continue
      o.setMatrixAt(i, ZERO_SCALE)
      touched = true
    }
    if (touched) o.instanceMatrix.needsUpdate = true
  })
}
