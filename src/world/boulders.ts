import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'

export interface Boulder {
  x: number
  z: number
  /** Ground height under the boulder. */
  y: number
  radius: number
}

/** Structurally identical to game/player.ts's Obstacle — see the same note in deadwood.ts. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
  topHeight?: number
}

const MIN_GAP = 4

/**
 * Scatters boulders across the plot: the wood's first obstacle that is
 * neither a tree nor deadwood, and — unlike either — one you cannot lean a
 * mushroom against, only grow moss beside.
 */
export function placeBoulders(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density = 0.0003,
): Boulder[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const attempts = Math.max(1, Math.floor(area * density))
  const boulders: Boulder[] = []

  for (let i = 0; i < attempts; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize
    if (boulders.some((b) => Math.hypot(b.x - x, b.z - z) < MIN_GAP)) continue
    boulders.push({ x, z, y: ground.heightAt(x, z), radius: 0.3 + rng() * 1.0 })
  }
  return boulders
}

/**
 * A boulder's collision shape: one circle is enough for something this round.
 *
 * `topHeight` mirrors how `buildBoulderMeshes` actually draws it (centred at
 * `radius * 0.55` above the ground, rising another `radius * 0.75`) — a small
 * boulder is low enough to climb; a big one keeps acting as a wall, exactly
 * the "if the height allows it" the player already expects from a real rock.
 */
export function boulderObstacle(b: Boulder): CircleObstacle {
  return { x: b.x, z: b.z, radius: b.radius, topHeight: b.radius * 1.3 }
}

/**
 * Where moss grows around a boulder: mostly on the shaded, damp north side
 * (-z in this world, see geo/project.ts) rather than spread evenly, since
 * that lopsidedness is the one thing about moss on a rock everyone already
 * half-knows. `ecology/sites.ts` still filters by the point's own measured
 * moisture, so a boulder sitting on dry high ground grows little regardless.
 */
export function mossSpawnPoints(b: Pick<Boulder, 'x' | 'z' | 'radius'>, count = 6): { x: number; z: number }[] {
  const side = b.radius + 0.25
  const northCount = Math.max(1, Math.round(count * 0.7))
  const southCount = Math.max(1, count - northCount)
  const points: { x: number; z: number }[] = []

  for (let i = 0; i < northCount; i++) {
    const t = Math.PI + (northCount > 1 ? (i / (northCount - 1)) * Math.PI : Math.PI / 2)
    points.push({ x: b.x + Math.cos(t) * side, z: b.z + Math.sin(t) * side })
  }
  for (let i = 0; i < southCount; i++) {
    const t = southCount > 1 ? (i / (southCount - 1)) * Math.PI : Math.PI / 2
    points.push({ x: b.x + Math.cos(t) * side, z: b.z + Math.sin(t) * side })
  }
  return points
}

/**
 * Boulder meshes: an icosahedron roughened the same way a crown is (see
 * world/trees.ts) so it reads as broken rock rather than a bowling ball.
 */
export function buildBoulderMeshes(boulders: Boulder[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'boulders'
  if (boulders.length === 0) return group

  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const bump = 1 + fbm2(x * 1.4 + 9, z * 1.4 + 9, 9, 2) * 0.3
    pos.setXYZ(i, x * bump, y * bump * 0.75, z * bump)
  }
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({ color: 0x6f6b62, roughness: 1 })
  const mesh = new THREE.InstancedMesh(geo, mat, boulders.length)
  const dummy = new THREE.Object3D()
  boulders.forEach((b, i) => {
    dummy.position.set(b.x, b.y + b.radius * 0.55, b.z)
    dummy.rotation.set(0, (b.x + b.z) * 0.7, 0)
    dummy.scale.setScalar(b.radius)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  group.add(mesh)
  return group
}
