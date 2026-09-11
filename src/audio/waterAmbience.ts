import type { Vec2 } from '../geo/types'
import { distanceToRing } from '../util/geometry'

/**
 * Stream vs pond — the same two kinds `world/water.ts`'s `classifyWater`
 * already tells apart for the mesh, redeclared here as a local type instead
 * of an import: this module has to stay pure core (no `world/` dependency,
 * same reasoning `audio/footsteps.ts` follows by owning its own
 * `FootstepSubstrate` rather than importing one). Callers just pass
 * `classifyWater()`'s own result straight through.
 */
export type WaterAmbienceKind = 'pond' | 'stream'

export interface WaterBody {
  ring: Vec2[]
  kind: WaterAmbienceKind
}

export interface NearestWater {
  distance: number
  kind: WaterAmbienceKind
}

/**
 * The nearest water body's edge distance and character, or null if the wood
 * has none at all — same "closest known spot" shape as `audio/birdCalls.ts`'s
 * `nearestBird`, just carrying a kind instead of a raw point. Distance is to
 * the ring's own edge (`distanceToRing`, 0 once the player is inside it),
 * the same measure `main.ts` already uses for the water footstep check.
 */
export function nearestWater(playerX: number, playerZ: number, bodies: WaterBody[]): NearestWater | null {
  let best: NearestWater | null = null
  for (const body of bodies) {
    if (body.ring.length < 2) continue
    const distance = distanceToRing(playerX, playerZ, body.ring)
    if (!best || distance < best.distance) best = { distance, kind: body.kind }
  }
  return best
}

/**
 * Linear falloff from 1 at distance 0 to 0 at maxDist — mirrors
 * `audio/birdCalls.ts`'s `birdGain`: past maxDist the ambience is gone
 * outright, not just faint, so it reads as a landmark the player walks into
 * rather than a constant background hiss everywhere in the wood.
 */
export function waterAmbienceGain(distance: number, maxDist: number): number {
  if (distance >= maxDist) return 0
  return 1 - distance / maxDist
}
