# A live wood behind the start screen — implementation plan

Spec: `docs/superpowers/specs/2026-09-22-attract-backdrop-design.md`.

Branch: current branch. TDD for the pure pieces; the wiring checked on
screenshots. Two commits. `FEATURES.md` ("Start screen") and `CHANGELOG.md`
with the wiring.

## Task 1 — the building blocks

- `src/world/pilotFigure.ts`: `buildWavingFigure()` → `{ group, wave(t),
  dispose }` — the pilot's materials and proportions, no controller, one arm
  at rest and one swinging above the shoulder.
- New `src/game/attractCamera.ts`: `OrbitPose`, `attractOrbitPose(t, centerX, centerZ, radius, height,
  lookHeight, angularSpeed)` —
  position on a circle at a fixed radius and height, looking at a fixed
  point above the centre.
- Not wired in yet.
- Tests: `test/world/pilotFigure.test.ts` (`buildWavingFigure`),
  `test/game/attractCamera.test.ts`.

Commit: `feat: waving figure and orbit-camera building blocks for the attract backdrop`

## Task 2 — the backdrop

- New `src/ui/attractBackdrop.ts`: `createAttractBackdrop(root):
  AttractBackdrop` (`start()`, `stop()` — both safe at any point) — its own renderer canvas behind the picker; loads the
  demo wood (`loadForestData` with no query), `createForest` with deferred
  placements drained in `GROW_SLICE_MS` slices; widens the fog; places the
  waving figure at `FIGURE_OFFSET` from the hut; advances the train by
  `TRAIN_HEAD_START`; per frame updates the train, critters, birds and the
  orbit camera; `stop()` disposes everything.
- `src/ui/placePicker.ts` and the loading overlay: translucent backgrounds,
  text shadows.
- `main.ts`: start the backdrop before the picker; keep it through loading;
  `stop()` after the real game's first rendered frame.
- Look at it: the start screen at several orbit times; the loading screen
  over it; `npm run boot-check`.

Commit: `feat: a live quadcopter flyover as the start screen's own backdrop`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
