/**
 * Where a bird call should come from, and how loud — pure trigger logic for
 * `AudioEngine.birdCall()` (`audio.ts`), same split as `footsteps.ts`: the
 * geometry stays testable without an `AudioContext`.
 */

/**
 * Stereo pan for a call from (birdX, birdZ), in [-1, 1] — negative left,
 * positive right, 0 dead ahead or behind. Uses the same yaw convention as
 * `game/player.ts`'s own movement: forward is (-sin(yaw), -cos(yaw)), right
 * is (cos(yaw), -sin(yaw)); pan is the direction-to-bird's own component
 * along "right", normalised by distance.
 */
export function birdPan(playerX: number, playerZ: number, playerYaw: number, birdX: number, birdZ: number): number {
  const dx = birdX - playerX
  const dz = birdZ - playerZ
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-6) return 0
  const lateral = dx * Math.cos(playerYaw) - dz * Math.sin(playerYaw)
  return Math.max(-1, Math.min(1, lateral / dist))
}

/** Linear falloff from 1 at distance 0 to 0 at maxDist — a call this far
 *  away should be inaudible, not just quiet, the same "gone past its own
 *  leash" cutoff `footstepSubstrate`'s water check uses a radius for. */
export function birdGain(distance: number, maxDist: number): number {
  if (distance >= maxDist) return 0
  return 1 - distance / maxDist
}

/** The nearest bird within maxDist of the player, or null if the flock is
 *  out of earshot entirely — the same "closest known spot within range"
 *  question `world/critters.ts`'s `nearestPoint` answers, kept separate
 *  here since it returns the whole point (birds carry y) rather than just
 *  picking from a homogenous list of ground spots. */
export function nearestBird<T extends { x: number; z: number }>(
  birds: T[],
  playerX: number,
  playerZ: number,
  maxDist: number,
): T | null {
  let best: T | null = null
  let bestD2 = maxDist * maxDist
  for (const b of birds) {
    const d2 = (b.x - playerX) ** 2 + (b.z - playerZ) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = b
    }
  }
  return best
}
