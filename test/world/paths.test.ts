import * as THREE from 'three'
import { buildPathMeshes } from '../../src/world/paths'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const HALF_SIZE = 90

describe('buildPathMeshes', () => {
  it('draws nothing for an empty list', () => {
    expect(buildPathMeshes([], flat, HALF_SIZE).children).toHaveLength(0)
  })

  it('draws a ribbon for a single path', () => {
    const path = [{ x: -10, z: 0 }, { x: 10, z: 0 }]
    const group = buildPathMeshes([path], flat, HALF_SIZE)
    expect(group.children).toHaveLength(1)
    const geo = (group.children[0] as THREE.Mesh).geometry
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('skips a degenerate path with a single point', () => {
    expect(buildPathMeshes([[{ x: 0, z: 0 }]], flat, HALF_SIZE).children).toHaveLength(0)
  })

  it('follows the terrain height under it', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.2 }
    const path = [{ x: -10, z: 0 }, { x: 10, z: 0 }]
    const group = buildPathMeshes([path], slope, HALF_SIZE)
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

  it('cuts a run where the trail leaves the plot, instead of reaching a point far outside it', () => {
    // An edge case that actually happened: a real OSM trail keeps going well
    // past this wood's square, and drawing the ribbon all the way to that
    // far point left it floating off the visible ground entirely.
    const path = [{ x: 0, z: 0 }, { x: 200, z: 0 }]
    const group = buildPathMeshes([path], flat, HALF_SIZE)
    const pos = (group.children[0] as THREE.Mesh).geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(HALF_SIZE + 1)
    }
  })

  it('draws nothing when every point of a path is outside the plot', () => {
    const path = [{ x: 200, z: 0 }, { x: 300, z: 0 }]
    expect(buildPathMeshes([path], flat, HALF_SIZE).children).toHaveLength(0)
  })
})
