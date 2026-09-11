# Sound: footsteps, water, birds, music — design

Date: 2026-09-11
Status: approved, in implementation.
Builds on: the pick sound (v0.55.0, `audio/audio.ts`) and the camera bob
(`game/player.ts`'s `bobPhase`).

## 0. Why

The game's tone rests on quiet, and the quiet has to be alive. Until now the
only sound was a short synthesised click on picking. Silence between events
reads as a muted tab, not a wood.

From `race-the-city` only the plumbing comes across — one `AudioContext`, a
mixer, volumes, a settings row. Its content (an engine, a radio) is a car's.

## 1. Decisions

### What is synthesised and what is recorded

| Decision | Why |
|---|---|
| Short discrete events are synthesised: the pick click (noise burst through a highpass, sharp attack, fast decay), a footstep on water, a bird's two-note chirp | The project draws without pictures; a click is the same idea applied to sound. No file, no licence. |
| Continuous water is synthesised too: looping noise through a lowpass swept by one LFO (the moving texture) into a gain wobbled by a second LFO (the bubbling) | It had been planned as a CC0 recording. Two LFOs on unrelated periods do not audibly loop, and the stream/pond difference is just parameters. |
| Music and dry-ground footsteps are **real recordings** — the first in the game — at the owner's request: `day.mp3`, `night.mp3`, `campfire.mp3`, `walk.mp3`, `run.mp3` in `public/audio/`, metadata and cover art stripped with ffmpeg before they enter the repo | Synthesised music is not music, and the owner supplied the tracks. The exception is explained in `audio/audio.ts`'s header. |
| One `AudioContext`, resumed on the first guaranteed user gesture — the click on the place picker | Every player makes that click, new or returning. |

### Footsteps

| Decision | Why |
|---|---|
| A footstep fires when `bobPhase` crosses a multiple of π (`crossedFootstep`) — twice per cycle, one per foot | The camera bob already advances only by ground actually covered, so a standing player provably makes no footsteps. |
| The substrate comes from the biome plus a water check (`footstepSubstrate`: water near or in water, sand on dunes, moss on wetland, litter elsewhere) | The same moisture idea `ecology/sites.ts` uses. |
| Synthesised steps are quiet (peak 0.14–0.22, far below the pick's 0.9), short (0.04–0.06 s) and narrow-band (Q 1.0–1.3) | They repeat twice a second; anything near an event's loudness fatigues the ear. A higher Q turns broadband hiss into a tap. `FOOTSTEP_PARAMS` is exported so the bounds are testable without an `AudioContext`. |
| Recorded walk/run clips replace the synthesis on dry ground; water keeps its synthesised splash | The recording sounds like a foot on litter; nothing was recorded for water. |
| Each footfall **retriggers** the clip from offset 0 — a fresh `AudioBufferSourceNode` cut short (0.4 s walk, 0.3 s run) with a fade on its tail | The first version looped the recording continuously and only gated its volume, like water and music. Live report on release: out of step with walking. A loop has no "hit" to land on; footsteps do. |
| Sprint is new, on `Shift`; crouch moves to `Ctrl` alone; no sprint while crouched | `Shift` was crouch, which collides with every FPS habit. `SPRINT_SPEED` in `stepPlayer`, refused crouched like the jump. |

### Where sound comes from

| Decision | Why |
|---|---|
| Bird calls come from the bird: `world/birds.ts` exposes each bird's last rendered position; `nearestBird`, `birdPan` (relative to the player's yaw) and `birdGain` (linear fall-off) decide which bird calls and how it sounds; a `StereoPannerNode` places it; a random 4–11 s wait between calls | A call from nowhere is noise; a call from the birch on your left is a wood. |
| Water is audible before it is visible: `nearestWater` over the pond/stream rings, `waterAmbienceGain` falling off with distance; streams faster, deeper and louder, ponds slow and near-silent (`WATER_AMBIENCE_PARAMS`) | In a wood with few landmarks, a stream you hear is a direction. Kinds are classified once at load, not per frame. |
| Day and night music crossfade on `world/daynight.ts`'s `nightFactor(t)`; campfire music takes over by distance (`campfireGain`) | The same number that darkens the sky and lights the hut's windows — no second idea of "night". |
| Volumes: `Prefs.soundVolume`, `musicVolume`, `footstepVolume`, each its own slider | Music is the first thing a player wants to turn down without losing footsteps. |
| `save/store.ts`'s new `mergeSave()` merges `prefs` as its own level | `loadSave()` merged defaults only at the top level, so an old save's `prefs` object replaced the whole default — every new prefs field would have come back `undefined`, not just `soundVolume`. |

### Taste, decided live

| Decision | Why |
|---|---|
| Bird calls and the pick sound are switched **off** (the calls removed from `main.ts`, the timers and helpers with them); `AudioEngine.collect()` and `birdCall()` stay, tested | The owner's taste, not a bug. Turning them back on is restoring the call sites, not rewriting synthesis. |

## 2. Out of scope

- A forest bed — wind in the crowns, creaking trunks. The owner will send a
  reference first.
- CC0 recordings for anything else; when they come, each file's licence lives
  next to it, like species photos.

## 3. Testing

Pure helpers only — no test in `test/audio/` mocks an `AudioContext`:

- `crossedFootstep` (same half-cycle, the crossing, twice per cycle, standing
  still, several crossings in one frame), `footstepSubstrate` (each case).
- `FOOTSTEP_PARAMS`: a recipe per substrate; peak far below 0.9; short;
  moderate-to-high Q; cut-offs in the audible thud range; sand and litter
  brighter than moss; moss the quietest.
- `birdPan`, `birdGain`, `nearestBird`; `waterAmbienceGain`, `nearestWater`;
  `campfireGain`; `nightFactor`.
- `stepPlayer`: sprint is faster; sprint refused while crouched.
- `mergeSave`: a prefs field the stored save predates is filled from
  defaults.

Whether it *sounds* better is checked by ear in a real browser — headless
Chrome has no audio output, and its throttled `requestAnimationFrame` (1–2
Hz in a background tab) never covers one stride in a wall-clock key hold.
Live runs check only that nothing throws and every mp3 loads (200).
