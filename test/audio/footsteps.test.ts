import { crossedFootstep, footstepSubstrate } from '../../src/audio/footsteps'

describe('crossedFootstep', () => {
  it('is false while bobPhase stays within the same half-cycle', () => {
    expect(crossedFootstep(0.1, 0.5)).toBe(false)
  })

  it('is true the instant bobPhase crosses a multiple of PI', () => {
    expect(crossedFootstep(Math.PI - 0.1, Math.PI + 0.1)).toBe(true)
  })

  it('fires twice per full 2*PI cycle — once per foot', () => {
    let prev = 0
    let steps = 0
    const samples = 200
    for (let i = 1; i <= samples; i++) {
      const curr = (i / samples) * Math.PI * 2
      if (crossedFootstep(prev, curr)) steps++
      prev = curr
    }
    expect(steps).toBe(2)
  })

  it('is false when standing still (phase unchanged)', () => {
    expect(crossedFootstep(1.2, 1.2)).toBe(false)
  })

  it('handles a resumed walk crossing several multiples of PI in one frame', () => {
    expect(crossedFootstep(0, Math.PI * 2.5)).toBe(true)
  })
})

describe('footstepSubstrate', () => {
  it('is water when standing near or in a water body, regardless of biome', () => {
    expect(footstepSubstrate('forest-mixed', true)).toBe('water')
    expect(footstepSubstrate('dunes-coast', true)).toBe('water')
  })

  it('is sand on the dunes biome', () => {
    expect(footstepSubstrate('dunes-coast', false)).toBe('sand')
  })

  it('is moss on the wetland biome', () => {
    expect(footstepSubstrate('wetland', false)).toBe('moss')
  })

  it('is litter everywhere else', () => {
    expect(footstepSubstrate('forest-mixed', false)).toBe('litter')
    expect(footstepSubstrate('forest-coniferous', false)).toBe('litter')
    expect(footstepSubstrate('meadow-scrub', false)).toBe('litter')
  })
})
