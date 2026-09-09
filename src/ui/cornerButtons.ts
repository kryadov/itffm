/**
 * Geometry of the round buttons stacked in the top-right corner: the settings
 * gear (`ui/hud.ts`, always there) plus the touch-only encyclopedia and
 * tally buttons a mouse-and-keyboard player reaches with `Tab`/`Q` instead.
 * Deriving every offset from one function, rather than a `right:` value
 * hand-picked per button, keeps them packed against the corner with no gaps
 * or overlaps as buttons are added — ported from race-the-city's
 * `ui/cornerButtons.ts` (same idea, sized to this HUD's own 32px gear button
 * rather than that project's 44px pause/help pair).
 */

/** px from the screen edge to the first (rightmost) button — matches the
 *  settings gear's existing `right:16px`. */
export const CORNER_EDGE = 16
/** button width/height, px — matches the settings gear's existing size. */
export const CORNER_SIZE = 32
/** gap between adjacent buttons, px. */
export const CORNER_GAP = 8

/** The `right` offset (px) of the i-th top-right button, 0 = flush to the edge. */
export function cornerRight(i: number): number {
  return CORNER_EDGE + i * (CORNER_SIZE + CORNER_GAP)
}
