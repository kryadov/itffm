/** A known new moon (2000-01-06 18:14 UTC), as a reference point. */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)
/** The Moon's synodic period — new moon to new moon — in days. */
const SYNODIC_MONTH_DAYS = 29.530588853

/**
 * Today's real moon phase, 0 = new, 0.5 = full, approaching 1 = new again —
 * there is no in-game calendar yet (see TODO.md's "Сезоны и календарь"), so
 * `world/sky.ts`'s moon reads whatever phase the real sky actually shows
 * tonight rather than a fixed, always-full disc, without needing one of its
 * own to exist first.
 */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - REFERENCE_NEW_MOON_MS) / 86_400_000
  const phase = (days / SYNODIC_MONTH_DAYS) % 1
  return phase < 0 ? phase + 1 : phase
}
