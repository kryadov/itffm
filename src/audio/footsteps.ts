import type { Biome } from '../species/schema'

/** What `AudioEngine.footstep()` actually synthesises differently. */
export type FootstepSubstrate = 'litter' | 'moss' | 'sand' | 'water'

/**
 * Whether a footstep happened between last frame's camera-bob phase and this
 * one — `game/player.ts`'s `cameraBob` bounces twice per full `2·PI` of
 * `bobPhase` (`Math.abs(Math.sin(bobPhase))`, one bounce per foot), touching
 * down at each multiple of `PI`. Crossing one of those, not just being near
 * it, is what a single frame's phase delta needs to test for — a fast frame
 * covering several multiples at once (e.g. a low frame rate, or an external
 * jump in phase) still only needs to know THAT it crossed at least one, so
 * this fires once per call regardless of how many it actually stepped over.
 */
export function crossedFootstep(prevPhase: number, currPhase: number): boolean {
  return Math.floor(currPhase / Math.PI) > Math.floor(prevPhase / Math.PI)
}

/**
 * Which footstep sound plays here. Near or in a water body wins outright —
 * `nearWater` is the caller's own (already-existing) proximity check against
 * `world/water.ts`'s rings, the same "how close" question `ecology/sites.ts`
 * already asks for moisture. Otherwise it follows the biome under the
 * player's feet: sand on the dunes, moss in the wetland, leaf litter
 * everywhere else — the ordinary forest floor.
 */
export function footstepSubstrate(biome: Biome, nearWater: boolean): FootstepSubstrate {
  if (nearWater) return 'water'
  if (biome === 'dunes-coast') return 'sand'
  if (biome === 'wetland') return 'moss'
  return 'litter'
}
