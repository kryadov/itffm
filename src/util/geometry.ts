import type { Vec2 } from '../geo/types'

/** Ray casting: a point is inside when a ray from it crosses the ring oddly. */
export function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const zi = poly[i].z
    const xj = poly[j].x
    const zj = poly[j].z
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Splits a polyline so no segment is longer than `step`.
 *
 * OSM maps a straight path with as few vertices as it can get away with, and
 * a ribbon drawn straight between two distant vertices is a chord over
 * rolling ground: it floats over the dips and sinks under the crests. A
 * vertex placed often enough that the ribbon can follow `heightAt` at each
 * one fixes that — see `world/paths.ts`.
 */
export function densify(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points.slice()
  const out: Vec2[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
    }
  }
  return out
}

/** The axis-aligned bounds of a ring, or null if it has no points. */
export function boundsOf(poly: Vec2[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (poly.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, maxX, minZ, maxZ }
}
