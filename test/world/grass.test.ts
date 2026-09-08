import * as THREE from 'three'
import { placeGrass, buildGrassMesh } from '../../src/world/grass'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('placeGrass', () => {
  it('is deterministic', () => {
    expect(placeGrass(flat, 20, 5)).toEqual(placeGrass(flat, 20, 5))
  })

  it('gives a different scatter for a different seed', () => {
    expect(placeGrass(flat, 20, 1)).not.toEqual(placeGrass(flat, 20, 2))
  })

  it('grows something at all on flat ground', () => {
    expect(placeGrass(flat, 20, 5).length).toBeGreaterThan(0)
  })

  it('stays within the plot', () => {
    for (const t of placeGrass(flat, 20, 5)) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(20)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(20)
    }
  })

  it('stands on the ground beneath it', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }
    for (const t of placeGrass(slope, 20, 5)) {
      expect(t.y).toBeCloseTo(slope.heightAt(t.x, t.z), 5)
    }
  })

  it('grows thicker where the ground is wetter', () => {
    // A sharp local hollow reads wet by moistureAt; matching flat ground on
    // either side stays dry — the same trick terrain/pits.test.ts uses.
    const hollow: ElevationProvider = {
      heightAt: (x, z) => (Math.hypot(x, z) < 6 ? -1 : 0),
    }
    const wet = placeGrass(hollow, 40, 5).filter((t) => Math.hypot(t.x, t.z) < 4).length
    const dry = placeGrass(flat, 40, 5).filter((t) => Math.hypot(t.x, t.z) < 4).length
    expect(wet).toBeGreaterThan(dry)
  })
})

describe('buildGrassMesh', () => {
  it('gives one instance per blade, three blades per tuft', () => {
    const tufts = placeGrass(flat, 15, 5)
    const group = buildGrassMesh(tufts)
    const mesh = group.children[0] as THREE.InstancedMesh
    expect(mesh.count).toBe(tufts.length * 3)
  })

  it('is empty when there is no grass to draw', () => {
    expect(buildGrassMesh([]).children).toHaveLength(0)
  })
})
