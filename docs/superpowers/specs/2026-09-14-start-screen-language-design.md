# The start screen: language and settings before you start — design

Date: 2026-09-14
Status: approved, to implement next.
Builds on: `ui/placePicker.ts`, `ui/settingsMenu.ts`,
`2026-09-11-walking-and-menus-design.md` (the pause menu).

## 0. Why

The game has two player-facing languages, and a new player meets the one
they did not choose:

- A fresh save starts in **Russian**, whatever the player reads.
- The language switch lives only in the in-game settings, which cannot be
  reached until the player has already named a place and sat through a load
  — in a language they may not read.

The same is true of every other setting: walking speed, sensitivity,
volumes, weather — none can be set before the first walk.

And one piece of the pause-menu rework turned out wrong in use: a second
`Esc` opens "leave the game?", and from there `Esc` cannot take you back to
the wood. A player who presses `Esc` twice to get back to the game lands on
a dialog asking whether to quit.

## 1. Decisions

| Decision | Why |
|---|---|
| A new save starts in **English** (`emptySave().lang = 'en'`, and `i18n`'s own default) | Most players will meet the game through an English page. Russian is one click away, on the first screen. |
| The title screen carries an RU/EN switch, top-right, the same toggle the settings menu uses; switching re-renders the picker in place | The first screen is where the choice is needed. |
| The title screen gets its own settings gear, opening the same `ui/settingsMenu.ts` panel and writing straight into the save the game will read once it loads | One settings panel, two doors. Nothing new to keep in sync. |
| A second `Esc` in the pause menu **closes it** — the same as "Continue" | `Esc` toggles the menu, as in every other game. The exit-confirm dialog becomes unreachable and is removed with its strings; "Change location" in the menu already does what "Leave" did. |
| Project language is English everywhere — code, comments, docs, commits — and Russian lives only in `src/i18n/` as the game's own localisation | Recorded in `CLAUDE.md`. Old Russian specs stay as written; new ones are English. |

## 2. Out of scope

- Detecting the browser's language. One explicit switch on the first screen
  is simpler to trust than a guess that is sometimes wrong.
- More languages.

## 3. Testing

- `test/i18n/i18n.test.ts`: defaults to English; switches; both dictionaries
  have the same keys and no empty values.
- Live: the title screen in both languages; the gear opens settings, a change
  survives into the game; `Esc`, `Esc` returns to the wood.
