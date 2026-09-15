# Minimap markers and a quest guide screen — design addendum

Date: 2026-09-15
Status: approved, in implementation.
Extends and partially supersedes:
`docs/superpowers/specs/2026-09-13-quest-items-design.md` (§4, "What does NOT
change" — the "no minimap, no waypoint arrows" and "no new UI screen" lines).

## 0. Why

`ui/minimap.ts`'s own doc comment states the original intent plainly: "this
map... never marks a single mushroom — only the ground itself." That held
while the only thing worth finding was the shelter. Since v0.89.0-v0.91.0 the
wood also hides four quest items 30-45m out in a random direction, plus a
diamond inside a mine — five things a player might want a hint about, not
one landmark. A live request (2026-09-15) asks for exactly that: a coloured
dot per item, and somewhere to read what each item does before spending time
looking for it.

This is a deliberate reversal of the 2026-09-13 doc's "no minimap for quests"
call, not an oversight of it — the reasoning here is why the reversal is
still worth the original doc's spirit rather than working against it.

## 1. Decisions

| Decision | Why |
|---|---|
| The minimap gains a generic list of markers instead of one hardcoded shelter point | Same bearing/clamp/draw arithmetic `update()` already runs for the shelter — extracted into a loop over `{position, color}` entries, not a new drawing system. |
| Two marker categories: **landmarks** (shelter, mine, campfire — fixed once a wood is built) and **quest hints** (axe/lamp/rod/bike while still lying in the wood) | A landmark is geography the player would naturally learn just by walking, the same way they already remember where the hut is — showing it doesn't spoil anything. A quest item's hidden position is the entire content of its own fetch-and-detour quest; showing it by default would flatten that quest to "walk to the dot," directly undoing what the 2026-09-13 doc built. |
| Landmarks show whenever the minimap itself is on (`Prefs.minimap`) — no separate switch | This is the same map the shelter already appears on; adding two more fixed dots to it is the same feature, not a new one. |
| Quest hints need a second, independent preference, `Prefs.minimapQuestHints`, **default `false`** | Preserves the original default experience byte-for-byte: a player who never touches this new setting still gets exactly the hardcore "find it yourself" quest the 2026-09-13 doc designed. Turning the minimap on and turning quest hints on are two separate, deliberate opt-ins, not one. |
| The diamond gets no marker, ever, at any setting | Confirmed live: the mine's own landmark marker is enough to find the *building*; the diamond's exact spot inside it stays an unaided small-scale search, which is what makes the lamp (dark mine interior) meaningful. Marking the diamond too would make the lamp's own darkness pointless. |
| A quest marker only exists while `quests[id].state === 'pending'` | Once carried or delivered the physical object isn't in the wood any more — nothing left to point to. No new state, this reuses the existing `QuestState`. |
| Marker colors reuse `main.ts`'s existing `QUEST_ITEM_COLOR` values, translated to CSS hex strings, except the lamp | The in-world pickup mesh and the map dot already share a colour language for axe/rod/bike; keeping that for the map read is free recognition. The lamp's item colour (`0xd8a04a`) is identical to the shelter's existing marker amber (`#d8a04a`) — changing the shelter's colour after two releases of muscle memory is the bigger, unrelated change, so the lamp's *marker* (not its in-world mesh) gets its own distinct hex instead. |
| A new standalone screen, `ui/questGuide.ts` (`openQuestGuide`), reached from the pause menu | Matches `openEncyclopedia`/`openSettingsMenu`'s existing shape: one file, one `open*()` overlay function. Lists each item's ability and current state (not found / carrying / delivered), pulled straight from the live `Quests` record — no new save shape, no inventory system, just a read-only view of state that already exists. This is the "reason to browse abilities" the 2026-09-13 doc said didn't yet exist (its "No skills/inventory screen" line) — five items with real, easy-to-forget effects is that reason now. |

## 2. What still does NOT change

Everything else the 2026-09-13 doc ruled out stays ruled out: no mount/
dismount animation, no fishing mini-game, no new save/inventory data beyond
what `Quests` already holds, no waypoint *arrows* (a dot on the minimap is
not a directional arrow HUD element) — this addendum only widens the
minimap's own marker set and adds one read-only screen.

## 3. Testing

- Pure: a marker-position/clamp helper extracted from `ui/minimap.ts`'s
  drawing code (same style as the existing `regionToOffscreen`/
  `headingFromYaw` tests in `test/ui/minimap.test.ts`).
- Pure: a `buildMinimapMarkers` function (landmarks always, quest items only
  when hinted and pending, diamond never) — unit tested in `test/quest/`.
- `npm run boot-check` after wiring `main.ts`.
