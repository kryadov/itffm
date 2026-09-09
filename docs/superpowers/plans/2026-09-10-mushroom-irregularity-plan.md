# No two mushrooms alike — implementation plan

Spec: `docs/superpowers/specs/2026-09-10-mushroom-irregularity-design.md`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Global constraints

- `capR`, `stipeH`, gill/ring/volva sizing are computed exactly as before.
  Every existing `test/mushroom/build.test.ts` assertion stays green without
  edits.
- One `size` factor per specimen still drives every dimension.
- `mulberry32`/`fbm2` only — no `Math.random`.

## Task 1 — the pure shape functions

- New `src/mushroom/irregularity.ts`:
  - `capWobble(phi, seed, age): number` — a signed fraction of the
    radius: `fbm2(cos(phi) * CAP_WOBBLE_FREQ, sin(phi) * CAP_WOBBLE_FREQ,
    seed, 2)` times an amount lerped from `CAP_WOBBLE_YOUNG` to
    `CAP_WOBBLE_MATURE` by age.
  - `stipeBendCurve(t): number` — `t²` clamped to [0, 1]: 0 at the base,
    1 at the top, eased rather than linear.
- Not wired into `build.ts` yet: this is the groundwork while the rest of the
  design is settled.
- Tests (`test/mushroom/irregularity.test.ts`): `capWobble` deterministic;
  periodic — no seam where the rim closes; grows with age; stays a subtle
  fraction, never doubling the radius. `stipeBendCurve` zero at the base,
  full at the top, monotonically non-decreasing.

Commit: `feat: pure functions for mushroom irregularity (cap and stipe) — groundwork`

## Task 2 — wire it into the model

- `src/mushroom/build.ts`:
  - `buildCap`: scale each lathe ring's radius by `1 + capWobble(phi, seed,
    age)`, tapered to 1 at the apex and at the stipe junction.
  - `buildStipe`: offset each ring sideways by `lean * stipeBendCurve(t)` in
    a seeded direction, the lean scaled by stipe height; return the tip's
    `{x, z}`.
  - `buildCap`, `buildHymenium`, `buildRing`, `buildWarts`: take that
    `{x, z}` offset instead of the old lateral-bracket-only scalar.
- Tests (`test/mushroom/build.test.ts`): a mature cap wobbles more than a
  young one for the same seed; a tall stipe leans rather than standing
  perfectly straight; the cap follows a bent stipe's actual tip, not a fixed
  point above the base.
- `npm run silhouette-sheet` and look at every species — the oyster mushroom
  lying on its side is correct (a lateral stipe by design), a ragged parasol
  rim is the data's `surface: scaly`, not a bug.

Commit: `feat: no two mushrooms alike — cap wobble and stipe lean`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
