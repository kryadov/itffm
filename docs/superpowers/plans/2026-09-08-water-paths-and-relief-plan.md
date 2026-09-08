# Water, paths, dunes and bog — implementation plan

Spec: `docs/superpowers/specs/2026-09-08-water-paths-and-relief-design.md`.
Donor: `kryadov/race-the-city` — `world/roads.ts` (ribbon geometry only),
`world/water.ts` (surface and skirt only).

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Global constraints

- `ForestSource` gains `paths?` and `water?` as **optional** fields: a source
  without them (old tests, the demo wood before it has any) still builds.
- Biome-aware code reads a `biomeAt(x, z)` callback; `terrain/` never imports
  `world/biome.ts`.
- Nothing here may need the network: everything works on the demo wood's own
  data as well as on OSM.

## Task 1 — paths

- `src/util/geometry.ts`: `densify(points, step)`.
- New `src/world/paths.ts`: `HALF_WIDTH`, `buildPathMeshes(paths, ground)` —
  per path, densify at `RIBBON_STEP`, offset left and right by the
  mitred normal, sample `ground.heightAt` at every vertex plus `LIFT`, one
  merged mesh for all paths.
- `src/game/loadForest.ts` passes `world.paths` through; `game/scene.ts` adds
  the mesh.
- Tests: `test/util/geometry.test.ts` (`densify`); `test/world/paths.test.ts` —
  draws nothing for an empty list; draws a ribbon for a single path; skips a
  degenerate single-point path; follows the terrain height under it.

Commit: `feat: paths — an earthen ribbon along OSM ways`

## Task 2 — ponds and their banks

- `src/util/geometry.ts`: `distanceToRing(p, ring)` — 0 inside.
- New `src/world/water.ts`: `waterLevel(ring, ground)` (lowest vertex +
  `WATER_OFFSET`), `buildWaterMeshes(water, ground)` — a triangulated surface
  plus a skirt dropping `SKIRT_DROP` along the edge.
- `src/ecology/sites.ts`: raise moisture within `WATER_REACH` (12 m) of any
  ring, falling off with distance.
- Tests: `test/util/geometry.test.ts` (`distanceToRing`);
  `test/world/water.test.ts` — level sits just above the bed; draws nothing
  for an empty list; a surface and a skirt for one pond; ignores a degenerate
  ring. `test/ecology/sites.test.ts` — wets the ground near a pond even where the
  terrain shape says dry.

Commit: `feat: water bodies — a surface, a skirt along the bank, and a moisture source`

## Task 3 — dune and bog colour, and walking on bog

- `src/world/ground.ts`: `buildGround(..., biomeAt?)` paints each vertex from
  `BIOME_COLOR[biome]` when given — sand for `dunes-coast`, peat for
  `wetland`, the default green otherwise.
- `src/game/player.ts`: `biomeSpeedFactor(biome)` — `WETLAND_SPEED` 0.55 on
  bog, 1 elsewhere; `main.ts` multiplies it into the walking speed with the
  player's own multiplier.
- `src/ui/popularPlaces.ts`: add the Polistovsky reserve.
- Tests: `test/world/ground.test.ts` — no vertex colours without a biome
  function; dunes and wetland tinted differently from the default floor.
  `test/game/player.test.ts` — slows walking on wetland; leaves every other
  biome at full speed.

Commit: `feat: dunes and bog — ground colour and walking physics`

## Task 4 — streams, waterfalls, springs

- `src/world/water.ts`: `WaterKind`, `classifyWater(ring)`; streams drawn as
  a ribbon of `STREAM_WIDTH` following the bed, its vertices rippled in
  `update(t)`; `findWaterfall(ring, ground)` — the steepest drop over
  `WATERFALL_DROP`, or null; a translucent sheet there whose opacity breathes
  with `t`. `placeSprings(water, halfSize, rand, count)` and
  `buildSpringMeshes(springs, ground)` — a small pool of `SPRING_RADIUS`
  offset 2–6 m from the water.
- `game/scene.ts` and `main.ts`: call `water.update(t)` and
  `springs.update(t)` per frame.
- Tests: reads a closed ring as a pond and an open way as a stream; finds no
  waterfall along flat ground and picks the steepest drop, not the first;
  draws a rippling ribbon for a stream with no pond skirt; adds a waterfall
  mesh where a stream drops steeply; springs — none without water,
  deterministic, never outside the plot; spring meshes animate without
  throwing.
- Look at it: a temporary stream beside the hut, screenshot, revert.

Commit: `feat: streams, waterfalls and springs`

## Task 5 — dune and bog relief

- New `src/terrain/relief.ts`: `withBiomeRelief(base, biomeAt, seed)` —
  dunes add `DUNE_AMPLITUDE * sin(...)` ridges at `DUNE_WAVELENGTH` with a
  touch of `fbm2`; wetland adds one octave of `fbm2` at `WETLAND_SCALE`,
  amplitude `WETLAND_AMPLITUDE`; any other biome passes through.
- `src/game/loadForest.ts` (`buildSource`): compute `biomeAt` from the base
  provider, wrap the provider, then place trees on the wrapped one.
- Tests (`test/terrain/relief.test.ts`): leaves an ordinary biome untouched;
  dune bumps around the base height; wetland finer and gentler than a dune;
  deterministic; different per seed; switches shape exactly where the biome
  does.
- Look at it: a temporary dune and bog strip in the demo wood, screenshot,
  revert.

Commit: `feat: dune and bog relief`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Build one real place with a
lake (any of the known places with water) and look at the shore, a path and a
stream. Push.
