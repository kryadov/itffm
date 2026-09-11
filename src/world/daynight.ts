export type TimeMode = 'cycle' | 'day' | 'night'
export const TIME_MODES: TimeMode[] = ['cycle', 'day', 'night']
/** Where the 'day' and 'night' locks hold the clock, in [0,1) — 0 is midnight. */
export const DAY_TIME = 0.5
export const NIGHT_TIME = 0.0

interface Key {
  t: number
  sky: number
  sun: number
  sunI: number
  ambI: number
}

/**
 * Keyframes across the day (t: 0 = midnight, 0.5 = noon). The noon entry
 * matches the fixed colours and intensities game/scene.ts shipped with
 * before this module existed, so the default 'day' lock looks exactly like
 * the wood always has — day/night is additive, not a repaint of the base look.
 */
const KEYS: Key[] = [
  { t: 0.0, sky: 0x0d1420, sun: 0x33427a, sunI: 0.03, ambI: 0.35 }, // midnight
  { t: 0.24, sky: 0xd98a55, sun: 0xffb070, sunI: 0.5, ambI: 1.1 }, // dawn
  { t: 0.5, sky: 0xa8c0a2, sun: 0xfff1cf, sunI: 1.1, ambI: 2.6 }, // noon
  { t: 0.76, sky: 0xc97a4c, sun: 0xff9058, sunI: 0.5, ambI: 1.1 }, // dusk
  { t: 1.0, sky: 0x0d1420, sun: 0x33427a, sunI: 0.03, ambI: 0.35 }, // wraps to midnight
]

/** Sun elevation from time: +1 at noon, -1 at midnight. */
export function sunElevation(t: number): number {
  return Math.sin((t - 0.25) * Math.PI * 2)
}

/**
 * How "night" it is, 0 (sun above the horizon) to 1 (well below it) — the
 * same clamp `game/scene.ts` already applied inline to its own `sunVisible`
 * for the sky/shelter fade, pulled out here so `audio/audio.ts`'s music
 * crossfade (day.mp3 vs night.mp3) can read the identical value instead of
 * re-deriving its own notion of "night" from the clock.
 */
export function nightFactor(t: number): number {
  return Math.max(0, Math.min(1, -sunElevation(t) * 1.5))
}

const lerp = (a: number, b: number, x: number): number => a + (b - a) * x

function lerpColor(a: number, b: number, x: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const br = (b >> 16) & 255
  const bg = (b >> 8) & 255
  const bb = b & 255
  return (
    (Math.round(lerp(ar, br, x)) << 16) | (Math.round(lerp(ag, bg, x)) << 8) | Math.round(lerp(ab, bb, x))
  )
}

export interface DayNightSample {
  sky: number
  sun: number
  sunI: number
  ambI: number
}

/** Interpolated sky/sun/ambient values for a time in [0,1). */
export function sampleDayNight(t: number): DayNightSample {
  const tt = ((t % 1) + 1) % 1
  let i = 0
  while (i < KEYS.length - 1 && tt > KEYS[i + 1].t) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const x = (tt - a.t) / (b.t - a.t || 1)
  return {
    sky: lerpColor(a.sky, b.sky, x),
    sun: lerpColor(a.sun, b.sun, x),
    sunI: lerp(a.sunI, b.sunI, x),
    ambI: lerp(a.ambI, b.ambI, x),
  }
}

/**
 * The clock's own time for a given mode: 'day' and 'night' hold it at a
 * fixed point (so the sun never approaches the horizon under a lock — a
 * "permanent noon" that occasionally dipped into dusk would not read as a
 * lock at all); 'cycle' passes the running clock straight through.
 */
export function timeFor(mode: TimeMode, cycleT: number): number {
  if (mode === 'day') return DAY_TIME
  if (mode === 'night') return NIGHT_TIME
  return cycleT
}
