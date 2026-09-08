# Sky, day and night, weather — design

Date: 2026-09-08
Status: approved, in implementation.
Builds on: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md`.

## 0. Why

The wood sits under a flat clear colour at a fixed noon. That is the cheapest
possible sky and it shows: there is no sense of time passing, nothing changes
between one walk and the next, and the fog that hides the edge of the world
is the only atmosphere there is.

`kryadov/race-the-city` already solved most of this for a city: a sky dome
shader, instanced clouds, a day/night keyframe table, rain/snow/fog particles.
The rule from `CLAUDE.md` applies — port and adapt, drop what belongs to cars
and streets.

## 1. Decisions

| Decision | Why |
|---|---|
| The sky is one back-facing dome (`world/sky.ts`'s `buildSky()`), radius 1500 m, painted first and following the camera | A shader paints the horizon gradient, the sun disc and hashed stars from the view direction — no textures, the project has none. Following the camera means the player never reaches its edge. |
| The camera's far plane grows from 300 m to 2000 m to hold the dome | The fog still hides the wood at 140 m, so what is drawn of the wood does not change — only the dome needs the depth. |
| `buildSky()` takes no scene and returns an object with `update(...)`; the caller adds it | Same shape as every other `world/` builder. |
| Clouds are one instanced layer of low-poly lumps (`world/clouds.ts`), `setCover(0..1)` choosing how many of the pre-built instances draw (`CLOUDS_CLEAR` 12 → `CLOUDS_OVERCAST` 40) | One draw call for the whole layer. Weather can thicken the sky without building anything new. |
| Cloud heights and spread are rescaled for a wood: 70–105 m up, 220 m spread (the city used 130–175 m and 480 m) | With fog cutting at 140 m, a cloud further out is just a fog-coloured smear, not a shape. Recompute for our scale; never copy a donor's numbers blind. |
| `Math.random()` in the donor code becomes `mulberry32(seed)` | `src/` has no nondeterministic generation. The sky over a wood must look the same after a reload, like its ground. |
| Day and night are pure functions in `world/daynight.ts` — `sunElevation(t)`, `nightFactor(t)`, `sampleDayNight(t)` over a keyframe table, `timeFor(mode, cycleT)` | The city's neon mode and stage logic are dropped. A pure sampler is testable and shared by everything that needs "how dark is it". |
| The noon keyframe equals the scene's old fixed constants exactly | "Day" (the default) looks precisely like the wood always has. Day/night is additive, not a rewrite of the base look. |
| Three time modes, `TimeMode = 'cycle' \| 'day' \| 'night'`, chosen in settings (`M`); in cycle mode ten real minutes are one game day | A player who wants the noon wood keeps it. A cycle that slow is noticeable over a walk without being a strobe. |
| Sun light, hemisphere light, fog colour and the dome all read from one `updateDayNight(t, camPos)` in `game/scene.ts` | One source of truth for "what time is it", instead of four constants drifting apart. |
| Weather is `'clear' \| 'rain' \| 'snow' \| 'fog'` (`world/weather.ts`'s `buildWeather(seed, fog)`): rain as line segments, snow as points, in a box around the camera; fog only tightens `scene.fog` | Particles in a moving box cost the same wherever the player is. The particle box (`AREA`/`TOP`/`BOT`) is shrunk from the city's scale. |
| Weather is a fixed choice in settings for now — the donor's `auto` mode is not ported | Its natural driver is a game calendar (which would also feed `daysSinceRain` in `ecology/spawn.ts`), and there is no calendar yet. A fixed choice is honest; an auto mode with nothing behind it is not. |
| A flashlight on `F`: a `SpotLight` on the camera, off by default, not saved | It is the state of one walk, not a preference. |
| The flashlight's intensity is chosen by eye (600) | three r150+ uses physical units for spot and point lights, falling off with the square of distance; an intensity like the sun's (~1–2.6) is invisible. |

## 2. Out of scope

- Moon phases. The dome can show a moon disc; phases want a date, and the
  game has no calendar of its own yet.
- Weather that changes by itself (see the table) and any link from weather to
  what grows.
- Sound for any of it.

## 3. Testing

- `world/daynight.ts`: the sun peaks at noon, bottoms out at midnight, crosses
  zero at dawn and dusk; `nightFactor` is 0 at noon, 1 at midnight, never
  negative after sunrise, always in [0, 1]; the noon sample matches the old
  fixed look; sampling interpolates smoothly and wraps past midnight;
  `timeFor` locks day and night and passes the clock through in cycle mode.
- `world/sky.ts`: a back-facing dome drawn first; it follows the camera; it
  applies the colours and sun direction it is given.
- `world/clouds.ts`: deterministic, different per seed, only the clear-sky
  share by default, more as cover grows, drifting with the camera plus wind
  and wrapping within the spread.
- `world/weather.ts`: deterministic, different per seed, both particle layers
  hidden when clear, only rain in rain and only snow in snow, fog tightened
  and restored, rain falling over time.
- Look at it: noon, dusk and midnight screenshots; rain and fog screenshots.
