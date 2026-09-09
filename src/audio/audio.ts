/**
 * Sound in the wood. Only the mixer plumbing is ported from race-the-city's
 * own `src/audio/audio.ts` — one `AudioContext`, a single volume-controlled
 * gain node, resumed from a user gesture (autoplay policy). Its music/radio
 * and synthesized-engine content is that project's own game, not this one's
 * (CLAUDE.md's own note on the donor project) — what plays through the gain
 * here is `itffm`'s single sound so far: a snip when a mushroom is severed.
 *
 * No CC0 recording, by choice: the whole game draws without pictures (see
 * CLAUDE.md's Conventions) — mushrooms, terrain and litter are all generated
 * from a handful of numbers rather than shipped as assets — and a synthesized
 * "dry cut" (a short filtered noise burst, not a sampled snip) is the same
 * idea applied to the one sound effect the game has right now. The broader
 * ambient-sound plan (wind, footsteps, water — TODO.md's 🔊 section) is a
 * different problem: those need to sound like real recorded places, which
 * synthesis does not do convincingly, and that is where sourcing real CC0
 * recordings actually belongs.
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
}
