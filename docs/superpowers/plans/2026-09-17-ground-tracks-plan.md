# Fading tracks on the ground — implementation plan

Spec: `docs/superpowers/specs/2026-09-17-ground-tracks-design.md`.

Branch: current branch. TDD for the pure helpers. Two commits: the module,
then the wiring. `FEATURES.md` and `CHANGELOG.md` in the wiring commit.

## Task 1 — the module

- New `src/world/tracks.ts`:
  - Types `FootSide`, `AnimalKind`, `TrackKind`.
  - Pure: `footSide(bobPhase)`, `footOffset(heading, side, spacing)`,
    `fadeScale(life, maxLife)`, `sizeJitter(rand)`.
  - Tables: `TRACK_LIFETIME`, `TRACK_COLOR`, `TRACK_OPACITY`, `TRACK_SIZE`.
  - `createTrackFx(scene, seed = 1): TrackFx` — one pool per kind (a flat quad
    in an `InstancedMesh` with a ring cursor); `layFoot(provider,
    x, z, heading, side)`, `layBike(provider, x, z, heading)`,
    `layAnimal(provider, kind, x, z, heading)`, `update(dt)` ageing every mark
    and recomposing its matrix with `fadeScale`, `setEnabled(on)`, `reset()`.
- Not wired into the game yet.
- Tests (`test/world/tracks.test.ts`): the list in the spec's §3.

Commit: `feat: fading ground tracks module (instanced, ground-toned, not asphalt-black)`

## Task 2 — wire it in

- `src/save/store.ts`: `Prefs.groundTracks`, default `true`.
  `src/ui/settingsMenu.ts`: a toggle row. `src/i18n/i18n.ts`: its label.
- `src/game/scene.ts`: create the `TrackFx`; expose `Forest.layFootTrack`,
  `layBikeTrack`, `updateTracks`, `setTracksEnabled` (the forest samples its
  own ground for each).
- `main.ts`: on each `crossedFootstep` while walking,
  `forest.layFootTrack(x, z, yaw, footSide(bobPhase))`; while riding,
  `layBikeTrack` every `BIKE_TRACK_SPACING` (0.4 m) actually covered — by
  distance, not by event, as the donor lays skid marks;
  `forest.updateTracks(dt)` per frame; `setTracksEnabled(prefs.groundTracks)`
  on load and on change.
- `src/world/critters.ts`: an optional `onStep(x, z, heading)` callback and
  `trackSpacing` (0.35 m) on the critter group — called only while fleeing,
  the first flee step always laying one. `world/critters.ts` never imports
  the track pools; `game/scene.ts` passes `layAnimal` bound to the kind.
- Look at it: the scenes listed in the spec's §3.

Commit: `feat: wire fading ground tracks into settings, the player's own steps, the bicycle and fleeing wildlife`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
