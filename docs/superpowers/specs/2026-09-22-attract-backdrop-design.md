# A live wood behind the start screen — design

Date: 2026-09-22
Status: approved, in implementation.
Builds on: `2026-09-14-start-screen-language-design.md`, the quadcopter
(`2026-09-21-quadcopter-design.md`), and `race-the-city`'s attract mode.

## 0. Why

The first thing a new player sees is a form over a flat colour: type a place,
pick a size. Nothing on it says what kind of game this is. Racing games solved
this decades ago with an attract mode — the game playing itself behind the
menu. We have everything an attract mode needs already: a demo wood that
builds offline in seconds, a train, wildlife, a quadcopter whose whole point
is a view from above.

## 1. Decisions

| Decision | Why |
|---|---|
| The backdrop is the **real, running** offline demo wood — its own throwaway `Forest` and renderer behind the picker — not a video or a screenshot | It is exactly the wood "Just show me a wood" drops you into. Nothing to keep in sync with the game's look; no asset in the repo. |
| A quadcopter's-eye orbit round the plot (`attractOrbitPose(t)`: fixed `ORBIT_RADIUS` 100 m and `ORBIT_HEIGHT` 90 m, always looking at a point `ORBIT_LOOK_HEIGHT` 20 m above the centre, one turn in four minutes) | The drone's own view, which the player earns later. Pure and periodic, separate from the gameplay drone's tuning so neither can break the other. |
| It orbits the plot's **centre**, not the hut, at a radius that catches the railway | The railway sits well over 100 m out; an orbit round the hut never showed the train. Tuned on real screenshots, not guessed. |
| The backdrop's own fog is pushed out (`FOG_NEAR` 60, `FOG_FAR` 340) | From 90 m up the game's own 30–140 m fog is a grey wall. |
| The train starts already some way along (`TRAIN_HEAD_START` 45 s), wildlife runs, and a figure **waves** by the hut (`buildWavingFigure` — the pilot's proportions and colours, no controller, an arm swinging above the shoulder) | Something should be happening in the first seconds; and a person in the wood says "you will be here". |
| It keeps running behind the loading screen once a place is picked, and stops only when the real game's first frame renders | The loading screen is the longest wait; it should not go back to a flat fill. |
| The picker and loading overlays become translucent, with a text shadow where needed | The backdrop has to show through; text has to stay legible over a moving scene. |
| The backdrop's finds are built in slices (`GROW_SLICE_MS` 30), the same way the game's loading screen does it | Building it must not freeze the very screen it decorates. |

## 2. Out of scope

- Sound on the start screen.
- Choosing what the backdrop shows (a real place, night, weather).

## 3. Testing

- `attractOrbitPose`: fixed radius and height through the loop; always the
  same look-at point; periodic; deterministic.
- `buildWavingFigure`: human height, standing; legs, torso, capped head, a
  still arm and a waving one, no controller; the waving arm moves over time
  and the hand stays above the shoulder throughout.
- Look at it: screenshots of the start screen at several orbit times — the
  hut, the waving figure, the railway with the train, legible picker text.
  `boot-check` must still start (the backdrop builds a second renderer).
