import * as THREE from 'three'
import { mulberry32, hashString } from '../util/rng'
import { distanceToPolyline, pointInPolygon } from '../util/geometry'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'
import { classifyWater, streamSurfaceAt, waterLevel, STREAM_WIDTH } from './water'

export interface ReedClump {
  x: number
  z: number
  /** The ground (or the pond bed) the clump stands on. */
  y: number
  /** From `y` to the tallest stem's tip, metres. */
  height: number
  seed: number
}

/** A circle reeds keep out of — the fishing shack, its boat. Structurally
 *  the same as every other module's plain circle obstacle. */
export interface KeepOut {
  x: number
  z: number
  radius: number
}

/** How far out from a pond's bank reeds stand in the shallows, metres. */
export const REED_REACH_INTO_WATER = 1
/** How far up the shore from the water's edge they still grow, metres. */
export const REED_REACH_ONTO_LAND = 0.5

/** Step along a bank between candidate clumps, metres. */
const STEP = 0.35
/** One stretch of bank that either is a reed bed or is not, metres. */
const BED_LENGTH = 5
const POND_BED_CHANCE = 0.55
const STREAM_BED_CHANCE = 0.4
/** Inside a bed, the chance each step grows a clump. */
const CLUMP_CHANCE = 0.85
/** Tallest a stem's tip stands over the water (or the shore), metres. */
const TIP_OVER = [1.0, 2.0] as const
/** Ground this little above a pond's water still counts as its edge, metres. */
const SHORE_TOLERANCE = 0.1
/** How far a pond's shallows reach down under the water, metres of depth. */
const SHALLOWS_DEPTH = 0.55
/** Highest above the water a shore reed still stands, metres. */
const SHORE_RISE = 0.5
/** Spacing of the grid a pond is searched on for its real shoreline, metres. */
const POND_GRID = 0.35
/** Grid points searched per pond, at most — a big lake gets a coarser grid. */
const POND_GRID_BUDGET = 60000
/** Inside a pond bed, the chance each grid point grows a clump. */
const POND_CLUMP_CHANCE = 0.4
/** A ceiling however much bank a wood has: each clump is a dozen instances. */
const MAX_CLUMPS = 3000

/**
 * Reed beds along the wood's water: thick stretches with bare bank between
 * them, the way reed and cattail actually colonise a shore — around a pond
 * in the shallows and on the wet margin at its real waterline, along a
 * stream on its two banks, off the channel itself. Pure and deterministic:
 * one seed, one shoreline.
 *
 * @param keepOut circles nothing grows in — the fishing shack and its boat
 */
export function placeReeds(
  water: Vec2[][],
  ground: ElevationProvider,
  seed: number,
  keepOut: KeepOut[] = [],
): ReedClump[] {
  const out: ReedClump[] = []
  const clear = (x: number, z: number) => keepOut.every((k) => Math.hypot(x - k.x, z - k.z) > k.radius)
  const push = (x: number, z: number, surface: number, rng: () => number): void => {
    const y = ground.heightAt(x, z)
    const tip = Math.max(y, surface) + TIP_OVER[0] + rng() * (TIP_OVER[1] - TIP_OVER[0])
    out.push({ x, z, y, height: tip - y, seed: Math.floor(rng() * 0xffffff) })
  }

  water.forEach((ring, w) => {
    if (out.length >= MAX_CLUMPS) return
    if (ring.length >= 3 && classifyWater(ring) !== 'stream') pondReeds(ring, w)
    else if (ring.length >= 2) streamReeds(ring, w)
  })
  return out

  /**
   * A pond floats at its lowest bank point (`waterLevel`), so on a slope the
   * ground inside the outline stands above the water until well in, and the
   * water that shows can begin metres from the outline. The reeds go where it
   * does: a grid over the pond, keeping points in the shallows or on the wet
   * margin that lie within reach of the real waterline — where the ground
   * crosses the water's level, or the outline itself where the water meets it.
   */
  function pondReeds(ring: Vec2[], w: number): void {
    const level = waterLevel(ring, ground)
    const edge = [...ring, ring[0]]
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of ring) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    minX -= REED_REACH_ONTO_LAND; maxX += REED_REACH_ONTO_LAND
    minZ -= REED_REACH_ONTO_LAND; maxZ += REED_REACH_ONTO_LAND
    const step = Math.max(POND_GRID, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / POND_GRID_BUDGET))
    const wetAt = (x: number, z: number) => ground.heightAt(x, z) <= level + SHORE_TOLERANCE
    const around = (x: number, z: number, r: number, want: boolean): boolean => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const qx = x + Math.cos(a) * r
        const qz = z + Math.sin(a) * r
        if (pointInPolygon(qx, qz, ring) && wetAt(qx, qz) === want) return true
      }
      return false
    }

    for (let gx = Math.floor(minX / step); gx * step <= maxX; gx++) {
      for (let gz = Math.floor(minZ / step); gz * step <= maxZ; gz++) {
        if (out.length >= MAX_CLUMPS) return
        const bed = mulberry32(hashString(`reedbed:${w}:${Math.floor((gx * step) / BED_LENGTH)}:${Math.floor((gz * step) / BED_LENGTH)}:${seed}`))
        if (bed() >= POND_BED_CHANCE) continue
        const rng = mulberry32(hashString(`reed:${w}:${gx}:${gz}:${seed}`))
        if (rng() >= POND_CLUMP_CHANCE) continue
        const x = (gx + 0.2 + rng() * 0.6) * step
        const z = (gz + 0.2 + rng() * 0.6) * step
        const h = ground.heightAt(x, z)
        if (h > level + SHORE_RISE || h < level - SHALLOWS_DEPTH) continue
        const inside = pointInPolygon(x, z, ring)
        const d = distanceToPolyline(x, z, edge)
        let shore: boolean
        if (!inside) {
          // Just past the outline, where the water meets it.
          shore = d <= REED_REACH_ONTO_LAND && around(x, z, d + 0.05, true)
        } else if (h <= level + SHORE_TOLERANCE) {
          // In the shallows: near the outline or near land rising out of the water.
          shore = d <= REED_REACH_INTO_WATER || around(x, z, REED_REACH_INTO_WATER, false)
        } else {
          // On the wet margin above the waterline, close to it.
          shore = around(x, z, REED_REACH_ONTO_LAND, true)
        }
        if (!shore || !clear(x, z)) continue
        push(x, z, level, rng)
      }
    }
  }

  /** Along a stream: on its two banks, off the channel. */
  function streamReeds(line: Vec2[], w: number): void {
    let walked = 0
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 1e-6) continue
      const tx = (b.x - a.x) / len
      const tz = (b.z - a.z) / len
      for (let s = 0; s < len; s += STEP) {
        if (out.length >= MAX_CLUMPS) return
        const along = walked + s
        const bed = mulberry32(hashString(`reedbed:${w}:${Math.floor(along / BED_LENGTH)}:${seed}`))
        if (bed() >= STREAM_BED_CHANCE) continue
        const rng = mulberry32(hashString(`reed:${w}:${Math.round(along / STEP)}:${seed}`))
        if (rng() >= CLUMP_CHANCE) continue
        const side = rng() < 0.5 ? 1 : -1
        const offset = STREAM_WIDTH / 2 - 0.15 + rng() * (REED_REACH_ONTO_LAND + 0.15)
        const slip = (rng() - 0.5) * 0.2
        const x = a.x + tx * s - tz * offset * side + tx * slip
        const z = a.z + tz * s + tx * offset * side + tz * slip
        // Checked against the whole line: a bend can bring the other reach near.
        const d = distanceToPolyline(x, z, line)
        if (d < STREAM_WIDTH / 2 - 0.2 || d > STREAM_WIDTH / 2 + REED_REACH_ONTO_LAND) continue
        if (!clear(x, z)) continue
        push(x, z, streamSurfaceAt(ground, x, z), rng)
      }
      walked += len
    }
  }
}

/** A unit-tall stem, base at the origin, a little thicker at the foot. */
function stemGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.011, 0.017, 1, 5, 1)
  geo.translate(0, 0.5, 0)
  return geo
}

/** A unit-tall leaf: a strip tapering to a point, arching over toward +z. */
function leafGeometry(): THREE.BufferGeometry {
  const n = 5
  const positions: number[] = []
  const index: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const half = 0.038 * (1 - t * 0.9)
    const y = t * (1 - 0.25 * t * t)
    const z = 0.35 * t * t
    positions.push(-half, y, z, half, y, z)
    if (i < n) {
      const k = i * 2
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * Every clump's stems, leaves and cattail heads, instanced — three draw
 * calls for every reed in the wood. Named `reeds` so the static scatter
 * culling (`world/instanceCulling.ts`) and the mine's clearing both see it.
 */
export function buildReedMesh(clumps: ReedClump[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'reeds'
  if (clumps.length === 0) return group

  interface Part { m: THREE.Matrix4 }
  const stems: Part[] = []
  const leaves: Part[] = []
  const heads: Part[] = []
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3()

  for (const c of clumps) {
    const rng = mulberry32(c.seed)
    const stemCount = 6 + Math.floor(rng() * 6)
    for (let k = 0; k < stemCount; k++) {
      const h = c.height * (0.72 + rng() * 0.28)
      dummy.position.set(c.x + (rng() - 0.5) * 0.35, c.y, c.z + (rng() - 0.5) * 0.35)
      dummy.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18)
      dummy.scale.set(1, h, 1)
      dummy.updateMatrix()
      stems.push({ m: dummy.matrix.clone() })
      // A cattail's brown head, on the stem a little below its tip.
      if (rng() < 0.4) {
        up.set(0, h * 0.84, 0).applyEuler(dummy.rotation)
        const head = new THREE.Object3D()
        head.position.copy(dummy.position).add(up)
        head.rotation.copy(dummy.rotation)
        head.updateMatrix()
        heads.push({ m: head.matrix.clone() })
      }
    }
    const leafCount = 5 + Math.floor(rng() * 4)
    for (let k = 0; k < leafCount; k++) {
      dummy.position.set(c.x + (rng() - 0.5) * 0.2, c.y, c.z + (rng() - 0.5) * 0.2)
      dummy.rotation.set(0.1 + rng() * 0.25, rng() * Math.PI * 2, 0)
      dummy.scale.setScalar(c.height * (0.55 + rng() * 0.3))
      dummy.updateMatrix()
      leaves.push({ m: dummy.matrix.clone() })
    }
  }

  const instanced = (geo: THREE.BufferGeometry, color: number, parts: Part[], name: string) => {
    const mesh = new THREE.InstancedMesh(
      geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }), parts.length,
    )
    mesh.name = name
    parts.forEach((p, i) => mesh.setMatrixAt(i, p.m))
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  instanced(stemGeometry(), 0x76843e, stems, 'reed-stems')
  instanced(leafGeometry(), 0x5f7a34, leaves, 'reed-leaves')
  if (heads.length > 0) {
    const head = new THREE.CylinderGeometry(0.028, 0.028, 0.22, 7)
    instanced(head, 0x5a3a20, heads, 'reed-heads')
  }
  return group
}
