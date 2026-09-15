# itffm — features & how to play

A quiet first-person walk through a **real wood**, built on the fly from real
place data. A mushroom encyclopedia is its heart, but the wood has grown a
life of its own around that: a hut, a campfire, a mine, a railway, wildlife,
weather, a day and night cycle, and five things lost in the wood waiting to
be found.

> Keep this file current: when you add a feature or change an existing one,
> update the relevant section here in the same change (see CLAUDE.md).

---

## Start screen

On load you get a **place picker**: name a real place — your own local wood,
a nature reserve, dunes, a wetland — or pick one of several **known places**
offered as one-tap buttons. Terrain comes from real elevation data and the
trees, clearings, water and paths come from OpenStreetMap, so the wood
actually matches that place's real ecology. **"Just show me a wood"** drops
you straight into a **baked-in offline demo wood** instead — and if a named
place ever fails to build (not found, no map data, the network down), the
game falls back to that same demo wood rather than an error screen. A
**plot size** picker controls how large an area to build once you've typed a
place. A **language switch** (Russian/English) sits on this same screen, so
you never have to start the game just to change it.

---

## Controls

| Keys | Action |
|---|---|
| `W` `A` `S` `D` | Walk |
| `Shift` | Crouch — to look under a cap |
| `Space` | Jump |
| `E` | Examine a find, pick up/deliver a quest item, chop scrub (once the hatchet is owned), open/close the hut's door |
| `F` | Flashlight |
| `L` | Toggle the carried lamp on/off, once owned (layered on top of its own automatic day/night/mine rule) |
| `Tab` | Encyclopedia |
| `Q` | Sort the basket |
| `M` | Settings |
| `H` | This same control list, in-game |
| `Esc` | Pause menu |

On a phone or tablet, the same actions come from an on-screen stick, a
swipe-to-look zone, and a tap.

---

## Finding things

Everything you can pick — mushroom, berry, herb, nut, a fish, or a plain
forest find — is **generated from its own species data**, not a hand-modelled
asset, and placed by real ecology: the birch bolete grows under a birch, the
slippery jack among young pines on sand, the oyster mushroom on dead wood.
**46 species** across six kinds (mushroom, berry, herb, nut, fish, find) ship
today, each with real field marks, edibility and season.

- **Examine (`E`)** turns a find over in your hands — cap, underside, stipe,
  ring, volva, whatever marks it — before you decide to collect or leave it.
- Everything collected stays in your own **encyclopedia** (`Tab`) for good —
  no timers, nothing to lose. Filter by kind, biome, edibility, underside
  type or season; an undiscovered species shows as a flat silhouette instead
  of nothing at all.
- The **basket** holds a limited number of finds; **sort the basket** (`Q`)
  tallies what's in it and adds it all to your encyclopedia at once.
- Add your own **note** to any discovered species' card.
- **Export the whole encyclopedia as one image** — every discovered species
  on a grid, for sharing.

---

## A wood, not just a spawn table

- A **hut** with a working door: walk in, and there's a bed, a table with a
  cup and a lit lamp, a painting on the wall, a firewood pile and a well
  outside.
- A **campfire** with a pot on a tripod and a bench, apart from the hut on
  its own clearing — its own place in the night's music, too.
- Where the wood actually has water, a **fisherman's hut and a boat** at the
  shore.
- A **mine** you can walk into — dead dark inside until the lamp quest item
  is delivered, sited on a real surveyed cave/adit/mineshaft mouth where one
  exists, or picked procedurally otherwise, so every wood has one.
- A **railway** crossing the wood, with a short train — a diesel locomotive
  (cab, exhaust stack puffing smoke, a headlight that switches on at night)
  pulling two wagons, each its own colour, each with windows that glow amber
  after dark — shuttling back and forth along its own line.
- **Weather** (clear, rain, snow, fog) and a **day/night cycle** with a real
  sun and moon, changeable in settings or left on a self-running cycle.
- A **self-running accelerated calendar**: the game clock runs faster than
  real time, so a single play session moves through real seasons instead of
  staying stuck on the day you started, driving what's in season and how
  long it's been since rain.
- **Wildlife**: birds nesting and flying between the trees, hares and
  squirrels that bolt when you get close, snakes that quietly slip away,
  bees around a wild hive, dragonflies over the water.
- Streams, ponds, waterfalls and springs, each animated, not a flat panel.
- A **minimap** (opt-in in settings) and a scrolling **compass**. Once the
  minimap is on, it always marks the hut, the mine and the campfire — never a
  single mushroom. A second, separate opt-in also marks the four hidden
  quest items while they're still out there, for anyone who wants the hint
  instead of the search.

---

## Five things lost in the wood

A one-time prompt at the start of a new game points you at five lost items,
each found in its own place and carried home (`E` to pick up, `E` at the
hut's doorway to deliver):

- **Hatchet** — once delivered, `E` while facing a bush/thicket clears it;
  the wood's various detour thickets (including ones blocking the other
  quest items) become choppable.
- **Lamp** — a warm light that follows you once owned, on automatically
  after dark or inside the mine, with a manual `L` override on top.
- **Fishing rod** — unlocks catching fish, a real collectible kind spawned
  near water; a rod trophy leans by the hut's own table once delivered.
- **Bicycle** — moves you faster while on a mapped path or track; a bike
  trophy is parked outside by the hut's door once delivered.
- **Diamond** — found inside the wood's own mine, not near the hut like the
  other four. Unlike them it unlocks nothing: it's a trophy that ends up on
  the hut's table once delivered. A returning save from before the diamond
  existed gets its own one-time prompt pointing at the mine.

A **"Rules & Quests" screen**, in the pause menu, lists the basket/
encyclopedia loop above plus all five items, what each one unlocks, and
whether it's still out there, in your hands, or already home.

---

## Settings (`M`)

- **Language** — Russian/English, live, no restart.
- **Walking speed** and **mouse sensitivity** multipliers.
- **Mushroom draw distance**.
- **Sound, music and footstep volume**, independently.
- **Time of day** — a self-running cycle, or pinned to day/night.
- **Weather** — clear, rain, snow, fog.
- **Minimap** on/off, plus a separate **quest items on the map** on/off,
  and **invert look** on/off.

---

## Saves and offline

No backend — everything runs in the browser and progress (discovered
species, finds, quest state, notes, preferences) saves to IndexedDB.
Works offline once loaded once, and installs to the home screen like an
app on a phone or tablet.

---

## Technology and data

TypeScript, [Three.js](https://threejs.org), Vite — no other runtime
dependency. Elevation comes from
[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/); trees,
clearings, water, paths and structures come from
[OpenStreetMap](https://www.openstreetmap.org). Species taxonomy rests on
[GBIF](https://www.gbif.org) and [Wikidata](https://www.wikidata.org)
(both CC0); morphology, ecology and edibility are curated by hand — no open
structured database of those characters exists.
