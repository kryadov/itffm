import { withPits } from '../../src/terrain/pits'
import { moistureAt } from '../../src/ecology/sites'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 100 }
const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }

describe('withPits', () => {
  it('is deterministic', () => {
    expect(withPits(flat, 7).heightAt(3, 4)).toBe(withPits(flat, 7).heightAt(3, 4))
  })

  it('differs by seed', () => {
    const sample = (seed: number): number[] => {
      const out: number[] = []
      const p = withPits(flat, seed)
      for (let x = -60; x <= 60; x += 4) {
        for (let z = -60; z <= 60; z += 4) out.push(p.heightAt(x, z))
      }
      return out
    }
    expect(sample(1)).not.toEqual(sample(2))
  })

  it('never rises above the source — a pit only digs down', () => {
    const p = withPits(flat, 5)
    for (let i = 0; i < 200; i++) {
      expect(p.heightAt(i * 1.7, -i * 0.9)).toBeLessThanOrEqual(100)
    }
  })

  it('leaves most of the ground untouched — pits are rare, not a texture', () => {
    const p = withPits(flat, 5)
    let untouched = 0
    for (let i = 0; i < 300; i++) {
      if (p.heightAt(i * 3, 0) === 100) untouched++
    }
    expect(untouched / 300).toBeGreaterThan(0.5)
  })

  it('digs at least one real hollow over a wide enough stretch', () => {
    const p = withPits(flat, 5)
    let deepest = 0
    for (let x = -150; x <= 150; x += 0.5) {
      for (let z = -150; z <= 150; z += 0.5) {
        deepest = Math.max(deepest, 100 - p.heightAt(x, z))
      }
    }
    expect(deepest).toBeGreaterThan(0.3)
  })

  it('keeps the broad shape of the source underneath the pits', () => {
    const p = withPits(slope, 5)
    expect(p.heightAt(100, 0) - p.heightAt(-100, 0)).toBeCloseTo(20, 0)
  })

  it('raises moisture inside a pit it happens to dig', () => {
    const p = withPits(flat, 5)
    const dry = moistureAt(flat, 10, 10)
    let sawWetter = false
    for (let x = -150; x <= 150; x += 1) {
      for (let z = -150; z <= 150; z += 1) {
        if (moistureAt(p, x, z) > dry) sawWetter = true
      }
    }
    expect(sawWetter).toBe(true)
  })
})
