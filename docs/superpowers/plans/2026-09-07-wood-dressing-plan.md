# Dressing the wood — implementation plan

Spec: `docs/superpowers/specs/2026-09-07-wood-dressing-design.md`.
Builds on the playable slice (`world/trees.ts`, `ecology/sites.ts`,
`game/player.ts`'s circle obstacles, `game/pick.ts`).

Branch: `feat/todo-batch-*`, one per few tasks, merged as each batch is green.
TDD throughout: failing test → minimal implementation → green → commit. One
commit per task.

## Global constraints

- No `Math.random` in `src/`. Every placer takes `seed` and draws from
  `mulberry32`; every placer has a "same seed, same layout" test.
- Every placer stands what it places on `ground.heightAt(x, z)` — a test
  asserts it for each.
- Everything renders as one `InstancedMesh` per geometry/material, never a
  mesh per object.
- `world/` modules stay free of `game/` imports; obstacles are the plain
  `CircleObstacle` shape `game/player.ts` already consumes.

## Task 1 — three broadleaf crown shapes

- `src/world/trees.ts`: `buildRaggedCrown(seed)` — an icosahedron whose
  vertices are pushed in and out by `fbm2`, so a crown is lumpy rather than a
  sphere. `BROADLEAF_CROWNS`: three entries `{ geometry, yScale, xzScale,
  heightFrac }` — round, wide-and-low, tall-and-narrow.
  `crownVariantIndex(x, z)` picks one per tree from its position (stable
  across reloads, no extra RNG draw that would shift every later tree).
  `buildTreeMeshes` batches broadleaves by `(genus, variant)`.
- Test (`test/world/crownVariant.test.ts`): deterministic for the same
  position; stays within range; more than one variant across many positions.

Commit: `feat: three crown shapes for broadleaf trees instead of identical spheres`

## Task 2 — fallen logs and stumps as deadwood substrate

- New `src/world/deadwood.ts`: `Log { x, z, y, length, radius, heading }`,
  `Stump { x, z, y, radius, height }`. `placeLogs(seed, halfSize, ground,
  density)` and `placeStumps(...)` with a `MIN_GAP` (3 m) spacing cull.
  `logObstacles(log)` — a chain of circles ("beads") along the log, since the
  player only collides with circles. `logSpawnPoints(log, count, seed)` —
  points beside the log, off its centreline, spread along its length.
  `buildDeadwoodMeshes(logs, stumps)`.
- `game/scene.ts`: feed `logSpawnPoints` into `buildSites` as `deadwood`
  sites; add the bead obstacles.
- Tests (`test/world/deadwood.test.ts`): deterministic, bounded, on the
  ground, plausible dimensions, denser at higher density; obstacles cover both
  ends, carry the log radius, follow the heading; spawn points sit to the
  side and spread along the length.

Commit: `feat: fallen logs and stumps — real support for the deadwood substrate`

## Task 3 — mossy boulders

- New `src/world/boulders.ts`: `Boulder { x, z, y, radius, height }`,
  `placeBoulders`, `boulderObstacle`, `mossSpawnPoints(b, count)` biased to
  the north face (−z), `buildBoulderMeshes` (squashed, jittered icosahedra
  with a moss-green top tint).
- `game/scene.ts`: `moss` sites from `mossSpawnPoints`.
- Tests: the placer battery; obstacle matches position and radius; moss
  points sit outside the stone and favour −z.

Commit: `feat: mossy boulders`

## Task 4 — step up onto low obstacles

- `src/game/player.ts`: optional `Obstacle.topHeight`. In `stepPlayer`, an
  obstacle with `topHeight <= MAX_STEP_HEIGHT` (0.55 m) is not pushed out of;
  standing inside its radius raises `PlayerState.stand` to its top.
  Stumps, thin logs and small boulders set `topHeight`; leaning trees and big
  boulders do not.
- Tests (`test/game/player.test.ts`): stands on top of a low obstacle instead
  of sliding around it; still blocks one too tall to step onto; comes back
  down to `stand: 0` after stepping off.

Commit: `feat: step up onto a boulder, stump or thin log`

## Task 5 — undergrowth that blocks the view

- New `src/world/undergrowth.ts`: `Bush { x, z, y, radius, height }`,
  `placeBushes(seed, halfSize, ground, density)` with `MIN_GAP` 2 m,
  `bushObstacle`, `buildBushMeshes` (two lumpy blobs per bush).
- Not wired into `ecology/` (see spec).
- Tests: the placer battery; wider than tall and at most about eye height;
  never two bushes on top of each other.

Commit: `feat: shrubs — they limit the view and have nothing to do with mushroom ecology`

## Task 6 — flowers and fern

- New `src/world/flora.ts`: `FloraKind = 'flower' | 'fern'`, `placeFlora`,
  `buildFloraMeshes` with `FLOWER_COLORS` (yellow, white, violet).
- Tests: the placer battery; both kinds occur; the scatter is dense enough to
  read as ground cover (a count floor over a fixed area).

Commit: `feat: flowers and fern — visual noise for an honest search`

## Task 7 — clearings and wood edges

- New `src/world/clearings.ts`: `isClearing(x, z, seed)` — `fbm2` at
  `CLEARING_SCALE` 55 m below `CLEARING_THRESHOLD`. `placeTrees` skips
  candidates inside a clearing.
- Tests: deterministic; a spread of points yields both clearing and wood; a
  different seed draws a different shape.

Commit: `feat: clearings and wood edges inside the forest`

## Task 8 — pits and hollows

- New `src/terrain/pits.ts`: `withPits(base, seed): ElevationProvider` — a
  jittered grid of 14 m cells, each with `CHANCE` 0.14 of a bowl
  (`MIN_RADIUS`..`MAX_RADIUS` 1.3–2.6 m, depth 0.35–1.0 m) subtracted with a
  smooth falloff. Raise the moisture sample inside a pit.
- `game/loadForest.ts`: wrap the provider before anything is placed on it.
- Tests (`test/terrain/pits.test.ts`): deterministic; differs by seed; never
  rises above the source; most of the ground untouched; at least one real
  hollow over a wide stretch; broad shape of the source preserved; moisture
  raised inside a pit.

Commit: `feat: random pits and hollows in the terrain`

## Task 9 — grass, thicker in damp ground

- New `src/world/grass.ts`: `GrassTuft`, `placeGrass(seed, halfSize, ground,
  moisture)` on a `CELL` 2.4 m jittered grid, chance `BASE_CHANCE +
  MOISTURE_WEIGHT * moisture`, capped at `MAX_TUFTS`. `buildGrassMesh` —
  `BLADES_PER_TUFT` 3 crossed blades per tuft, one instance per blade.
- Tests: deterministic; grows something on flat ground; bounded; on the
  ground; thicker where wetter; one instance per blade, three per tuft; empty
  input gives an empty mesh.

Commit: `feat: grass — thicker in damp low ground`

## Task 10 — a mushroom hides behind grass and undergrowth

- `src/game/pick.ts`: `nearestInView(..., occluders)` casts against
  `[...objects, ...occluders]` but returns only a hit that walks up to a
  `userData.placement`. The first hit being an occluder means nothing is
  returned.
- `game/scene.ts`: expose the grass and undergrowth groups as `occluders`.
- Tests (`test/game/pick.test.ts`): hidden behind an occluder standing in
  front of it; found once nothing stands between the camera and it.

Commit: `feat: a mushroom hides behind grass and undergrowth`

## Task 11 — half-fallen trees

- `src/world/deadwood.ts`: `LeaningTree { x, z, y, length, radius, heading,
  lean }`, `placeLeaningTrees` (rarer than logs at the same density),
  `leaningTreeObstacle` at the root, `buildLeaningTreeMeshes` (trunk tilted by
  `lean`, crown where the tip hangs).
- Tests: deterministic and bounded; lean strictly between upright and flat;
  plausible trunk; rarer than logs or stumps; obstacle at the root.

Commit: `feat: half-fallen trees`

## Task 12 — undergrowth in patches

- `src/world/undergrowth.ts`: filter candidates by `fbm2` at `PATCH_SCALE`
  22 m above `PATCH_THRESHOLD`.
- Test: bush counts across a grid of cells are far more uneven than an even
  scatter of the same total would give.

Commit: `feat: undergrowth grows in patches, not as an even lawn`

## Task 13 — a crown per conifer genus

- `src/world/trees.ts`: `buildTieredConiferCrown(tiers)`; `CONIFER_SHAPES`
  — spruce and fir a single narrow drooping spire, pine and larch a tiered
  crown raised higher up the trunk; `DEFAULT_CONIFER_SHAPE` = spruce.
- No new unit test: the shapes are constants. Look at it: headless screenshot of a mixed stand.

Commit: `feat: conifers — a crown per genus, not one cone for all`

## Task 14 — forest-floor litter

- `src/world/ground.ts`: `litterColor()` mixes `DEFAULT_COLOR` toward
  `LITTER_DARK` by `fbm2` at `LITTER_SCALE`, strength `LITTER_STRENGTH`, on the
  default floor only.
- Tests (`test/world/ground.test.ts`): the default floor varies across
  neighbouring cells; dunes and wetland stay unmottled; deterministic for one
  seed.

Commit: `feat: forest-floor litter`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; a headless screenshot of the
home clearing with every kind in frame. Merge and push.
