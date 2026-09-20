import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import {
  FACE_HALF_EXTRA, FLOOR_LIFT, caveLattice, caveSdf, type Mine,
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
const ROCK_COLOR = new THREE.Color(0x8c8679)
const GRASS_COLOR = new THREE.Color(0x4d5b39)
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

/** Where the mound meets the levelled apron: one strip of rock face per pair
 *  of neighbouring z stations, doorway left open. Its top edge is the mound's
 *  own front row, so the two share vertices. */
function buildFace(m: Mine, terrain: MineTerrain, material: THREE.Material): THREE.Mesh {
  const b = new Builder()
  const fy = m.y + FLOOR_LIFT
  const rock = ROCK_COLOR
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

  const strip = (z0: number, y0b: number, z1: number, y1b: number): void => {
    const t0 = terrain.deckAt(0, z0)
    const t1 = terrain.deckAt(0, z1)
    if (t0 - y0b < 0.005 && t1 - y1b < 0.005) return
    b.quad(
      [0, y0b, z0], [0, y1b, z1], [0, t1, z1], [0, t0, z0], hint((z0 + z1) / 2, (y0b + t0) / 2),
      rock.clone().multiplyScalar(0.88 + tint() * 0.24),
    )
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
  const colorAt = (x: number, z: number): THREE.Color => {
    const t = Math.min(1, dOut(x, z) / terrain.deckRadius)
    const k = t * t * (3 - 2 * t)
    const rockMix = ROCK_COLOR.clone().multiplyScalar(0.95 + rng() * 0.1)
    return rockMix.lerp(GRASS_COLOR, Math.min(1, k * 1.15))
  }
  const up: [number, number, number] = [0, 1e4, 0]
  b.smooth = (x, _y, z) => {
    const e = 0.25
    const dx = terrain.deckAt(x + e, z) - terrain.deckAt(x - e, z)
    const dz = terrain.deckAt(x, z + e) - terrain.deckAt(x, z - e)
    const l = Math.hypot(dx, 2 * e, dz)
    return [-dx / l, (2 * e) / l, -dz / l]
  }
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
  return group
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
