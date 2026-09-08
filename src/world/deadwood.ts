import * as THREE from 'three'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'

/** Structurally identical to game/player.ts's Obstacle — world/ stays below
 *  game/ in the dependency order, so the shape is repeated rather than imported. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
}

export interface Log {
  x: number
  z: number
  /** Ground height under the log's centre. */
  y: number
  /** Heading the log lies along, radians: 0 along +x, π/2 along +z. */
  angle: number
  length: number
  radius: number
}

export interface Stump {
  x: number
  z: number
  y: number
  radius: number
  height: number
}

const MIN_GAP = 3

/** Scattered candidate points, spaced apart, each stood on the ground beneath it. */
function scatter(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density: number,
): { x: number; z: number; y: number }[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const attempts = Math.max(1, Math.floor(area * density))
  const placed: { x: number; z: number; y: number }[] = []

  for (let i = 0; i < attempts; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_GAP)) continue
    placed.push({ x, z, y: ground.heightAt(x, z) })
  }
  return placed
}

/**
 * Scatters fallen trunks across the plot.
 *
 * Existing, not merely decorative: `ecology/sites.ts` grows real deadwood
 * mushrooms along these, in place of the old guess that anything near a
 * standing trunk might be rotting wood. Without an actual log to stand on, an
 * oyster mushroom had nothing to grow from but bare ground.
 *
 * @param density logs per square metre before the spacing cull
 */
export function placeLogs(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density = 0.0008,
): Log[] {
  const scattered = scatter(ground, halfSize, seed, density)
  const rng = mulberry32(seed + 97)
  return scattered.map((p) => ({
    ...p,
    angle: rng() * Math.PI * 2,
    length: 2 + rng() * 4,
    radius: 0.1 + rng() * 0.2,
  }))
}

/** Scatters the stubs left where a trunk has broken off close to the ground. */
export function placeStumps(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density = 0.0004,
): Stump[] {
  const scattered = scatter(ground, halfSize, seed, density)
  const rng = mulberry32(seed + 53)
  return scattered.map((p) => ({
    ...p,
    radius: 0.15 + rng() * 0.2,
    height: 0.25 + rng() * 0.4,
  }))
}

/**
 * A log's collision shape as a chain of circles along its length — a cheap
 * stand-in for a capsule that reuses the same point-and-radius `Obstacle`
 * `stepPlayer` already knows how to slide around, so a fat trunk on the
 * ground blocks the way exactly like a standing tree does.
 */
export function logObstacles(log: Log, beadSpacing = 1): CircleObstacle[] {
  const beads: CircleObstacle[] = []
  const count = Math.max(1, Math.round(log.length / beadSpacing))
  const dx = Math.cos(log.angle)
  const dz = Math.sin(log.angle)
  for (let i = 0; i <= count; i++) {
    const t = (i / count - 0.5) * log.length
    beads.push({ x: log.x + dx * t, z: log.z + dz * t, radius: log.radius })
  }
  return beads
}

/**
 * Where mushrooms grow along a log: spaced out along its length, offset to
 * the side rather than sitting on its centreline — a shelf fungus grows out
 * of the bark, not through the pith.
 */
export function logSpawnPoints(
  log: Log,
  spacing = 1.2,
  offset = 0.3,
): { x: number; z: number }[] {
  const dx = Math.cos(log.angle)
  const dz = Math.sin(log.angle)
  // Perpendicular to the log's own heading.
  const px = -dz
  const pz = dx
  const side = offset + log.radius

  const points: { x: number; z: number }[] = []
  const count = Math.max(1, Math.floor(log.length / spacing))
  for (let i = 0; i <= count; i++) {
    const t = (i / count - 0.5) * log.length
    const face = i % 2 === 0 ? 1 : -1
    points.push({
      x: log.x + dx * t + px * side * face,
      z: log.z + dz * t + pz * side * face,
    })
  }
  return points
}

/** Meshes for fallen logs and stumps, instanced — the wood can hold dozens without a new draw call each. */
export function buildDeadwoodMeshes(logs: Log[], stumps: Stump[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'deadwood'
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 1 })
  const dummy = new THREE.Object3D()

  if (logs.length > 0) {
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), mat, logs.length)
    const up = new THREE.Vector3(0, 1, 0)
    logs.forEach((log, i) => {
      // A cylinder's own axis is Y; rotate that to the log's horizontal
      // heading via a quaternion rather than an Euler triple, since two
      // non-zero Euler components are easy to apply in the wrong order.
      const dir = new THREE.Vector3(Math.cos(log.angle), 0, Math.sin(log.angle))
      dummy.quaternion.setFromUnitVectors(up, dir)
      dummy.position.set(log.x, log.y + log.radius, log.z)
      dummy.scale.set(log.radius, log.length, log.radius)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    group.add(mesh)
  }

  if (stumps.length > 0) {
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1, 1, 10), mat, stumps.length)
    stumps.forEach((s, i) => {
      dummy.position.set(s.x, s.y + s.height / 2, s.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(s.radius, s.height, s.radius)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    group.add(mesh)
  }

  return group
}
