# Small finds you can pick, a collection worth keeping — implementation plan

Spec: `docs/superpowers/specs/2026-09-09-finds-and-collection-design.md`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per task.

## Global constraints

- One aiming rule for every kind. If a task adds a branch on `kind` to
  `game/pick.ts`, it is going the wrong way.
- A fix to aiming is not done until it has been tried at a realistic
  distance (about 2 m) and an ordinary view angle — not looking steeply down
  at the find — in the built game.
- Pure arithmetic lives apart from `canvas`/`Image`, which the `node` test
  environment does not have.

## Task 1 — the basket as 3D cards

- `src/ui/preview.ts`: `renderCollectiblePreview(species, seed, age, size,
  silhouette): string` (a data URL) moved out of `ui/encyclopedia.ts`.
- `main.ts`'s `showTally` (`Q`): a grid of cards, one per basket entry, each
  with its own seed and age.

Commit: `feat: the basket in 3D — preview cards instead of a text list`

## Task 2 — a trace where a find was picked

- `main.ts`: `leaveTrace(placement)` — a dark, slightly transparent disc on the
  ground, for any kind.

Commit: `feat: a trace where something was picked`

## Task 3 — notes on finds

- `src/save/store.ts`: `Find.note?: string`; `setFindNote(save, at, note)`
  returns a new save.
- Basket cards get a text field; a `WeakMap<Placement, number>` filled at the
  moment of picking maps the card to the find's `at`; save on `blur`.
- Test (`test/save/store.test.ts`): sets the note on the find with a matching
  timestamp, leaves the rest untouched.

Commit: `feat: your own notes on a find`

## Task 4 — export the encyclopedia as an image

- New `src/ui/export.ts`: `columnsFor(count)`, `layoutGrid(count, cols):
  GridLayout`, `EXPORT_CELL_SIZE`.
- `ui/encyclopedia.ts`: an "Export as image" button — previews of discovered
  species drawn onto a 2D canvas at `layoutGrid` positions with captions,
  `toBlob` → download link.
- Tests (`test/ui/export.test.ts`): never fewer than one column; grows with
  √count; caps out; exact column count; reading order; height grows with
  rows; empty collection safe; every cell positive and inside the canvas.

Commit: `feat: export the encyclopedia as an image`

## Task 5 — one aiming rule, through a hitbox

- `src/collectible/worldMesh.ts`: `withPickHitbox(mesh)` — wraps the world
  mesh in a group with an invisible sphere (`HITBOX_MATERIAL`: transparent,
  opacity 0, no depth write), radius `HITBOX_RADIUS`.
- `src/game/pick.ts`: delete the small-object cone and its fallback pass;
  `nearestInView` is one ray against objects and occluders for every kind.
- `game/scene.ts`: non-mushroom finds go into the scene wrapped.
- Tests: `test/collectible/worldMesh.test.ts` — wraps as a child; never draws
  but still raycasts; hit by a ray the speck alone never could.
  `test/game/pick.test.ts` (small collectibles via `withPickHitbox`) — a tiny
  find dead ahead is found; distance still respected; still hidden behind an
  occluder; two specimens of one colony centimetres apart are told apart.
- Live: scripted walk to a berry at 2 m, label shows, `E` collects.

Commit: `fix: berries, herbs and finds are aimed at exactly like a mushroom`

## Task 6 — berries on a real bush; a hitbox the size of the model

- `src/species/schema.ts`: `BerryMorphology.bushHeight` (mm), validated;
  data for every berry.
- `src/berry/build.ts`: stems from base to tip (`orientAlong`), leaves along
  them, the cluster at the tips; height from `bushHeight` through the same
  size factor.
- `withPickHitbox`: radius and centre from the model's `Box3`, floored at
  `HITBOX_RADIUS`.
- Tests: `test/berry/build.test.ts` — a low creeping species gives a visibly
  shorter bush than a knee-high one. `test/collectible/worldMesh.test.ts` —
  never shrinks below the floor radius; grows to cover a bigger model,
  centred on it.

Commit: `fix: berries grow on a real bush`

## Task 7 — LOD for world finds

- `src/collectible/worldMesh.ts`: `LOD_DISTANCE` 18; `buildLodProxy(mesh)` —
  a 6-sided cone fitted to the mesh's bounding box, one flat colour averaged
  from the mesh's vertex colours; `buildCollectibleLod(mesh, lodDistance)`.
- `game/scene.ts`: every placement's world mesh goes through
  `buildCollectibleLod`; keep a `lods` list; `Forest.updateMushroomLod
  (camera)`. `main.ts` calls it every frame. The 45 m cull is unchanged.
- Tests (`test/collectible/worldMesh.test.ts`): the proxy is far cheaper,
  fills roughly the same footprint, takes the mesh's own colour, has no
  per-vertex colour; the LOD shows the mesh close and the proxy beyond, and
  swaps as the camera moves.

Commit: `feat: LOD for placed finds — a cheap silhouette in the distance`

## Task 8 — the silhouette sheet

- New `scripts/silhouetteSheet.entry.ts` + `scripts/silhouette-sheet.html`:
  load every species, render each with `silhouette: true` at `layoutGrid`
  positions, set `document.title = 'SHEET_READY'`.
- New `scripts/silhouette-sheet.mjs`: start a vite dev server, drive headless
  Chrome over CDP, wait for the title, screenshot to the given path (default
  in the temp dir), shut both down. `package.json`: `silhouette-sheet`.
- Run it over all species and look: anything chimeric, sideways or broken?

Commit: `feat: silhouette-sheet — every species on one sheet, for "look at it"`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`, `npm run silhouette-sheet`.
Push; ask the owner to retry berries with `?debug=1`.
