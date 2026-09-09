import * as THREE from 'three'
import { buildGround } from '../../src/world/ground'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('buildGround', () => {
  it('follows the terrain height at each vertex', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }
    const mesh = buildGround(slope, 20, 4)
    const pos = mesh.geometry.getAttribute('position')
    let sawHigh = false
    let sawLow = false
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 1) sawHigh = true
      if (pos.getY(i) < -1) sawLow = true
    }
    expect(sawHigh).toBe(true)
    expect(sawLow).toBe(true)
  })

  it('has no vertex colours when no biome function is given', () => {
    const mesh = buildGround(flat, 20, 4)
    expect(mesh.geometry.getAttribute('color')).toBeUndefined()
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(false)
  })

  it('tints dunes and wetland differently from the default forest floor', () => {
    const mesh = buildGround(flat, 20, 8, (x) => (x < 0 ? 'dunes-coast' : x > 5 ? 'wetland' : 'forest-mixed'))
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.vertexColors).toBe(true)
    const pos = mesh.geometry.getAttribute('position')
    const color = mesh.geometry.getAttribute('color')
    let duneColor: [number, number, number] | null = null
    let wetColor: [number, number, number] | null = null
    let forestColor: [number, number, number] | null = null
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const c: [number, number, number] = [color.getX(i), color.getY(i), color.getZ(i)]
      if (x < 0) duneColor = c
      else if (x > 5) wetColor = c
      else forestColor = c
    }
    expect(duneColor).not.toEqual(forestColor)
    expect(wetColor).not.toEqual(forestColor)
    expect(duneColor).not.toEqual(wetColor)
  })

  it('breaks the default forest floor into litter patches, not one flat green', () => {
    const mesh = buildGround(flat, 40, 20, () => 'forest-mixed', 5)
    const color = mesh.geometry.getAttribute('color')
    const seen = new Set<string>()
    for (let i = 0; i < color.count; i++) {
      seen.add(`${color.getX(i).toFixed(4)},${color.getY(i).toFixed(4)},${color.getZ(i).toFixed(4)}`)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('leaves dunes and wetland free of litter mottling', () => {
    const a = buildGround(flat, 20, 8, () => 'dunes-coast', 1)
    const b = buildGround(flat, 20, 8, () => 'dunes-coast', 2)
    const colorA = a.geometry.getAttribute('color')
    const colorB = b.geometry.getAttribute('color')
    for (let i = 0; i < colorA.count; i++) {
      expect(colorA.getX(i)).toBeCloseTo(colorB.getX(i), 5)
      expect(colorA.getY(i)).toBeCloseTo(colorB.getY(i), 5)
      expect(colorA.getZ(i)).toBeCloseTo(colorB.getZ(i), 5)
    }
  })

  it('keeps the litter pattern deterministic for the same seed', () => {
    const a = buildGround(flat, 40, 20, () => 'forest-mixed', 5)
    const b = buildGround(flat, 40, 20, () => 'forest-mixed', 5)
    expect(a.geometry.getAttribute('color').array).toEqual(b.geometry.getAttribute('color').array)
  })

  it('places an off-centre chunk tile at its own origin, sampling the real world point', () => {
    const origin = { x: 1000, z: -500 }
    const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }
    const mesh = buildGround(slope, 20, 4, undefined, 0, origin)
    expect(mesh.position.x).toBe(origin.x)
    expect(mesh.position.z).toBe(origin.z)
    // The vertex at local (0,0) sits at world (1000, -500) — heightAt(1000) = 100.
    const pos = mesh.geometry.getAttribute('position')
    let centreY: number | null = null
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) === 0 && pos.getZ(i) === 0) centreY = pos.getY(i)
    }
    expect(centreY).toBeCloseTo(100, 5)
  })
})
