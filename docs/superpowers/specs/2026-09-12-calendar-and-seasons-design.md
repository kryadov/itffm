# A calendar that runs by itself — design

Date: 2026-09-12
Status: approved (brainstormed 2026-09-11), in implementation.
Builds on: `ecology/spawn.ts`'s `SpawnContext.month`/`daysSinceRain`.

## 0. Why

Every species carries a real `season` (the months it fruits) and the spawn
score already reads drought (`daysSinceRain`). Neither is alive:

- `month` comes from the real wall-clock date, so a player sees one month's
  wood for weeks, and a species that fruits in May is simply never seen by
  someone who plays in October.
- `daysSinceRain` is the constant `2`.

The decision from the brainstorm: the calendar runs **by itself**, quickly. It
does not wait for the player to ask to skip time.

## 1. Decisions

| Decision | Why |
|---|---|
| One real hour is one game day (`REAL_HOURS_PER_GAME_DAY` 1); `gameDaysElapsed(startMs, nowMs)` | A month passes in 30 real hours, a whole year in about 15 real days — every species' window comes round within a couple of weeks of ordinary play. |
| A 360-day game year: 30-day months (`DAYS_PER_MONTH`), `gameMonth(gameDays)` in 1..12 | Round numbers; the game year owes nothing to the real calendar's month lengths. |
| `SaveData.calendarStart` — `Date.now()` when the save is first created — is the fixed point | Survives reloads; the clock keeps running while the tab is closed, as a real season would. |
| Game month 1 is the **real** month the save began in: `realMonthAt(calendarStart)` offsets `gameDays` by `(month − 1) × DAYS_PER_MONTH` | Starting every save in "January" put a September player in winter, where almost nothing fruits, for a day and a half of real time. A new player meets the season outside their window. |
| Rain history is deterministic per seed: `isRainDay(seed, dayIndex)` at `RAIN_CHANCE` 0.25, `daysSinceRain(seed, gameDays)` searching back at most `MAX_DROUGHT_DAYS` 14 | No `Math.random`, as everywhere. Past 14 days the drought penalty in `speciesScore` has already bottomed out, so a longer search buys nothing. |
| Out of season is **rare, not absent**: `speciesScore` uses `OFF_SEASON_WEIGHT` 0.08 instead of `return 0` | The owner's request right after the first release: mushrooms must always be there whatever the month. A hard zero could empty the whole wood for a game month; a steep weight keeps the season visible without a barren wood. |
| `main.ts` computes `gameDays` once at load and passes it to `createForest` and `createWorldStream` (`gameDays = 0` by default) | Old callers and tests are unaffected. Both spawn sites — home plot and streamed chunks — read the same month and drought. |
| Visible weather stays the player's fixed choice in settings | Tying it to the calendar silently would override what the player picked, with no explanation. Whether to add an "auto" mode is a UI decision for the owner. |

## 2. Out of scope

- Weather that follows the calendar (see the table).
- Seasons changing the look of the wood (autumn colour, snow cover).
- A visible date anywhere in the UI.

## 3. Testing

`test/world/calendar.test.ts`: `gameDaysElapsed` zero at start, one day per
real hour, never negative on a backward clock; `realMonthAt` reads the real
month, and with the offset starts `gameMonth` at the save's real month;
`gameMonth` starts at 1, advances every 30 days, wraps after 360, always in
1..12; `isRainDay` deterministic, varying by day and by seed;
`daysSinceRain` never negative, never past the cap, small right after rain.
`test/ecology/spawn.test.ts`: a species scores much lower out of season, but
never zero.

A flaky test found on the way: `test/save/store.test.ts` compared
`mergeSave(undefined)` with a separate `emptySave()` via `toEqual` — both
stamp `Date.now()` into `calendarStart`, and a millisecond apart they differ.
