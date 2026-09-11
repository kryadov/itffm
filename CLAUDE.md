# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser first-person game about picking mushrooms, and a mushroom encyclopedia
in the same breath. The species, their field marks and their ecology are real.
Mushroom models are not drawn by hand — each one is generated from its species
parameters, and those same parameters decide where in the wood it grows.

Live: https://kryadov.github.io/itffm/

Current state: plans 1 and 2 done, released as `v0.3.0`. The wood is built from
a real place name via OpenStreetMap and AWS Terrain Tiles, with an offline demo
wood as an honest fallback on any failure. Next: expanding the species database
past three, and the ETL pipeline for photos (see TODO.md).

Everything in the project is in English — code, documents, commit messages,
this file. Russian exists only inside the game itself, as one of the two
player-facing languages (see Conventions).

- Design doc: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md` —
  section 0 lists where the implementation taught us better than the spec.
- Plans: `docs/superpowers/plans/` — each carries ready-to-write code and tests
  per task.
- Backlog: `TODO.md`.

**Read the spec and the current plan before working.** The plan says what to do;
the spec says why it is that way.

## Commands

```bash
npm run dev            # dev server with hot reload
npm test               # tests, single run
npm run test:watch     # tests in watch mode
npm test -- profile    # only files whose path contains "profile"
npm run build          # tsc + build into dist/
npm run boot-check     # after build: does the bundle start in headless Chrome
npm run silhouette-sheet [outPng]  # every species' silhouette on one sheet, for "look at it"
```

`npm test` and `npm run build` run in CI on every push to `master`, and a green
build publishes to GitHub Pages (`.github/workflows/deploy.yml`). A release is
cut by pushing a version tag (`git tag v0.3.0 && git push --tags`).

`boot-check` exists because unit tests never load `main.ts`: the build can be
green while the screen is black. It has caught two real hangs already. If Chrome
is not installed it skips silently.

`silhouette-sheet` renders every species' silhouette (the same flat mode the
encyclopedia already uses for an undiscovered one) onto one contact sheet — a
dev tool for "look at it" (see Conventions below), not a pass/fail test: exact
pixels drift across GPUs and drivers, so, like `boot-check`, it stays out of CI
and out of `npm test` on purpose. Run it after any change to a species'
morphology and scan the sheet for the kind of thing tests have missed before —
chimeric proportions, a sideways stipe, a shape that reads as broken rather
than just a different species.

## Architecture

The species data is the single source of truth, and it has three consumers:

```
data/species/*.yaml
  ├── morphology → src/mushroom/  → the 3D model
  ├── ecology    → src/ecology/   → where and when it grows
  └── name/text  → src/ui/        → encyclopedia and inspection card
```

`src/species/schema.ts` validates all of it by hand, without a library: the data
is written by people, so an error message has to name the file and the field.

Layers and the dependency rule:

| Layer | Modules | Rule |
|---|---|---|
| Pure core | `util`, `species`, `mushroom`, `ecology`, `terrain` | No network, no global state, no imports from `game`/`ui`/`world`. Fully covered by tests. |
| World and runtime | `world`, `game` | Assembles the scene from the core. Tested selectively. |
| Interface | `ui`, `i18n`, `save` | DOM over the canvas. |

### Two things worth knowing before you touch the mushrooms

**A mushroom exists in two forms.** `buildMushroom()` returns a detailed group
with named parts (`cap`, `stipe`, `hymenium`, `ring`, `volva`) — that is what
the inspection view and the encyclopedia build, because there the parts matter.
`toWorldMesh()` flattens it into one mesh with baked vertex colours, and that is
what goes into the wood. The reason is arithmetic: a few hundred mushrooms at
five meshes each is over a thousand draw calls, which stalls a real GPU and
hangs a software one. Do not put the detailed group into the scene.

**Specimen size comes from one factor.** Drawing each dimension independently
produced a 25 cm cap on a 6 cm stalk. `buildMushroom` picks `size` once and every
measurement follows it. Keep it that way when adding morphology fields.

### The seam for real geography

`ElevationProvider` (`src/terrain/provider.ts`) is deliberately one method,
`heightAt(x, z)`. Behind it today sits procedural terrain; plan 2 puts an AWS
Terrain Tiles DEM there, and nothing else in the codebase learns about it. Do
not add anything to that interface a procedural surface cannot answer.

`Tree` (`src/world/trees.ts`) is data, not meshes, for the same reason: the
mushroom spawner reads tree genus and position without knowing anything about
rendering, so OSM polygons can replace the procedural scatter.

Geo and terrain modules are ported from the sibling project
`kryadov/race-the-city` (Overpass with mirrors and an IndexedDB cache, Terrarium
tiles, geo→metres projection). Its CI and `boot-check` are the model for ours.
When something there solves our problem, port and adapt it rather than
reinventing — but that project drives a car around a city, so everything about
buildings, carriageways and lanes is dropped on the way.

## Conventions

- **Language.** Everything in the project is English: code, comments, error
  messages, test names, documents, specs, `TODO.md`, `CHANGELOG.md`, commit
  messages, this file. The one exception is the game's own player-facing
  localization: strings live in `src/i18n/` as parallel `RU`/`EN` data and are
  never hardcoded in modules — Russian belongs there and nowhere else in the
  project. (`TODO.md`, `CHANGELOG.md` and the specs under
  `docs/superpowers/specs/` predate this rule and stay Russian where they
  already are — write new entries in English, don't translate old ones.)
- **Determinism.** No `Math.random` anywhere in `src/`. Everything generated
  draws from `mulberry32` (`src/util/rng.ts`), and every generator has a test
  asserting one seed gives one result. The wood must look the same for everyone
  and survive a reload.
- **Units.** The scene is in metres, species data is in millimetres. The
  conversion lives only in `src/mushroom/build.ts`.
- **Dependencies.** Runtime is `three` and `yaml`, nothing else. A third one
  needs its own decision — hence hand-rolled schema validation instead of zod,
  and our own camera orbit instead of OrbitControls.
- **TDD.** The plans set the order: failing test → minimal implementation →
  green test → commit. One commit per task.
- **Look at it.** Three real defects in v0.2.0 — chimeric proportions, the
  oyster mushroom drawn as a pancake, black lids for conifer crowns — were
  invisible to the tests and obvious on screen. Render a screenshot in headless
  Chrome and actually look before calling visual work done.
- **Branches.** Work happens on a branch; `master` is what deploys. Merge at the
  checkpoints where the plan expects a push.

## Responsibility

This game is not a field guide. There is no in-game disclaimer screen — it
blocked the game on mobile past fixing, and was removed by direct request
(2026-09-11) rather than left broken. The `edibility` field is checked against
two independent sources during curation — it is the one place where an error
in the data costs health rather than a bug report.
