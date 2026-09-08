import * as THREE from 'three'
import {
  waterLevel, buildWaterMeshes, classifyWater, findWaterfall, placeSprings, buildSpringMeshes,
} from '../../src/world/water'
import { mulberry32 } from '../../src/util/rng'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 5 }
const pond = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]
const stream = [{ x: -20, z: 0 }, { x: -5, z: 1 }, { x: 10, z: -1 }, { x: 25, z: 0 }]

describe('classifyWater', () => {
  it('reads a closed ring as a pond', () => {
    expect(classifyWater([...pond, pond[0]])).toBe('pond')
  })

  it('reads an open way as a stream', () => {
    expect(classifyWater(stream)).toBe('stream')
  })
})

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

describe('findWaterfall', () => {
  it('finds nothing along flat ground', () => {
    expect(findWaterfall(stream, flat)).toBeNull()
  })

  it('picks the steepest drop, not the first one', () => {
    const ground: ElevationProvider = {
      heightAt: (x) => {
        if (x <= -20) return 10
        if (x <= -5) return 8 // a 2m drop
        if (x <= 10) return 3 // a 5m drop — this is the real waterfall
        return 3
      },
    }
    const fall = findWaterfall(stream, ground)
    expect(fall).not.toBeNull()
    expect(fall!.drop).toBeCloseTo(5, 5)
    expect(fall!.a).toEqual(stream[1])
    expect(fall!.b).toEqual(stream[2])
  })
})

describe('buildWaterMeshes', () => {
  it('draws nothing for an empty list', () => {
    expect(buildWaterMeshes([], flat).group.children).toHaveLength(0)
  })

  it('draws a surface and a skirt for one pond', () => {
    const water = buildWaterMeshes([pond], flat)
    expect(water.group.children.length).toBeGreaterThanOrEqual(2)
    for (const child of water.group.children) {
      const mesh = child as THREE.Mesh
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0)
    }
  })

  it('draws a rippling ribbon for a stream, with no pond skirt', () => {
    const water = buildWaterMeshes([stream], flat)
    expect(water.group.children.length).toBeGreaterThanOrEqual(1)
    expect(() => water.update(0.4)).not.toThrow()
  })

  it('adds a waterfall mesh where a stream drops steeply', () => {
    const ground: ElevationProvider = {
      heightAt: (x) => (x <= -5 ? 10 : 2),
    }
    const water = buildWaterMeshes([stream], ground)
    // ribbon + waterfall sheet, at least
    expect(water.group.children.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores a degenerate ring', () => {
    expect(buildWaterMeshes([[{ x: 0, z: 0 }, { x: 1, z: 1 }]], flat).group.children).toHaveLength(0)
  })
})

describe('placeSprings', () => {
  it('gives nothing when there is no water', () => {
    expect(placeSprings([], 90, mulberry32(1), 5)).toHaveLength(0)
  })

  it('is deterministic for the same seed', () => {
    const a = placeSprings([pond], 90, mulberry32(7), 4)
    const b = placeSprings([pond], 90, mulberry32(7), 4)
    expect(a).toEqual(b)
  })

  it('never places a spring outside the plot', () => {
    const springs = placeSprings([pond], 90, mulberry32(3), 30)
    for (const s of springs) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(90)
    }
  })
})

describe('buildSpringMeshes', () => {
  it('draws one mesh per spring and animates without throwing', () => {
    const springs = placeSprings([pond], 90, mulberry32(2), 3)
    const fx = buildSpringMeshes(springs, flat)
    expect(fx.group.children).toHaveLength(springs.length)
    expect(() => fx.update(1.2)).not.toThrow()
  })
})
