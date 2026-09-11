import { mulberry32 } from '../util/rng'

/**
 * The wood's own accelerated calendar (design decided in the 2026-09-11
 * brainstorm): the game clock runs itself, faster than real time, so a
 * player visits every season within a normal play session instead of only
 * once a real year. `ecology/spawn.ts`'s `daysSinceRain` (previously a
 * hardcoded `2`) and its species `season` filter (previously the real
 * wall-clock month) both read off this same clock — see `game/scene.ts`
 * and `game/worldStream.ts`.
 */

/** Real hours per one accelerated game day. */
export const REAL_HOURS_PER_GAME_DAY = 1
const MS_PER_GAME_DAY = REAL_HOURS_PER_GAME_DAY * 60 * 60 * 1000

/**
 * Game-days elapsed since `startMs` — a fixed point persisted in
 * `SaveData.calendarStart` (set once, on a save's first creation) rather
 * than reset on every reload, so the calendar keeps advancing across
 * sessions the way a real one would. Fractional: a moment partway through a
 * game-day reads as partway, not snapped to a whole one. Never negative —
 * a clock skewed backward (a corrected system clock, a copied save) reads
 * as "day zero," not a negative age nothing else in this module expects.
 */
export function gameDaysElapsed(startMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - startMs) / MS_PER_GAME_DAY)
}

const DAYS_PER_MONTH = 30
const MONTHS_PER_YEAR = 12

/**
 * Which month (1..12) the calendar is in. A 360-day year (30-day months) —
 * not the real, unequal-length one — cycling continuously so every
 * species' `season` window in the data comes around every real ~15 days
 * (`REAL_HOURS_PER_GAME_DAY` × 360) rather than the once-a-year window the
 * real wall-clock month gave it before this.
 */
export function gameMonth(gameDays: number): number {
  const dayOfYear = gameDays % (DAYS_PER_MONTH * MONTHS_PER_YEAR)
  return Math.floor(dayOfYear / DAYS_PER_MONTH) + 1
}

/** Chance any single game-day has rain — not a real weather model (no
 *  fronts, no seasons of its own), just enough variation that
 *  `daysSinceRain` actually moves instead of sitting at one constant. */
const RAIN_CHANCE = 0.25
/** How far back `daysSinceRain` searches before giving up and calling it a
 *  long drought — well past where `ecology/spawn.ts`'s own drought falloff
 *  (`speciesScore`) has already flattened out (score roughly halves by day
 *  6), so nothing downstream can tell the difference between this cap and
 *  actually searching forever. */
const MAX_DROUGHT_DAYS = 14
/** Spaces consecutive days' own RNG streams apart — `mulberry32(seed + n)`
 *  for small consecutive `n` can correlate in its early outputs; a large
 *  prime multiplier decorrelates one game-day from its neighbours the same
 *  way other modules give each feature its own distinct seed offset. */
const DAY_SEED_STRIDE = 104729

/** Whether it rained on this whole game-day — deterministic per (seed, day)
 *  so the same seed always gives the same weather history (see CLAUDE.md's
 *  own "no Math.random" rule): replaying the same wood twice rains on the
 *  same days both times. */
export function isRainDay(seed: number, dayIndex: number): boolean {
  return mulberry32(seed + Math.floor(dayIndex) * DAY_SEED_STRIDE)() < RAIN_CHANCE
}

/**
 * How many game-days since it last rained, capped at `MAX_DROUGHT_DAYS` —
 * feeds `ecology/spawn.ts`'s `SpawnContext.daysSinceRain` instead of the
 * hardcoded `2` it used before this. Continuous within the current day: it
 * rained "today" reads as a small fraction, not a flat 0 all day.
 */
export function daysSinceRain(seed: number, gameDays: number): number {
  const today = Math.floor(gameDays)
  for (let back = 0; back <= MAX_DROUGHT_DAYS; back++) {
    if (isRainDay(seed, today - back)) return gameDays - (today - back)
  }
  return MAX_DROUGHT_DAYS
}
