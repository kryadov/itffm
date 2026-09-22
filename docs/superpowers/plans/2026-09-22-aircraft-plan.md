# Aircraft over the wood — implementation plan

Spec: `docs/superpowers/specs/2026-09-22-aircraft-design.md`.

Branch: current branch. TDD, one commit.

## Task 1 — port, adapt, add the An-2

- New `src/world/aircraft.ts`: `AircraftKind`, `AIRCRAFT_PROFILES`,
  `AIRCRAFT_SPAN`, `BALLOON_SILKS`; one builder per kind (the donor's
  airliner, jet, turboprop, helicopter and balloon, and a new biplane);
  `createAircraft(scene, rand): Aircraft` — `update(dt, camX, camZ, night,
  hidden, groundY?)` picks the next kind after a `GAP_MIN`..`GAP_MAX` wait, flies it
  along a straight line through the sky over the camera, spins rotors and
  props, blinks the strobe and lights the navigation lights at night, hides
  everything while `hidden` (fog); `summon(kind, camX, camZ)` for the debug
  hook.
- `game/scene.ts`: create it with a seeded `rand`; per-frame update with the
  day/night and weather state.
- `main.ts`: `&sky=<kind>` calls `summon(kind, …)` once, eastbound.
- `CLAUDE.md`: the `&sky=` hook.
- Tests (`test/world/aircraft.test.ts`): the list in the spec's §3.
- Look at it: one screenshot per kind, looking west and up.

Commit: `feat: aircraft cross the sky over the wood`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
