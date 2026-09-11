import type { FootstepSubstrate } from './footsteps'
import type { WaterAmbienceKind } from './waterAmbience'

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
 * held, for a while, only for a short discrete EVENT — the original plan for
 * a continuous ambience (wind, a babbling stream) was to source a real CC0
 * recording instead, on the theory that synthesis reads as a real place less
 * convincingly stretched over a whole loop than in one sharp burst. Water
 * ambience (`updateWaterAmbience`, below) went the other way on reflection:
 * the same filtered-noise-plus-LFO recipe that already reads as a footstep
 * splash or a bird chirp keeps "nothing in this game is a picture, everything
 * is a formula" consistent instead of carving out one exception, and it does
 * not need to fool anyone into thinking they hear an actual recorded stream —
 * just enough texture and movement to read as "water, over there" from a
 * distance. TODO.md's 🔊 section's forest ambience (wind, creaks) is still
 * open and still undecided between the two.
 *
 * `updateMusic()`/`footstepClip()` below are a deliberate, later exception
 * to the "no CC0 recording" rule above, not an erosion of it: a real
 * 2026-09-11 request asked specifically for real recordings (zvukbox.ru,
 * metadata and cover art stripped before they entered the repo) for the
 * wood's own day/night/campfire music bed and its walk/run footstep sound —
 * every other sound in this file is still synthesis, and stays that way.
 * Both play through their own `Prefs`-driven volume (`musicVolume`,
 * `footstepVolume`), independent of `sfxGain`'s `soundVolume` — a player who
 * wants the mushroom-collect snap without the music, or the reverse, can
 * have it.
 *
 * `footstepClip()` is a one-shot retrigger from the start of the recording
 * on every `crossedFootstep()` (`main.ts`, the same event `footstep()`
 * already fires on) rather than a continuously-playing background loop —
 * a live report the same day ("звук шагов не синхронизирован с ходьбой")
 * caught the first version, which ran the clip on its own free-running
 * loop gated only by volume: it never landed on a real footfall, drifting
 * further out of step the longer the player walked. Retriggering from
 * offset 0 every footfall is the same fix `updateWaterAmbience()` never
 * needed (water has no beat to land on) but `footstep()` already had right
 * from the start.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private volume = 0.7

  // Water ambience is the one sound in this file that is not fire-and-forget
  // like collect()/footstep()/birdCall(): it has to keep running while the
  // player walks, so its nodes are built once (ensureWaterAmbience, lazily
  // on first non-zero gain) and kept around rather than created per call.
  private waterNoise: AudioBufferSourceNode | null = null
  private waterFilter: BiquadFilterNode | null = null
  private waterFreqLfo: OscillatorNode | null = null
  private waterFreqLfoDepth: GainNode | null = null
  private waterAmpGain: GainNode | null = null
  private waterAmpLfo: OscillatorNode | null = null
  private waterAmpLfoDepth: GainNode | null = null
  private waterDistanceGain: GainNode | null = null

  // The music bed (day/night/campfire) and the footstep loop (walk/run) are
  // both real recordings (see the class doc comment above) rather than
  // synthesis — three/two looping AudioBufferSourceNodes each, decoded once
  // and left running for the whole session; only their own gain crosses
  // fade in and out, the same "never tear the graph down, just ramp toward
  // silence" choice updateWaterAmbience() makes.
  private musicGain: GainNode | null = null
  private musicVolume = 0.5
  private dayBuffer: AudioBuffer | null = null
  private nightBuffer: AudioBuffer | null = null
  private campfireBuffer: AudioBuffer | null = null
  private dayGain: GainNode | null = null
  private nightGain: GainNode | null = null
  private campfireLoopGain: GainNode | null = null

  private footstepGain: GainNode | null = null
  private footstepVolume = 0.6
  private walkBuffer: AudioBuffer | null = null
  private runBuffer: AudioBuffer | null = null

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

    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.musicVolume
    this.musicGain.connect(this.ctx.destination)
    this.footstepGain = this.ctx.createGain()
    this.footstepGain.gain.value = this.footstepVolume
    this.footstepGain.connect(this.ctx.destination)
    void this.loadMusic()
    void this.loadFootsteps()
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.sfxGain) this.sfxGain.gain.value = this.volume
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v))
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume
  }

  setFootstepVolume(v: number): void {
    this.footstepVolume = Math.max(0, Math.min(1, v))
    if (this.footstepGain) this.footstepGain.gain.value = this.footstepVolume
  }

  /** Fetch + decode one recorded clip. Never throws — a failed fetch (the
   *  file missing, a network hiccup) just leaves that track silent forever,
   *  the same honest-fallback spirit as `terrain/provider.ts`'s own offline
   *  demo wood, not a reason to break the rest of the mixer. */
  private async loadClip(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null
    try {
      const res = await fetch(url)
      const bytes = await res.arrayBuffer()
      return await this.ctx.decodeAudioData(bytes)
    } catch {
      return null
    }
  }

  private async loadMusic(): Promise<void> {
    const [day, night, campfire] = await Promise.all([
      this.loadClip('./audio/day.mp3'),
      this.loadClip('./audio/night.mp3'),
      this.loadClip('./audio/campfire.mp3'),
    ])
    this.dayBuffer = day
    this.nightBuffer = night
    this.campfireBuffer = campfire
    this.ensureMusicSources()
  }

  private async loadFootsteps(): Promise<void> {
    const [walk, run] = await Promise.all([this.loadClip('./audio/walk.mp3'), this.loadClip('./audio/run.mp3')])
    this.walkBuffer = walk
    this.runBuffer = run
  }

  /** One looping source, gain-nulled until the first real `updateMusic()`
   *  call sets a target — built once its buffer has actually finished
   *  decoding, a no-op on every call after. Music has no beat to land on
   *  (unlike the footstep clip below), so a free-running loop is fine here. */
  private startLoop(buffer: AudioBuffer, into: GainNode): GainNode {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(g)
    g.connect(into)
    src.start()
    return g
  }

  private ensureMusicSources(): void {
    if (!this.ctx || !this.musicGain) return
    if (this.dayBuffer && !this.dayGain) this.dayGain = this.startLoop(this.dayBuffer, this.musicGain)
    if (this.nightBuffer && !this.nightGain) this.nightGain = this.startLoop(this.nightBuffer, this.musicGain)
    if (this.campfireBuffer && !this.campfireLoopGain) {
      this.campfireLoopGain = this.startLoop(this.campfireBuffer, this.musicGain)
    }
  }

  /**
   * The wood's own music bed — called every frame (`main.ts`, alongside the
   * water-ambience/footstep wiring) with `night` (`world/daynight.ts`'s
   * `nightFactor`, the same value the sky/shelter fade already use) and
   * `fireGain` (`audio/musicAmbience.ts`'s `campfireGain`, the player's own
   * distance to the campfire). `fireGain` doubles as the crossfade factor —
   * at 1 the day/night bed is fully replaced by campfire.mp3, at 0 it is
   * untouched — so the two never disagree about where the swap happens.
   */
  updateMusic(night: number, fireGain: number): void {
    if (!this.ctx) return
    this.ensureMusicSources()
    const t = this.ctx.currentTime
    const bed = Math.max(0, 1 - fireGain)
    if (this.dayGain) this.dayGain.gain.setTargetAtTime((1 - night) * bed, t, 0.8)
    if (this.nightGain) this.nightGain.gain.setTargetAtTime(night * bed, t, 0.8)
    if (this.campfireLoopGain) this.campfireLoopGain.gain.setTargetAtTime(fireGain, t, 0.8)
  }

  /** How much of walk.mp3/run.mp3, from its own start, plays per footfall —
   *  short enough that a faster cadence (sprinting, or just a quick step)
   *  doesn't pile several overlapping copies on top of each other, the same
   *  concern `FOOTSTEP_PARAMS`' own short durations above already solve for
   *  the synthesized substrates. Run gets the shorter slice: sprint footfalls
   *  land closer together (`SPRINT_SPEED`/`WALK_SPEED` in game/player.ts). */
  private static readonly FOOTSTEP_CLIP_DURATION = { walk: 0.4, run: 0.3 }

  /**
   * One footfall from the recorded walk/run clip — called on `main.ts`'s own
   * `crossedFootstep()`, the exact same trigger `footstep()` above fires on
   * for the synthesized substrates, so this one lands on a real footfall
   * instead of drifting on its own clock. Retriggers from the clip's own
   * offset 0 every time (a fresh `AudioBufferSourceNode` — Web Audio sources
   * are one-shot, cannot be rewound and replayed) rather than looping
   * continuously in the background, which a live report caught: a
   * free-running loop gated only by volume never lined up with an actual
   * step. A short gain ramp at the tail avoids a click if the clip is cut off
   * mid-sound at `FOOTSTEP_CLIP_DURATION`.
   */
  footstepClip(sprinting: boolean): void {
    if (!this.ctx || !this.footstepGain || this.footstepVolume <= 0) return
    const buffer = sprinting ? this.runBuffer : this.walkBuffer
    if (!buffer) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const duration = sprinting ? AudioEngine.FOOTSTEP_CLIP_DURATION.run : AudioEngine.FOOTSTEP_CLIP_DURATION.walk

    const src = ctx.createBufferSource()
    src.buffer = buffer
    const g = ctx.createGain()
    g.gain.setValueAtTime(1, t)
    g.gain.setValueAtTime(1, t + Math.max(0, duration - 0.05))
    g.gain.linearRampToValueAtTime(0, t + duration)

    src.connect(g)
    g.connect(this.footstepGain)
    src.start(t, 0, duration)
  }

  /** One filtered-noise-plus-LFO recipe per water kind — a stream reads as
   *  more active than a pond by moving more: a wider, faster sweep on the
   *  lowpass cutoff (the "bubbling" motion) and a faster, deeper amplitude
   *  wobble on top of it, both centred higher and louder than the pond's
   *  own near-silent, near-static hush. */
  private static readonly WATER_AMBIENCE_PARAMS: Record<
    WaterAmbienceKind,
    { baseFreq: number; freqLfoRate: number; freqLfoDepth: number; ampLfoRate: number; ampLfoDepth: number; peakGain: number }
  > = {
    stream: { baseFreq: 900, freqLfoRate: 1.7, freqLfoDepth: 350, ampLfoRate: 3.3, ampLfoDepth: 0.3, peakGain: 0.5 },
    pond: { baseFreq: 260, freqLfoRate: 0.15, freqLfoDepth: 40, ampLfoRate: 0.4, ampLfoDepth: 0.06, peakGain: 0.22 },
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
   * and `footstep()` above — unlike `updateWaterAmbience()` below, a
   * continuous loop rather than a one-shot. Two quick upward chirps read
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

  /** Builds the water-ambience node graph once, on the first frame that
   *  actually needs it — a looping noise buffer through a lowpass filter
   *  (an LFO sweeps its cutoff for the "moving water" texture) into an
   *  amplitude-wobble gain (a second LFO for the bubbling pulse) into the
   *  distance gain `updateWaterAmbience` drives every frame. No-op once
   *  built; a no-op if the context isn't ready yet (mirrors `resume()`'s own
   *  guard elsewhere in this file). */
  private ensureWaterAmbience(): void {
    if (!this.ctx || !this.sfxGain || this.waterNoise) return
    const ctx = this.ctx

    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBurst(2)
    noise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.6

    const freqLfo = ctx.createOscillator()
    freqLfo.type = 'sine'
    const freqLfoDepth = ctx.createGain()
    freqLfo.connect(freqLfoDepth)
    freqLfoDepth.connect(filter.frequency)

    const ampGain = ctx.createGain()
    const ampLfo = ctx.createOscillator()
    ampLfo.type = 'sine'
    const ampLfoDepth = ctx.createGain()
    ampLfo.connect(ampLfoDepth)
    ampLfoDepth.connect(ampGain.gain)

    const distanceGain = ctx.createGain()
    distanceGain.gain.value = 0

    noise.connect(filter)
    filter.connect(ampGain)
    ampGain.connect(distanceGain)
    distanceGain.connect(this.sfxGain)

    noise.start()
    freqLfo.start()
    ampLfo.start()

    this.waterNoise = noise
    this.waterFilter = filter
    this.waterFreqLfo = freqLfo
    this.waterFreqLfoDepth = freqLfoDepth
    this.waterAmpGain = ampGain
    this.waterAmpLfo = ampLfo
    this.waterAmpLfoDepth = ampLfoDepth
    this.waterDistanceGain = distanceGain
  }

  /**
   * The one continuous, looping sound in this file — called every frame
   * (`main.ts`'s per-frame loop, alongside footstep/bird-call wiring) with
   * `kind` and `gain` from `audio/waterAmbience.ts`'s pure `nearestWater`/
   * `waterAmbienceGain`, computed from the player's own distance to the
   * nearest pond or stream. `kind` picks which of `WATER_AMBIENCE_PARAMS`'
   * two characters plays (see that table's own comment); `gain` (already
   * the [0, 1] distance falloff) sets how loud, ramped rather than snapped
   * to avoid a click at the target (`setTargetAtTime`, same reason a
   * `footstep()`'s own envelope ramps rather than jumps). Nodes are built
   * lazily on the first call that actually needs them; with no water in
   * earshot (`kind` null or `gain` 0) this only ever ramps existing nodes
   * toward silence, never tears them down — cheaper than rebuilding the
   * graph every time the player wanders in and out of range.
   */
  updateWaterAmbience(gain: number, kind: WaterAmbienceKind | null): void {
    if (!this.ctx || !this.sfxGain) return
    if (!kind || gain <= 0) {
      if (this.waterDistanceGain) this.waterDistanceGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15)
      return
    }
    this.ensureWaterAmbience()
    if (
      !this.waterFilter ||
      !this.waterFreqLfo ||
      !this.waterFreqLfoDepth ||
      !this.waterAmpGain ||
      !this.waterAmpLfo ||
      !this.waterAmpLfoDepth ||
      !this.waterDistanceGain
    ) {
      return
    }
    const p = AudioEngine.WATER_AMBIENCE_PARAMS[kind]
    const t = this.ctx.currentTime
    this.waterFilter.frequency.setTargetAtTime(p.baseFreq, t, 0.5)
    this.waterFreqLfo.frequency.setTargetAtTime(p.freqLfoRate, t, 0.5)
    this.waterFreqLfoDepth.gain.setTargetAtTime(p.freqLfoDepth, t, 0.5)
    this.waterAmpGain.gain.setTargetAtTime(1, t, 0.5)
    this.waterAmpLfo.frequency.setTargetAtTime(p.ampLfoRate, t, 0.5)
    this.waterAmpLfoDepth.gain.setTargetAtTime(p.ampLfoDepth, t, 0.5)
    this.waterDistanceGain.gain.setTargetAtTime(gain * p.peakGain, t, 0.15)
  }
}
