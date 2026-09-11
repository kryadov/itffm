import type { FootstepSubstrate } from './footsteps'

/**
 * One filtered-noise recipe per substrate for `AudioEngine.footstep()` below —
 * same "short burst, fast decay" shape as `collect()`, just a different
 * filter and length so each reads as a distinct footstep rather than four
 * volumes of the same thud.
 *
 * Live report 2026-09-11: "footsteps sound loud and unatmospheric." Footsteps
 * fire roughly twice a second while walking — unlike `collect()`'s one-off
 * 0.9 peak gain, that repetition means the ear needs a much quieter, tighter
 * sound or it fatigues fast. Two changes from the first pass: peak gains
 * dropped to a fifth-to-a-third of `collect()`'s (0.14-0.22, was 0.32-0.5),
 * and every filter moved to `bandpass` (or stayed narrow-Q `lowpass` for
 * water, where the broadband spray itself needs to survive) with Q raised
 * to ~1-1.3 (was 0.4-0.8) — a higher Q narrows the passband, which is what
 * turns a wash of broadband noise (reads as hiss) into a resonant "tap"
 * (reads as a footfall). Durations also came down (0.09s → 0.04-0.06s) so
 * the decay reads as percussive rather than sustained. Exported (not a
 * private class field) so `test/audio/audio.test.ts` can assert the bounds
 * without an `AudioContext` — whether it actually *sounds* better is a
 * judgment call verified by ear, not something a unit test can prove.
 */
export const FOOTSTEP_PARAMS: Record<
  FootstepSubstrate,
  { filterType: BiquadFilterType; frequency: number; q: number; duration: number; peakGain: number }
> = {
  // Leaf litter: a soft, dull thud — narrow-band around a low tap frequency,
  // nothing broadband or sharp in it.
  litter: { filterType: 'bandpass', frequency: 700, q: 1.1, duration: 0.05, peakGain: 0.22 },
  // Moss: even softer and quieter — a damp cushion, not bare ground.
  moss: { filterType: 'bandpass', frequency: 350, q: 1.0, duration: 0.06, peakGain: 0.14 },
  // Sand: a gritty crunch — higher-band and slightly tighter-Q than litter,
  // but still well below collect()'s gain so the grit doesn't turn harsh.
  sand: { filterType: 'bandpass', frequency: 2400, q: 1.3, duration: 0.04, peakGain: 0.18 },
  // Water: the noise burst carries the splash's own broadband spray, kept as
  // a narrow-Q lowpass rather than bandpass so it stays soft; the short
  // descending tone in footstep() below is what actually reads as "wet".
  water: { filterType: 'lowpass', frequency: 1200, q: 0.7, duration: 0.055, peakGain: 0.16 },
}

/**
 * Sound in the wood. Only the mixer plumbing is ported from race-the-city's
 * own `src/audio/audio.ts` — one `AudioContext`, a single volume-controlled
 * gain node, resumed from a user gesture (autoplay policy). Its music/radio
 * and synthesized-engine content is that project's own game, not this one's
 * (CLAUDE.md's own note on the donor project).
 *
 * No CC0 recording, by choice, for any sound this game has: the whole
 * game draws without pictures (see CLAUDE.md's Conventions) — mushrooms,
 * terrain and litter are all generated from a handful of numbers rather
 * than shipped as assets — and a synthesized "dry cut", footstep thud, or
 * bird chirp (a short filtered noise burst or a couple of oscillator
 * notes, not a sampled recording) is the same idea applied to sound. That
 * only holds for a short, discrete EVENT, though:
 * the broader ambient-sound plan (continuous wind, a babbling stream — see
 * TODO.md's 🔊 section) is a different problem, where synthesis does not
 * read as a real recorded place convincingly the way one sharp noise burst
 * does, and that is where sourcing real CC0 recordings actually belongs.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private volume = 0.7

  /** Create/resume the AudioContext. Call from a click/keydown handler —
   *  browsers refuse to start audio before one. */
  resume(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this.volume
    this.sfxGain.connect(this.ctx.destination)
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.sfxGain) this.sfxGain.gain.value = this.volume
  }

  private noiseBurst(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  /**
   * The one sound this game has: a short, dry snip when a mushroom is
   * severed from the ground (collected or cut — either way the stem parts).
   * A brief burst of high-passed noise reads as a snap rather than a hiss;
   * the sharp attack and fast exponential decay are what make it read as one
   * quick event instead of a texture.
   */
  collect(): void {
    if (!this.ctx || !this.sfxGain || this.volume <= 0) return
    const ctx = this.ctx
    const t = ctx.currentTime

    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBurst(0.09)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 2200
    filter.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.08)

    noise.connect(filter)
    filter.connect(g)
    g.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + 0.09)
  }

  /**
   * One footstep, timed from the camera bob's own rhythm
   * (`audio/footsteps.ts`'s `crossedFootstep`, called once per foot) —
   * `substrate` (`footstepSubstrate()`, from the biome/water under the
   * player) picks which of four short noise bursts plays.
   */
  footstep(substrate: FootstepSubstrate): void {
    if (!this.ctx || !this.sfxGain || this.volume <= 0) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const p = FOOTSTEP_PARAMS[substrate]

    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBurst(p.duration)
    const filter = ctx.createBiquadFilter()
    filter.type = p.filterType
    filter.frequency.value = p.frequency
    filter.Q.value = p.q
    const g = ctx.createGain()
    g.gain.setValueAtTime(p.peakGain, t)
    g.gain.exponentialRampToValueAtTime(0.0008, t + p.duration)

    noise.connect(filter)
    filter.connect(g)
    g.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + p.duration + 0.01)

    if (substrate === 'water') {
      const plop = ctx.createOscillator()
      plop.type = 'sine'
      plop.frequency.setValueAtTime(650, t)
      plop.frequency.exponentialRampToValueAtTime(140, t + 0.07)
      const plopGain = ctx.createGain()
      plopGain.gain.setValueAtTime(0.09, t)
      plopGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.06)
      plop.connect(plopGain)
      plopGain.connect(this.sfxGain)
      plop.start(t)
      plop.stop(t + 0.09)
    }
  }

  /**
   * A short two-note chirp from a bird in the flock (`audio/birdCalls.ts`
   * decides which bird, and this call's own `pan`/`gain`) — another short
   * discrete event, same synthesis-is-honest-here reasoning as `collect()`
   * and `footstep()` above, not the continuous-texture case TODO.md's 🔊
   * section still wants a real recording for. Two quick upward chirps read
   * as a bird call; one long tone reads as a siren.
   */
  birdCall(pan: number, gain: number): void {
    if (!this.ctx || !this.sfxGain || this.volume <= 0 || gain <= 0) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    panner.connect(this.sfxGain)

    const NOTE_GAP = 0.09
    for (const start of [0, NOTE_GAP]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(2600, t + start)
      osc.frequency.exponentialRampToValueAtTime(3400, t + start + 0.04)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.22 * gain, t + start)
      g.gain.exponentialRampToValueAtTime(0.0008, t + start + 0.06)
      osc.connect(g)
      g.connect(panner)
      osc.start(t + start)
      osc.stop(t + start + 0.07)
    }
  }
}
