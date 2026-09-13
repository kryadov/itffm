# Four quest items with real abilities — implementation plan

Spec: `docs/superpowers/specs/2026-09-13-quest-items-design.md`.
Builds on the fetch quest already shipped in `v0.88.0`
(`src/quest/state.ts`, `src/quest/placement.ts`, `src/world/water.ts`'s
`waterObstacles`, the `E`-key pickup/delivery wiring in `main.ts`/`game/scene.ts`,
and `save/store.ts`'s `quest` field).

Branch: `feature/quest-items`. TDD throughout: failing test → minimal
implementation → green → commit. One commit per task. Read each touched
file's relevant section before editing it — this plan describes intent, not
exact line numbers.

## Task 1 — generalize quest state from one item to four

- `src/quest/state.ts`: no shape change needed (it already operates on one
  `Quest` at a time) — add the `QuestItemId` type (`'axe' | 'lamp' | 'rod' |
  'bike'`) and a `Quests = Record<QuestItemId, Quest>` type alias here or in
  a shared `src/quest/types.ts` if that reads cleaner once you see the
  existing file.
- `src/quest/placement.ts`: `placeQuestItem` already takes a `seed` — calling
  it four times with four different derived seeds (e.g. `seed + hashOf(id)`,
  or simplest: `seed` offset by a distinct small integer per item id, tested
  for no-collision the same way) gives four independent placements. Add a
  small helper, e.g. `placeQuestItems(seed, shelterPos, water, heightAt):
  Record<QuestItemId, {position, obstacles}>`, so callers don't hand-roll the
  per-id seed derivation four times.
- Test: four placements from one seed land at meaningfully different
  positions (not exactly equal), and the whole function is still
  deterministic (same seed → same four results).

Commit: `feat: place four independent quest items instead of one`

## Task 2 — persist four quests in the save

- `src/save/store.ts`: `quest?: Quest` → `quests?: Partial<Record<QuestItemId, Quest>>`.
  Check how this file currently versions/migrates saved fields (the plan for
  the first quest already added one optional field the same way — follow
  that exact pattern) so an old save with the singular `quest` field either
  migrates cleanly or is simply superseded (decide by reading how other
  renamed/replaced fields were handled here before, if any; otherwise
  dropping the old field is fine since the feature is one release old).
- Test: round-trip preserves a partially-populated `quests` (e.g. only
  `axe` present, as a fresh save built one item at a time would produce
  before the others are placed) and a fully-populated one.

Commit: `feat: persist all four quest items in the save`

## Task 3 — scrub becomes a visible, identifiable object

Today `thicketObstacles` (in `src/quest/placement.ts`) returns bare
`{x, z, radius}` circles with no mesh and no per-object identity — needed
because the hatchet has to remove one specific bush, not the whole band.

- Give each generated thicket obstacle a stable id (e.g. index within its
  quest's band is enough, scoped by which quest/item it belongs to).
- Add a small visual builder for one scrub object — reuse whatever simple
  primitive style an existing decoration in `src/world/` already uses for a
  bush/shrub (check `world/trees.ts`'s undergrowth or any existing bush
  decoration before inventing a new mesh shape) — one mesh per obstacle,
  not a new procedural-morphology system.
- Wire these meshes + obstacle circles into `game/scene.ts`'s existing
  obstacle/scene assembly for the home plot (same place the first quest's
  thicket obstacles and item marker were added), keyed so each mesh can be
  found again by the object the player is looking at (mirror how pick.ts's
  `withPickHitbox`/`userData` pattern identifies a pickable object).

Test: a scrub object's mesh and obstacle circle share an id; building a
quest's thicket produces one mesh per circle.

Commit: `feat: render quest-detour scrub as real, identifiable objects`

## Task 4 — hatchet: chop scrub, once owned

- `src/main.ts`: extend the existing `E`-key handling — when the player is
  aiming at a scrub object (via the same crosshair-raycast idea `pick.ts`
  already uses for collectibles — check whether to reuse `pick.ts`'s
  `nearestInView` directly or add a small parallel check, whichever fits
  the existing code better) and `quests.axe.state === 'done'`, remove that
  scrub's mesh from the scene and its circle from the obstacle list, mirror-
  ing `worldStream.ts`'s existing `removeMushroomObject` pattern (add a
  `removeScrubObject` following the same shape if no generic removal helper
  already fits).
- Chopping only ever affects scrub built by `thicketObstacles` — never
  `world/trees.ts`'s batched trees. Don't touch `trees.ts`.
- Test: chopping without the hatchet owned is a no-op; chopping with it
  owned removes both the mesh and the obstacle.

Commit: `feat: hatchet clears quest-detour scrub`

## Task 5 — lamp: a moving point light, and a darker mine

- `game/scene.ts`: add a `PointLight` that tracks the player's position each
  frame (same update cadence as the camera/scene update loop — find where
  per-frame player-position-dependent updates already happen, e.g. wherever
  `biomeSpeedFactor` or similar per-frame reads of player position live).
- Its intensity/visibility is a pure function of three inputs — write this
  as a small testable function rather than inlining the condition, e.g.
  `lampIsOn(owned: boolean, nightFactor: number, insideMine: boolean):
  boolean` in `src/quest/` or `src/world/` (wherever pure helpers for this
  feature naturally collect) — `owned && (nightFactor > 0 || insideMine)`.
- `insideMine` needs a distance check against the loaded mine's position/
  radius (`world/mine.ts` already has this geometry — reuse it, don't
  duplicate the radius constant).
- `world/mine.ts`: reduce the interior's own light values (whatever
  ambient/local lights it currently sets) so that without `lampIsOn`, the
  interior reads as genuinely dark regardless of time of day. This is a
  values change to existing lights, not a new light-rig.
- Test: `lampIsOn` truth table (owned/not × night/day × inside/outside
  mine); mine's reduced-light values differ from before (a simple
  regression-style assertion that the constant changed, or that computed
  interior brightness is below a threshold — whichever the existing mine
  tests already check, follow that style).

Commit: `feat: lamp lights the player at night and inside mines`

## Task 6 — rod: fish as a new collectible kind

Follow `docs/superpowers/specs/2026-09-08-forest-finds-design.md` exactly —
read it before starting this task, it's the template for every step below.

- `src/species/schema.ts`: add `{ kind: 'fish'; morphology: FishMorphology;
  edibility: Edibility }` to the `Species` union, with hand-written
  validation matching the existing per-kind branches (name the file/field in
  any error, same as every other branch here).
- `src/fish/build.ts`: `buildFish(morphology, seed, age)`, `toWorldMesh`,
  `traitsFor` — same three exports as `src/berry/build.ts`/`src/herb/
  build.ts`. Keep the morphology genuinely simple for v1 (this is new
  procedural geometry, budget it modestly — a fish silhouette, not a
  render-accurate species model) — check with a quick look at `src/berry/
  build.ts` for how simple "simple" already means in this codebase.
- `src/collectible/build.ts`'s dispatcher (`buildCollectible`,
  `collectibleWorldMesh`) gets a `'fish'` case.
- `ecology/sites.ts`: fish's spawn condition keys off proximity to
  `world.water` (the same data `waterObstacles` and pond rendering already
  use) rather than substrate/mycorrhizal fields — read how `find`'s
  ecology fields are stretched to fit non-growing objects in the forest-
  finds doc's "conscious inaccuracy" section, and do the analogous thing
  for fish (which body of water it needs nearby, not what it grows on).
- `data/species/` gets 2-3 real fish species (e.g. common freshwater fish
  found in small ponds/streams — perch, roach, whatever the game's already-
  established freshwater biome supports), each with real ecology/text in
  both languages, matching the curation bar `CLAUDE.md`'s Responsibility
  section sets for `edibility` (check against real sources; a wrong fish
  edibility claim is the same class of problem as a wrong mushroom one).
- `game/pick.ts`: add a guard — picking a `kind: 'fish'` placement is a
  no-op unless `quests.rod.state === 'done'`. This is one conditional, not a
  new interaction system.
- `ui/encyclopedia.ts` / `encyclopediaFilters.ts`: confirm `kind: 'fish'`
  flows through the existing `kind` filter/label dictionaries added for the
  forest-finds work (it likely already does — check before adding anything).

Test: fish morphology determinism (one seed → one result, project
convention), the pick-guard (no rod → no-op, rod owned → normal pick),
ecology spawn condition keys off water proximity.

Run `npm run silhouette-sheet` after this task and look at the sheet per
CLAUDE.md's "look at it" convention — this is the one task in this plan that
adds real procedural morphology.

Commit: `feat: fishing rod unlocks catching fish (new collectible kind)`

## Task 7 — bike: path-speed multiplier

- Add a pure helper (in `src/world/paths.ts` or a sibling file, whichever
  keeps it a pure core module per CLAUDE.md's layering table) —
  `distanceToNearestPath(pos: {x,z}, paths: Path[]): number`, reusing the
  same ribbon geometry `buildPathMeshes` already walks (don't recompute path
  geometry a second way).
- `game/player.ts`'s `biomeSpeedFactor` (or wherever the per-frame speed
  multiplier is actually assembled — read the current wetland logic first)
  gains a bike check: when `quests.bike.state === 'done'` and
  `distanceToNearestPath(...) <= pathWidth`, multiply speed up. Tune the
  exact multiplier during implementation (start around 1.5-1.6x, adjust if
  it feels wrong when boot-checked) — this is a gameplay-feel number, not an
  architectural decision.
- Test: the path-distance helper against a known path segment; the speed
  multiplier applies only when owned AND on a path, not either alone.

Commit: `feat: bicycle speeds up movement on paths`

## Task 8 — wire quest prompts and verify

- `main.ts`/HUD: one-line prompt per item on first appearance (or one
  combined line — pick whichever reads better once you see the other three
  prompts in place), completion message per item, mirroring the first
  quest's existing prompt/message wiring.
- `i18n/`: RU/EN strings for four prompts + four completion messages (the
  first quest's strings are the template).
- `npm test`, `npm run build`, `npm run boot-check` all green — paste actual
  output, don't assert from memory.
- Update `CHANGELOG.md` (new entry) and `TODO.md` if it references this
  work (check first, don't force an edit that doesn't fit — same judgement
  call as the first quest's plan).
- Do NOT bump `package.json`, tag, merge to master, or push — reserved for
  the orchestrating session same as last time.

Commit: `feat: wire quest prompts, messages, and changelog`
