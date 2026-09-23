# Moose, bear, boar, beaver — and real bodies — implementation plan

Spec: `docs/superpowers/specs/2026-09-23-large-animals-design.md`.

Branch: current branch. TDD throughout; every animal looked at through the
debug hook before the commit. Two commits: the ground animals, then the
birds. `FEATURES.md` with the first.

## Global constraints

- One rig, many species: a new four-legged animal is a `quadRig({...})`
  config. If a task adds per-species pose code, it is going the wrong way.
- Facing is tested, not eyeballed: the sign slip passed every existing test.
- The state machine (`stepCritter`) stays the one machine; new behaviour is
  new optional spec fields (wander, home placement), defaulting to the old
  behaviour.

## Task 1 — rigs, the new species, wandering

- New `src/world/animalRigs.ts`: primitives `ellipsoid`, `limb`, `cone`,
  `merge`; `PoseInput`, `Rig`; `quadRig(...)` building torso, neck-pivoted
  head and hip-pivoted legs as merged vertex-coloured meshes; `MOOSE_RIG`
  (with `MOOSE_BULL_SHARE` antlered bulls), `BEAR_RIG`, `BOAR_RIG`,
  `BEAVER_RIG`, `HARE_RIG`, `SQUIRREL_RIG`, `SNAKE_RIG` (`SNAKE_SEGMENTS`).
  Gait from distance covered; a grazing head-down pose with a nibble.
- `src/world/critters.ts`: fix the facing sign; drive the instanced parts
  from a rig; a wander spec (radius, turn-then-walk) for idle animals and a
  walk home after fleeing; `placeBearHomes` (the densest food patch from the
  placements, or none), `placeBeaverHomes` (a tree near water, facing it, or
  none), a boar sounder around one spot; `createMoose`, `createBears`,
  `createBoars`, `createBeavers`.
- `src/game/scene.ts`: place and create them; beavers only with water.
- Tests (`test/world/critters.test.ts`): the spec's §3 lists for facing,
  wandering, the new species and the home placers.
- Look at it: each kind through `&tp=animal:<kind>`.

Commit: `feat: moose, brown bear, wild boar and beaver; real bodies for every ground animal`

## Task 2 — birds the right way round, at a bird's size

- `src/world/birds.ts`: fix the facing sign; curve the landing heading onto
  the run-in instead of snapping; clamp the approach gate to at most halfway;
  a crow-sized spindle body with a paler breast and fanned tail, a head with
  a beak and eyes, fingered wings darker outboard; rescale grounded motion.
- Tests (`test/world/birds.test.ts`): flies head first — its body points
  the way it is going. Size is checked on a screenshot.

Commit: `fix: birds fly head first, at a real bird's size, with a beak and fingered wings`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
