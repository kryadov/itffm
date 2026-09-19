# The railway grows up: stations, bends and tunnels — design

Date: 2026-09-19
Status: approved, to implement next.
Builds on: `2026-09-10-railway-design.md` (a straight dead-end shuttle).

## 0. Why, and what the first version taught

The railway started as the smallest thing that reads as one: a straight
narrow-gauge spur, three box cars shuttling on it. Since then:

- **The train "did not appear".** The line was sampled at a fixed 12 points
  whatever its length, so on real terrain the interpolated rail strayed up to
  ~0.9 m from the ground between samples and buried an 8 cm rail and a 1 m
  train under the terrain mesh. Sampling every `RAIL_STEP` (3 m) by distance,
  like `world/paths.ts`, brought the worst error under 0.2 m. Trees now keep
  `RAIL_CLEARANCE` off the line (`placeOsmTrees`), and the line is sited once
  in `loadForest` and reused, never sited twice.
- **The rails floated off their sleepers on a slope**: each rail was one rigid
  box at the midpoint's height. They became chains of short segments, each at
  its own local slope, merged to one mesh per side.
- The lead car became a diesel locomotive with a cab, an exhaust puffing the
  hut's chimney smoke and a headlight at night; wagons got colours and windows
  that glow after dark.
- The train stops at each end for a minute or two instead of bouncing back.
- Cars got underframes and wheels; and at a terminus the formation used to
  reverse instantly, putting wagons off the end of the line where they
  clamped onto one point — "the train merges into a single car". The head now
  stays a train's length clear of both ends, and the formation turns round as
  the train **leaves** a station, not as it arrives.

What is still wrong is the shape of the thing. A dead-straight line that
begins and ends in the middle of the wood comes from nowhere and goes
nowhere; its two ends are stations with nothing at them; and the train cannot
be found on the map.

## 1. Decisions

### The line

| Decision | Why |
|---|---|
| The line **winds**: chosen from `CANDIDATES` (90) seeded routes, scored to keep out of water when there is a way round, off steep ground, and away from the hut in the middle | A railway in a wood follows the ground and avoids lakes; a ruler-straight one reads as a placeholder. |
| No bend tighter than `MIN_RADIUS` (14 m) — no kinks | A narrow-gauge train still cannot turn on a point. |
| The line is described in plan (`PlanLine`) and walked by arc length: `lineLength`, `pointAt(line, s)` → position, tangent, height; `railHeightAt(line, s)`; past either end it carries straight on | Everything that rides on the line — cars, platforms, portals, the crate — asks one function where along it is. |
| Each end is **dead straight** for the portal and the platform (`END_STRAIGHT`) | Platforms are straight; a portal faces along its track. |
| Each end is a **tunnel portal** (`world/portal.ts`): a stone headwall with an opening (`OPENING_WIDTH` 2.1 × `OPENING_HEIGHT` 2.6 m), a dark mouth, a grassy mound behind; the line runs on past the mouth out of sight | The train visibly comes out of one hillside and goes into another — it comes from somewhere and goes somewhere. The mound and wings are solid; the opening stays clear for the rails. |
| The line must leave room for both platforms at every plot size | Small plots used to be the case that broke. |

### The train

| Decision | Why |
|---|---|
| A locomotive and five wagons (`TRAIN_CARS` 6): coaches, a boxcar, a log flatcar; car lengths and gaps are shared constants (`LOCO_LENGTH`, `WAGON_LENGTH`, `CAR_GAP`, `CAR_OFFSETS`, `TRAIN_TOTAL`) | Platforms, the dwell position and the cars all derive from the same numbers, so a platform is always exactly as long as the train plus `STATION_OVERHANG`. |
| A run: out of one tunnel, brake for the first platform, stand, run to the second, stand, into the far tunnel and out of sight for a while, back the other way; `CRUISE_SPEED` 6 m/s with `ACCEL`/`BRAKE` | It is at a platform often, and it disappears — a train you can miss. |
| Every car rides two axles on the line and **leans out of a curve** (`LEAN_GAIN`, capped at `LEAN_MAX`), pitches with the slope and nods under braking (`PITCH_GAIN`); wheels turn | A rigid box sliding along a curve reads as a sprite. |
| The locomotive is redrawn: windows on every side of the cab, a bonnet, a yellow bumper, buffers, a grille, handrails | The first diesel was a taller box. |
| `stopped()` says which end the train stands at (with every car alongside the platform), `departSoon()` gets a standing train moving, `locomotive()` gives its position while it is out in the open | What the rest of the game needs to know about the train — hand-overs at a platform, the minimap dot — without reading its internals. |

### Stations

| Decision | Why |
|---|---|
| `stationsFor(line)` derives both stops from the line alone, on the wood side of the track, sized to the whole standing train | Nothing to keep in sync: move the line and the stations move with it. |
| A low platform (`STATION_PLATFORM_HEIGHT` 13 cm) following the rail's ground profile, a yellow edge line, a roofed shelter on posts, a bench, lamps that light after dark | Recognisable as a halt at a glance. The platform is a step you walk onto; posts, bench and lamps are solid. |
| `stationOccupies` and `portalOccupies` are reserved: no trees, scatter, logs or mushrooms there — one `reserved` predicate in `game/scene.ts`, the same one that keeps the mine's mound clear | Nothing grows on a platform or through a tunnel mound. |
| The minimap draws the line (dashed), a marker per station, and the train as a yellow dot while it is out in the open | Two fixed landmarks and one moving one — never a find. |

## 2. Out of scope

- Boarding the train.
- Level crossings, points, a second line.
- The line continuing into streamed chunks.

## 3. Testing

- `placeRailLine`: deterministic; spans most of the plot within bounds; has
  bends; no kinks; even sampling a few metres apart; straight at both ends;
  follows the ground; out of the water when there is a way round; clear of
  the hut; does not climb a hill it could go round; room for both platforms
  at every plot size.
- `pointAt`/`railHeightAt`: measured along the line round corners; slope
  interpolation; straight on past either end.
- `buildRailMesh`: follows a slope at both ends; a few draw calls however
  long; rail within a step of every point of the line.
- Portals: one at each mouth with the platform beyond, clear of the mound;
  headwall, opening, dark mouth, mound; opening clear for the rails;
  solid mound and wings.
- Stations: one per end, deterministic; on the wood side; long enough for the
  whole train on straight track; the occupied footprint; built platform
  following the ground, beside the track; roof on solid posts and a bench;
  lamp at night only.
- Train: a locomotive and five wagons; deterministic; finite after a long
  run; through both tunnels and back; hidden only inside a tunnel; on the
  rails round bends; locomotive always leading; cars never overlap; wheels
  turn; leans into a bend, level on the straight; nose up on a climb; lit
  windows and headlight at night; `stopped()` at each platform with every
  car alongside; waits a good while; `departSoon()` moves it within seconds;
  `locomotive()` null in a tunnel.
- Look at it: the train standing at a platform from both sides, from above
  and along the track; a portal with the train emerging; the minimap.
  Headless Chrome renders about a frame a second, so waiting for the train
  is not an option: add `?debug` hooks that stand the player on a platform
  and run the train there.
