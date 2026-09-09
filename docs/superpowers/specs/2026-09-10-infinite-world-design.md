# Infinite world: chunked generation

Brainstormed 2026-09-10 (session continues past a 6-hour unattended
window — decisions below are what was actually approved before the human
partner went to sleep; anything not explicitly decided stays conservative
and is logged as follow-up, not guessed).

## Why

The wood is currently one static plot: `createForest`/`loadForestData` build
everything — ground, trees, mushrooms, water, the hut, wildlife — once, for
`[-halfSize, halfSize]²`, and `main.ts` hard-clamps the player's position to
that square. The player asked for a wood with no edges: walk in any direction
for as long as you like.

## Decisions from the brainstorm

- **Both modes get chunking** — the offline procedural/demo wood AND a named
  real place via OpenStreetMap. Not "procedural first, real place later."
- **Real-place mode, when a new chunk's OSM/DEM fetch fails or the OSM map
  itself simply has no data that far out**: fall back to procedural
  generation for that one chunk, silently, from the same seed lineage — the
  same honest-fallback principle the whole-wood-level fallback already uses
  (`loadForestData`'s demo wood). Never wall the player off, never show an
  error.
- **Scope of infinity**: a very large but still finite world (some
  kilometres across), not a genuinely unbounded one with a floating/
  recentring origin. At ordinary walking speed the player will not reach a
  multi-kilometre edge in a normal session, and a floating origin is its own
  invasive, error-prone project (every position-dependent system would need
  to react to a recentre event) that buys nothing at this scale.

## What "a chunk" is

A square tile, `CHUNK_SIZE` metres per side (see `world/chunking.ts`), on a
fixed grid anchored at the world origin — `chunkCoord(x, z)` floor-divides.
Each chunk is generated **independently and deterministically** from its own
`(chunkX, chunkZ)` plus the world's global seed — `chunkSeed(cx, cz, seed)` —
so revisiting a chunk (or two players naming the same real place) always
regenerates the identical tile, without replaying every other chunk's random
draws first. This is the one structural change that ripples through every
placement function: today they all take one `mulberry32(seed)` stream and
scatter across the *whole* bounded plot in one pass, where the Nth object's
position depends on how many were placed before it. Chunking instead gives
each placement function its own bounds (an origin + a half-size, both
smaller and off-centre from world (0,0)) and its own chunk-local seed, so it
only ever has to fill *that* tile.

`CHUNK_SIZE` is picked comfortably larger than the fog draw distance
(`game/scene.ts`'s `Fog(...,30,140)`), so a chunk boundary is never the
reason something pops in mid-view.

## What's chunked in this pass, and what stays a fixed landmark

Chunked (regenerated per tile, as the player approaches):
- Terrain (`ElevationProvider`, procedural and — for real places — a
  per-chunk Terrarium DEM tile).
- Trees (`world/trees.ts`'s `placeTrees`, OSM-tagged trees for real places).
- The ground mesh itself (`world/ground.ts`), one tile per chunk rather than
  one huge plane.
- Mushroom/berry/herb/nut/find ecology sites and spawn
  (`ecology/sites.ts`/`spawn.ts`) — this is the actual point of walking
  further, so it is not optional scope.

Deliberately **not** chunked in this pass — stays exactly as it is today,
confined to the world's original home plot (the first chunk(s) generated at
the player's start position):
- The hut, campfire, fisherman's hut and boat, the wild hive — one-off
  landmarks a wood has exactly one of; multiplying them per chunk was never
  the ask, and siting logic for "the one hut" doesn't generalise to "a hut
  per tile" without its own design pass.
- Wildlife (`world/critters.ts`, `world/insects.ts`) — homes/anchors are
  currently sited once, relative to the whole plot's obstacle list.
  Extending them per-chunk is real but separate follow-up work (logged in
  `TODO.md`), not silently dropped.
- Decorative InstancedMesh scatter — boulders, deadwood, undergrowth, flora,
  grass (`world/boulders.ts`/`deadwood.ts`/`undergrowth.ts`/`flora.ts`/
  `grass.ts`) — same reason as wildlife: real, valuable, but its own pass.
- Paths and water polygons, which come from one `WorldData` per real place —
  extending these needs the same incremental-OSM-tile treatment trees get,
  logged as follow-up alongside them rather than attempted in the same
  breath as trees.

So beyond the home plot's radius, the player walks through terrain, trees
and mushrooms that keep generating — the core loop — without the rest of the
wood's scenery repeating past the horizon. Honest about what it does and
doesn't do, the same way the LOD/instancing/shadow items elsewhere in
`TODO.md` are already scoped and documented rather than silently skipped.

## Chunk lifecycle

A chunk manager (`game/worldStream.ts`) tracks which chunk the player is
currently in and keeps a square of chunks loaded around it (`LOAD_RADIUS`
chunks each direction); anything outside `UNLOAD_RADIUS` (slightly larger,
so a chunk doesn't flicker in and out right at the boundary of a single
frame's movement) gets disposed — its meshes removed and geometries freed,
its mushroom placements dropped. Nothing about already-collected finds is
affected: the save only ever records what was picked, never what a
placement *would* be next time, so discarding an unvisited chunk's
placements is free.

## Real-place mode: incremental OSM/DEM tiling

`game/loadForest.ts` currently asks Overpass and the Terrarium DEM for one
bbox around the named place, with `OSM_MARGIN` of context. Chunking extends
this: each new chunk the player approaches gets its own small bbox query
(chunk bounds plus a small margin), through the same cache
(`geo/cache.ts`) and the same mirror fallback (`geo/overpass.ts`) already in
place — nothing new to build there, just called per chunk instead of once
for the whole plot. `WorldData` (paths, water, trees, shelters) accumulates
per chunk rather than being one flat list for the whole wood; `buildBiomeMap`
and `placeOsmTrees` already take a `WorldData` and can run per chunk with a
chunk-sized slice of it.

## Settings implication

`ui/worldSize.ts`'s "plot size" (`halfSize`) picker stops meaning anything
once the wood has no edge — infinite chunking replaces it rather than
composing with it. Decide its fate (remove, or repurpose as an initial
load-radius/detail setting) once the chunked path actually ships; noted as
its own follow-up, not decided here blind.

## Scope actually shipped this pass (narrower than "both modes")

Implementing the above surfaced a real reconciliation problem the original
brainstorm didn't catch: the home plot's own radius (`ui/worldSize.ts`'s
60/90/150m half-size choices) doesn't line up with the chunk grid's fixed
`CHUNK_SIZE/2` (200m) — chunk (0,0) has to be skipped entirely by the
streaming system (it's already built, the old way, by `createForest`), but
for every world-size choice smaller than 400m across, that leaves either a
gap (nothing generated between the home plot's own edge and the first real
chunk ring) or, if chunk (0,0) were instead generated too, doubled-up trees
and mushrooms over the same ground `createForest` already placed.

Real-place mode's `halfSize` is not just cosmetic — it is also the OSM query
radius, with real network/rate-limit cost — so silently overriding it to
200m always would change what a player asked for. The offline/demo wood has
no such cost: its `halfSize` is just a number.

**So, for now:** infinite chunking ships for the offline/demo wood only,
which always builds its home plot at exactly `CHUNK_SIZE/2` regardless of
the world-size picker (the picker still governs a *named* place, which is
unaffected — bounded, as it works today). `game/loadForestData`'s `fellBackTo
=== 'demo'` is the exact existing signal for "this is the demo wood,"
whether the player pressed "just show the forest" or a real query failed and
fell back to it — both get the infinite treatment, consistent with the
project's honest-fallback principle elsewhere.

Real-place incremental OSM/DEM tiling (the harder half of the original
ask) is deferred, not abandoned — logged in `TODO.md` as its own item, now
that the chunk-vs-home-plot reconciliation problem above is understood and
solved for the tractable case first.

## Testing

Pure grid/seeding math (`world/chunking.ts`) gets ordinary unit tests. Each
generalised placement function (trees, sites/spawn, terrain) keeps its
existing test suite passing unchanged when called with the old
whole-plot-at-origin arguments (no behaviour change for existing callers),
plus new tests for an off-centre chunk bounds. The chunk manager itself is
tested the way `game/scene.ts` already is — selectively, plus a live
headless-Chrome walk-and-screenshot check that new terrain/trees/mushrooms
keep appearing past the old fixed edge.
