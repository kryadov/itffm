# Sky, day and night, weather — implementation plan

Spec: `docs/superpowers/specs/2026-09-08-sky-and-weather-design.md`.
Donor: `kryadov/race-the-city` — `app/sky.ts`, `app/clouds.ts`,
`app/daynight.ts`, `app/weather.ts`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Global constraints

- Every `Math.random()` in donor code becomes a `mulberry32(seed)` draw.
- Every donor distance is recomputed for a wood with fog at 140 m — never
  copied as is. Say what it was and what it became in the commit body.
- Only `game/scene.ts` and `main.ts` own lights, fog and the camera; the
  `world/` builders return objects with `update(...)` and take what they need
  as arguments.

## Task 1 — the sky dome

- New `src/world/sky.ts`: `interface Sky { mesh; update(colors, sunDir, …) }`,
  `buildSky()` — a `SphereGeometry` (radius 1500) with `side: BackSide`,
  `depthWrite: false`, `renderOrder` −1, and the donor's shader (horizon
  gradient, sun disc, stars hashed from the view direction). The `night`
  uniform stays 0 until Task 3 drives it.
- `src/game/scene.ts`: add the dome, move it to the camera every frame.
  `main.ts`: camera far plane 300 → 2000.
- `scripts/boot-check.mjs`: the scene has grown (species, grass); widen its
  start-up budget from 2.5 s to 4 s so it fails on hangs, not on noise.
- Tests (`test/world/sky.test.ts`): a back-facing dome painted first; it
  follows the camera; it applies the colours and sun direction it is given.

Commit: `feat: the sky — a dome with a gradient, sun and stars`

## Task 2 — clouds

- New `src/world/clouds.ts`: `buildClouds(seed): Clouds` — `CLOUDS_OVERCAST`
  (40) instances of `PUFFS` (5) merged lumps each, placed once from the seed
  within `SPREAD` 220 m at `Y_MIN`..`Y_MAX` 70–105 m. `setCover(c)` sets
  `mesh.count` between `CLOUDS_CLEAR` and `CLOUDS_OVERCAST`.
  `update(dt, camPos)` drifts by `DRIFT` m/s plus the camera and wraps inside
  the spread.
- Tests (`test/world/clouds.test.ts`): deterministic; different per seed;
  only the clear-sky share drawn by default; more as cover grows, up to the
  full set; drifts with the camera plus wind, wrapping within the spread.

Commit: `feat: clouds drifting over the wood`

## Task 3 — day and night

- New `src/world/daynight.ts`: `TimeMode`, `TIME_MODES`, `DAY_TIME` 0.5,
  `NIGHT_TIME` 0; `sunElevation(t)`, `nightFactor(t)`,
  `sampleDayNight(t): DayNightSample` (sun/hemisphere colour and intensity,
  fog colour, sky colours) interpolated over keyframes; `timeFor(mode,
  cycleT)`. The noon keyframe copies the scene's current constants.
- `src/game/scene.ts`: `updateDayNight(t, camPos)` sets the sun light, the
  hemisphere light, fog colour, and `sky.update(...)` from one sample.
- `src/save/store.ts`: `Prefs.timeMode`, default `'day'`.
  `src/ui/settingsMenu.ts`: a Cycle/Day/Night row. `src/i18n/i18n.ts`: its
  labels in RU and EN. `main.ts`: in cycle mode `t` advances one full day per
  `DAY_LENGTH_SECONDS` (600).
- Tests (`test/world/daynight.test.ts`): see the spec's §3 list, one `it` per
  line.

Commit: `feat: day and night — day/night/cycle modes`

## Task 4 — weather

- New `src/world/weather.ts`: `Weather`, `WEATHERS`, `buildWeather(seed, fog):
  WeatherFx` — rain as `LineSegments` (`RAIN_N` 1400 streaks of `STREAK` 1.2 m
  in a `RAIN_AREA` box), snow as `Points` (`SNOW_N` 700), both recentred on
  the camera each frame; `set(weather)` toggles their visibility and, for
  fog, narrows the scene fog to `FOG_NEAR`..`FOG_FAR` 6–55 m, restoring the
  normal range otherwise.
- `src/save/store.ts`: `Prefs.weather`, default `'clear'`; settings row and
  i18n labels as in Task 3.
- Tests (`test/world/weather.test.ts`): deterministic; different per seed;
  both layers hidden under clear skies; only rain in rain, only snow in snow;
  fog tightened for fog and restored for clear; rain drops move downward over
  time.

Commit: `feat: weather — rain, snow, fog`

## Task 5 — a flashlight

- `src/game/scene.ts`: a `SpotLight` parented to the camera, aimed along the
  view, off by default, intensity 600 (physical units — check the value on a
  screenshot, not by analogy with the sun). `main.ts`: `F` toggles it.
- No unit test: it is wiring with no logic of its own. Look at it at night,
  once at a wildly high intensity to prove the toggle works, then at the
  chosen one.

Commit: `feat: a flashlight on F`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Screenshots at noon, dusk
and midnight in cycle mode, and one each in rain and fog. Push.
