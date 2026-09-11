# A calendar that runs by itself — implementation plan

Spec: `docs/superpowers/specs/2026-09-12-calendar-and-seasons-design.md`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Global constraints

- `world/calendar.ts` is pure: timestamps in, numbers out. `Date.now()` is
  read only in `main.ts` and `save/store.ts`.
- New parameters default so every existing caller and test keeps working
  untouched (`gameDays = 0`).

## Task 1 — the calendar module and its wiring

- New `src/world/calendar.ts`: `REAL_HOURS_PER_GAME_DAY`,
  `gameDaysElapsed(startMs, nowMs)`, `DAYS_PER_MONTH`, `gameMonth(gameDays)`,
  `isRainDay(seed, dayIndex)` (hash of `seed + dayIndex * DAY_SEED_STRIDE`
  through `mulberry32`), `daysSinceRain(seed, gameDays)`.
- `src/save/store.ts`: `SaveData.calendarStart`, set in `emptySave()`;
  `mergeSave` keeps a stored one.
- `src/game/scene.ts` (`createForest`) and `src/game/worldStream.ts`
  (`createWorldStream`): optional `gameDays = 0`; `SpawnContext.month =
  gameMonth(gameDays)`, `daysSinceRain = daysSinceRain(seed, gameDays)`
  instead of `new Date().getMonth() + 1` and `2`.
- `main.ts`: `gameDays = gameDaysElapsed(save.calendarStart, Date.now())`
  once at load.
- `test/save/store.test.ts`: compare `mergeSave(undefined)` to `emptySave()`
  ignoring `calendarStart` — the old `toEqual` was flaky by a millisecond.
- Tests (`test/world/calendar.test.ts`, 13): see the spec's §3.

Commit: `feat: a self-running accelerated calendar drives season and drought`

## Task 2 — start in the real month; never empty out of season

- `world/calendar.ts`: `realMonthAt(ms)`.
- `main.ts`: `gameDays += (realMonthAt(save.calendarStart) - 1) *
  DAYS_PER_MONTH`.
- `ecology/spawn.ts`: export `OFF_SEASON_WEIGHT` (0.08); `speciesScore`
  multiplies by it out of season instead of returning 0.
- Tests: `realMonthAt` reads the real month; with the offset, `gameMonth`
  starts at the month the save began in. `test/ecology/spawn.test.ts`: the
  old "scores zero out of season" becomes "scores much lower out of season,
  but never zero".

Commit: `fix: mushrooms had all but stopped appearing since the calendar update`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
