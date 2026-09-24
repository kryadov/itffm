# Ukha and honey — implementation plan

Spec: `docs/superpowers/specs/2026-09-24-ukha-and-honey-design.md`.

Branch: current branch, as part of the 2026-09-24 batch. TDD for both state
machines and every model; each run driven through its debug hooks in the
built game. One commit per task; `FEATURES.md` with each.

## Global constraints

- Each quest is a pure state machine in `src/quest/`, saved as plain data,
  read back through a validator that accepts only a real state.
- The quest reset in settings clears both.
- Nothing about either quest is visible on the minimap except the hive while
  the honey is being fetched.

## Task 1 — a level hut with a plank floor and a rug

- `src/world/shelter.ts`: `placeShelter` stands the hut on the highest ground
  under its footprint; `FLOOR_TOP`, `hutFloorY(s)`, separate boards in
  several shades, a rug on top; `onHutFootprint(s, x, z, margin)`.
- `game/scene.ts`: the player's ground inside the hut is the floor; grass and
  placements kept off the footprint.
- `main.ts`: `&tp=hut` (just inside the doorway, door open, facing in) and
  `&pitch=`.
- Tests: stands on the highest ground under its footprint; boards in more
  than one shade with their top at `FLOOR_TOP`; a rug on the boards;
  `onHutFootprint` covers the walls and a margin.

Commit: `feat: the hut gets a real plank floor and a rug, and stands level so no ground shows through`

## Task 2 — ukha

- New `src/quest/soup.ts`: `SoupStage`, `Soup`, `COOK_SECONDS`, `NO_SOUP`,
  `SoupEvent`, `soupAtFire`, `soupAtHut`, `tickSoup`, `readSoup`.
- `src/world/campfire.ts`: the pot shows a ladle and steam by stage.
  New `src/world/soupBowl.ts`: `buildSoupBowl()`. `world/shelter.ts`: the
  bowl on the table, hidden until delivered.
- New `src/world/puff.ts`: `puffTexture()` — used by every smoke and steam
  sprite (chimney, campfire, train).
- `src/save/store.ts`: `save.soup`; reset clears it.
- `ui/questGuide.ts`: accept extra rows; a soup row.
- `main.ts`: `E` at the fire and in the hut, toasts per event, `tickSoup`
  per frame; `&tp=campfire`.
- Tests: `test/quest/soup.test.ts`; `test/world/campfire.test.ts` (the pot as
  the ukha cooks); `test/world/shelter.test.ts` (the bowl).

Commit: `feat: fish soup — cook a fish over the campfire and carry the ukha home`

## Task 3 — honey

- New `src/quest/honey.ts`: `HoneyStage`, `Honey`, `FILL_SECONDS`,
  `HIVE_REACH`, `BEES_REACH`, `NO_HONEY`, `HoneyEvent`, `honeyAtShelf`,
  `honeyOnLaunch`, `honeyInFlight`, `honeyOnLand`, `jarInHand`, `jarOnDrone`,
  `readHoney`.
- New `src/world/honeyJar.ts`: `buildHoneyJar()` (empty or full).
  `world/shelter.ts`: the shelf and `jarSpotWorld(s)`.
- `src/world/hive.ts`: the skep — coiled straw, a bracketed shelf, a bark
  roof, an entrance, honey at the door.
- New `src/game/heldView.ts`: `HeldItem`, `HeldMode`, `createHeldView
  (worldScene)` — draws the jar (empty or full) or the bowl in hand
  (`IN_HAND`) or under the drone on a string (`UNDER_DRONE`), as a second
  pass like the bicycle.
- `src/save/store.ts`: `save.honey`; reset clears it. `ui/questGuide.ts`: a
  honey row. Minimap: the hive while fetching.
- `main.ts`: the shelf, launch, in-flight fill and landing hooks; the bees'
  toast on foot; `&tp=hive`, `window.__droneToHive()`.
- Tests: `test/quest/honey.test.ts`; `test/world/shelter.test.ts` (the shelf
  and the jar); `test/world/hive.test.ts`.

Commit: `feat: honey — fetch it from the wild hive with the quadcopter`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; both runs in the built
game, looking at the bowl on the table and the jar on its shelf.
