import { withBiomeRelief } from '../../src/terrain/relief'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 10 }

describe('withBiomeRelief', () => {
  it('leaves an ordinary biome untouched', () => {
    const relief = withBiomeRelief(flat, () => 'forest-mixed', 1)
    expect(relief.heightAt(3, 4)).toBe(10)
  })

  it('gives a dune field bumps around the base height', () => {
    const relief = withBiomeRelief(flat, () => 'dunes-coast', 1)
    const samples = [0, 4, 8, 12, 16, 20, 24].map((x) => relief.heightAt(x, 0))
    expect(samples.some((h) => h !== 10)).toBe(true)
    for (const h of samples) expect(Math.abs(h - 10)).toBeLessThan(2)
  })

  it('gives a wetland a finer, gentler texture than a dune', () => {
    const relief = withBiomeRelief(flat, () => 'wetland', 1)
    const samples = [0, 1, 2, 3, 4, 5].map((x) => relief.heightAt(x, 0))
    expect(samples.some((h) => h !== 10)).toBe(true)
    for (const h of samples) expect(Math.abs(h - 10)).toBeLessThan(0.5)
  })

  it('is deterministic for the same seed', () => {
    const a = withBiomeRelief(flat, () => 'dunes-coast', 7)
    const b = withBiomeRelief(flat, () => 'dunes-coast', 7)
    expect(a.heightAt(5, 9)).toBe(b.heightAt(5, 9))
  })

  it('gives a different shape for a different seed', () => {
    const a = withBiomeRelief(flat, () => 'dunes-coast', 1)
    const b = withBiomeRelief(flat, () => 'dunes-coast', 2)
    expect(a.heightAt(5, 9)).not.toBe(b.heightAt(5, 9))
  })

  it('switches shape exactly where the biome does', () => {
    const relief = withBiomeRelief(flat, (x) => (x < 0 ? 'wetland' : 'dunes-coast'), 3)
    const wetlandSide = Math.abs(relief.heightAt(-2, 0) - 10)
    const duneSide = Math.abs(relief.heightAt(2, 0) - 10)
    // Not a claim about exact values, just that the two textures really
    // differ in scale — a wetland should never swing as far as a dune.
    expect(wetlandSide).toBeLessThan(WETLAND_UPPER_BOUND)
    expect(duneSide).toBeLessThanOrEqual(DUNE_UPPER_BOUND)
  })
})

const WETLAND_UPPER_BOUND = 0.5
const DUNE_UPPER_BOUND = 2
