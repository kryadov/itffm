/**
 * A wisp's own drift, size and fade as it rises through its 0..1 lifecycle —
 * pure, so both `world/shelter.ts`'s chimney and `world/campfire.ts`'s fire
 * can loop the same handful of sprites through it without each keeping its
 * own copy of the formula. Extracted once a second real use turned up, not
 * ahead of one.
 */

/** A wisp's offset from its base position at lifecycle fraction `t` (0..1),
 *  metres. `phase` (0..1) gives each of a group of wisps its own drift, so
 *  they do not all sway the same way at once. */
export function smokeOffset(t: number, phase: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(t * Math.PI * 2 + phase * 7) * 0.08,
    y: t * 1.4,
    z: Math.cos(t * Math.PI * 2 + phase * 5) * 0.08,
  }
}

/** A wisp's own scale at lifecycle fraction `t` — grows as it rises and
 *  disperses, never zero so it is never briefly invisible right as it spawns. */
export function smokeScale(t: number): number {
  return 0.15 + t * 0.4
}

/** A wisp's opacity at lifecycle fraction `t`, relative to its own peak —
 *  the caller scales this by whatever peak opacity its own smoke reads best
 *  at (a chimney's wisp and a campfire's needn't be equally thick). */
export function smokeOpacity(t: number): number {
  return 1 - t
}
