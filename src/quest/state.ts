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

/**
 * Takes a delivered item back into your hands: `done` -> `carrying` once the
 * player is at the spot in the hut where it was left. Only some items have such
 * a spot (the fishing rod and the bicycle — the ones you use while carrying,
 * and go back for); the caller knows which. A no-op in any other state or out
 * of range, same as the other transitions.
 */
export function tryTake(
  quest: Quest,
  playerPos: { x: number; z: number },
  homeSpot: { x: number; z: number },
  range: number,
): Quest {
  if (quest.state !== 'done') return quest
  if (distance2D(playerPos, homeSpot) > range) return quest
  return { ...quest, state: 'carrying' }
}

/**
 * One press of `E` for one item: at most ONE transition, whichever fits where
 * the item is now — pick it up if it lies out in the wood, deliver it if you
 * carry it, take it back if it waits at home. Deliberately never two in a row:
 * standing at the hut, taking the rod and putting it straight back down again
 * in the same press would look like nothing happened.
 *
 * @param spots where a carried item is handed in (null when it cannot be just
 *   now), and (null for an item that
 *   cannot be taken back — the hatchet, the lamp, the diamond) where a delivered
 *   one waits
 */
export function interact(
  quest: Quest,
  playerPos: { x: number; z: number },
  spots: { deliverAt: { x: number; z: number } | null; takeFrom: { x: number; z: number } | null },
  range: number,
): Quest {
  if (quest.state === 'pending') return tryPickUp(quest, playerPos, range)
  if (quest.state === 'carrying') {
    // Nowhere to hand it in right now (the diamond, with no train at the platform).
    return spots.deliverAt ? tryDeliver(quest, playerPos, spots.deliverAt, range) : quest
  }
  return spots.takeFrom ? tryTake(quest, playerPos, spots.takeFrom, range) : quest
}
