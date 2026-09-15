# Minimap markers and a quest guide screen — implementation plan

Spec: `docs/superpowers/specs/2026-09-15-quest-minimap-and-guide-design.md`.
Builds on the shipped quest-items feature (`src/quest/*`, `QUEST_ITEM_COLOR`
in `main.ts`, `ui/minimap.ts`'s single shelter marker).

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Task 1 — generalize the minimap to a marker list

- `src/ui/minimap.ts`: replace the single `shelter: Vec2` parameter of
  `setWorld` with nothing (drop it from `setWorld` entirely — that function
  keeps only `paths`/`water`/`halfSize`, the static base layer). Add
  `setMarkers(markers: MinimapMarker[]): void` to the `Minimap` interface,
  storing the list in a closure variable. Extract the existing
  bearing/clamp/screen-position arithmetic (currently inline in `update()`
  for `shelterPoint`) into a small pure function, e.g.
  `markerScreenPos(marker: Vec2, player: {x,z,heading}, half: number,
  viewRadius: number): {x, y}`, exported for testing. `update()` loops over
  the stored markers, calling this function and filling each dot with its
  own `color` instead of the hardcoded `#d8a04a`.
  ```ts
  export interface MinimapMarker { position: Vec2; color: string }
  ```
- Test (`test/ui/minimap.test.ts`): `markerScreenPos` — a marker straight
  ahead of the player lands above centre; a marker behind lands below;
  clamps to the edge radius when farther than the view radius; unaffected by
  markers other than itself.

Commit: `feat: generalize minimap to a list of coloured markers`

## Task 2 — a second, independent minimap preference

- `src/save/store.ts`: add `minimapQuestHints: boolean` to `Prefs`, default
  `false` in `defaultPrefs()`. `mergeSave`'s existing shallow-merge-over-
  defaults for `prefs` already fills this in for an old save with no
  knowledge of it — no migration code needed, same as every other `Prefs`
  field added before it.
- No new test strictly needed (the existing "fills in a prefs field a stored
  save predates" test in `test/save/store.test.ts` already proves the
  general mechanism); add one only if it reads as a meaningfully different
  case once you're in the file.

Commit: `feat: add a separate opt-in for quest-item minimap hints`

## Task 3 — settings menu row for the new preference

- `src/ui/settingsMenu.ts`: widen the existing generic `toggle()` helper's
  key union from `'minimap' | 'invertMouseY'` to also accept
  `'minimapQuestHints'`, and add `toggle('minimapQuestHints',
  'settingsMinimapHints')` below the existing minimap toggle.
- `src/i18n/i18n.ts`: add `settingsMinimapHints` to both `RU` and `EN`,
  next to `settingsMinimap` — something like "Show quest items on the
  minimap" (EN) / «Показывать квестовые предметы на мини-карте» (RU). Reuse
  the existing `settingsOn`/`settingsOff` button labels, same as the other
  toggles.

Commit: `feat: expose quest-hint minimap toggle in settings`

## Task 4 — expose the mine's landmark position from Forest

- `src/game/scene.ts`: `Forest` already builds a `Mine` (`mine.x`, `mine.z`)
  but never returns its position, only derived helpers (`playerInsideMine`,
  `diamondSpot`). Add `mine: { x: number; z: number }` to the `Forest`
  interface and its return value (`{ x: mine.x, z: mine.z }`), next to the
  existing `shelter`/`campfire` fields — same shape, same place.
- No new pure logic here, so no new unit test; if `game/scene.ts` has an
  existing test file asserting `Forest`'s shape, extend it there, otherwise
  skip (this mirrors how `shelter`/`campfire` themselves were added).

Commit: `feat: expose the mine's position as a landmark`

## Task 5 — a pure marker-building function

- New file `src/quest/markers.ts` (pure, tested, same layer as
  `quest/state.ts`/`quest/placement.ts`):
  ```ts
  export interface Landmark { position: { x: number; z: number }; color: string }
  export function buildMinimapMarkers(
    landmarks: Landmark[],
    quests: Quests,
    showQuestHints: boolean,
    questColor: Record<'axe' | 'lamp' | 'rod' | 'bike', string>,
  ): MinimapMarker[]
  ```
  Returns `landmarks` unchanged, plus one entry per `'axe' | 'lamp' | 'rod' |
  'bike'` (never `'diamond'`) when `showQuestHints` is true and that item's
  `state === 'pending'`, colored from `questColor[id]`.
- Test (`test/quest/markers.test.ts`): landmarks always present regardless of
  `showQuestHints`; quest items absent when hints are off; present only for
  `pending` items when hints are on; `carrying`/`done` items never produce a
  marker; diamond never produces a marker even when `pending` and hints are
  on.

Commit: `feat: build minimap markers from landmarks and pending quest items`

## Task 6 — wire it all into main.ts

- `main.ts`: define hex-string marker colors next to the existing
  `QUEST_ITEM_COLOR` (numeric, for meshes) — e.g. `MARKER_COLOR: Record<
  QuestItemId, string>` reusing the same values as `#hex` strings except
  `lamp`, which gets a distinct marker-only colour (the spec's own call —
  pick something warm and lamp-like but visibly different from the
  shelter's `#d8a04a`, e.g. `#f2c14e`), plus a `LANDMARK_COLOR` map (or
  inline) for shelter/mine/campfire — shelter keeps `#d8a04a` (unchanged
  from today), mine and campfire get their own distinct colors.
- Replace `minimap.setWorld(source.paths ?? [], source.water ?? [],
  forest.shelter, halfSize)` with `minimap.setWorld(source.paths ?? [],
  source.water ?? [], halfSize)` (drop the shelter argument, per Task 1).
- Right after building `quests` (and once per frame, alongside the existing
  `minimap.update(...)` call gated on `save.prefs.minimap`), call
  `minimap.setMarkers(buildMinimapMarkers(landmarks, quests,
  save.prefs.minimapQuestHints, MARKER_COLOR))` where `landmarks` is built
  once from `forest.shelter`/`forest.mine`/`forest.campfire` with their
  fixed colors — cheap enough (7 entries at most) to recompute every frame
  rather than wiring a change-detection path for quest state transitions.
- `npm run boot-check` after this — it touches `main.ts`'s scene wiring
  directly, the exact class of change that check exists for.

Commit: `feat: show landmarks and opt-in quest hints on the minimap`

## Task 7 — the quest guide screen

- New file `src/ui/questGuide.ts`, following `openSettingsMenu`'s overlay
  shape (a fixed full-screen `div`, closed on `Escape`):
  `openQuestGuide(quests: Quests): void`. Content: a short "how this wood
  works" paragraph (mushroom picking + the responsibility note already in
  `CLAUDE.md`'s spirit — check whether the game already has any equivalent
  text to reuse before writing new copy), then one row per
  `'axe' | 'lamp' | 'rod' | 'bike' | 'diamond'`: a colored dot (reuse the
  same `MARKER_COLOR`/`QUEST_ITEM_COLOR` values passed in or re-declared
  here), the item's name, what it unlocks, and its current state read from
  `quests[id].state` (not found / carrying / delivered — three more i18n
  keys, generic across items).
- `main.ts`: add a `pause-quests` button to `openPauseMenu()`'s markup,
  right after `pause-encyclopedia`, wired the same way (`closeMenu(); 
  openQuestGuide(quests)`).
- `src/i18n/i18n.ts`: new keys for the screen title, the rules paragraph,
  the three state labels, and (if not already covered by
  `questCompleteAxe` etc.) each item's short ability description — check
  for reuse before adding near-duplicates.

Commit: `feat: add a quest guide screen listing items, rules, and progress`

## Task 8 — verify and document

- `npm test`, `npm run build`, `npm run boot-check` all green — paste actual
  output, don't assert from memory.
- Update `TODO.md` (new `- [x]` entry, English, citing this spec/plan,
  mirroring the existing "Four quest items" entry's style) and
  `CHANGELOG.md` (one new line, English).
- Push the branch (per this session's own instructions — no PR unless asked).

Commit: `docs: record the minimap markers and quest guide feature`
