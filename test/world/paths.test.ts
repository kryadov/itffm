import * as THREE from 'three'
import { buildPathMeshes } from '../../src/world/paths'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('buildPathMeshes', () => {
  it('draws nothing for an empty list', () => {
    expect(buildPathMeshes([], flat).children).toHaveLength(0)
  })

  it('draws a ribbon for a single path', () => {
    const path = [{ x: -10, z: 0 }, { x: 10, z: 0 }]
    const group = buildPathMeshes([path], flat)
    expect(group.children).toHaveLength(1)
    const geo = (group.children[0] as THREE.Mesh).geometry
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('skips a degenerate path with a single point', () => {
    expect(buildPathMeshes([[{ x: 0, z: 0 }]], flat).children).toHaveLength(0)
  })

  it('follows the terrain height under it', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.2 }
    const path = [{ x: -10, z: 0 }, { x: 10, z: 0 }]
    const group = buildPathMeshes([path], slope)
    const pos = (group.children[0] as THREE.Mesh).geometry.getAttribute('position')
    let sawHigh = false
    let sawLow = false
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 1) sawHigh = true
      if (pos.getY(i) < -1) sawLow = true
    }
    expect(sawHigh).toBe(true)
    expect(sawLow).toBe(true)
  })
})
