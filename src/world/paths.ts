import * as THREE from 'three'
import { densify } from '../util/geometry'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** Half the ribbon's width, metres — a footpath, not a road. */
const HALF_WIDTH = 0.6
/** How far apart ribbon vertices sit at most, metres — dense enough that the
 *  ribbon follows the ground rather than cutting a chord over it (see
 *  `densify`). */
const RIBBON_STEP = 4
/** Clears the ground mesh so the two surfaces never z-fight. */
const LIFT = 0.03

/** Left/right edge points for each vertex of a polyline, mitred at joints so
 *  consecutive segments share their joint vertices. */
function offsetsForPolyline(points: Vec2[], halfWidth: number): { left: Vec2; right: Vec2 }[] {
  if (points.length < 2) return []
  const seg: Vec2[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dz = points[i + 1].z - points[i].z
    const len = Math.hypot(dx, dz) || 1
    seg.push({ x: -dz / len, z: dx / len })
  }

  const out: { left: Vec2; right: Vec2 }[] = []
  for (let j = 0; j < points.length; j++) {
    let mx: number
    let mz: number
    if (j === 0) {
      ;({ x: mx, z: mz } = seg[0])
    } else if (j === points.length - 1) {
      ;({ x: mx, z: mz } = seg[seg.length - 1])
    } else {
      const a = seg[j - 1]
      const b = seg[j]
      const sx = a.x + b.x
      const sz = a.z + b.z
      const slen = Math.hypot(sx, sz)
      if (slen < 1e-4) {
        ;({ x: mx, z: mz } = b)
      } else {
        // Scaled so the ribbon keeps its width across the joint; capped so a
        // hairpin turn does not spike the offset out to infinity.
        mx = sx / slen
        mz = sz / slen
        const cos = mx * b.x + mz * b.z
        const scale = 1 / Math.max(cos, 0.25)
        mx *= scale
        mz *= scale
      }
    }
    const p = points[j]
    out.push({
      left: { x: p.x + mx * halfWidth, z: p.z + mz * halfWidth },
      right: { x: p.x - mx * halfWidth, z: p.z - mz * halfWidth },
    })
  }
  return out
}

/**
 * A packed-dirt ribbon for every trail in the wood, following the ground.
 *
 * Ported from race-the-city's world/roads.ts (`offsetsForPolyline`,
 * `densify`) with the road-specific parts dropped — a forest trail has one
 * width and one surface, not a hierarchy of motorway down to service road.
 * A trail is not decoration: it is how the player enters the wood and how
 * they find their way back out of it (see TODO.md).
 *
 * @param halfSize the plot's own half-extent — an OSM trail routinely
 *   continues past this wood's square, and a ribbon reaching a point out
 *   there sits far beyond the ground mesh, at whatever height the elevation
 *   provider clamps to at its edge: a thin ribbon floating in empty space,
 *   not on the ground anyone can see. Runs are cut wherever they leave the
 *   square instead.
 */
export function buildPathMeshes(paths: Vec2[][], ground: ElevationProvider, halfSize: number): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'paths'

  const inside = (p: Vec2): boolean => Math.abs(p.x) <= halfSize && Math.abs(p.z) <= halfSize

  const positions: number[] = []
  for (const path of paths) {
    const dense = densify(path, RIBBON_STEP)
    const runs: Vec2[][] = []
    let current: Vec2[] = []
    for (const p of dense) {
      if (inside(p)) current.push(p)
      else if (current.length > 0) {
        runs.push(current)
        current = []
      }
    }
    if (current.length > 0) runs.push(current)

    for (const run of runs) {
      const sides = offsetsForPolyline(run, HALF_WIDTH)
      for (let j = 0; j < sides.length - 1; j++) {
        const l0 = sides[j].left
        const r0 = sides[j].right
        const l1 = sides[j + 1].left
        const r1 = sides[j + 1].right
        const y = (p: Vec2): number => ground.heightAt(p.x, p.z) + LIFT
        positions.push(l0.x, y(l0), l0.z, l1.x, y(l1), l1.z, r1.x, y(r1), r1.z)
        positions.push(l0.x, y(l0), l0.z, r1.x, y(r1), r1.z, r0.x, y(r0), r0.z)
      }
    }
  }
  if (positions.length === 0) return group

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x8a6f4e, roughness: 1, side: THREE.DoubleSide }),
  )
  group.add(mesh)
  return group
}
