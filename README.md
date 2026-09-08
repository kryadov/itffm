# itffm 🍄

A quiet first-person game about picking mushrooms — and a mushroom encyclopedia
in the same breath.

You walk through a wood, find a mushroom, take it in your hands, turn it over,
look underneath the cap and read why it is the one it is. Everything you pick
stays in your own encyclopedia for good. No timers, no enemies, nothing to lose.

The species are real. So are their field marks, their edibility, their season
and their ecology. Mushrooms do not grow just anywhere — they grow where they
belong: the birch bolete under a birch, the slippery jack among young pines on
sand, the oyster mushroom on dead wood. Work out where to look and you really do
start finding more.

**▶ Play: https://kryadov.github.io/itffm/**

> ⚠️ This game is not a field guide. Do not use it to decide what is safe to
> eat: a real mushroom is identified from the whole set of its characters, and a
> mistake costs your health.

---

## How it works

There is no such thing as a library of 3D models "by mushroom species" — not
free, not for money — and hand-modelling hundreds of species is not possible.
So there are no models here. Every mushroom is **generated on the spot** from
its species parameters: cap shape, hymenium type, whether it has a ring or a
volva, colours, size ranges.

One YAML file per species feeds three subsystems at once:

```
data/species/*.yaml
  ├── morphology → the 3D model
  ├── ecology    → where and when it grows
  └── name/text  → encyclopedia and inspection card
```

A new species is a line of data, not a job for a 3D artist. That is exactly why
this scales to hundreds of them.

The same approach has a second consequence: ecology is a generator, not
decoration. The terrain decides moisture — hollows are damp, rises are dry.
Trees grow in stands of one genus. From there every point knows its biome, its
nearest partner tree, its substrate and its moisture, and the species is chosen
by real rules.

## Running it

Needs Node.js 22.

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Tests |
| `npm run build` | Build into `dist/` |
| `npm run boot-check` | After a build: does it actually start, in headless Chrome |

## Controls

| Keys | Action |
|---|---|
| `W` `A` `S` `D` | Walk |
| `Shift` | Crouch — to look under a cap |
| `E` | Examine a mushroom |
| `Tab` | Encyclopedia |
| `Q` | Sort the basket |

## Where it stands

Work in progress, but the wood is real now. Name a place and elevation comes
from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), while
the trees, clearings, water and paths come from
[OpenStreetMap](https://www.openstreetmap.org) — your own local wood, a nature
reserve, a national park. Any failure along the way — the place not found, the
map bare, the network down — falls back honestly to a baked-in demo wood rather
than an error screen.

Left to do: the species database still holds three mushrooms, not the twenty or
so a proper walk deserves, and their photographs are not wired up yet. See
`TODO.md` for the rest — atmosphere, sound, wildlife, and everything else a
wood is missing.

Design documents and plans live in `docs/superpowers/` and are written in
Russian. The backlog is `TODO.md`.

## Technology and data

TypeScript, [Three.js](https://threejs.org), Vite. No backend — everything is
computed in the browser, and progress is saved to IndexedDB.

Species data rests on [GBIF](https://www.gbif.org) (taxonomy, CC0) and
[Wikidata](https://www.wikidata.org) (names, CC0); photographs come from
[iNaturalist Open Data](https://github.com/inaturalist/inaturalist-open-data)
under Creative Commons licences, with the author and licence shown on the
species card. Morphology, ecology and edibility are curated by hand: no open
structured database of those characters exists, and that curation is the most
valuable part of the project.
