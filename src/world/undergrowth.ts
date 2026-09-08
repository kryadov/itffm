import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'

export interface Bush {
  x: number
  z: number
  /** Ground height under the bush. */
  y: number
  radius: number
  height: number
}

/** Structurally identical to game/player.ts's Obstacle — see the same note in deadwood.ts. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
}

const MIN_GAP = 2
/** Spatial scale of one undergrowth patch, metres — smaller-grained than a
 *  whole clearing (world/clearings.ts's 55), so a wood gets many thickets,
 *  not one big pocket of them. */
const PATCH_SCALE = 22
/** Above this the noise reads as a patch of undergrowth; below it, open floor
 *  a forager can actually walk across. Zero splits the plot roughly in half —
 *  thickets and gaps in comparable measure, not a lawn with rare bushes. */
const PATCH_THRESHOLD = 0

/**
 * Scatters undergrowth across the plot: not there to be found or foraged, only
 * to stand in the way. A wood without it is a wood you can see straight
 * through — walking becomes a choice of which gap to thread rather than a
 * choice of route.
 *
 * Clustered by a noise field, the same principle already used for tree
 * genera (world/trees.ts) and clearings (world/clearings.ts): real
 * undergrowth is thicker where a gap in the canopy lets light reach the
 * ground, not spread as an even lawn of rare bushes.
 */
export function placeBushes(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density = 0.002,
): Bush[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const attempts = Math.max(1, Math.floor(area * density))
  const bushes: Bush[] = []

  for (let i = 0; i < attempts; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize
    if (fbm2(x / PATCH_SCALE, z / PATCH_SCALE, seed + 31, 2) < PATCH_THRESHOLD) continue
    if (bushes.some((b) => Math.hypot(b.x - x, b.z - z) < MIN_GAP)) continue
    bushes.push({
      x,
      z,
      y: ground.heightAt(x, z),
      radius: 0.35 + rng() * 0.7,
      height: 0.5 + rng() * 0.9,
    })
  }
  return bushes
}

/** A bush's collision shape: round and, unlike a boulder, worth stepping around rather than through. */
export function bushObstacle(b: Bush): CircleObstacle {
  return { x: b.x, z: b.z, radius: b.radius }
}

/**
 * Bush meshes: the same roughened-icosahedron trick as tree crowns and
 * boulders (see world/trees.ts, world/boulders.ts), squashed low and wide
 * rather than tall — a thicket reads as a thicket, not a floating crown.
 */
export function buildBushMeshes(bushes: Bush[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'undergrowth'
  if (bushes.length === 0) return group

  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const bump = 1 + fbm2(x * 1.8 + 17, z * 1.8 + 17, 17, 2) * 0.28
    pos.setXYZ(i, x * bump, y * bump * 0.6, z * bump)
  }
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({ color: 0x445c2e, roughness: 1 })
  const mesh = new THREE.InstancedMesh(geo, mat, bushes.length)
  const dummy = new THREE.Object3D()
  bushes.forEach((b, i) => {
    dummy.position.set(b.x, b.y + b.height / 2, b.z)
    dummy.rotation.set(0, (b.x - b.z) * 0.5, 0)
    dummy.scale.set(b.radius, b.height, b.radius)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  group.add(mesh)
  return group
}
