# The hut, the campfire and the fisherman's shack — implementation plan

Spec: `docs/superpowers/specs/2026-09-09-shelter-and-camp-design.md`.
Builds on `world/shelter.ts` (`placeShelter`, `buildShelterMesh` returning
`ShelterFx`), `util/openSpot.ts`, `world/water.ts`'s `classifyWater`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task. Every task ends with a headless
screenshot taken through a **temporary** teleport hook in `main.ts`, removed
before the commit (`git diff main.ts` empty).

## Global constraints

- All hut dimensions are named constants in `world/shelter.ts`; positions of
  windows, furniture and obstacles are formulas off them, never numbers
  picked by eye.
- No collision shape other than circles: walls, door and furniture are all
  `Circle`s consumed by `stepPlayer` through `extraObstacles`.
- Decoration (smoke, door grooves, firewood, well) has no collision of its
  own.

## Task 1 — window frames, light that stays inside, firewood and a well

- `buildWindow()`: a cross of box muntins (`vMuntinGeo`/`hMuntinGeo`) over
  the glass.
- Shadows for the hearth light only: walls cast and receive, the light casts,
  `world/ground.ts`'s mesh receives.
- New subgroups in `buildShelterMesh()`: `firewood` (a stack of cylinders
  with lighter end caps) and `well` (an open cylinder ring, two posts, a
  beam, a roof, a rope, a bucket).
- `main.ts`: `?debug=1` panel — aim, player position, view angle, distance to
  the nearest small find (for the berry reports running in parallel).
- Tests: each window has a muntin bar; a firewood pile and a well exist;
  the hearth light casts shadows and the walls cast and receive.

Commit: `feat: hut — window frames, no light leak, firewood and a well; live debug panel`

## Task 2 — a hut that stands on a mapped hut

- `src/geo/parse.ts`: `isShelterTag(tags)`; nodes push `{ at }`, polygons
  push their `centroidOf` (new in `util/geometry.ts`) into `world.shelters`.
- `src/geo/overpass.ts`: add `building=hut` (only that value) to
  `forestQuery`.
- `src/world/shelter.ts`: `placeShelter(ground, halfSize, seed, obstacles, mapped: Vec2[] = [])` — the first
  mapped point inside the plot wins outright; otherwise the existing
  `findOpenSpot` search.
- Tests: `test/geo/parse.test.ts` — takes a mapped hut/shelter/tower as a
  point, node or way alike; does not read an ordinary building as a shelter. `test/world/shelter.test.ts` — stands where a surveyor
  mapped one; ignores one outside the plot; falls back with none.

Commit: `feat: the hut stands on a real OSM hut when there is one`

## Task 3 — human scale; firewood off the wall

- Constants: wall height 1.7 → 2.3 m, door 0.7 × 1.25 → 0.95 × 2.0 m,
  footprint 2.6 × 2.2 → 3.0 × 2.6 m, `SHELTER_RADIUS` 1.8 → 2.1 m (the new
  half-diagonal ≈ 1.99 m plus a margin). Well ring 0.32 → 0.55 m, posts
  0.85 → 1.05 m.
- Firewood rows run along z (along the wall), each log's length along x.
- Test: `Box3.intersectsBox(log, wall)` is false for every log — keeps
  every log of the firewood pile clear of the wall it leans against.

Commit: `fix: hut — real human scale, firewood no longer through the wall`

## Task 4 — the campfire

- `src/util/openSpot.ts`: `findOpenSpot(..., extra?)`.
- `src/world/smoke.ts`: `smokeOffset(t, phase)`, `smokeScale(t)`,
  `smokeOpacity(t)` moved out of `shelter.ts`; the hut calls them.
- New `src/world/campfire.ts`: `placeCampfire(ground, halfSize, seed,
  obstacles, shelter)` — search origin opposite the hut through the centre,
  noise on the angle, `extra = isClearing`; `campfireObstacle` (ring + bench,
  `CAMPFIRE_RADIUS` 1.3 m); `buildCampfireMesh(c): CampfireFx` — stones,
  crossed logs, `EMBER_COLORS` embers each with its own emissive material,
  flickering point light, tripod and pot, bench turned to the fire, smoke.
- `game/scene.ts`: place it after the hut, add its obstacle, update it per
  frame.
- Tests: `test/util/openSpot.test.ts`, `test/world/smoke.test.ts`,
  `test/world/campfire.test.ts` — see the spec's §3.

Commit: `feat: a campfire with a pot and a bench, apart from the hut`

## Task 5 — going in, a door on a hinge

- `buildShelterMesh`: replace the wall box with six panels and a plank floor;
  `doorHinge` group with the leaf, grooves and a handle at the free edge;
  `toggleDoor()`, `update(dt)` easing the hinge to `DOOR_OPEN_ANGLE` at
  `DOOR_SWING_RATE`.
- `wallObstacles(s)` — circles every `WALL_CIRCLE_SPACING` along the walls,
  stopping one circle radius short of the doorway; `doorObstacle(s)` — one
  circle across the doorway, radius `DOOR_CLOSED_RADIUS` when closed and 0
  when open; `doorPosition(s)`.
- `game/scene.ts`: the hut's player collision becomes `wallObstacles` +
  `doorObstacle` (the big `shelterObstacle` stays only for siting other
  things). `main.ts`: `E` near the door toggles it and the HUD shows "Door —
  E"; a touch tap with no find near the door does the same.
- Tests: the doorway gap stays open; circles rotate with the hut; the door
  circle sits at the doorway, blocks the whole gap, and is within
  interacting distance; starts closed; toggles and clears/restores the shared
  obstacle; swings over time. Integration: walk `stepPlayer` at the closed
  door (stopped outside), toggle, walk again (ends inside).

Commit: `feat: walk into the hut, a door on a hinge`

## Task 6 — furniture

- `BED_*`/`TABLE_*` constants from `WIDTH` and `WALL_THICKNESS`; bed (frame,
  mattress, pillow, legs), table (top, legs) with a named `cup` child, a
  painting of flat shapes on the back wall, all `DoubleSide`.
- `interiorObstacles(s)` — one circle each for bed and table, added to
  `extraObstacles`.
- Tests: bed, table, cup and painting exist; the cup sits on the table's
  surface; the painting has more than one colour; bed and table have their
  own collision and rotate with the hut.

Commit: `feat: furniture in the hut — a table, a bed, a painting, a cup`

## Task 7 — the fisherman's hut and boat

- New `src/world/fisherHut.ts`: `placeFisherHut(water, ground, halfSize, seed,
  obstacles)` — `null` with no water; pick a pond ring if any, else a stream;
  a shore vertex; the boat on that vertex along the shore's tangent; the hut
  `SHORE_DISTANCE_MIN`..`MAX` (4–7 m) inland, facing the water.
  `fisherHutObstacle`, `buildFisherHutMesh`, `buildBoatMesh` (extruded
  tapered outline).
- Tests: null without water; deterministic; sites a hut by a pond; stays in
  the plot; boat at the water's edge, hut further back; pond preferred over
  stream; obstacle blocks the shack; the boat is longer than it is wide.

Commit: `feat: a fisherman's hut and a boat on the shore, where there is water`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; the screenshots listed in
the spec's §3. Push.
