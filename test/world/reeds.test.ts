import * as THREE from 'three'
import { placeReeds, buildReedMesh, REED_REACH_INTO_WATER, REED_REACH_ONTO_LAND } from '../../src/world/reeds'
import { waterLevel, STREAM_WIDTH } from '../../src/world/water'
import { distanceToPolyline, pointInPolygon } from '../../src/util/geometry'
import type { Vec2 } from '../../src/geo/types'

const square = (cx: number, cz: number, r: number): Vec2[] => [
  { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r }, { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
]
const pond = square(0, 0, 15)
const stream: Vec2[] = [{ x: 40, z: 0 }, { x: 60, z: 5 }, { x: 80, z: 0 }, { x: 100, z: 8 }]
const hill = { heightAt: (x: number, z: number) => 2 + 0.03 * x + 0.01 * z }

describe('placeReeds', () => {
  it('is deterministic, and a different seed grows different beds', () => {
    expect(placeReeds([pond], hill, 5)).toEqual(placeReeds([pond], hill, 5))
    expect(placeReeds([pond], hill, 6)).not.toEqual(placeReeds([pond], hill, 5))
  })

  it('grows along a pond\'s bank, a little into the water or onto the shore, not out in the middle', () => {
    const reeds = placeReeds([pond], { heightAt: () => 2 }, 5)
    expect(reeds.length).toBeGreaterThan(20)
    const edge = [...pond, pond[0]]
    let inWater = 0
    for (const r of reeds) {
      const d = distanceToPolyline(r.x, r.z, edge)
      const wet = pointInPolygon(r.x, r.z, pond)
      if (wet) inWater++
      expect(d).toBeLessThanOrEqual(wet ? REED_REACH_INTO_WATER + 1e-9 : REED_REACH_ONTO_LAND + 1e-9)
    }
    expect(inWater).toBeGreaterThan(0)
  })

  it('grows in beds with gaps between them, not an even hedge all round', () => {
    const reeds = placeReeds([pond], hill, 5)
    // Walk the bank in 2 m steps: some stretches are thick, some bare.
    const edge = [...pond, pond[0]]
    let bare = 0
    let thick = 0
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      for (let s = 1; s < len; s += 2) {
        const x = a.x + ((b.x - a.x) * s) / len
        const z = a.z + ((b.z - a.z) * s) / len
        const n = reeds.filter((r) => Math.hypot(r.x - x, r.z - z) < 1.2).length
        if (n === 0) bare++
        if (n >= 2) thick++
      }
    }
    expect(bare).toBeGreaterThan(2)
    expect(thick).toBeGreaterThan(2)
  })

  // In the game a pond floats at its lowest bank point, so on a slope the
  // ground inside the outline can stand above the water, and the water only
  // shows further in. Reeds belong at the water that shows.
  it('finds the shoreline that actually shows on a slope, not the outline', () => {
    const slope = { heightAt: (x: number) => 0.08 * x }
    const level = waterLevel(pond, slope)
    const reeds = placeReeds([pond], slope, 5)
    expect(reeds.length).toBeGreaterThan(10)
    for (const r of reeds) {
      expect(slope.heightAt(r.x)).toBeLessThanOrEqual(level + 0.6)
      expect(slope.heightAt(r.x)).toBeGreaterThan(level - REED_REACH_INTO_WATER * 0.08 - 0.5)
    }
  })

  it('stands on the bed and rises well clear of the water surface', () => {
    const level = waterLevel(pond, hill)
    for (const r of placeReeds([pond], hill, 5)) {
      expect(r.y).toBeCloseTo(hill.heightAt(r.x, r.z), 5)
      expect(r.y + r.height).toBeGreaterThan(Math.max(level, r.y) + 0.8)
    }
  })

  it('keeps to a stream\'s banks, off its channel', () => {
    const reeds = placeReeds([stream], hill, 5)
    expect(reeds.length).toBeGreaterThan(3)
    for (const r of reeds) {
      const d = distanceToPolyline(r.x, r.z, stream)
      expect(d).toBeGreaterThanOrEqual(STREAM_WIDTH / 2 - 0.2)
      expect(d).toBeLessThanOrEqual(STREAM_WIDTH / 2 + REED_REACH_ONTO_LAND + 1e-9)
    }
  })

  it('leaves room where it is told to (the fishing shack, its boat)', () => {
    const keepOut = [{ x: 15, z: 0, radius: 4 }]
    for (const r of placeReeds([pond], hill, 5, keepOut)) expect(Math.hypot(r.x - 15, r.z)).toBeGreaterThan(4)
  })

  it('gives nothing for no water', () => {
    expect(placeReeds([], hill, 5)).toEqual([])
  })
})

describe('buildReedMesh', () => {
  it('is one group of instanced stems, leaves and cattail heads, named for scatter culling', () => {
    const g = buildReedMesh(placeReeds([pond], hill, 5))
    expect(g.name).toBe('reeds')
    const meshes = g.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh)
    expect(meshes.length).toBeGreaterThanOrEqual(3)
    for (const m of meshes) expect(m.count).toBeGreaterThan(0)
    const [stems, , heads] = meshes
    expect(heads.count).toBeLessThan(stems.count)
  })

  it('builds an empty group for no reeds', () => {
    expect(buildReedMesh([]).children).toHaveLength(0)
  })
})
