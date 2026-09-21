import * as THREE from 'three'
import {
  placeRailLine, railHeightAt, buildRailMesh, lineLength, pointAt, stationsFor, portalSites, portalOccupies,
  END_STRAIGHT, PORTAL_MOUTH,
} from '../../src/world/railway'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

/** The angle the line turns through at each of its interior points. */
function turns(pts: { x: number; z: number }[]): number[] {
  const out: number[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x)
    const b = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x)
    let d = b - a
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    out.push(d)
  }
  return out
}

describe('placeRailLine', () => {
  it('is deterministic for the same seed', () => {
    expect(placeRailLine(flat, 90, 5)).toEqual(placeRailLine(flat, 90, 5))
  })

  it('gives a different line for a different seed', () => {
    const a = placeRailLine(flat, 90, 1)
    const b = placeRailLine(flat, 90, 2)
    expect(a.points[1]).not.toEqual(b.points[1])
  })

  it('runs across most of the plot and stays well within its bounds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const line = placeRailLine(flat, 90, seed)
      for (const p of line.points) {
        expect(Math.abs(p.x)).toBeLessThan(90)
        expect(Math.abs(p.z)).toBeLessThan(90)
      }
      const a = line.points[0]
      const b = line.points[line.points.length - 1]
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(90)
    }
  })

  it('has bends: it is not one straight line', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const line = placeRailLine(flat, 90, seed)
      const a = line.points[0]
      const b = line.points[line.points.length - 1]
      const chord = Math.hypot(b.x - a.x, b.z - a.z)
      let farthest = 0
      for (const p of line.points) {
        const across = Math.abs((b.x - a.x) * (a.z - p.z) - (a.x - p.x) * (b.z - a.z)) / chord
        farthest = Math.max(farthest, across)
      }
      expect(farthest, `seed ${seed}`).toBeGreaterThan(4)
    }
  })

  it('takes no bend a small railway could not: no kinks', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const line = placeRailLine(flat, 120, seed)
      for (const d of turns(line.points)) expect(Math.abs(d)).toBeLessThan(0.3)
    }
  })

  it('samples evenly, a few metres apart', () => {
    const line = placeRailLine(flat, 90, 3)
    for (let i = 1; i < line.points.length; i++) {
      const d = Math.hypot(line.points[i].x - line.points[i - 1].x, line.points[i].z - line.points[i - 1].z)
      expect(d).toBeGreaterThan(2)
      expect(d).toBeLessThan(4)
    }
  })

  it('is dead straight for the portal and the platform at each end', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const line = placeRailLine(flat, 120, seed)
      const len = lineLength(line)
      for (const from of [0, len - END_STRAIGHT]) {
        const t0 = pointAt(line, from + 1)
        for (let s = from + 2; s < from + END_STRAIGHT - 2; s += 2) {
          const p = pointAt(line, s)
          expect(Math.hypot(p.tx - t0.tx, p.tz - t0.tz), `seed ${seed} at ${s}`).toBeLessThan(0.02)
        }
      }
    }
  })

  it('follows the real ground height at each point along it', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }
    const line = placeRailLine(slope, 90, 3)
    for (const p of line.points) expect(p.y).toBeCloseTo(slope.heightAt(p.x, p.z), 5)
  })

  it('keeps out of the water when there is a way round', () => {
    // A lake across the middle with a gap at one end: the line has to go through the gap or round it.
    const lake = (x: number, z: number): boolean => Math.abs(z) < 12 && x > -40
    for (const seed of [1, 2, 3, 4]) {
      const line = placeRailLine(flat, 120, seed, lake)
      const wet = line.points.filter((p) => lake(p.x, p.z)).length
      expect(wet, `seed ${seed}`).toBe(0)
    }
  })

  it('keeps clear of the hut in the middle', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const line = placeRailLine(flat, 120, seed)
      for (const p of line.points) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(120 * 0.2)
    }
  })

  it('does not climb a hill it could go round', () => {
    // A ridge that runs across half the plot: a good line finds its way past.
    const ridge: ElevationProvider = { heightAt: (x, z) => (Math.abs(x) < 15 && z > -20 ? 12 : 0) }
    const line = placeRailLine(ridge, 120, 3)
    let steepest = 0
    for (let i = 1; i < line.points.length; i++) steepest = Math.max(steepest, Math.abs(line.points[i].y - line.points[i - 1].y))
    expect(steepest).toBeLessThan(3)
  })
})

describe('placeRailLine at other plot sizes', () => {
  for (const half of [60, 90, 150, 220]) {
    it(`stays inside the plot and leaves room for both platforms at half-size ${half}`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const line = placeRailLine(flat, half, seed)
        for (const p of line.points) {
          expect(Math.abs(p.x)).toBeLessThan(half)
          expect(Math.abs(p.z)).toBeLessThan(half)
        }
        const [a, b] = stationsFor(line)
        expect(a.s1).toBeLessThan(b.s0 - 5)
      }
    })
  }
})

describe('pointAt and railHeightAt', () => {
  const line = { points: [{ x: 0, z: 0, y: 0 }, { x: 10, z: 0, y: 2 }, { x: 10, z: 10, y: 2 }] }

  it('measures along the line, round corners', () => {
    expect(lineLength(line)).toBeCloseTo(20, 6)
    expect(pointAt(line, 5)).toMatchObject({ x: 5, z: 0, tx: 1, tz: 0 })
    expect(pointAt(line, 15).z).toBeCloseTo(5, 6)
    expect(pointAt(line, 15).tz).toBeCloseTo(1, 6)
  })

  it('interpolates the height between two points on a slope, and matches an end exactly', () => {
    expect(railHeightAt(line, 0)).toBe(0)
    expect(railHeightAt(line, 5)).toBeCloseTo(1, 6)
    expect(railHeightAt(line, 20)).toBe(2)
  })

  it('carries straight on past either end', () => {
    const before = pointAt(line, -3)
    expect(before.x).toBeCloseTo(-3, 6)
    expect(before.z).toBeCloseTo(0, 6)
    const after = pointAt(line, 23)
    expect(after.z).toBeCloseTo(13, 6)
    expect(after.x).toBeCloseTo(10, 6)
  })
})

describe('buildRailMesh', () => {
  it('follows a real slope at both ends, not just at its own midpoint', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.2 }
    const line = placeRailLine(slope, 90, 3)
    const group = buildRailMesh(line)
    group.updateMatrixWorld(true)
    const rails = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.geometry.getAttribute('position').count > 0)
    expect(rails.length).toBeGreaterThanOrEqual(3)
    const box = new THREE.Box3().setFromObject(group)
    const ys = line.points.map((p) => p.y)
    expect(box.min.y).toBeLessThan(Math.min(...ys) + 0.1)
    expect(box.max.y).toBeGreaterThan(Math.max(...ys))
  })

  it('is a few draw calls, however long the line', () => {
    const group = buildRailMesh(placeRailLine(flat, 200, 4))
    let meshes = 0
    group.traverse((o) => { if (o instanceof THREE.Mesh) meshes++ })
    expect(meshes).toBeLessThanOrEqual(5)
  })

  it('lays its rails along the bends: every point of the line has rail within a step of it', () => {
    const line = placeRailLine(flat, 120, 2)
    const group = buildRailMesh(line)
    const rail = group.children[0] as THREE.Mesh
    const pos = rail.geometry.getAttribute('position')
    for (const p of line.points) {
      let nearest = Infinity
      for (let i = 0; i < pos.count; i++) nearest = Math.min(nearest, Math.hypot(pos.getX(i) - p.x, pos.getZ(i) - p.z))
      expect(nearest).toBeLessThan(0.6)
    }
  })
})

describe('stations and portals sit on the line', () => {
  it('has a portal mouth at each end, a platform beyond it, clear of the mound', () => {
    const line = placeRailLine(flat, 120, 3)
    const len = lineLength(line)
    const sites = portalSites(line)
    expect(sites).toHaveLength(2)
    const a = pointAt(line, PORTAL_MOUTH)
    expect(sites[0]).toMatchObject({ x: a.x, z: a.z })
    // into the hill is away from the line
    expect(sites[0].ox * a.tx + sites[0].oz * a.tz).toBeCloseTo(-1, 6)
    const b = pointAt(line, len - PORTAL_MOUTH)
    expect(sites[1].ox * b.tx + sites[1].oz * b.tz).toBeCloseTo(1, 6)
    const [sa, sb] = stationsFor(line)
    expect(sa.s0).toBeGreaterThan(PORTAL_MOUTH + 2)
    expect(sb.s1).toBeLessThan(len - PORTAL_MOUTH - 2)
    expect(portalOccupies(line, sites[0].x + sites[0].ox * 2, sites[0].z + sites[0].oz * 2)).toBe(true)
    expect(portalOccupies(line, a.x + a.tx * 20, a.z + a.tz * 20)).toBe(false)
  })
})

describe('the ground under a line on real terrain', () => {
  it('is followed by the sampled heights, every point', () => {
    const terrain = proceduralTerrain(4)
    const line = placeRailLine(terrain, 100, 7)
    for (const p of line.points) expect(p.y).toBeCloseTo(terrain.heightAt(p.x, p.z), 6)
  })
})
