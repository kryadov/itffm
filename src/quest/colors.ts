/** Minimap marker colors for the four hintable quest items — reuses
 *  main.ts's own QUEST_ITEM_COLOR hex values as strings, so the map dot and
 *  the in-world pickup mesh read as the same thing, except the lamp: its
 *  item colour (0xd8a04a) is identical to the shelter's own marker amber, so
 *  its *marker* gets a distinct hex instead (see the 2026-09-15 addendum).
 *  Shared between main.ts (the minimap wiring) and ui/questGuide.ts (the
 *  colour swatch next to each item's name) so the two never drift apart. */
export const QUEST_MARKER_COLOR: Record<'axe' | 'lamp' | 'rod' | 'bike', string> = {
  axe: '#8a8a92',
  lamp: '#f2c14e',
  rod: '#5a4a30',
  bike: '#3f6db0',
}

/** The diamond's own in-world colour (main.ts's QUEST_ITEM_COLOR.diamond) —
 *  it never gets a minimap marker, but the quest guide still shows its
 *  swatch alongside the other four. */
export const DIAMOND_COLOR = '#bfe8ff'
