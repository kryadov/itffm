import type { Quest } from './state'

/** The wood's five quest items — a hatchet, a lamp, a fishing rod, a
 *  bicycle, and a diamond — each an independent instance of the same
 *  one-item quest shape (see
 *  docs/superpowers/specs/2026-09-13-quest-items-design.md). The diamond is
 *  the one exception to "placed 30-45m from the shelter" (`quest/placement.ts`'s
 *  `placeQuestItems`): it sits at a fixed spot inside the wood's mine
 *  instead, and delivering it has no ability to unlock — it is a trophy. */
export type QuestItemId = 'axe' | 'lamp' | 'rod' | 'bike' | 'diamond'

export const QUEST_ITEM_IDS: QuestItemId[] = ['axe', 'lamp', 'rod', 'bike', 'diamond']

/** One `Quest` per item id — the caller's own record; `quest/state.ts`'s
 *  `tryPickUp`/`tryDeliver` still operate on a single `Quest` at a time. */
export type Quests = Record<QuestItemId, Quest>
