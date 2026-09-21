# The diamond, the train and the quadcopter — implementation plan

Spec: `docs/superpowers/specs/2026-09-21-quadcopter-design.md`.
Builds on the stations (`stationsFor`, `buildStationMesh`) and the train's
dwell at each platform.

Branch: current branch. TDD for the flight model and the figures; the flow is
driven end to end in the built game. One commit for the feature; the
follow-up fixes after the first flight screenshots in the same change.

## Global constraints

- `game/drone.ts` is pure: `(state, input, env, dt) → state`, frame-rate
  independent, deterministic. Nothing in it touches three.js scene objects.
- The view in flight is **from** the drone. No chase camera anywhere.
- While the drone flies, everything that follows "the player" for loading
  and liveliness — streaming, culling, animals, the minimap — follows the
  drone instead.
- Any menu pauses the flight.

## Task 1 — `Train.stopped()`

- `src/world/train.ts`: `stopped(): { end: 0 | 1; cars: { x, z }[] } | null`
  — null while moving; during a dwell, which end and where every car is.
- Tests (`test/world/train.test.ts`, `stopped()`): null while moving, the end
  during the dwell; every car alongside the platform at each end in either
  direction; the cars exactly where they are; a good long wait.

## Task 2 — the flight model

- New `src/game/drone.ts`:
  - `DRONE` constants: top speed, acceleration, `range` 150 m with the signal
    fading from 100 m, ceiling 40 m above the ground below, two-minute
    battery, about a minute to recharge on foot.
  - `DroneState`, `DroneInput` (move, strafe, climb, yaw/pitch deltas,
    home), `DroneObstacle`, `DroneEnv` (ground, obstacles, pilot position).
  - `launchDrone(pilot: { x, z, yaw }, ground, battery)` — hovering just above the
    pilot, facing the pilot's way.
  - `stepDrone(s, input, env, dt)` — eases toward the commanded velocity in
    the camera's frame, leans into sideways moves, clamps height to the
    ground and the ceiling, holds it within range, drains the battery only
    while flying, and flies home by itself (up over the trees, across, down
    to the pilot) when asked or when the battery is empty.
  - `treeObstacles(trees)` — one solid trunk per tree from the ground nearly
    to the top, **no solid crown**: crowns overlap in this wood, and solid
    ones wedged the drone at crown height in 43 of 120 random spots.
  - `droneReadout(s, env)` — height above the ground below, distance from the
    pilot, speed, battery and signal as percentages, the bearing home
    relative to the camera.
- Tests (`test/game/drone.test.ts`): launch; flying (direction, strafe,
  easing and top speed, stopping, climbing above ground, the ceiling over
  flat ground and a hill, mouse turn and tilt limits, leaning, determinism,
  frame-rate independence); radio range; battery; returning home (from far
  and high, over the trees, not fighting the pilot once landed); obstacles
  (never inside a trunk, not stuck, over a top, under a high crown);
  `treeObstacles`; `droneReadout`.

## Task 3 — the pilot, the beacon, the crate, the screen

- New `src/world/pilotFigure.ts`: `buildPilotFigure()` — legs, body, arms, a
  head with a cap, the controller in its hands; `update(dt, target)` turns
  the body toward the drone and tilts the head up, without spinning for a drone
  straight overhead. `buildPilotBeacon()` — a slim orange pole with a flag,
  taller than the tallest tree, unlit so it shows in any light and weather.
- New `src/world/droneCrate.ts`: `buildDroneCrate()`.
  `src/world/station.ts`: `stationCrateSpot(line, station)` — on the slab,
  at its top, clear of the shelter.
- New `src/ui/droneHud.ts`: `createDroneHud(root)` — crosshair, height,
  distance, battery, signal, an arrow home.
- Tests: `test/world/pilotFigure.test.ts` (human height, standing, narrow;
  the parts; facing −z; turning to watch; no spin overhead; relative to where
  it stands; the beacon clears the tallest tree, unlit);
  `test/world/station.test.ts` (the crate spot; a liftable crate on the
  ground).

## Task 4 — the flow and the wiring

- `src/save/store.ts`: `save.drone?: DroneOrder` (`{ stage:
  'ordered' | 'crate' | 'owned', crateEnd }`), validated on load. A save whose diamond already sat on the hut's table gets it
  back as `carrying`. Resetting the quests takes the drone back too.
- `main.ts`:
  - `E` beside a car of a stopped train while carrying the diamond: the
    diamond is `done`, `drone = { stage: 'ordered', crateEnd: other end }`.
    At a platform with no train in, a toast says to wait.
  - The next dwell at `crateEnd`: `stage: 'crate'`, the crate on that
    platform. `E` at it: `owned`; the empty drone box stands on the hut's
    table instead of the diamond.
  - `R` launches (not inside the hut or the mine); the camera is the drone's;
    the figure and beacon stand where the player stood; the HUD shows the
    readout; `R` again or an empty battery flies it home; landing gives the
    camera back.
  - Streaming, culling, animals and the minimap follow the drone in flight.
- `i18n`: toasts, prompts, and `droneHowTo` in the `H` help and the Rules &
  Quests screen (the owner asked for in-game instructions).
- `CLAUDE.md`: the `&tp=` and `&train=` debug hooks.
- In the built game (headless Chrome, demo wood): wait-for-train toast,
  hand-over, crate at the far end, taking it, launch, climb, fly out, the
  readouts, `R` → "flying home", landing. Look at the flight screenshot —
  that is what shows solid crowns wedging the drone, a beacon filling the
  screen, HUD labels wrapping.

Commit: `feat: the diamond goes to the train, and earns a quadcopter you fly`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Report honestly what was
not verified: a real GPU, a real (non-demo) place, touch.
