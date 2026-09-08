import type { Obstacle } from './player'

export interface StartPose {
  x: number
  z: number
}

/** How much room beyond an obstacle's own radius to leave, metres — enough
 *  that the player does not start with bark against their nose. */
const CLEARANCE = 1.2
const RING_STEP = 2
const ANGLES_PER_RING = 12

/**
 * Where to stand the player at the start of a walk.
 *
 * Spawning at a fixed local origin, as the very first version of the game
 * did, sometimes dropped the player face-first into a trunk that happened to
 * generate right there. This searches outward from the centre in rings until
 * it finds a spot clear of every obstacle, and gives up back at the centre
 * only if the whole searchable area is somehow blocked.
 *
 * Deterministic and obstacle-only: it takes the same `Obstacle[]` collision
 * shapes `stepPlayer` already avoids, so a tree that blocks walking also
 * blocks spawning inside it.
 */
export function chooseStartPose(obstacles: Obstacle[], halfSize: number): StartPose {
  const isOpen = (x: number, z: number): boolean =>
    Math.abs(x) <= halfSize &&
    Math.abs(z) <= halfSize &&
    obstacles.every((o) => Math.hypot(x - o.x, z - o.z) >= o.radius + CLEARANCE)

  if (isOpen(0, 0)) return { x: 0, z: 0 }

  for (let radius = RING_STEP; radius <= halfSize; radius += RING_STEP) {
    for (let a = 0; a < ANGLES_PER_RING; a++) {
      const angle = (a / ANGLES_PER_RING) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (isOpen(x, z)) return { x, z }
    }
  }

  return { x: 0, z: 0 }
}
