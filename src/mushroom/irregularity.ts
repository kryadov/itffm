import { fbm2 } from '../util/noise'

/**
 * No two mushrooms are alike — see docs/superpowers/specs, the brainstorm on
 * `mushroom/build.ts`'s perfect-body-of-revolution cap and stipe. Pure,
 * small functions kept apart from `build.ts` the same way `profile.ts`'s
 * `capCrossSection` is: easy to reason about and to test without a
 * `THREE.Group` in hand.
 */

/** How many lobes wobble around the rim — sampling a circle of this radius
 *  in noise-space, the same trick `world/trees.ts`'s `buildRaggedCrown` uses
 *  radially, just parameterised by angle instead of by vertex position. */
const CAP_WOBBLE_FREQ = 2.2
const CAP_WOBBLE_YOUNG = 0.02
const CAP_WOBBLE_MATURE = 0.07

/**
 * A cap radius multiplier at angle `phi` (radians) around the stipe — real
 * caps are never a perfect circle in plan. Periodic in `phi` (no seam where
 * a lathe sweep closes on itself, since it samples a circle in noise-space
 * via cos/sin rather than `phi` itself), and grows with `age` (0 young, 1
 * mature) — barely irregular fresh, more weathered-looking grown up.
 */
export function capWobble(phi: number, seed: number, age: number): number {
  const n = fbm2(Math.cos(phi) * CAP_WOBBLE_FREQ, Math.sin(phi) * CAP_WOBBLE_FREQ, seed, 2)
  const t = Math.max(0, Math.min(1, age))
  const amount = CAP_WOBBLE_YOUNG + (CAP_WOBBLE_MATURE - CAP_WOBBLE_YOUNG) * t
  return n * amount
}

/**
 * How far the stipe's axis has leaned sideways by height fraction `t` (0 at
 * the base, 1 at the top) — zero at the base, since a mushroom doesn't hover
 * over the point it actually grew from, eased rather than linear so the
 * curve reads as grown, not snapped at a hinge.
 */
export function stipeBendCurve(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c
}
