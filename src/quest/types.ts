import type { Quest } from './state'

/** The wood's four quest items — a hatchet, a lamp, a fishing rod, a
 *  bicycle — each an independent instance of the same one-item quest shape
 *  (see docs/superpowers/specs/2026-09-13-quest-items-design.md). */
export type QuestItemId = 'axe' | 'lamp' | 'rod' | 'bike'

export const QUEST_ITEM_IDS: QuestItemId[] = ['axe', 'lamp', 'rod', 'bike']

/** One `Quest` per item id — the caller's own record; `quest/state.ts`'s
 *  `tryPickUp`/`tryDeliver` still operate on a single `Quest` at a time. */
export type Quests = Record<QuestItemId, Quest>
