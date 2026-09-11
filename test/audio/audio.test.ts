import { FOOTSTEP_PARAMS } from '../../src/audio/audio'
import type { FootstepSubstrate } from '../../src/audio/footsteps'

// `AudioEngine.footstep()` itself needs a real `AudioContext`/`BiquadFilterNode`
// (there is none in this project's `node` test environment — see
// vitest.config.ts — and no existing test in test/audio/ mocks one; both
// footsteps.test.ts and birdCalls.test.ts only exercise the pure helpers).
// So these tests cover what can actually be asserted without a browser:
// the synthesis recipe `footstep()` reads its parameters from stays within
// a sane, non-fatiguing range for every substrate. Whether the rebalanced
// footsteps actually *sound* better is a judgment call, verified by ear in
// the running game — not something a unit test can prove either way.
const SUBSTRATES: FootstepSubstrate[] = ['litter', 'moss', 'sand', 'water']

describe('FOOTSTEP_PARAMS', () => {
  it('has a recipe for every substrate', () => {
    for (const s of SUBSTRATES) expect(FOOTSTEP_PARAMS[s]).toBeDefined()
  })

  it('keeps peak gain well below collect()\'s one-off 0.9 — footsteps repeat constantly', () => {
    for (const s of SUBSTRATES) {
      expect(FOOTSTEP_PARAMS[s].peakGain).toBeGreaterThan(0)
      expect(FOOTSTEP_PARAMS[s].peakGain).toBeLessThanOrEqual(0.3)
    }
  })

  it('stays short — a percussive tap, not a sustained texture', () => {
    for (const s of SUBSTRATES) {
      expect(FOOTSTEP_PARAMS[s].duration).toBeGreaterThan(0)
      expect(FOOTSTEP_PARAMS[s].duration).toBeLessThanOrEqual(0.09)
    }
  })

  it('uses a moderate-to-high Q so the noise reads as a narrow-band tap, not broadband hiss', () => {
    for (const s of SUBSTRATES) {
      expect(FOOTSTEP_PARAMS[s].q).toBeGreaterThanOrEqual(0.5)
      expect(FOOTSTEP_PARAMS[s].q).toBeLessThanOrEqual(2)
    }
  })

  it('keeps filter cutoffs within the audible thud/crunch range', () => {
    for (const s of SUBSTRATES) {
      expect(FOOTSTEP_PARAMS[s].frequency).toBeGreaterThan(0)
      expect(FOOTSTEP_PARAMS[s].frequency).toBeLessThanOrEqual(4000)
    }
  })

  it('gives sand and litter a higher passband than moss — grit reads brighter than a damp cushion', () => {
    expect(FOOTSTEP_PARAMS.sand.frequency).toBeGreaterThan(FOOTSTEP_PARAMS.moss.frequency)
    expect(FOOTSTEP_PARAMS.litter.frequency).toBeGreaterThan(FOOTSTEP_PARAMS.moss.frequency)
  })

  it('makes moss the quietest substrate — a damp cushion, not bare ground', () => {
    for (const s of SUBSTRATES) {
      if (s === 'moss') continue
      expect(FOOTSTEP_PARAMS.moss.peakGain).toBeLessThanOrEqual(FOOTSTEP_PARAMS[s].peakGain)
    }
  })
})
