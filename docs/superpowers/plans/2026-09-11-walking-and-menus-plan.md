# Walking, finding your way, and the menus — implementation plan

Spec: `docs/superpowers/specs/2026-09-11-walking-and-menus-design.md`.

Branch: current branch. TDD throughout for `game/` and pure `ui/` helpers; DOM
wiring checked live. One commit per task.

## Global constraints

- `stepPlayer` stays a pure function of `(state, input, dt, ground,
  obstacles, …)`; new behaviour is new fields on `PlayerState`/`PlayerInput`,
  not hidden state in `main.ts`.
- Every new player-facing string goes into `src/i18n/` in RU and EN.
- Every overlay goes through `main.ts`'s one `overlay()` helper.

## Task 1 — slopes and a jump

- `game/player.ts`: `slopeFactor(ground, x, z, dirX, dirZ)` (uphill only,
  35°→54°); `PlayerState.hop`, `vy`; `PlayerInput.jump`. `game/controls.ts`:
  `jumpPending` set on keydown without `repeat`, consumed by `read()`.
- Tests: the slopes and jumping groups in `test/game/player.test.ts`.

Commit: `feat: a steep slope slows you down, jump on Space`

## Task 2 — a compass

- New `src/ui/compass.ts`: `bearingDegrees(yaw)`, `compassLabel(bearing)`,
  `createCompass(root)` — a strip of the eight points scrolled by
  `PX_PER_DEGREE`.
- Tests (`test/ui/compass.test.ts`): north at yaw 0; west and east at a
  quarter turn either way; south at a half; wraps; always in [0, 360); four
  cardinal and four intercardinal names; nearest-of-eight rounding; wraps
  round zero.

Commit: `feat: a compass`

## Task 3 — an honest start

- New `src/game/startPose.ts`: `chooseStartPose(obstacles, halfSize,
  origin = { x: 0, z: 0 }, clearance = DEFAULT_CLEARANCE)` — ring search from the centre.
- Tests (`test/game/startPose.test.ts`): starts at the centre when clear;
  moves away from a tree on the centre; never closer to a tree than its
  radius; within the plot; deterministic; falls back to the centre.

Commit: `feat: an honest start — not blindly at (0, 0)`

## Task 4 — a settings menu

- New `src/ui/settingsMenu.ts` on `M`: walking-speed and sensitivity
  multipliers, mushroom draw distance, language. `Prefs` gains the fields;
  `game/player.ts` and `game/controls.ts` take multipliers instead of
  constants.

Commit: `feat: a settings menu — speed, sensitivity, draw distance, language`

## Task 5 — version in the corner, Esc to leave

- `ui/hud.ts`: `#version` from `__APP_VERSION__` (defined in
  `vite.config.ts`). `main.ts`: `openExitConfirm()` on `Escape`.

Commit: `feat: the version in the corner, Esc to leave to the menu`

## Task 6 — the walking bob

- `game/player.ts`: `PlayerState.bobPhase` advanced by ground distance while
  grounded; `cameraBob(state)` → `{ dy, dx }`. `main.ts` applies it along
  the view's right vector and up.
- Tests: the walking-bob group.

Commit: `feat: camera bob and the rhythm of a step`

## Task 7 — help on H

- `main.ts`: a dim "H — controls" line in the HUD; `H` toggles an overlay
  with the controls text; `H` or `Esc` closes it.

Commit: `feat: a controls hint while walking (H)`

## Task 8 — a minimap, off by default

- New `src/ui/minimap.ts` (ported): `regionToOffscreen`, `headingFromYaw`;
  `createMinimap(root)` with `setWorld(paths, water, shelter, halfSize)`
  drawing the base layer once and `update({ x, z, heading })` rotating it.
- `Prefs.minimap` default `false`; a settings row.
- Tests (`test/ui/minimap.test.ts`): `regionToOffscreen` centre, north-west
  corner, linear scale; `headingFromYaw` north at yaw 0, turning right turns
  toward west like the compass, periodic.

Commit: `feat: a minimap — off by default, the compass stays primary`

## Task 9 — invert look

- `Prefs.invertMouseY` default `false`; `setInvertY(v)` on both
  `game/controls.ts` and `game/touchControls.ts`, multiplying `dPitch`.
- `ui/settingsMenu.ts`: extract `toggle(key, labelKey)` from the minimap row;
  add the invert row.

Commit: `feat: mouse setting — invert vertical look`

## Task 10 — overlays that scroll; Pointer Lock on "Go"

- `main.ts`'s `overlay()`: outer container `overflow-y:auto`, inner wrapper
  `min-height:100%; display:flex; align-items:center`.
- `main.ts`: call `renderer.domElement.requestPointerLock()` (with a
  `.catch`) in the place picker promise's `.then`, before `loadForestData`.
- Live: `Emulation.setDeviceMetricsOverride` at 220 px height — the button
  starts off-screen and `scrollIntoView` reaches it.

Commits: `fix: the first-run screen was unreachable on a phone`,
`fix: mouse-look needed an extra click after "Go"`

## Task 11 — remove the disclaimer

- `main.ts`: delete `showDisclaimer()`, its first-run call and markup;
  `ui/encyclopedia.ts`: delete the banner; `save/store.ts`: drop
  `disclaimerSeen` (and from `emptySave()` and tests); `i18n`: drop
  `disclaimer`/`understood` (keep `controls`, used by `H`);
  `scripts/shot-cdp.mjs`: stop clicking it away.
- Live: pick the demo place — gameplay directly, no screen in between.

Commit: `fix: remove the first-run disclaimer screen entirely`

## Task 12 — a pause menu

- `main.ts`: `openPauseMenu()` — Continue, Settings, Change location,
  Encyclopedia, Basket — each calling the existing entry point; `Escape`
  opens it, a second `Escape` opens `openExitConfirm()` on top; the confirm
  refuses to stack twice.
- `ui/hud.ts`: the gear opens the pause menu; tooltip "Menu — Esc".
- `i18n`: `pauseTitle`, `pauseContinue`, `pauseChangeLocation`.
- Live: the sequence in the spec's §3, screenshots looked at.

Commit: `feat: rework Escape into a pause menu before the exit confirm`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
