# The railway grows up — implementation plan

Spec: `docs/superpowers/specs/2026-09-19-railway-stations-and-portals-design.md`.
Builds on `world/railway.ts` and `world/train.ts` as of the wheels fix.

Branch: current branch. TDD throughout. Two commits: stations first (they
work on the current straight line), then the line itself.

## Global constraints

- Everything positioned on the railway asks `pointAt(line, s)`; nothing
  re-derives positions from raw points.
- Train dimensions are shared constants in `world/railway.ts`; platforms,
  dwell positions and cars all read them.
- `?debug` hooks for driving the built game headless: `&tp=station0|1`,
  `&tp=portal0|1`, `&trainAt=0|1`, `&train=N`, `&back=`, `&along=`, `&yaw=`,
  `&pitch=`, and `window.__trainAt(end)` — documented in `CLAUDE.md`.

## Task 1 — stations at both ends

- `src/world/railway.ts`: `Station`, `STATION_PLATFORM_GAP`/`WIDTH`/`HEIGHT`,
  `stationToWorld(st, u, v)`, `stationsFor(line)`, `stationOccupies(stations,
  x, z, margin)`.
- New `src/world/station.ts`: `buildStationMesh(line, stations, ground)` →
  `{ group, setNight, obstacles, dispose }` —
  platform slabs every `SLAB_STEP` following the rail's ground, a yellow edge,
  a shelter (`ROOF_HEIGHT`, `ROOF_LENGTH`) on posts, a bench, a lamp;
  `StationObstacle`s for posts and bench.
- `src/game/scene.ts`: one `reserved(x, z)` predicate — mine mound or a
  station — applied to trees, scatter, logs and placements.
- `src/ui/minimap.ts`: draw the line dashed; station markers.
- Tests (`test/world/station.test.ts`): one station per end; wood side; long
  enough, on straight track; footprint covers platform, track and a margin;
  one named platform per station following the ground; beside the track;
  roof on posts, bench, solid posts; lamp at night; disposes. A train run to
  both ends with every car inside a platform.
- Look at it: the stopped train beside the platform from both sides, from
  above and along the track; the minimap.

Commit: `feat: train stations - a platform and shelter at each end of the line, on the minimap`

## Task 2 — a winding line between two portals; a longer, leaning train

- `src/world/railway.ts`: `PlanLine`; `placeRailLine(ground, halfSize, seed,
  avoid?)` — `CANDIDATES` seeded routes of straight ends plus bends no
  tighter than `MIN_RADIUS`, each scored by `lineCost` on slope, on staying
  in the plot, and on `avoid(x, z)` (water, the hut), the cheapest kept; resampled every `RAIL_STEP`; `lineLength`, `pointAt`, `railHeightAt
  (line, s)`, `yawOf`; `PORTAL_MOUTH`, `END_STRAIGHT`, `portalSites`,
  `portalOccupies`, `MOUND_CLEAR_RADIUS`. Train constants: `LOCO_LENGTH`,
  `WAGON_LENGTH`, `CAR_GAP`, `TRAIN_CARS`, `CAR_OFFSETS`, `TRAIN_TOTAL`,
  `PLATFORM_LENGTH`.
- `buildRailMesh`: rails as segment chains along the bends, ballast, sleepers
  instanced — a few draw calls.
- New `src/world/portal.ts`: `buildPortalMesh(line)` — headwall with the
  opening, a dark mouth, a mound, wing walls; `PortalObstacle`s.
- `src/world/train.ts`: six cars on two axles each, posed by `pointAt` at
  each axle; lean from curvature × speed, pitch from slope and braking; the
  run cycle with acceleration, braking, dwell and tunnel time; `stopped()` →
  `{ end, cars } | null`, `departSoon(seconds?)`, `locomotive()`; a redrawn locomotive; coaches, a boxcar and
  a log flatcar.
- `game/scene.ts`: portals and their obstacles; portals in `reserved`.
  `ui/minimap.ts`: the train's dot while `locomotive()` is non-null.
- Tests: `test/world/railway.test.ts`, `test/world/portal.test.ts`,
  `test/world/train.test.ts` — the lists in the spec's §3.
- Look at it: the scenes in the spec's §3, through the debug hooks.

Commit: `feat: a winding railway between two tunnel portals, a longer train that leans and shows on the minimap, a redrawn locomotive`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`.
