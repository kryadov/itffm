/**
 * Linear falloff from 1 at the campfire's own edge to 0 at maxDist — mirrors
 * `audio/waterAmbience.ts`'s `waterAmbienceGain`/`audio/birdCalls.ts`'s
 * `birdGain`, the same shape duplicated a third time rather than shared: each
 * of these three is one line, and CLAUDE.md's own "three similar lines is
 * better than a premature abstraction" applies here as much as anywhere.
 * `AudioEngine.updateMusic()` uses this same [0, 1] value both to fade the
 * campfire loop in and to fade the day/night bed out, so the swap at the
 * fire's own edge reads as one crossfade, not two independent ramps that
 * might not agree at the boundary.
 */
export function campfireGain(distance: number, maxDist: number): number {
  if (distance >= maxDist) return 0
  return 1 - distance / maxDist
}
