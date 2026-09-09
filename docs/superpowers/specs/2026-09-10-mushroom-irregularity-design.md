# No two mushrooms alike — design

Date: 2026-09-10
Status: approved, in implementation.
Builds on: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md` §4.1
(the model is generated from the species' parameters) and `mushroom/profile.ts`.

## 0. Why

Every mushroom is a perfect solid of revolution: a lathe-swept cap on a dead
straight stipe. Two boletes of one size and age are the same object rotated.
In a real wood no two caps are round and no two stipes are plumb — a cap is
dented where it pushed past a leaf, a stipe leans toward the light. The eye
reads perfection as plastic long before it can say why.

The constraint that shapes everything below: **the measurements that decide
identification do not move.** Cap radius, stipe height, gill, ring and volva
sizes come from the species data and stay exactly as drawn from it. Only the
visual surface ripples around them.

## 1. Decisions

| Decision | Why |
|---|---|
| Two pure functions in a new `mushroom/irregularity.ts`, apart from `build.ts` | The same split `mushroom/profile.ts` already has: shape math testable without a `THREE.Group`. |
| `capWobble(phi, seed, age)` scales the cap's lathe radius by angle, sampling `fbm2` on a **circle** in noise space (`CAP_WOBBLE_FREQ` 2.2) | Sampling by angle on a circle is periodic by construction — no seam where the sweep closes on itself. Sampling by raw vertex position, as `world/trees.ts`'s `buildRaggedCrown` does for a crown, would tear the cap at 0/2π. |
| The wobble's amplitude grows with age: `CAP_WOBBLE_YOUNG` 0.02 → `CAP_WOBBLE_MATURE` 0.07 | A button is near-round; an old cap is weathered and dented. A fraction of the radius, never enough to double it. |
| The wobble tapers to zero at the apex and at the stipe | A wobbling apex or cap-to-stipe junction opens holes. |
| `stipeBendCurve(t)` leans each stipe ring sideways by its height fraction — zero at the base, eased, full at the top | The stipe still plants where it grew; the lean is a curve, not a hinge at the ground. |
| The lean's direction and size come from the specimen's seed; tall stipes lean, squat ones barely | A 2 cm puffball-like stipe does not bend; a 20 cm parasol does. |
| A bent stipe's tip drifts, so cap, hymenium, ring and warts all take a real `{x, z}` offset from the stipe's actual tip | The one complication a straight port of the crown trick would have missed: everything above the stipe used to assume the tip sits straight over the base (only lateral brackets had an offset, as a scalar). Without this the cap floats beside its own stipe. |
| The world mesh needs nothing new | `toWorldMesh` bakes whatever `buildMushroom` produced. |

## 2. Out of scope

- Breaking the profile itself (a torn rim, a split cap) — that would be a
  morphology field, data rather than noise.
- Irregularity for berries, herbs, nuts, finds.

## 3. Testing

- `capWobble`: deterministic; periodic across 0/2π; grows with age; stays a
  subtle fraction of the radius.
- `stipeBendCurve`: zero at the base, full at the top, monotonically
  non-decreasing.
- `buildMushroom`: a mature cap wobbles more than a young one for one seed;
  a tall stipe leans rather than standing straight; the cap follows the bent
  stipe's actual tip.
- `npm run silhouette-sheet` over the whole roster: no chimeric shapes, no
  broken silhouettes. The measurements tests that already exist must pass
  untouched — that is the proof identification did not move.
