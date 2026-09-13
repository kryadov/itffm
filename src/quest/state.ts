/**
 * The one fetch quest's own state machine: find the lost basket, carry it
 * home. Pure — no DOM, no three.js, no randomness — per the project's
 * core-layer rule (see CLAUDE.md's layering table).
 */
export type QuestState = 'pending' | 'carrying' | 'done'

export interface Quest {
  position: { x: number; y: number; z: number }
  state: QuestState
}

/** Horizontal distance only — the same "flat ground" assumption every other
 *  proximity check in the game already makes (e.g. world/shelter.ts's own
 *  door range). */
function distance2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * Picks up the quest item: `pending` -> `carrying` once the player is close
 * enough. A no-op (same field values, not necessarily the same reference)
 * in the wrong state or out of range.
 */
export function tryPickUp(quest: Quest, playerPos: { x: number; z: number }, range: number): Quest {
  if (quest.state !== 'pending') return quest
  if (distance2D(playerPos, quest.position) > range) return quest
  return { ...quest, state: 'carrying' }
}

/**
 * Delivers the quest item: `carrying` -> `done` once the player is close
 * enough to the shelter's own doorway. A no-op in the wrong state or out of
 * range, same as `tryPickUp`.
 */
export function tryDeliver(
  quest: Quest,
  playerPos: { x: number; z: number },
  shelterDoor: { x: number; z: number },
  range: number,
): Quest {
  if (quest.state !== 'carrying') return quest
  if (distance2D(playerPos, shelterDoor) > range) return quest
  return { ...quest, state: 'done' }
}
