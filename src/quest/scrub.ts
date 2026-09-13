import type { QuestObstacle } from './placement'

/**
 * The hatchet's own rule: remove exactly one scrub obstacle by id, but only
 * once the axe quest is delivered — a no-op (the same array reference back)
 * otherwise, mirroring `quest/state.ts`'s own "no-op returns an equivalent
 * value" convention. Pure: `main.ts` pairs this with removing the matching
 * mesh from the scene, which this function knows nothing about.
 */
export function chopScrub(obstacles: QuestObstacle[], targetId: string, axeOwned: boolean): QuestObstacle[] {
  if (!axeOwned) return obstacles
  const i = obstacles.findIndex((o) => o.id === targetId)
  if (i < 0) return obstacles
  return [...obstacles.slice(0, i), ...obstacles.slice(i + 1)]
}
