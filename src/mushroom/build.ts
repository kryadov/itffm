import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { capCrossSection } from './profile'
import { capWobble, stipeBendCurve } from './irregularity'
import { mulberry32 } from '../util/rng'
import type { MushroomMorphology, Range } from '../species/schema'

type Morphology = MushroomMorphology

/** Species data is in millimetres, the scene is in metres. The conversion lives only here. */
const MM = 0.001

/** How far a lateral cap sits off the stipe, in cap radii. */
const LATERAL_OFFSET = 0.75

/**
 * How far a lateral cap tips, in radians. A bracket fungus is a shelf standing
 * out of dead wood, and a shallow tilt just reads as a plate on the ground.
 */
const LATERAL_TILT = 0.5

/** How far the stipe's own axis can lean, as a fraction of its height, at
 *  full age — see docs/superpowers/specs on mushroom/build.ts's irregularity
 *  (no two mushrooms alike): a real stipe is almost never perfectly straight. */
const STIPE_BEND_FRAC = 0.08
/** Rings of vertices along a bent stipe — one (the old default) draws a
 *  kink, not a curve; this is the minimum that actually reads as bent. */
const STIPE_BEND_SEGMENTS = 8

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

/** How far the stipe's tip has drifted sideways from its base, at full
 *  height (`stipeBendCurve(1) === 1`) — what the cap/hymenium/ring all need
 *  to follow so they still sit where the stipe's own tip actually ended up. */
function tipOffset(bendAngle: number, bendAmount: number): { x: number; z: number } {
  return { x: Math.cos(bendAngle) * bendAmount, z: Math.sin(bendAngle) * bendAmount }
}

/** Perturbs a lathe-swept cap's radius by angle, in its own local frame
 *  (before any lateral tilt or translate) — real caps are never a perfect
 *  circle in plan. Tapers to nothing at the apex and at the stipe, so
 *  neither the tip nor the underside's inner edge gets a stray hole. */
function wobbleCap(geo: THREE.BufferGeometry, capR: number, seed: number, age: number): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 1e-9) continue
    const taper = Math.min(1, r / capR)
    const newR = r * (1 + capWobble(Math.atan2(z, x), seed, age) * taper)
    pos.setX(i, (x / r) * newR)
    pos.setZ(i, (z / r) * newR)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

/** Leans a stipe's own rings of vertices sideways by height, in its own
 *  local frame (after the base-to-tip translate, before any lateral
 *  rotation) — zero at the base (it still plants where it grew), full
 *  `bendAmount` at the tip. */
function bendStipe(geo: THREE.BufferGeometry, h: number, bendAngle: number, bendAmount: number): void {
  if (bendAmount === 0) return
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const dirX = Math.cos(bendAngle)
  const dirZ = Math.sin(bendAngle)
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / h
    const off = stipeBendCurve(t) * bendAmount
    pos.setX(i, pos.getX(i) + dirX * off)
    pos.setZ(i, pos.getZ(i) + dirZ * off)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

/**
 * A mushroom built from its species parameters. Pure: one seed gives the same
 * geometry in every browser, so the forest looks the same for everyone and
 * survives a reload.
 *
 * @param age 0 young, 1 mature — changes the cap shape as it opens out
 */
export function buildMushroom(m: Morphology, seed: number, age: number): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()

  // One size factor for the whole specimen. Drawing each dimension
  // independently produced chimeras — a 25 cm cap on a stubby 6 cm stalk — so
  // the draw happens once and every measurement follows it, with only a little
  // jitter left for individual variation. A big mushroom is big all over.
  const size = rng()
  const jitter = () => 0.88 + rng() * 0.24

  const capR = (lerp(m.cap.diameter, size) * MM) / 2
  const stipeH = lerp(m.stipe.height, size) * MM * jitter()
  const stipeR = (lerp(m.stipe.width, size) * MM * jitter()) / 2

  const lateral = m.stipe.position === 'lateral'
  const capOffset = lateral ? capR * LATERAL_OFFSET : 0

  // A stipe that doesn't exist can't lean — the cap has nothing under it to
  // explain a sideways drift, so an absent stipe simply gets no bend at all.
  const hasStipe = m.stipe.position !== 'absent'
  const bendAngle = rng() * Math.PI * 2
  const bendAmount = hasStipe ? stipeH * STIPE_BEND_FRAC * (0.5 + 0.5 * age) * (0.6 + rng() * 0.8) : 0
  const tip = tipOffset(bendAngle, bendAmount)

  if (hasStipe) group.add(buildStipe(m, stipeH, stipeR, lateral, bendAngle, bendAmount))
  group.add(buildCap(m, age, capR, stipeR, stipeH, capOffset + tip.x, tip.z, lateral, seed))
  group.add(buildHymenium(m, capR, stipeR, stipeH, capOffset + tip.x, tip.z, lateral))
  if (m.stipe.ring !== 'none') group.add(buildRing(m, stipeR, stipeH, bendAngle, bendAmount))
  if (m.stipe.volva !== 'none') group.add(buildVolva(m, stipeR))
  if (m.cap.surface === 'warty' || m.cap.surface === 'scaly') {
    group.add(buildWarts(m, rng, capR, stipeH, age, capOffset + tip.x, tip.z))
  }

  // A slight lean: a perfectly upright mushroom reads as scenery, not as a find.
  group.rotation.z = (rng() - 0.5) * 0.18
  group.rotation.x = (rng() - 0.5) * 0.18
  return group
}

function buildStipe(
  m: Morphology,
  h: number,
  r: number,
  lateral: boolean,
  bendAngle: number,
  bendAmount: number,
): THREE.Mesh {
  // Narrower at the top than at the base, or the stipe reads as a pipe.
  // Enough height segments to actually curve — one ring at each end draws a
  // kink, not a lean.
  const geo = new THREE.CylinderGeometry(r * 0.85, r, h, 16, STIPE_BEND_SEGMENTS)
  geo.translate(0, h / 2, 0)
  bendStipe(geo, h, bendAngle, bendAmount)
  // A lateral stipe leans out towards its cap instead of standing upright.
  if (lateral) geo.rotateZ(-0.35)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.9 }))
  mesh.name = 'stipe'
  return mesh
}

function buildCap(
  m: Morphology,
  age: number,
  capR: number,
  stipeR: number,
  stipeH: number,
  offsetX: number,
  offsetZ: number,
  lateral: boolean,
  seed: number,
): THREE.Mesh {
  const section = capCrossSection(m.cap.shape, m.cap.ageShape, age, capR, lateral ? capR * 0.12 : stipeR)
  const geo = new THREE.LatheGeometry(section.map((p) => new THREE.Vector2(p.r, p.y)), 32)
  wobbleCap(geo, capR, seed, age)
  // A bracket fungus grows out of its substrate as a shelf, so its cap is
  // tipped and pushed off the stalk rather than balanced on top of it.
  if (lateral) geo.rotateZ(LATERAL_TILT)
  geo.translate(offsetX, stipeH, offsetZ)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: m.cap.color, roughness: 0.75, side: THREE.DoubleSide }),
  )
  mesh.name = 'cap'
  return mesh
}

/**
 * The underside — what the player crouches down and turns the mushroom over to
 * see. Gills are real radial blades rather than a texture: they hold up from
 * any angle, and they are how a fly agaric is told from a bolete.
 */
function buildHymenium(
  m: Morphology,
  capR: number,
  stipeR: number,
  stipeH: number,
  offsetX: number,
  offsetZ: number,
  lateral: boolean,
): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({
    color: m.hymenium.color,
    roughness: 1,
    side: THREE.DoubleSide,
  })
  const y = stipeH - capR * 0.1

  let mesh: THREE.Mesh
  if (m.hymenium.type === 'gills') {
    const blades: THREE.BufferGeometry[] = []
    const count = 48
    const inner = lateral
      ? capR * 0.12
      : m.hymenium.attachment === 'free'
        ? stipeR * 1.6
        : stipeR
    const width = Math.max(0.001, capR * 0.92 - inner)
    const drop = m.hymenium.attachment === 'decurrent' ? capR * 0.18 : capR * 0.1
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const geo = new THREE.PlaneGeometry(width, drop)
      geo.translate(inner + width / 2, 0, 0)
      geo.rotateY(-a)
      blades.push(geo)
    }
    mesh = new THREE.Mesh(mergeGeometries(blades), mat)
  } else {
    // Tubes, teeth and smooth undersides: a disc beneath the cap. Colour and
    // material carry the difference, and at arm's length that is enough.
    const geo = new THREE.CircleGeometry(capR * 0.94, 32)
    geo.rotateX(Math.PI / 2)
    mesh = new THREE.Mesh(geo, mat)
  }

  mesh.name = 'hymenium'
  if (lateral) mesh.rotation.z = LATERAL_TILT
  mesh.position.set(offsetX, y, offsetZ)
  return mesh
}

function buildRing(m: Morphology, stipeR: number, stipeH: number, bendAngle: number, bendAmount: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(stipeR * 1.45, stipeR * 0.3, 8, 20)
  geo.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.95 }))
  mesh.name = 'ring'
  const t = m.stipe.ring === 'ascending' ? 0.45 : 0.75
  const off = tipOffset(bendAngle, bendAmount * stipeBendCurve(t))
  mesh.position.set(off.x, stipeH * t, off.z)
  return mesh
}

function buildVolva(m: Morphology, stipeR: number): THREE.Mesh {
  const r = stipeR * 1.9
  const geo =
    m.stipe.volva === 'sheathing'
      ? new THREE.CylinderGeometry(r * 0.8, r, r * 2.2, 14, 1, true)
      : new THREE.SphereGeometry(r, 14, 10)
  geo.scale(1, 0.7, 1)
  geo.translate(0, r * 0.55, 0)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.95, side: THREE.DoubleSide }),
  )
  mesh.name = 'volva'
  return mesh
}

/** Warts and scales on the cap — how a fly agaric is spotted from a distance. */
function buildWarts(
  m: Morphology,
  rng: () => number,
  capR: number,
  stipeH: number,
  age: number,
  offsetX: number,
  offsetZ: number,
): THREE.InstancedMesh {
  const count = 26
  const size = capR * 0.09
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(size, 6, 5),
    new THREE.MeshStandardMaterial({ color: m.cap.surfaceColor, roughness: 1 }),
    count,
  )
  mesh.name = 'warts'
  const dummy = new THREE.Object3D()
  const section = capCrossSection(m.cap.shape, m.cap.ageShape, age, capR, capR * 0.1)
  for (let i = 0; i < count; i++) {
    const u = Math.sqrt(rng()) * 0.9
    const a = rng() * Math.PI * 2
    const idx = Math.min(section.length - 1, Math.floor(u * 24))
    dummy.position.set(offsetX + Math.cos(a) * u * capR, stipeH + section[idx].y, offsetZ + Math.sin(a) * u * capR)
    dummy.scale.setScalar(0.6 + rng() * 0.7)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  return mesh
}

export { toWorldMesh } from '../collectible/worldMesh'
