import { decodeTerrarium, lonLatToTilePixel, sampleGrid } from '../../src/terrain/terrarium'
import { gridProviderFromArray } from '../../src/terrain/gridded'

describe('decodeTerrarium', () => {
  it('decodes sea level', () => {
    // Terrarium stores height + 32768 across r*256 + g + b/256.
    expect(decodeTerrarium(128, 0, 0)).toBeCloseTo(0)
  })

  it('decodes a positive height', () => {
    expect(decodeTerrarium(128, 100, 0)).toBeCloseTo(100)
  })

  it('decodes below sea level', () => {
    expect(decodeTerrarium(127, 156, 0)).toBeCloseTo(-100)
  })

  it('uses blue as the fraction', () => {
    expect(decodeTerrarium(128, 0, 128)).toBeCloseTo(0.5)
  })
})

describe('lonLatToTilePixel', () => {
  it('puts null island at the middle of the world', () => {
    const { px, py } = lonLatToTilePixel(0, 0, 0)
    expect(px).toBeCloseTo(128)
    expect(py).toBeCloseTo(128)
  })

  it('grows eastwards', () => {
    expect(lonLatToTilePixel(0, 10, 5).px).toBeGreaterThan(lonLatToTilePixel(0, 0, 5).px)
  })

  it('grows southwards', () => {
    expect(lonLatToTilePixel(-10, 0, 5).py).toBeGreaterThan(lonLatToTilePixel(10, 0, 5).py)
  })

  it('doubles with every zoom level', () => {
    const a = lonLatToTilePixel(50, 30, 4).px
    const b = lonLatToTilePixel(50, 30, 5).px
    expect(b).toBeCloseTo(a * 2)
  })
})

describe('sampleGrid', () => {
  const grid = new Float32Array([0, 10, 20, 30])

  it('reads a node exactly', () => {
    expect(sampleGrid(grid, 2, 2, 0, 0)).toBe(0)
    expect(sampleGrid(grid, 2, 2, 1, 1)).toBe(30)
  })

  it('interpolates between nodes', () => {
    expect(sampleGrid(grid, 2, 2, 0.5, 0)).toBeCloseTo(5)
  })

  it('clamps outside the grid', () => {
    expect(sampleGrid(grid, 2, 2, -5, -5)).toBe(0)
    expect(sampleGrid(grid, 2, 2, 99, 99)).toBe(30)
  })
})

describe('gridProviderFromArray', () => {
  it('reproduces the stored surface at its nodes', () => {
    const p = gridProviderFromArray([0, 10, 20, 30], 10, 1)
    expect(p.heightAt(-10, -10)).toBeCloseTo(0)
    expect(p.heightAt(10, 10)).toBeCloseTo(30)
  })

  it('interpolates between them', () => {
    expect(gridProviderFromArray([0, 10, 20, 30], 10, 1).heightAt(0, -10)).toBeCloseTo(5)
  })

  it('clamps beyond the edge', () => {
    expect(gridProviderFromArray([0, 10, 20, 30], 10, 1).heightAt(-100, -100)).toBeCloseTo(0)
  })
})
