# The start screen: language and settings before you start — implementation plan

Spec: `docs/superpowers/specs/2026-09-14-start-screen-language-design.md`.

Branch: current branch. One commit per task.

## Task 1 — English by default, a switch on the title screen

- `src/save/store.ts`: `emptySave()` → `lang: 'en'`. `src/i18n/i18n.ts`:
  `let current: Lang = 'en'`.
- `src/ui/placePicker.ts`: an RU/EN toggle top-right; on change, `setLang`,
  save, re-render the picker's strings.
- `main.ts`: pass the save and a save callback to the picker.
- Tests (`test/i18n/i18n.test.ts`): "defaults to English" (was Russian);
  "switches language".
- `CHANGELOG.md`: the release line.

Commit: `feat: default to English, add a language switch on the title screen`

## Task 2 — settings on the title screen; Esc closes the pause menu

- `src/ui/placePicker.ts`: a gear button opening `openSettingsMenu` with the
  same save object the game will load.
- `main.ts`: `Escape` while the pause menu is open closes it; delete
  `openExitConfirm()` and its i18n strings.
- Live: change walking speed on the title screen, start, confirm it applied;
  `Esc` twice returns to the wood.

Commit: `fix: pause-menu Escape returns to the game, and settings reachable at the start screen`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
