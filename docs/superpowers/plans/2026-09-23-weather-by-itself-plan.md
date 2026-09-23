# Weather that changes by itself — implementation plan

Spec: `docs/superpowers/specs/2026-09-23-weather-by-itself-design.md`.

Branch: current branch. TDD throughout. Two commits: the mode, then the
look of fog and rain (found by looking at the first one). `FEATURES.md` with
the first.

## Task 1 — an auto mode, the default

- `src/world/weather.ts`: `WeatherMode`, `WEATHER_MODES`, `DayPart`,
  `dayPart(t)`, `WEATHER_SPELL_SECONDS`, `autoWeather(seed, spell, t)`;
  `buildWeather` gains a blend: `setWeather(w, instant = true)` — when
  not instant, eases the fog range,
  the particle opacities and an `overcast` factor toward the target over a
  few seconds.
- `src/save/store.ts`: `Prefs.weatherMode` default `'auto'`; on load, drop
  the old `weather` field rather than carrying it over.
- `src/ui/settingsMenu.ts`: the row lists Auto first. `i18n`: its label.
- `src/game/scene.ts`: dim the sun and hemisphere light by `overcast`.
- `main.ts`: in auto, compute the spell from elapsed time and redraw on a new
  spell or part of the day; the F3 panel shows the weather.
- Tests: `test/world/weather.test.ts` (`dayPart`; `autoWeather`; blending);
  `test/save/store.test.ts` (a save from before auto weather starts on auto,
  dropping its old fixed pick; a weather the player picked is kept).

Commit: `feat: weather changes on its own through the day`

## Task 2 — fog that is fog, rain you can see

- `src/world/sky.ts`: a `haze` uniform blending the dome to the converted fog
  colour and fading sun, moon and stars. `src/world/clouds.ts`: no clouds in
  fog.
- `src/world/weather.ts`: `RAIN_N` 1400 in a `RAIN_AREA` 18 m half-box.
- `main.ts` (under `?debug`): `&weather=` pins a weather for the session;
  `&tp=animal:<kind>` and `window.__animals()` for the animal work running
  alongside. `CLAUDE.md`: the hooks.
- Look at it: fog and rain screenshots before and after.

Commit: `fix: fog that is fog, rain you can see; debug hooks to look at both and at animals`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
