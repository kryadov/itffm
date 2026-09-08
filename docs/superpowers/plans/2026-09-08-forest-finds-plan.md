# Forest finds beyond mushrooms — implementation plan

Spec: `docs/superpowers/specs/2026-09-08-forest-finds-design.md`.
Builds on the playable slice: `species/schema.ts`, `mushroom/build.ts`'s
`buildMushroom`/`toWorldMesh`, `ui/encyclopediaFilters.ts`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per kind, as the spec's §5 orders it.

## Global constraints

- `ecology/sites.ts`, `ecology/spawn.ts`, `save/store.ts`, `game/pick.ts` do
  not change. If a task finds itself editing one of them, stop: the spec says
  the new kinds ride the existing pipeline, and a change there means the data
  is wrong, not the pipeline.
- Every `buildX(morphology, seed, age)` picks its size factor once, the same
  rule as `buildMushroom` — no independent per-dimension draws.
- Species data stays in millimetres; the conversion to metres lives in the
  builder, nowhere else.
- Validation errors name the file and the field.

## Task 1 — the `kind` discriminator and optional edibility

- `src/species/schema.ts`: `Kind = 'mushroom' | 'berry' | 'herb' | 'nut' |
  'find'`. `Species` becomes a union over `kind` with a shared common part;
  `edibility` is required on every kind except `find`. A missing `kind`
  defaults to `'mushroom'`, so the 25 existing YAML files load unchanged.
- `validateSpecies` switches on `kind` before reading `morphology`.
- Tests (`test/species/schema.test.ts`): defaults kind to mushroom when the
  field is absent; rejects an unknown kind and names the file; still requires
  edibility for a mushroom.

Commit: `feat: kind discriminator and optional edibility (forest finds, step 1/N)`

## Task 2 — berries, end to end

- `src/species/schema.ts`: `BerryMorphology` — berry `color` and `diameter`,
  `clusterSize` range, `leafColor`; validated with inverted-range
  checks like the mushroom's.
- New `src/berry/build.ts`: `buildBerry(m, seed, age)` — stems with leaves and
  a cluster of berries; the cluster fills out with `age`; a species whose
  `clusterSize` never exceeds one gets a single stem.
- New `src/collectible/build.ts`: `buildCollectible(species, seed, age)` — the
  one switch over `kind`; re-exports `toWorldMesh`. `game/scene.ts`,
  `ui/inspect.ts`, `ui/encyclopedia.ts` and `ui/preview.ts` call it instead of
  `buildMushroom` directly.
- `src/ui/encyclopediaFilters.ts`: `kind?: Kind` in `EncyclopediaFilters`,
  checked first in `matchesFilters`; `edibility` never matches a `find`;
  `hymenium` never matches a non-mushroom. `ui/encyclopedia.ts`:
  `KIND_LABEL` and a kind select.
- `src/i18n/i18n.ts`: `kindMushroom`, `kindBerry`, … in RU and EN.
- Data: `vaccinium-myrtillus.yaml`, `vaccinium-vitis-idaea.yaml`,
  `fragaria-vesca.yaml`, each with real ecology and text in both languages.
- Tests: `test/species/schema.test.ts` — accepts a well-formed berry; rejects
  a berry with mushroom-shaped morphology; rejects an inverted cluster range.
  `test/berry/build.test.ts` — same cluster for the same seed; different for a
  different seed; always at least one berry on at least one stem; a single
  stem when `clusterSize` never exceeds one; a fuller cluster as it ripens;
  tens of centimetres, not metres.
- Look at it: the berries in the encyclopedia and in the wood.

Commit: `feat: berries — the second collectible kind (step 2/N)`

## Task 3 — cloudberry, the one bog berry

- Data only: `rubus-chamaemorus.yaml`, biome `wetland`, a single berry per
  stem (`clusterSize: [1, 1]`).

Commit: `feat: cloudberry — a fourth berry, the only one on the bog`

## Task 4 — herbs

- `HerbMorphology` (`stemColor`, `leafColor`, `height`, `leafSize`, `leafCount`);
  `src/herb/build.ts`'s `buildHerb`; one more `case` in `buildCollectible`.
- Data: `urtica-dioica.yaml`, `allium-ursinum.yaml`, `rumex-acetosa.yaml`.
- Tests: schema accepts a well-formed herb and rejects one with berry-shaped
  morphology; `test/herb/build.test.ts` — deterministic, different per seed,
  always a stem and at least two leaves, fuller leaves as it matures, tens of
  centimetres.

Commit: `feat: herbs — the third collectible kind (step 3/N)`

## Task 5 — nuts

- `NutMorphology` (`bodyColor`, `capColor`, `size`, `capCoverage`
  range within 0..1); `src/nut/build.ts`'s `buildNut`.
- Data: `corylus-avellana.yaml` (hazel), `quercus-robur.yaml` (acorn). The
  "cone" from the spec's list is not a species — it is part of a tree — so
  it is dropped rather than invented.
- Tests: schema accepts a well-formed nut and rejects `capCoverage` outside
  0..1; `test/nut/build.test.ts` — deterministic, always a body and a cap, a
  fuller cap as it ripens, millimetres to a couple of centimetres.

Commit: `feat: nuts — the fourth collectible kind (step 4/N)`

## Task 6 — finds

- `FindMorphology` (`color`, `size`, `material`). `gbifKey` and
  `edibility` are both absent for a find, and an explicit edibility on one is
  an error — the question does not apply, it is not "inedible".
- `src/find/build.ts`'s `buildFind` — a nest, an antler, a stone.
- Data: `bird-nest.yaml`, `shed-antler.yaml`, `interesting-stone.yaml`. They
  keep `ecology.substrate`/`mycorrhizal` (the spec's accepted metaphor) so the
  spawn pipeline places them unchanged.
- Tests: schema accepts a find with no `gbifKey` and no edibility; still
  requires `gbifKey` for a non-find kind; rejects an explicit edibility on a
  find. `test/find/build.test.ts` — deterministic, always one object,
  centimetres not a metre.

Commit: `feat: finds — the fifth and last kind in the spec (step 5/N)`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Open the encyclopedia,
filter by each kind, examine one of each; walk the demo wood until a berry, a
herb, a nut and a find have each been seen in place. Push.
