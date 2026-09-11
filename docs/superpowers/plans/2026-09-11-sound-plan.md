# Sound: footsteps, water, birds, music — implementation plan

Spec: `docs/superpowers/specs/2026-09-11-sound-design.md`.
Already in place: `audio/audio.ts`'s `AudioEngine` with `collect()`,
`Prefs.soundVolume`, `mergeSave()`.

Branch: one worktree per independent task (footsteps, birds, water), merged
back as each is green; music and the live fixes on the main branch. TDD for
every pure helper. One commit per task.

## Global constraints

- Pure decision logic (`audio/footsteps.ts`, `birdCalls.ts`,
  `waterAmbience.ts`, `musicAmbience.ts`) is separate from node graphs and
  fully tested; `AudioEngine` node wiring is not unit-tested.
- Everything goes through the engine's master gains so the volume prefs
  apply.
- Ramps use `setTargetAtTime`, never a jump — no clicks.

## Task 1 — footsteps by substrate

- New `src/audio/footsteps.ts`: `FootstepSubstrate`, `crossedFootstep(prev,
  curr)`, `footstepSubstrate(biome, nearWater)`.
- `AudioEngine.footstep(substrate)`: one of four filtered-noise bursts; water
  adds a descending sine "plop".
- `main.ts`: keep the previous `bobPhase`; on a crossing, pick the substrate
  and play.
- Tests (`test/audio/footsteps.test.ts`): see the spec's §3.

Commit: `feat: footstep audio by substrate`

## Task 2 — bird calls from the bird

- `world/birds.ts`: each `Bird` caches the `x/y/z` it was last rendered at;
  `positions()`.
- New `src/audio/birdCalls.ts`: `birdPan(px, pz, yaw, bx, bz)`,
  `birdGain(distance, maxDist)`, `nearestBird(birds, playerX, playerZ, maxDist)`.
- `AudioEngine.birdCall(pan, gain)`: a two-note chirp through a
  `StereoPannerNode`. `main.ts`: a 4–11 s timer.
- Tests (`test/audio/birdCalls.test.ts`): pan 0 ahead, positive right,
  negative left, within [−1, 1], rotates with the player's facing; gain
  loudest at 0, silent at max, monotonic, never negative; nearest within
  range, null out of range, null for an empty flock.

Commit: `feat: positional bird calls`

## Task 3 — quieter, tighter footsteps

- `audio/audio.ts`: `FOOTSTEP_PARAMS` exported; peak 0.14–0.22, bandpass Q
  1.0–1.3 for litter/moss/sand, narrow-Q lowpass kept for water, 0.04–0.06 s.
  The trigger in `footsteps.ts` is untouched.
- Tests (`test/audio/audio.test.ts`): the `FOOTSTEP_PARAMS` list in the
  spec's §3.

Commit: `fix: rebalance footstep synthesis — quieter, tighter, narrower band`

## Task 4 — water you hear before you see

- New `src/audio/waterAmbience.ts`: `WaterBody { ring, kind }`,
  `nearestWater(x, z, bodies)`, `waterAmbienceGain(distance, maxDist)`.
- `AudioEngine.updateWaterAmbience(gain, kind)`: the one continuous graph —
  built lazily once (looping noise → lowpass swept by LFO 1 → gain wobbled
  by LFO 2), then only ramped. `WATER_AMBIENCE_PARAMS` (a static on the engine) per kind.
- `game/scene.ts`: classify rings once at load. `main.ts`: per frame next to
  the footsteps.
- Tests (`test/audio/waterAmbience.test.ts`): gain loudest at 0, silent at
  max, monotonic, never negative; the closer of two bodies; the other once it
  is closer; 0 inside a closed ring; null with no water; degenerate rings
  skipped.
- Live: hold movement toward the demo wood's pond for real seconds — no
  console errors.

Commit: `feat: synthesised water ambience — a stream or pond heard before it is seen`

## Task 5 — music, recorded footsteps, sprint

- `public/audio/`: `day.mp3`, `night.mp3`, `campfire.mp3`, `walk.mp3`,
  `run.mp3`, each through `ffmpeg -map_metadata -1` with the cover stream
  dropped.
- `world/daynight.ts`: `nightFactor(t)` (if not already exported).
- New `src/audio/musicAmbience.ts`: `campfireGain(distance, maxDist)`.
- `AudioEngine`: load the buffers; `updateMusic(night, fireGain)` crossfades
  three looping sources; footsteps on dry ground play the recording.
- `save/store.ts`: `musicVolume`, `footstepVolume`; settings sliders; i18n.
- `game/player.ts`: `SPRINT_SPEED` on `sprint` input; refused while
  crouching. `game/controls.ts`: `Shift` sprints, `Ctrl` crouches. Help text
  updated.
- Tests: `test/audio/musicAmbience.test.ts`; `test/world/daynight.test.ts`
  (`nightFactor`); `test/game/player.test.ts` — runs faster while sprinting;
  refuses to sprint while crouched.
- Live: demo wood, hold `W`+`Shift` — all five mp3 fetched with 200, no
  console errors.

Commit: `feat: real music (day/night/campfire) and recorded footsteps, plus sprint`

## Task 6 — a footstep per footfall, not a loop

- `AudioEngine.footstepClip(sprinting)`: on each `crossedFootstep`, a new
  `AudioBufferSourceNode` from offset 0, cut to 0.4 s (walk) / 0.3 s (run),
  with a short fade on the tail. Remove `updateFootstepLoop`.

Commit: `fix: retrigger the footstep clip per footfall instead of a free-running loop`

## Task 7 — bird calls and the pick sound off

- `main.ts`: remove both `audio.collect()` call sites and the bird-call timer
  (`birdCallTimer`, its RNG, `BIRD_CALL_*` constants and the now-unused
  imports — `noUnusedLocals` would flag them). Keep the engine methods and
  their tests.

Commit: part of `fix: door relief on both faces; disable bird-call and collect sounds`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push. Ask the owner to
listen — that is the only real test of this plan.
