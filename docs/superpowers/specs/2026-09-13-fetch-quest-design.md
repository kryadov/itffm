# Fetch quest with natural detours — design doc

Date: 2026-09-13
Status: approved, in implementation.

## 0. Why

The game today is pure foraging: walk, look, pick, fill the basket. There is no
objective that asks the player to go *somewhere specific* and back. A single
fetch quest — find a lost basket in the wood, carry it home — gives the wood a
destination without turning the game into something else. The interesting part
isn't the fetching, it's that the straight line home is blocked: a real pond or
wetland where the geography has one, or a generated stretch of dense thicket
where it doesn't. No maze — one obstacle to walk around, using terrain the
player already understands (water, dense growth).

## 1. Decisions

| Decision | Why |
|---|---|
| Data first: real `world.water`/wetland polygons become impassable; a generated thicket only fills in where there is none | Matches the project's existing rule for terrain (`ElevationProvider`'s real DEM with a procedural fallback) — reuse real geography before inventing anything. |
| Water becomes a real physics obstacle everywhere, not just near the quest | `world.water` is already parsed and rendered but has no collision (confirmed by investigation) — this is a small, general fix, not a quest-only hack. Wetland already slows the player (`WETLAND_SPEED`); water now blocks like a tree trunk. |
| One quest, one item, per saved game — not a repeatable/randomized quest system | YAGNI. There's no quest framework in the game at all yet; building one before there's a second quest to generalize from is speculative. |
| Reuse the existing obstacle system (`stepPlayer`'s `Obstacle` circles) for both water and thicket | The physics substrate already exists and already composes trees/logs/boulders/shelter walls the same way — a new obstacle type is just more circles in the same array. |
| Reuse the existing interact key (`E`, same as the shelter door) for pickup and delivery | The game already teaches this input for the door; no new control to explain. |
| A simple text distance readout while the quest is active, no compass arrow or minimap | Confirms the player is heading the right way without adding a new HUD element or waypoint rendering system. |
| No carried-item mesh in hand for v1 | Cosmetic, not load-bearing for the objective; can follow later without changing the design. |

## 2. Flow

1. On a new game (no saved quest state), a quest item ("lost basket") is placed
   deterministically from the world seed at 30-45m from the shelter, in a
   direction chosen so that either a mapped water/wetland polygon or a
   generated thicket band lies between the shelter and the item.
2. A one-line prompt appears once: find the lost basket, bring it home.
3. Walking near the item and pressing `E` picks it up (same interact range as
   the door). The item disappears from the world; a small always-on text
   ("far" / "near" / metres) shows distance back to the shelter door while
   carrying.
4. Reaching the shelter door while carrying and pressing `E` delivers it:
   completion message, quest marked done, persisted in the save.
5. A completed or not-yet-started quest has no HUD footprint beyond the one
   prompt/message lines above.

## 3. Architecture

New pure module `src/quest/`, following the project's core/runtime split:

- `src/quest/placement.ts` — `placeQuestItem(seed, shelterPos, water): { position, obstacles }`.
  Deterministic (`mulberry32`), pure, unit-tested. Picks a direction/distance;
  if `water` polygons intersect the shelter–item segment within a margin, no
  extra obstacles are generated (the real water already blocks); otherwise it
  calls `thicketObstacles` to generate a band of bush-radius circles across the
  segment, wide enough that going straight through fails but the ends are
  clearly walkable.
- `src/quest/state.ts` — pure state machine: `'pending' | 'carrying' | 'done'`,
  with `pickUp`/`deliver` transitions and range checks as plain functions
  (position + range in, boolean/next-state out) — no DOM, no three.js, fully
  unit-tested per the project's core-layer rule.
- `src/world/water.ts` (existing) gains `waterObstacles(water): Obstacle[]`,
  sampling polygon vertices into collision circles at a fixed radius, merged
  into the same obstacle arrays `game/scene.ts` and `game/worldStream.ts`
  already build for trees/logs/boulders.
- `game/scene.ts` / `main.ts` wire the above: build the quest on new-game,
  extend obstacle assembly with `waterObstacles`/thicket circles, add the `E`
  interact handling for pickup/delivery (mirrors the existing door handling),
  and the one-line HUD prompt/distance text.
- `save/store.ts` gains a `quest?: { position: Vec3; state: QuestState }`
  field, versioned the same way existing save fields are.
- `src/i18n/` gains RU/EN strings for the prompt, the distance readout labels,
  and the completion message.

## 4. What does NOT change

`ecology/*`, `species/*`, the mushroom/berry/herb/nut/find pipeline, and the
encyclopedia are untouched — this is a single hand-placed world object, not a
new `Species` kind, and deliberately not folded into that system (there is
nothing to look up about a lost basket).

## 5. Testing

- Unit: `placeQuestItem` determinism (one seed → one result, per project
  convention), `waterObstacles` conversion, `thicketObstacles` band shape
  (band blocks the straight segment, leaves the ends clear), the `state.ts`
  transitions.
- Selective integration: obstacle assembly includes water/thicket circles;
  `E` triggers pickup/delivery at the right ranges.
- `npm run boot-check` after build (this touches `main.ts`/scene assembly).
- No new morphology, so `silhouette-sheet` is not affected.
