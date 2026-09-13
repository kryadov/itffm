# Fetch quest with natural detours — implementation plan

Spec: `docs/superpowers/specs/2026-09-13-fetch-quest-design.md`

Branch: `feature/fetch-quest`. TDD throughout: failing test → minimal
implementation → green → commit. One commit per task.

## Task 1 — `src/quest/state.ts`

Pure state machine, no DOM/three imports.

```ts
export type QuestState = 'pending' | 'carrying' | 'done'
export interface Quest { position: { x: number; y: number; z: number }; state: QuestState }

export function tryPickUp(quest: Quest, playerPos: {x:number;z:number}, range: number): Quest
export function tryDeliver(quest: Quest, playerPos: {x:number;z:number}, shelterDoor: {x:number;z:number}, range: number): Quest
```

- `tryPickUp`: if `state === 'pending'` and horizontal distance to
  `quest.position` <= range, return `{ ...quest, state: 'carrying' }`;
  otherwise return `quest` unchanged (same reference semantics test:
  no-op returns an equal value, doesn't need to be the same object).
- `tryDeliver`: if `state === 'carrying'` and distance to `shelterDoor` <=
  range, return `{ ...quest, state: 'done' }`; otherwise unchanged.
- Tests: in range / out of range / wrong state, for both functions.

Commit: `feat: quest state machine (pending/carrying/done)`

## Task 2 — `src/world/water.ts`: `waterObstacles`

Add (existing file already builds pond/stream meshes from `Vec2[][]`):

```ts
export function waterObstacles(water: Vec2[][], radius = 0.6): Obstacle[]
```

Sample each polygon/line's vertices (and, for edges longer than ~2×radius,
midpoints too, so a long straight bank isn't porous) into `{x, z, radius}`
circles — same `Obstacle` shape `game/player.ts` already consumes. Empty
input → empty output.

Test: a simple square polygon produces obstacles covering its perimeter
(check a point at the centre of the square is within `radius` of some
returned obstacle's edge — i.e. the boundary is covered, not the interior).

Commit: `feat: real water blocks movement like a tree trunk`

## Task 3 — `src/quest/placement.ts`

```ts
export function placeQuestItem(
  seed: number,
  shelterPos: {x:number; z:number},
  water: Vec2[][],
  heightAt: (x:number, z:number) => number,
): { position: {x:number;y:number;z:number}; obstacles: Obstacle[] }
```

- `mulberry32(seed)` picks an angle (0-2π) and distance (30-45m) from
  `shelterPos` → candidate item position. `y = heightAt(x, z)`.
- If any segment of any `water` ring passes within a margin (e.g. 4m) of the
  straight line shelter→item, return `{ position, obstacles: [] }` (real
  water already blocks, via Task 2's obstacles, once merged into the scene's
  obstacle list — this function doesn't duplicate them).
- Otherwise call a sibling `thicketObstacles(seed, shelterPos, item)` (same
  file) that lays a band of ~8-14 bush-radius (`0.5`-`0.8`m) circles across
  the middle third of the segment, offset perpendicular to it in a noisy
  zig-zag (reuse `mulberry32`, not a new RNG), leaving both ends (first/last
  sixth of the segment) clear — i.e. you cannot walk straight through the
  middle, but going around either end works, no maze.
- Determinism test: same seed/inputs → same output, per project convention
  (`src/util/rng.ts` pattern already used elsewhere).
- Thicket-shape test: a point on the segment's middle third is within range
  of some generated obstacle; a point in the first/last sixth is not.
- Water-present test: with a water ring crossing the segment, `obstacles` is
  empty.

Commit: `feat: deterministic quest item placement with a detour`

## Task 4 — `src/save/store.ts`: persist quest

Add optional `quest?: { position: Vec3; state: QuestState }` to the saved
shape, following the existing versioned-field pattern in this file. Round-trip
test: save then load preserves `quest`.

Commit: `feat: persist quest progress in the save`

## Task 5 — `src/i18n/`: strings

Add RU/EN pairs (follow existing key style in this directory):
`questPrompt`, `questDistanceFar`, `questDistanceNear`, `questComplete`.
Test: existing i18n completeness test (if one exists — check first) covers
the new keys; if no such test exists, add one asserting both locales define
the same key set (this is likely already enforced — verify before adding a
duplicate).

Commit: `feat: quest strings (RU/EN)`

## Task 6 — wire into the game

- `game/scene.ts` / `game/worldStream.ts`: merge `waterObstacles(world.water)`
  into the existing obstacle arrays (same place trees/logs/boulders are
  merged).
- On new game (no saved `quest`), call `placeQuestItem` with the world seed,
  shelter position, `world.water`, and the terrain's `heightAt`; store the
  result's `obstacles` alongside the world's obstacle list and the item
  position as `quest.position`, state `'pending'`.
- `main.ts`: extend the existing `E`-key handler — if a quest is `'pending'`
  and player is within pickup range of `quest.position`, transition via
  `tryPickUp` (Task 1) instead of/alongside the door check; if `'carrying'`
  and within range of `shelter.doorPosition`, transition via `tryDeliver`.
  Show `questPrompt` once when a fresh quest starts, `questComplete` once on
  delivery.
- HUD: while `state !== 'done'`, show a small distance line — distance to
  `quest.position` while `'pending'`, to the shelter door while `'carrying'`
  — using existing UI text-overlay patterns in this file, not a new HUD
  subsystem. Threshold `questDistanceNear` under ~15m, else `questDistanceFar`.
- Render the item itself minimally: reuse an existing simple mesh (e.g. the
  same primitive style as a stump/boulder decoration) placed at
  `quest.position`, removed from the scene when picked up.

This task is integration-heavy and only "tested selectively" per the
project's layering rule — add whatever targeted test is practical (e.g. a
test that obstacle assembly includes the water/thicket circles when a world
has water/doesn't) without forcing full DOM/three coverage.

Commit: `feat: wire fetch quest into the running game`

## Task 7 — verify and finish

- `npm test`, `npm run build`, `npm run boot-check` all green.
- Update `CHANGELOG.md` (new feature entry) and `TODO.md` (mark done, in
  English per the post-2026-09-11 convention... note: this repo's TODO/spec
  prose is historically Russian; follow whatever the surrounding section
  already does — check before writing).
- Merge `feature/fetch-quest` to `master` (fast-forward or regular merge,
  matching how this repo has merged prior feature branches — check `git log
  --merges` first).
- Bump `package.json` version (minor bump, new feature) and tag
  `v<version>`, push branch/tag per `CLAUDE.md`'s release convention.
