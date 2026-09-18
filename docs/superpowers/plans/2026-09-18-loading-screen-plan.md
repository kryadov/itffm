# The frozen loading screen — implementation plan

Spec: `docs/superpowers/specs/2026-09-18-performance-and-loading-design.md` §2.

Branch: current branch. TDD for `yieldToPaint` and the deferred placements;
the screen itself is measured live. One commit.

## Global constraints

- Slicing must not change the wood: a deferred build drained in slices equals
  an immediate build, placement for placement.
- Nothing may wait on `requestAnimationFrame` alone.

## Task 1 — measure first

- Headless Chrome on the demo wood, a `requestAnimationFrame` counter and a
  longest-gap tracker injected with `Page.addScriptToEvaluateOnNewDocument`,
  from the click on "Just show me a wood" to `window.__READY`. Record frames
  and the worst pause. (Expect a handful of frames and a multi-second gap.)
- A temporary `performance.now()` around each stage of `loadForestData` and
  `createForest` to find where the time goes. Removed before the commit.

## Task 2 — yield to paint, defer the finds, close after the first frame

- New `src/util/yield.ts`: `yieldToPaint()`.
- `src/game/scene.ts`: `createForest(..., deferPlacements = false)` — when set,
  compute placements but build no meshes; expose `pendingPlacements(): number`
  and `buildPlacements(budgetMs): number` (builds until the budget is spent,
  always at least one, and returns what is still pending);
  `mushroomObjects` grows in place.
- `main.ts`: after `createForest`, loop `forest.buildPlacements(GROW_SLICE_MS)`
  (30) + `await yieldToPaint()` while `pendingPlacements() > 0`, advancing the bar through a new `grow` stage;
  `await renderer.compileAsync(scene, camera)`; render one frame; then close
  the overlay.
- `src/game/loadForest.ts`: `await yieldToPaint()` before the tree/biome
  block.
- `src/i18n/i18n.ts`: the `grow` stage label in RU and EN.
- `src/mushroom/build.ts`: compute `capWobble` once per angle and reuse it
  across rings.
- Tests: `test/util/yield.test.ts` (the three cases in the spec);
  `test/game/scene.test.ts` (createForest deferred placements — nothing up
  front, everything on request; progress on a zero budget, drains in slices;
  same wood as all at once).
- Measure again as in Task 1 and put both numbers in the commit body.

Commit: `perf: keep the loading screen alive while the wood's mushrooms are built`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; a real large place with
the network on, watching the spinner by eye.
