# How a species gets into the game — design

Date: 2026-09-12
Status: approved. A standing rule for every future addition to
`data/species/`, written down after the roster grew from 3 to 40.
Builds on: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md` (the
species data is the single source of truth) and
`2026-09-08-forest-finds-design.md` (kinds).

## 0. Why

The roster grew fast: 3 species, then 25, 30, and 40 once berries, herbs,
nuts and finds arrived. Two things surfaced on the way that make it worth
writing the rules down before it grows again:

1. **Plausible is not correct.** Every `gbifKey` was filled in by hand during
   curation with a plausible-looking number. Checked against the real GBIF
   Backbone (`api.gbif.org/v1/species/match?name=…`, no key needed), **all
   40 were wrong** — not one matched the real `usageKey`, while every match
   came back `EXACT`/`ACCEPTED` with high confidence, the two deadly species
   included. Nothing reads `gbifKey` at runtime yet, so no player saw it —
   but it is exactly the kind of error the project exists not to make.
2. **Some real species do not fit the schema**, and the temptation is to
   force them in with wrong data.

## 1. Decisions

### Every species

| Decision | Why |
|---|---|
| `gbifKey` comes from the GBIF API (`species/match`), an `EXACT`, `ACCEPTED` match, never typed from memory | See §0. A future ETL (plan 3: taxonomy from GBIF, names from Wikidata, photos from iNaturalist) needs the real key. |
| `edibility` is checked against **at least two independent sources** (field guides, Wikipedia, first-nature.com, MykoWeb, PMC/PubMed case reports) | It is the one field where an error costs health rather than a bug report (`CLAUDE.md`, Responsibility). There is no in-game disclaimer any more, which raises the bar, not lowers it. |
| `edibility` is one of `edible`, `conditional`, `inedible`, `poisonous`, `deadly`; `conditional` is explained in the text (e.g. woolly milkcap: toxic raw, eaten in Russia only salted after soaking and boiling) | A label alone cannot carry "only after this preparation". |
| `deadly` is used for cumulative and delayed killers as well as acute ones — the brown roll-rim is `deadly` | It was eaten for generations before the haemolysis was understood. "Once thought edible" is exactly the case to be loudest about. |
| `lookalikes` lists ids both ways where the confusion runs both ways (sheathed woodtuft ↔ funeral bell) | The card is where a forager learns what to fear. |
| Text in both languages, written as a field description, not a recipe | The game is not a field guide; the text says what it is and why it matters, not how to cook it. |
| `media: []` until plan 3 | The field is validated and waiting; nothing is invented to fill it. |
| Morphology in millimetres, ranges as `[min, max]`, ecology with real partners and real months | One `size` factor drives every dimension in the builder; a range that is wrong produces a chimera on screen, so `npm run silhouette-sheet` is part of adding a mushroom. |
| Finds that are not a biological species (`bird-nest`, `interesting-stone`, `shed-antler`) carry no `gbifKey` and no `edibility` | The schema enforces both absences. |

### Body plans the schema does not have

| Decision | Why |
|---|---|
| Truffles and other hypogeous fungi are **not** added | `MushroomMorphology` requires a cap, a stipe and a hymenium; a truffle has none of them. Forcing one in means writing data known to be false. |
| *Peziza ammophila* (the dune cup fungus) is **not** added either | A cup with no ordinary stipe: `CAP_SHAPES` has no cup and `stipe.height` is required. |
| Agreed for later: a new `kind: 'cup'` (an apothecium, Peziza) and `kind: 'hypogeous'` (truffle and relatives), the second with its own search by **scent** rather than aim-and-`E` | A truffle cannot be seen; dogs and pigs find it by smell. A growing proximity cue, not "walk up and look". Each needs its own body-plan builder, like berries got. |

### Coverage

Every one of the schema's nine biomes now has at least one species (dunes:
*Psathyrella ammophila*; bog: *Russula emetica*; highland: *Leccinum scabrum*,
*Hygrocybe conica*; adits: *Pleurotus ostreatus*, *Coprinellus micaceus*;
meadow edges: *Agaricus campestris*, *Coprinus comatus*, *Macrolepiota
procera*). Next additions favour common species a forager really meets, and
dangerous lookalikes of species already in.

## 2. Out of scope

- Plan 3 (the ETL and photos).
- The `cup` and `hypogeous` kinds themselves.

## 3. Testing

`species/schema.ts`'s validation on load names the file and the field;
`test/species/load.test.ts` loads the whole real roster and checks ids and
GBIF keys are unique and every lookalike points at a species that exists. Per mushroom:
`npm run silhouette-sheet` and a look. The edibility check has no test — it is
a curation step, recorded in the commit body with its sources.
