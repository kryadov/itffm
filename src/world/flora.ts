import * as THREE from 'three'
import { mulberry32, pickWeighted } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'

export type FloraKind = 'flower' | 'fern'

export interface Flora {
  x: number
  z: number
  /** Ground height at this point. */
  y: number
  kind: FloraKind
  scale: number
  rotationY: number
}

/**
 * Scatters low ground cover with no ecology and no collision of its own —
 * flowers and fern exist purely to give the eye something to search through.
 * Without this layer a mushroom either sits in plain view or it doesn't;
 * searching degenerates into "visible or not" instead of actually looking.
 *
 * @param density plants per square metre
 */
export function placeFlora(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  density = 0.01,
): Flora[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const count = Math.max(1, Math.floor(area * density))
  const plants: Flora[] = []

  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize
    const kind = pickWeighted(rng, ['fern', 'flower'] as const, (k) => (k === 'fern' ? 0.65 : 0.35)) ?? 'fern'
    plants.push({
      x,
      z,
      y: ground.heightAt(x, z),
      kind,
      scale: 0.6 + rng() * 0.8,
      rotationY: rng() * Math.PI * 2,
    })
  }
  return plants
}

const FLOWER_COLORS = [0xe8d84a, 0xe8eef0, 0xc871b0]

/** Flora meshes: two instanced batches, one per kind, cheap regardless of count. */
export function buildFloraMeshes(plants: Flora[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'flora'
  const ferns = plants.filter((p) => p.kind === 'fern')
  const flowers = plants.filter((p) => p.kind === 'flower')
  const dummy = new THREE.Object3D()

  if (ferns.length > 0) {
    // A few flat blades fanning from a point, like a squashed low cone.
    const geo = new THREE.ConeGeometry(0.22, 0.3, 5, 1)
    geo.translate(0, 0.15, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1, side: THREE.DoubleSide })
    const mesh = new THREE.InstancedMesh(geo, mat, ferns.length)
    ferns.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(0, f.rotationY, 0)
      dummy.scale.setScalar(f.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    group.add(mesh)
  }

  if (flowers.length > 0) {
    const geo = new THREE.SphereGeometry(0.06, 5, 4)
    geo.translate(0, 0.22, 0)
    const byColor = new Map<number, Flora[]>()
    for (const f of flowers) {
      // A handful of fixed colours, chosen by position so the same spot always
      // grows the same colour — deterministic without carrying a colour field.
      const color = FLOWER_COLORS[Math.floor(Math.abs(f.x * 3 + f.z * 7)) % FLOWER_COLORS.length]
      const bucket = byColor.get(color)
      if (bucket) bucket.push(f)
      else byColor.set(color, [f])
    }
    for (const [color, group_] of byColor) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
      const mesh = new THREE.InstancedMesh(geo, mat, group_.length)
      group_.forEach((f, i) => {
        dummy.position.set(f.x, f.y, f.z)
        dummy.rotation.set(0, f.rotationY, 0)
        dummy.scale.setScalar(f.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      group.add(mesh)
    }
  }

  return group
}
