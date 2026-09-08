# Water, paths, dunes and bog — design

Date: 2026-09-08
Status: approved, in implementation.
Builds on: `docs/superpowers/plans/2026-09-08-real-geography.md` (plan 2 —
`geo/parse.ts` already reads `world.paths` and `world.water` out of OSM and
`world/biome.ts` already tags `dunes-coast` and `wetland`).

## 0. Why

Plan 2 parses paths and water from OpenStreetMap and nobody draws them. A real
place with a lake in the middle renders as unbroken forest floor, and the
mushrooms that should crowd the damp shore have no shore to crowd. Dunes and
bog exist only as tags steering the spawn table; walking across a "dune" feels
exactly like walking across a spruce wood.

This is the cheapest step from "the wood has the right species" to "the wood
looks like the place".

## 1. Decisions

| Decision | Why |
|---|---|
| A path is one earthen ribbon of one width (`HALF_WIDTH` 0.6 m) — no road hierarchy | The donor (`race-the-city`'s `world/roads.ts`) mitres ribbons for a street network with carriageways and lanes. A wood has footpaths. Port the ribbon, drop the hierarchy. |
| The ribbon follows the ground at a dense step (`RIBBON_STEP` 4 m via `util/geometry.ts`'s `densify`), lifted 3 cm | OSM vertices are sparse; a ribbon drawn as chords between them cuts into hills and floats over hollows. `densify` is pure and reusable. |
| Water is a surface plus a **skirt** down the edge (`SKIRT_DROP` 1.2 m) | Without the skirt the bank's slope shows under the water's rim. The donor's stone embankment, railings and car collision are road furniture and are dropped. |
| A pond sits just above the lowest vertex of its ring (`waterLevel`) | Any single vertex can sit on a bank; the lowest is the one that floods first. |
| Water is a **moisture source** for ecology: `ecology/sites.ts` raises a site's moisture within `WATER_REACH` 12 m of a ring, using `util/geometry.ts`'s `distanceToRing` | A pond's bank is damp even on level ground, whatever the terrain's own shape says. This is where the drawing changes what grows. |
| Pond vs stream is read from the ring's own shape (`classifyWater`: closed and compact is a pond, open or elongated past `STREAM_ASPECT` 3 is a stream) | No new tag has to travel through `WorldData`; the geometry already says which it is. |
| A stream is a rippling ribbon following its bed's slope, animated in `update(t)`; a pond is still | A flat panel along a stream reads as a puddle. |
| A waterfall stands at the **steepest** drop along a stream (`findWaterfall`, at least `WATERFALL_DROP` 1.4 m), as a translucent sheet with breathing opacity — not spray particles | One per stream, cheap, and only where the ground really falls. |
| Springs (`placeSprings`) sit a few metres off the water (`SPRING_OFFSET_MIN`..`MAX` 2–6 m), not on the OSM line | That is where springs are in life — feeding the water, not in it. Seeded, so the same wood has the same springs. |
| Dunes and bog first get their own ground colour (`world/ground.ts`'s `biomeAt` callback: sand for `dunes-coast`, dark peat for `wetland`) and a walking cost (`game/player.ts`'s `biomeSpeedFactor`: ×0.55 on bog) | The cheapest honest difference — you see and feel where the bog starts. Same idea as the slope factor. |
| Then relief: `terrain/relief.ts`'s `withBiomeRelief(base, biomeAt, seed)` — dunes get ridges (a summed sine, `DUNE_WAVELENGTH` 16 m, `DUNE_AMPLITUDE` 1.4 m, plus a little `fbm2`), bog gets tussocks and hollows (one finer, gentler octave) | A decorator of `ElevationProvider`, the same shape as `withPits`; `terrain/procedural.ts` stays ignorant of biomes. |
| Relief is applied **after** the biome is computed from the base ground and **before** trees are placed | Otherwise the biome would be read off a surface it is about to reshape, and a tree at a dune's edge would stand on a bump the player never sees. |
| Polistovsky reserve (a real raised bog) joins the known places | A place to see the bog at all without hunting for one. |

## 2. Out of scope

- Collision with water. The player can walk across a pond; fixing that is a
  movement question, not a drawing one.
- Trees and scatter keeping off paths. OSM trees never move; procedural ones
  could avoid paths, but that is its own change.
- Water sound.

## 3. Testing

- `util/geometry.ts`: `densify` keeps endpoints and caps spacing;
  `distanceToRing` is 0 inside and grows outside.
- `world/paths.ts`: nothing for an empty list; a ribbon for one path; a
  degenerate single-point path skipped; follows the terrain height.
- `world/water.ts`: closed ring → pond, open way → stream; level sits just
  above the bed and follows the lowest vertex; no waterfall on flat ground,
  the steepest drop wins; a pond draws surface and skirt, a stream a ribbon
  with no skirt, a steep stream also a waterfall; degenerate rings ignored;
  springs deterministic, inside the plot, none without water.
- `terrain/relief.ts`: ordinary biomes untouched; dunes bump round the base;
  wetland finer and gentler than dunes; deterministic; seed-dependent; the
  shape switches exactly where the biome does.
- `ecology/sites.ts`: a site beside water is wetter than the same site far
  from it.
- Look at it: a temporary stream and dune strip beside the hut in the demo
  wood, screenshot, revert before committing.
