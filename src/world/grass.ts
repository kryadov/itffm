import * as THREE from 'three'
import { mulberry32, hashString } from '../util/rng'
import { moistureAt } from '../ecology/sites'
import type { ElevationProvider } from '../terrain/provider'

export interface GrassTuft {
  x: number
  z: number
  y: number
  scale: number
  rotationY: number
}

/** Spacing of the candidate lattice, metres — jittered, not a grid you can
 *  spot. Coarser than a single tuft's own reach: each cell's `moistureAt`
 *  call is itself several `heightAt` samples, and this grid is walked in
 *  full once at load, synchronously, for every wood no matter its size. */
const CELL = 2.4
/** Chance a cell grows a tuft at moisture 0.5. */
const BASE_CHANCE = 0.35
/** How much wetter or drier ground pulls that chance, either way. */
const MOISTURE_WEIGHT = 0.9
/** Hard ceiling regardless of plot size: a lattice over a big plot could ask
 *  for tens of thousands of tufts, and each is three instanced triangles. */
const MAX_TUFTS = 9000

/**
 * Scatters grass tufts across the plot, denser where the ground is damp.
 *
 * The point is not decoration: a mushroom standing bare on open ground is
 * only ever "visible or not", the way it never is in a real wood. Density
 * reads `moistureAt` (ecology/sites.ts) — the same hollow that already grows
 * a wetter mushroom site grows thicker grass over it, for the same reason.
 */
export function placeGrass(ground: ElevationProvider, halfSize: number, seed: number): GrassTuft[] {
  const tufts: GrassTuft[] = []
  const reach = Math.ceil(halfSize / CELL)

  outer: for (let gx = -reach; gx <= reach; gx++) {
    for (let gz = -reach; gz <= reach; gz++) {
      const rng = mulberry32(hashString(`grass:${gx}:${gz}:${seed}`))
      const x = gx * CELL + (rng() - 0.5) * CELL
      const z = gz * CELL + (rng() - 0.5) * CELL
      if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) continue

      const moisture = moistureAt(ground, x, z)
      const chance = Math.max(0.02, Math.min(0.95, BASE_CHANCE + (moisture - 0.5) * MOISTURE_WEIGHT))
      if (rng() >= chance) continue

      tufts.push({ x, z, y: ground.heightAt(x, z), scale: 0.7 + rng() * 0.6, rotationY: rng() * Math.PI * 2 })
      if (tufts.length >= MAX_TUFTS) break outer
    }
  }

  return tufts
}

/** One thin triangular blade, base at the origin, tip a unit up — instanced
 *  and scaled per tuft, so the whole field of grass is a single geometry. */
function bladeGeometry(): THREE.BufferGeometry {
  const halfWidth = 0.05
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-halfWidth, 0, 0, halfWidth, 0, 0, 0, 1, 0.03]), 3),
  )
  geo.setIndex([0, 1, 2])
  geo.computeVertexNormals()
  return geo
}

/** Blades sharing one tuft, arranged in a small fan so a tuft reads as a
 *  clump rather than a single flat card. */
const BLADES_PER_TUFT = 3

/**
 * Grass meshes: every blade of every tuft, instanced into one draw call.
 * Plain thin triangles rather than an alpha-cutout texture — the project has
 * no texture pipeline (see CLAUDE.md: three and yaml, nothing else), and a
 * blade-shaped triangle needs no cutout to read as a blade.
 */
export function buildGrassMesh(tufts: GrassTuft[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'grass'
  if (tufts.length === 0) return group

  const material = new THREE.MeshStandardMaterial({ color: 0x5c7a3a, roughness: 1, side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(bladeGeometry(), material, tufts.length * BLADES_PER_TUFT)

  const dummy = new THREE.Object3D()
  let i = 0
  for (const t of tufts) {
    const rng = mulberry32(hashString(`blade:${t.x.toFixed(3)}:${t.z.toFixed(3)}`))
    for (let b = 0; b < BLADES_PER_TUFT; b++) {
      const angle = (b / BLADES_PER_TUFT) * Math.PI * 2 + t.rotationY
      const spread = rng() * 0.07
      dummy.position.set(t.x + Math.cos(angle) * spread, t.y, t.z + Math.sin(angle) * spread)
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.scale.setScalar(t.scale * (0.8 + rng() * 0.4))
      dummy.updateMatrix()
      mesh.setMatrixAt(i++, dummy.matrix)
    }
  }
  group.add(mesh)
  return group
}
