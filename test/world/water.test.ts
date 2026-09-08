import * as THREE from 'three'
import { waterLevel, buildWaterMeshes } from '../../src/world/water'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 5 }
const pond = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]

describe('waterLevel', () => {
  it('sits just above the bed', () => {
    expect(waterLevel(pond, flat)).toBeGreaterThan(5)
    expect(waterLevel(pond, flat)).toBeCloseTo(5.15, 5)
  })

  it('follows the lowest of the ring vertices, not an arbitrary one', () => {
    const uneven: ElevationProvider = {
      heightAt: (x, z) => (x === -5 && z === -5 ? 1 : 5),
    }
    expect(waterLevel(pond, uneven)).toBeLessThan(waterLevel(pond, flat))
  })
})

describe('buildWaterMeshes', () => {
  it('draws nothing for an empty list', () => {
    expect(buildWaterMeshes([], flat).children).toHaveLength(0)
  })

  it('draws a surface and a skirt for one body', () => {
    const group = buildWaterMeshes([pond], flat)
    expect(group.children.length).toBeGreaterThanOrEqual(2)
    for (const child of group.children) {
      const mesh = child as THREE.Mesh
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0)
    }
  })

  it('ignores a degenerate ring', () => {
    expect(buildWaterMeshes([[{ x: 0, z: 0 }, { x: 1, z: 1 }]], flat).children).toHaveLength(0)
  })
})
