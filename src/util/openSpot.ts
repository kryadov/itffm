export interface Point {
  x: number
  z: number
}

export interface Circle {
  x: number
  z: number
  radius: number
}

const RING_STEP = 2
const ANGLES_PER_RING = 12

/**
 * Finds a point clear of every circle, searching outward in rings from
 * `origin` until one fits, or giving up back at `origin` if the whole
 * searchable area is somehow blocked.
 *
 * Lives in util/ rather than game/ or world/ because both need it: a
 * player's start (game/startPose.ts) and the wood's fixed features
 * (`world/shelter.ts`, `world/campfire.ts`) are the same question — "where
 * is there room?" — asked with a different `clearance`.
 *
 * @param extra an additional condition a candidate point must satisfy beyond
 *   clearance — `world/campfire.ts` uses it to also require an actual
 *   clearing (`world/clearings.ts`'s `isClearing`), not just open ground.
 * @param worldCenter the halfSize bound is measured from here, not always
 *   world (0, 0) — `game/worldStream.ts`'s chunked wildlife needs the bound
 *   centred on the chunk itself; a chunk far from the origin would otherwise
 *   fail the bound at every candidate (including `origin`) and silently fall
 *   back to it unchecked, skipping clearance entirely.
 */
export function findOpenSpot(
  obstacles: Circle[],
  halfSize: number,
  origin: Point,
  clearance: number,
  extra?: (x: number, z: number) => boolean,
  worldCenter: Point = { x: 0, z: 0 },
): Point {
  const isOpen = (x: number, z: number): boolean =>
    Math.abs(x - worldCenter.x) <= halfSize &&
    Math.abs(z - worldCenter.z) <= halfSize &&
    obstacles.every((o) => Math.hypot(x - o.x, z - o.z) >= o.radius + clearance) &&
    (!extra || extra(x, z))

  if (isOpen(origin.x, origin.z)) return origin

  for (let radius = RING_STEP; radius <= halfSize; radius += RING_STEP) {
    for (let a = 0; a < ANGLES_PER_RING; a++) {
      const angle = (a / ANGLES_PER_RING) * Math.PI * 2
      const x = origin.x + Math.cos(angle) * radius
      const z = origin.z + Math.sin(angle) * radius
      if (isOpen(x, z)) return { x, z }
    }
  }

  return origin
}
