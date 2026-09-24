/**
 * The fish-soup quest: cook a fish you caught in the pot over the campfire,
 * and carry the ukha home to the hut. Pure — no DOM, no three.js — like the
 * rest of `quest/`.
 *
 *   none ──E at the fire, a fish in the basket──▶ cooking
 *   cooking ──COOK_SECONDS──▶ ready
 *   ready ──E at the fire──▶ carrying
 *   carrying ──E in the hut (or at its door)──▶ done: a bowl on the table
 */
export type SoupStage = 'none' | 'cooking' | 'ready' | 'carrying' | 'done'

export interface Soup {
  stage: SoupStage
  /** Seconds of cooking still to go (only while `cooking`). */
  left: number
}

/** How long the ukha simmers, seconds of play. */
export const COOK_SECONDS = 20

export const NO_SOUP: Soup = { stage: 'none', left: 0 }

/** What an `E` did, for the toast that says so. */
export type SoupEvent = 'needFish' | 'started' | 'stillCooking' | 'took' | 'delivered' | null

/** `E` at the campfire. `hasFish`: a fish in the basket (the caller takes it out on 'started'). */
export function soupAtFire(s: Soup, hasFish: boolean): { soup: Soup; event: SoupEvent } {
  if (s.stage === 'none') {
    return hasFish ? { soup: { stage: 'cooking', left: COOK_SECONDS }, event: 'started' } : { soup: s, event: 'needFish' }
  }
  if (s.stage === 'cooking') return { soup: s, event: 'stillCooking' }
  if (s.stage === 'ready') return { soup: { stage: 'carrying', left: 0 }, event: 'took' }
  return { soup: s, event: null }
}

/** `E` at the hut with the ukha in hand. */
export function soupAtHut(s: Soup): { soup: Soup; event: SoupEvent } {
  if (s.stage !== 'carrying') return { soup: s, event: null }
  return { soup: { stage: 'done', left: 0 }, event: 'delivered' }
}

/** Time passing: the pot comes to the boil and the ukha is ready. */
export function tickSoup(s: Soup, dt: number): Soup {
  if (s.stage !== 'cooking') return s
  const left = s.left - dt
  return left > 0 ? { stage: 'cooking', left } : { stage: 'ready', left: 0 }
}

/** `raw` if it is a real soup state, else the fresh one — a value read back
 *  from storage can be anything. */
export function readSoup(raw: unknown): Soup {
  if (typeof raw !== 'object' || raw === null) return NO_SOUP
  const { stage, left } = raw as Record<string, unknown>
  const stages: SoupStage[] = ['none', 'cooking', 'ready', 'carrying', 'done']
  if (typeof stage !== 'string' || !stages.includes(stage as SoupStage)) return NO_SOUP
  const l = typeof left === 'number' && Number.isFinite(left) ? Math.max(0, Math.min(COOK_SECONDS, left)) : 0
  return { stage: stage as SoupStage, left: stage === 'cooking' ? l : 0 }
}
