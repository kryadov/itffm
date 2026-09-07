import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { capCrossSection } from './profile'
import { mulberry32 } from '../util/rng'
import type { Morphology, Range } from '../species/schema'

/** Species data is in millimetres, the scene is in metres. The conversion lives only here. */
const MM = 0.001

/** How far a lateral cap sits off the stipe, in cap radii. */
const LATERAL_OFFSET = 0.75

/**
 * How far a lateral cap tips, in radians. A bracket fungus is a shelf standing
 * out of dead wood, and a shallow tilt just reads as a plate on the ground.
 */
const LATERAL_TILT = 0.5

const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t

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

  if (m.stipe.position !== 'absent') group.add(buildStipe(m, stipeH, stipeR, lateral))
  group.add(buildCap(m, age, capR, stipeR, stipeH, capOffset, lateral))
  group.add(buildHymenium(m, capR, stipeR, stipeH, capOffset, lateral))
  if (m.stipe.ring !== 'none') group.add(buildRing(m, stipeR, stipeH))
  if (m.stipe.volva !== 'none') group.add(buildVolva(m, stipeR))
  if (m.cap.surface === 'warty' || m.cap.surface === 'scaly') {
    group.add(buildWarts(m, rng, capR, stipeH, age, capOffset))
  }

  // A slight lean: a perfectly upright mushroom reads as scenery, not as a find.
  group.rotation.z = (rng() - 0.5) * 0.18
  group.rotation.x = (rng() - 0.5) * 0.18
  return group
}

function buildStipe(m: Morphology, h: number, r: number, lateral: boolean): THREE.Mesh {
  // Narrower at the top than at the base, or the stipe reads as a pipe.
  const geo = new THREE.CylinderGeometry(r * 0.85, r, h, 16, 1)
  geo.translate(0, h / 2, 0)
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
  offset: number,
  lateral: boolean,
): THREE.Mesh {
  const section = capCrossSection(m.cap.shape, m.cap.ageShape, age, capR, lateral ? capR * 0.12 : stipeR)
  const geo = new THREE.LatheGeometry(section.map((p) => new THREE.Vector2(p.r, p.y)), 32)
  // A bracket fungus grows out of its substrate as a shelf, so its cap is
  // tipped and pushed off the stalk rather than balanced on top of it.
  if (lateral) geo.rotateZ(LATERAL_TILT)
  geo.translate(offset, stipeH, 0)
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
  offset: number,
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
  mesh.position.set(offset, y, 0)
  return mesh
}

function buildRing(m: Morphology, stipeR: number, stipeH: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(stipeR * 1.45, stipeR * 0.3, 8, 20)
  geo.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.stipe.color, roughness: 0.95 }))
  mesh.name = 'ring'
  mesh.position.y = stipeH * (m.stipe.ring === 'ascending' ? 0.45 : 0.75)
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
  offset: number,
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
    dummy.position.set(offset + Math.cos(a) * u * capR, stipeH + section[idx].y, Math.sin(a) * u * capR)
    dummy.scale.setScalar(0.6 + rng() * 0.7)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  return mesh
}
