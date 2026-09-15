import type { MinimapMarker } from '../ui/minimap'
import type { Quests } from './types'

/** A fixed piece of geography — the shelter, the mine, the campfire — always
 *  shown on the minimap once it's on at all (see the 2026-09-15 addendum:
 *  showing these doesn't spoil anything, unlike a quest item's hidden spot). */
export interface Landmark {
  position: { x: number; z: number }
  color: string
}

/** Quest items whose spawn point can ever appear on the minimap — never the
 *  diamond (see the addendum: the mine's own landmark marker is enough, the
 *  diamond's exact spot inside it stays an unaided search). */
const HINTABLE_IDS = ['axe', 'lamp', 'rod', 'bike'] as const
type HintableId = (typeof HINTABLE_IDS)[number]

/**
 * The minimap's full marker list: every landmark, plus (only when
 * `showQuestHints` is true) one marker per still-`pending` hintable quest
 * item. A `carrying`/`done` item never gets one — the physical object isn't
 * in the wood any more, so there's nothing left to point to.
 */
export function buildMinimapMarkers(
  landmarks: Landmark[],
  quests: Quests,
  showQuestHints: boolean,
  questColor: Record<HintableId, string>,
): MinimapMarker[] {
  const markers: MinimapMarker[] = landmarks.map((l) => ({ position: l.position, color: l.color }))
  if (!showQuestHints) return markers
  for (const id of HINTABLE_IDS) {
    if (quests[id].state !== 'pending') continue
    markers.push({ position: quests[id].position, color: questColor[id] })
  }
  return markers
}
