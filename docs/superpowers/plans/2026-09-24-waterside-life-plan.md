# Life at the water — implementation plan

Spec: `docs/superpowers/specs/2026-09-24-waterside-life-design.md`.

Branch: current branch, as part of the 2026-09-24 batch. TDD throughout; each
feature looked at through its debug hook. One commit per task; `FEATURES.md`
with each.

## Task 1 — fish built like fish

- `src/species/schema.ts`: optional `bodyDepth`, `pattern` (`FISH_PATTERN`),
  `patternColor`, `eyeColor`, `lowerFinColor`, `dorsalFins`, `dorsalAt` on
  `FishMorphology`, validated when present. Data for pike, perch, roach.
- `src/fish/build.ts`: a lathe body with a blunt head and tail stalk, vertex
  colours from back to belly, bars or spots from `pattern`, a forked tail on
  the tapered end, dorsal(s) at `dorsalAt`, anal, pectoral and pelvic fins,
  eyes; one size factor.
- `src/collectible/worldMesh.ts`: `toWorldMesh` keeps per-part vertex colours.
- Tests: `test/fish/build.test.ts` (the spec's list);
  `test/collectible/worldMesh.test.ts` (keeps a part's own colours).

Commit: `feat: fish are built like real fish, each species with its own marks`

## Task 2 — fish swim

- New `src/fish/swim.ts`: `SWIM_MAX_ROAM`, `SwimHome`, `SwimPose`,
  `swimPose(home, t)`.
- `src/ecology/spawn.ts`: optional `Placement.roam` and `Placement.onStream`.
  `src/world/fishSpawn.ts`: measure each fish's room — all water, and in a
  pond within reach of the bank.
- `game/scene.ts`: pose fish every frame (`updateFish(t)`).
- `main.ts`: `&tp=fish`. `CLAUDE.md`: the hook.
- Tests: `test/fish/swim.test.ts`; `test/world/fishSpawn.test.ts` (room in
  the water and within reach; stream fish in the channel).

Commit: `feat: fish swim instead of lying still on the water`

## Task 3 — reed beds

- New `src/world/reeds.ts`: `ReedClump`, `KeepOut`, `REED_REACH_INTO_WATER`,
  `REED_REACH_ONTO_LAND`, `placeReeds(water, ground, seed, keepOut)` — for a
  pond, scan a grid (`POND_GRID`, within `POND_GRID_BUDGET`) for cells where
  the ground crosses the pond's own water level; for a stream, step along
  both banks; beds of `BED_LENGTH` by chance, clumps within; `buildReedMesh
  (clumps)` — instanced stems, leaves and heads, named for scatter culling.
- `game/scene.ts`: keep-outs for the shack and its boat.
- Tests: `test/world/reeds.test.ts`.

Commit: `feat: reed beds along the banks of ponds and streams`

## Task 4 — a rowing boat

- `src/world/fisherHut.ts`: `buildBoatMesh` — planked hull strakes along a
  sheer curve from transom to a pointed bow, tarred below and painted above,
  per-plank shades, a dark gunwale, thwarts, floorboards, oars.
- Tests (`test/world/fisherHut.test.ts`): a boat not a barrel; hollow from
  above; rising at bow and stern and pointed only at the bow; painted planking
  in more than one colour; thwarts and a pair of oars.

Commit: `feat: the fisherman's boat is a real wooden rowing boat`

## Task 5 — crouch as a toggle

- `src/game/controls.ts`: `CROUCH_KEYS` (`ControlLeft`, `ControlRight`,
  `KeyC`), `nextCrouch(on, code, repeat)`; the bicycle stands you up; the
  quadcopter still descends while a crouch key or `Shift` is held.
  `src/game/touchControls.ts`: the button toggles and stays lit.
- Help text: `Shift` runs, `Ctrl`/`C` crouches.
- Tests (`test/game/controls.test.ts`): the crouch toggle group.

Commit: `feat: crouch is a toggle — one press down, the next up`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; screenshots through
`&tp=fish` and of a reed-lined pond and the boat.
