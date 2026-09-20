# The rod and the bicycle in your hands — implementation plan

Spec: `docs/superpowers/specs/2026-09-20-items-in-hand-design.md`.

Branch: current branch. TDD throughout. One commit per task; `FEATURES.md`
and the Rules & Quests screen updated in the same change as the behaviour.

## Global constraints

- An ability is checked against `'carrying'`, never `'done'`, after this plan.
- Every visual of the carried bicycle is checked on a screenshot from the
  player's eye, not only by its tests — this is the part tests have missed
  before.

## Task 1 — the bicycle in view; leave it at any wall

- `src/world/shelter.ts`: `ShelterWall`, `SHELTER_WALLS`, `BikeSpot { wall,
  along }`, `DEFAULT_BIKE_SPOT`, `nearestBikeSpot(s, p)` → `{ spot, point }`,
  `bikeSpotLocal(spot)`, `bikeSpotWorld(s, spot)`; the parked trophy placed
  at the spot, both wheels on the real ground, never across the doorway.
- `src/save/store.ts`: the chosen `BikeSpot` per save.
- New `src/game/bikeView.ts`: `createBikeView(worldScene)` — its own scene
  holding the bar, stem, fork and front wheel at `BAR_IN_VIEW`, scaled by
  `VIEW_SCALE` and tilted by `VIEW_TILT`; lights copied from the world each
  frame; `update(dt, yaw, camera, forwardSpeed?)` and `render(renderer, camera)` —
  a second pass right after the wood's own render.
- New `src/game/bikeSteer.ts`: `MAX_STEER`, `steerTarget(yawRate)`,
  `easeToward`, `smoothSteer(current, target, dt)`.
- `main.ts`: show the view while the bicycle is carried; steer from the
  frame's yaw change.
- Tests: `test/world/shelter.test.ts` (the parked bicycle; `nearestBikeSpot`;
  `bikeSpotLocal`); `test/game/bikeView.test.ts` (hidden, follows the
  camera, bar low, wheel in front of and below the bar, turns only while
  turning, starts straight, takes the wood's light, no light no throw);
  `test/game/bikeSteer.test.ts` (steer target, smoothing, easing).

Commit: part of `feat: rebuild the mine, carry the bicycle in view, leave it at any wall`

## Task 2 — riding what you carry; a visible rod; a fish that says why

- `src/game/player.ts`: `cameraBob(state, scale)`; the bob scale eases to 0
  while riding; no footsteps while riding.
- `main.ts`: speed while carrying the bicycle; the hint and toast for a fish
  without the rod.
- `src/world/questItemModels.ts`: a chunkier rod (cork handle, reel), lifted
  over trails and pitched along the slope.
- `src/fish/build.ts`: the tail cone scaled along the fish, on the tail end.

Commit: `fix: ride the carried bicycle, make the rod visible, mend the fish tail, explain why a fish cannot be taken`

## Task 3 — abilities in hand; take them back; fish in the water

- `game/player.ts`: `ridingSpeedFactor(riding)` — `RIDING_SPEED` 1.6 when
  riding, 1 otherwise; remove the delivered bike's path bonus.
- `game/pick.ts`: `canPick(species, rodOwned)` — a fish only with the rod;
  `main.ts` now passes "the rod is in hand".
- `src/quest/state.ts`: `tryTake` and `interact` handle take/leave at the hut, one
  transition per call. `world/shelter.ts`: `rodSpotWorld(s)`, `insideHut(s,
  x, z)` — the rod only from inside.
- `ecology/spawn.ts`: fish score 0 on land. New `src/world/fishSpawn.ts` (`spawnFish`):
  schools in ponds (shallows along the bank, at the water's surface) and
  streams, kept only where the bank is within reach.
- `ui/questGuide.ts`, prompts and `FEATURES.md` rewritten.
- Tests: `test/game/player.test.ts` (`ridingSpeedFactor`),
  `test/game/pick.test.ts` (`canPick`), `test/quest/state.test.ts`,
  `test/world/shelter.test.ts` (where the rod and the bicycle wait at home;
  knows the hut floor from outside), `test/world/fishSpawn.test.ts`.
- In the built game: bicycle taken, left and taken again with the right
  toasts, the wall remembered, ~1.55× speed measured.

Commit: `feat: rod and bicycle in your hands, taken back from the hut; fish live in the water`

## Task 4 — the front wheel turns with your speed

- `game/bikeSteer.ts`: `ROLLING_RADIUS` (the model's wheel 0.32 + tyre 0.025
  + tread 0.004), `wheelSpin(angle, forwardSpeed, dt)` capped at
  `MAX_WHEEL_SPEED`, `forwardSpeedOf(dx, dz, yaw, dt)`.
- `game/bikeView.ts`: spin the wheel group; raise it into the frame so it
  shows; a reflector so the spin can be seen.
- Tests: `wheelSpin` — once round per circumference, forward is negative,
  reversed backward, still when standing, additive however the time is cut;
  `forwardSpeedOf` — along the facing, negative backward, zero sideways or
  standing, zero for no time and sane when teleported. `bikeView` — spins
  with speed, not when not carried, the angle stays small.

Commit: `feat: the bicycle's front wheel turns with your speed, and shows in the view`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; screenshots from the
player's eye riding straight and turning, by day and at dusk.
