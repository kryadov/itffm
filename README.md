# itffm 🍄

A quiet first-person walk through a real wood. A mushroom encyclopedia is its
heart — pick a mushroom, take it in your hands, turn it over, look underneath
the cap and read why it is the one it is — but the wood has grown a life of
its own around that: a hut you can actually walk into, a campfire, wildlife
that flees or ignores you depending on what it is, weather, a day and night.

You walk through the wood and find something — a mushroom, a berry, a curious
stone, a bird's nest, whatever the ecology of that spot actually grows.
Everything you pick stays in your own encyclopedia for good. No timers, no
enemies, nothing to lose.

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

There is no such thing as a library of 3D models "by species" — not free, not
for money — and hand-modelling hundreds of them is not possible. So there are
no models here. Everything you can pick — mushroom, berry, herb, nut, or a
plain forest find like a bird's nest — is **generated on the spot** from its
own species parameters: shape, colours, size ranges, whatever makes it itself.

One YAML file per species feeds three subsystems at once:

```
data/species/*.yaml
  ├── morphology → the 3D model
  ├── ecology    → where and when it grows
  └── name/text  → encyclopedia and inspection card
```

A new species is a line of data, not a job for a 3D artist. That is exactly why
this scales to dozens of them, across five different kinds of find.

The same approach has a second consequence: ecology is a generator, not
decoration. The terrain decides moisture — hollows are damp, rises are dry.
Trees grow in stands of one genus. From there every point knows its biome, its
nearest partner tree, its substrate and its moisture, and the species is chosen
by real rules.

## A wood, not just a spawn table

The wood has grown a life of its own around the finding:

- A **hut** with a working door — walk in, and there's a bed, a table, a
  painting on the wall, a cup on it.
- A **campfire** with a pot on a tripod and a bench, apart from the hut, out
  on its own clearing.
- Where the wood actually has water, a **fisherman's hut and a boat** at the
  shore.
- **Weather and a day/night cycle** — rain, snow, fog, a real sun and moon.
- **Wildlife**: birds nesting and flying between the trees, hares and
  squirrels that bolt when you get close, snakes that quietly slip away,
  bees around a wild hive, dragonflies over the water.
- Streams, ponds, waterfalls and springs, each animated, not a flat panel.

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
| `Space` | Jump |
| `E` | Examine a find, or open/close a door |
| `F` | Flashlight |
| `Tab` | Encyclopedia |
| `Q` | Sort the basket |
| `M` | Settings |
| `H` | This same control list, in-game |

On a phone or tablet, the same actions come from an on-screen stick, a
swipe-to-look zone, and a tap.

## Where it stands

Work in progress, but the wood is real now. Name a place and elevation comes
from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), while
the trees, clearings, water and paths come from
[OpenStreetMap](https://www.openstreetmap.org) — your own local wood, a nature
reserve, a national park. Any failure along the way — the place not found, the
map bare, the network down — falls back honestly to a baked-in demo wood rather
than an error screen.

Works offline once it has loaded once, and installs to your home screen like
an app.

Left to do: photographs for the species aren't wired up yet (the taxonomy,
names and edibility are all curated by hand already), and the season is
stuck on a permanent September after rain. See `TODO.md` for the rest.

Design documents and plans live in `docs/superpowers/`. The backlog is
`TODO.md`.

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
