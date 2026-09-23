# The mine as a maze, with bats — implementation plan

Spec: `docs/superpowers/specs/2026-09-23-mine-maze-and-bats-design.md`.
Builds on the SDF mine (`caveSdf`, `caveLattice`, `mineTerrain.ts`,
`caveLitMaterial`).

Branch: current branch. TDD throughout; the slow mine tests (geometry swept
over many seeds and terrains) are expected to take seconds each. Three
commits.

## Global constraints

- Mesh, collision and floor all come from `caveSdf`. Nothing gets its own
  copy of the passage geometry.
- Every structural property is tested over many seeds and several terrain
  types (flat, slope, steep, bumpy), not on one hand-picked mine.

## Task 1 — a real maze

- `src/world/mine.ts`: the graph generator grows 9–12 forks (some three-way)
  with longer passages; rejects or shortens a candidate passage whose SDF
  would come within rock thickness of a passage it is not joined to; keeps
  0.7 rad between siblings; refuses passages that turn back through the
  mouth; keeps the whole system within half the plot. The diamond chamber is
  the leaf with the greatest path length from the root, widened as far as
  the rock allows. `caveLattice`: undo the pull for a cell it would fold.
  `placeMine(ground, halfSize, seed, obstacles, shelterPos, mapped, trails,
  keepClear)` — `keepClear` lists the hut, campfire, shack, stations and
  rails.
- `main.ts`: `&tp=mine` stands `&back=` metres (default 14) in front of the
  mouth, facing it. `CLAUDE.md`: the hook.
- Tests (`test/world/mine.test.ts`): a real maze on every seed; the diamond
  in the farthest dead end; solid rock between unjoined passages; never back
  through the mouth; fits the plot at the demo and default sizes; never
  buries the hut, campfire or rails; no folded cell over dozens of mines.

Commit: `feat: the mine is a real maze, and the diamond waits at its far end`

## Task 2 — bats

- New `src/world/bats.ts`: `BatRoost`, `placeBatRoosts(m, seed)` (dead ends
  only, never the chamber, on the ceiling), `batPose(r, k, t, flushedAt)`,
  `shouldFlush(...)` (within 5 m, inside the mine, not already flying),
  `BAT_FLIGHT_SECONDS`, `buildBats(roosts, material)` — instanced body and
  two wings.
- `src/world/mineMesh.ts`: `caveLitMaterial(group)` — a shader material
  sharing the cave mesh's lighting uniforms.
- `game/scene.ts` and `main.ts`: build, update per frame with the player's
  position, flush on `shouldFlush`. `&tp=bats` stands 2.5 m from the first
  colony.
- Tests (`test/world/bats.test.ts`): the spec's §3 bat list.

Commit: `feat: bats roost in the mine and take wing when you come near`

## Task 3 — a mossy hill, not a wall

- `src/world/mine.ts`: `FACE_HALF_EXTRA` — the sheer face only a few metres
  either side of the doorway; `outcropBoulders(m, moundRadius)`, used by both
  `mineObstacles` and the mesh.
- `src/world/mineTerrain.ts` / `mineMesh.ts`: beyond the face, the mound's
  front slopes like its flanks; strata rows receding unevenly; a crest that
  rises and falls up to 1.8 m; moss and grass with rock patches.
- Tests: the mound is still unclimbable from any side on any ground; the
  doorway and approach stay clear; boulders along the foot and the brink,
  clear of the doorway.
- Look at it: from the meadow, from the side, from above.

Commit: `fix: the mine's outcrop is a mossy hill with a rock face at its door, not a wall`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`; walk the maze to the
diamond in the built game with the lamp.
