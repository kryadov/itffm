import { fbm2 } from '../util/noise'

/** Spatial scale of a clearing, metres — bigger than a single tree's spacing,
 *  smaller than a whole stand, so a wood gets several of them, not one. */
const CLEARING_SCALE = 55
/** Below this the noise reads as open ground. Tuned so roughly a fifth of a
 *  wood's area opens up — enough to matter, not so much it stops being a wood. */
const CLEARING_THRESHOLD = -0.42

/**
 * Whether this point falls inside a clearing or a wood's edge.
 *
 * Both `placeOsmTrees` (skips planting here) and the biome lookup built in
 * `game/loadForest.ts` (treats it as a pocket of `meadow-scrub`) call this
 * with the same seed, so the gap in the canopy and the change in ecology
 * always line up — one hole in the noise field, not two that might disagree.
 */
export function isClearing(x: number, z: number, seed: number): boolean {
  return fbm2(x / CLEARING_SCALE, z / CLEARING_SCALE, seed, 2) < CLEARING_THRESHOLD
}
