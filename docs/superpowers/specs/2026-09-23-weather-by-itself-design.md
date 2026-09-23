# Weather that changes by itself — design

Date: 2026-09-23
Status: approved with the owner, in implementation.
Builds on: `2026-09-08-sky-and-weather-design.md` (weather as a fixed choice)
and `2026-09-12-calendar-and-seasons-design.md`, which deliberately left
visible weather alone because changing it silently would override the
player's own choice.

## 0. Why

Weather is one of four fixed settings, and nearly every save sits on the
default, `clear`. The wood never rains on anyone who did not go looking for
rain in a menu. And looked at in the running game, the two weathers that
matter most do not read: fog shows fully fogged crowns as flat pale cut-outs
against a darker sky, and rain shows one or two streaks on screen.

The answer to the calendar spec's open question: make "auto" an explicit
mode, and make it the default — the player can still pin any weather, and a
pinned weather is never overridden.

## 1. Decisions

| Decision | Why |
|---|---|
| A new mode, `WeatherMode = 'auto' \| Weather`, **default `auto`** | Weather becomes something that happens to you. Pinning one is still one click. |
| The preference is **renamed** `weather` → `weatherMode`; the old field is dropped on load | Every existing save holds the old default `clear`, which would read as "pinned to clear" and never see auto. A new name starts them all on auto; nobody loses a choice they made on purpose often enough to matter. |
| The day is split into parts (`dayPart(t)`: night, morning, day, evening); each part has its own odds: by day clear or rain (`RAIN_BY_DAY` 0.4), morning and evening clear or fog (`FOG_MORNING_EVENING` 0.55), night clear or fog (`FOG_BY_NIGHT` 0.35); never snow on its own | Morning mist and evening fog, rain by day, clear starry nights: what a temperate summer wood does. Snow stays a pinned choice — snowing in a season the calendar calls July would be wrong. |
| The draw is redrawn every spell (`WEATHER_SPELL_SECONDS` 180) and at each new part of the day, and is a **pure function** of seed, spell and part (`autoWeather(seed, spell, t)`) | Deterministic like everything else; and testable without a clock. |
| A change **blends in** over a few seconds — fog rolls in, rain fades up — instead of snapping | A cut from clear to fog is a glitch; a fog bank arriving is weather. |
| The sun and sky light dim under rain and fog | Rain under full sunshine reads as a sprinkler. |
| Fog that is fog: the sky dome takes a haze uniform that blends it to the (colour-converted) fog colour and fades the sun, moon and stars; in fog there are no clouds | The dome's shader skips the output colour conversion the fog colour goes through, so fogged crowns stood out pale against it. |
| Rain you can see: 1400 streaks in a 36 m box around the camera instead of 500 over 80 m | Density is per what is on screen, not per area. |
| The F3 panel shows the current weather; `&weather=` pins one for the session without saving it | So a live report can say what the weather was, and a headless check can look at a weather on demand. |

## 2. Out of scope

- Weather that feeds back into the calendar's rain history
  (`daysSinceRain`). They share a seed, not a source; joining them is its own
  change.
- Wind, thunder, puddles.

## 3. Testing

- `dayPart` splits the clock into four parts.
- `autoWeather`: clear or rain by day and both happen; clear or fog in the
  morning and evening; clear or fog at night, never rain or snow; same seed,
  spell and time give the same weather; it changes from spell to spell.
- Blending: fog rolls in gradually when not instant, and all the way in the
  end; rain fades in, and the sky reports overcast under it.
- `save/store.ts`: an old save's `weather` is dropped and it starts on
  `auto`; `weatherMode` round-trips.
- Look at it: `&weather=fog` and `&weather=rain` screenshots, crowns and sky
  together.
