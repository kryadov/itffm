# Eleven new species — implementation plan

Spec: `docs/superpowers/specs/2026-09-12-species-curation-design.md` (the
curation rules). Fish additions depend on the fish-shape fields planned with
the waterside work (`bodyDepth`, `pattern`, `patternColor`, `eyeColor`,
`lowerFinColor`, `dorsalFins`, `dorsalAt`) — do them last.

Branch: current branch. One commit for the whole batch; each species checked
on its own before it goes in.

## Global constraints

- Every rule in the spec: `gbifKey` from the GBIF API (exact, accepted);
  every mushroom's edibility against at least two independent sources, named
  in the commit body; text in RU and EN.
- No schema change in this plan. A species that needs one is dropped from
  the batch, not forced in.

## The list

Chosen because a forager in a northern mixed wood really meets them, or
because they are the dangerous double of something already in the game:

| Kind | Species | Why it earns a place |
|---|---|---|
| mushroom | *Paxillus involutus* — brown roll-rim | Common, once eaten widely, `deadly` (immune haemolysis in regular eaters). Lookalike of the saffron milkcap. |
| mushroom | *Suillus grevillei* — larch bolete | Strictly with larch — gives `larix` a partner and a reason to look under one. |
| mushroom | *Amanita pantherina* — panther cap | `poisonous`, and a double of the fly agaric and the parasol — both already in the game. |
| mushroom | *Russula vesca* — the flirt | A good edible russula with a tell (the cuticle stops short of the margin). |
| mushroom | *Lactarius torminosus* — woolly milkcap | `conditional`: toxic raw, eaten in Russia only salted after soaking and boiling — the text says so. |
| mushroom | *Kuehneromyces mutabilis* — sheathed woodtuft | Edible, and the funeral bell's own lookalike both ways; `galerina-marginata` lists it back. |
| fish | *Abramis brama* — common bream | Deep-bodied — exercises `bodyDepth`. |
| fish | *Carassius carassius* — crucian carp | A pond fish, the commonest catch in still water. |
| fish | *Gymnocephalus cernua* — ruffe | Spotted, perch-like — exercises `pattern`; lookalike of the perch. |
| berry | *Rubus idaeus* — raspberry | Clearings and edges. |
| berry | *Vaccinium oxycoccos* — cranberry | A second bog berry beside cloudberry. |

## Task 1 — add, check, look

For each species, in this order:

1. `curl 'https://api.gbif.org/v1/species/match?name=<Latin name>'` — copy
   `usageKey` only from an `EXACT`, `ACCEPTED` match.
2. Edibility from two independent sources; note them.
3. Write `data/species/<id>.yaml`: names (la/ru/en), morphology in mm, ecology
   (partners, substrate, biomes, real months, moisture, gregariousness,
   frequency), `lookalikes` both ways, text in both languages, `media: []`.
4. `npm test -- species` — the loader validates it.

Then for the batch:

- `test/world/fishSpawn.test.ts`: stop hard-coding the three original fish in
  its real-data test — read the fish from the loaded roster.
- `npm run silhouette-sheet` — look at all six new mushrooms beside the rest.
- `FEATURES.md`: the species count (57) in the same change.

Commit: `feat: eleven new species — 57 in all` (body: the sources per
mushroom)

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; the encyclopedia shows 57.
