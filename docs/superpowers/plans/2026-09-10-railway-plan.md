# A railway through the wood — implementation plan

Spec: `docs/superpowers/specs/2026-09-10-railway-design.md`.

Branch: current branch. TDD throughout. One task, one commit — the whole
feature is small.

## Task 1 — line, rails, train

- New `src/world/railway.ts`:
  - `RailPoint { x, z, y }`, `RailLine { points }`.
  - `placeRailLine(ground, halfSize, seed)`: a direction and an offset of
    `OFFSET_MIN`..`OFFSET_MAX` × `halfSize` from the centre, spanning
    `SPAN_FRAC` of the plot, sampled at `RAIL_SEGMENTS` (12) points, each at
    `ground.heightAt`.
  - `railHeightAt(line, x)`: linear between the bracketing points.
  - `stepTrainT(t, dir, dt, speed, lineLength): { t, dir }`: advance
    `t` in 0..1; on passing either end, clamp and reverse.
  - `buildRailMesh(line)`: two box rails (`RAIL_HEIGHT` 8 cm) at
    `RAIL_GAUGE`, sleepers every `SLEEPER_SPACING` 1.4 m as one
    `InstancedMesh`.
  - `createTrain(scene, line, seed): Train` — `CAR_COUNT` box cars
    (`CAR_LENGTH`, `CAR_WIDTH`, `CAR_HEIGHT`) spaced by `CAR_GAP`, colour
    from `CAR_COLORS` by seed; `update(dt)` steps `t` and poses each car
    along the line at `railHeightAt`; `dispose()`.
- `game/scene.ts`: `placeRailLine(source.ground, halfSize, seed + 29)`; add the
  rails; create the train; `Forest.updateTrain(dt)`. `main.ts` calls it every
  frame, not gated on where the player is.
- Tests (`test/world/railway.test.ts`): the list in the spec's §3.
- Look at it: frame the line with a temporary teleport, screenshot, revert;
  `git diff` clean before the commit.

Commit: `feat: a rail line and a shuttling train`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
