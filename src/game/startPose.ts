import { findOpenSpot } from '../util/openSpot'
import type { Obstacle } from './player'

export interface StartPose {
  x: number
  z: number
}

/** How much room beyond an obstacle's own radius to leave, metres — enough
 *  that the player does not start with bark against their nose. */
const DEFAULT_CLEARANCE = 1.2

/**
 * Where to stand the player at the start of a walk.
 *
 * Spawning at a fixed local origin, as the very first version of the game
 * did, sometimes dropped the player face-first into a trunk that happened to
 * generate right there. `findOpenSpot` searches outward from `origin` — the
 * world centre by default, or the wood's shelter, so the player starts beside
 * it rather than in an unrelated clearing — until it finds room.
 *
 * Deterministic and obstacle-only: it takes the same `Obstacle[]` collision
 * shapes `stepPlayer` already avoids, so a tree that blocks walking also
 * blocks spawning inside it.
 */
export function chooseStartPose(
  obstacles: Obstacle[],
  halfSize: number,
  origin: StartPose = { x: 0, z: 0 },
  clearance: number = DEFAULT_CLEARANCE,
): StartPose {
  return findOpenSpot(obstacles, halfSize, origin, clearance)
}
