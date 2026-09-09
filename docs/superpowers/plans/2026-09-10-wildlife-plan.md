# Wildlife: hares, squirrels, snakes, bees, dragonflies — implementation plan

Spec: `docs/superpowers/specs/2026-09-10-wildlife-design.md`.
Builds on `world/birds.ts` (the `{ update, setEnabled, dispose }` contract,
`InstancedMesh` posing, `TreePerch`), `util/openSpot.ts`, `world/water.ts`'s
`classifyWater`.

Branch: current branch. TDD throughout: failing test → minimal implementation
→ green → commit. One commit per part, as the spec splits it (1/3, 2/3, 3/3).

## Global constraints

- Two tiers, not five systems: ground animals share one state machine in
  `world/critters.ts`; insects share one stateless orbit in
  `world/insects.ts`. A new animal is a config + geometry + pose, not a new
  machine.
- `stepCritter` is a pure function of one tick; everything that renders runs
  on top of it.
- Every factory is deterministic for a seed and returns `{ update(dt,
  playerX, playerZ), setEnabled(on), dispose() }`.
- Homes and anchors are decided by the caller (`game/scene.ts`); a landmark
  with nothing to stand on returns `null`, never a fallback in the wrong
  place.

## Task 1 — the critter framework, hares and squirrels (1/3)

- New `src/world/critters.ts`:
  - `CritterState = 'idle' | 'alert' | 'flee' | 'resting'`, `CritterSpecies`
    (`fleeRadius`, `alertDur`, `fleeSpeed`, `fleeDur`, `restMin`/`restMax`,
    `climbsTrees`, geometry, pose).
  - `stepCritter(c, dt, playerX, playerZ, species, rand, ground,
    findFleeTarget?)` — idle until the player is
    inside `fleeRadius`, then alert (frozen) for `alertDur`, then flee
    straight away — or toward `findFleeTarget(x, z)` when it returns one — for `fleeDur`,
    then rest, then idle again.
  - `placeCritterHomes(ground, halfSize, seed, count, obstacles,
    clearance = 1.5)` — `findOpenSpot` asked `count` times.
  - `nearestPoint(x, z, points, maxDist)`.
  - `createCritterGroup(scene, name, rand, count, species, provider, homes,
    …)` runs N instances on the machine, one `InstancedMesh` per part.
    `createHares(scene, rand, count, provider, homes)` and
    `createSquirrels(..., perches, perchSearchRadius = 20)` are thin configs
    over it; the squirrel's flee target is the nearest perch.
- `game/scene.ts`: homes, factories, `updateCritters`; `main.ts` calls it.
- Tests (`test/world/critters.test.ts`): `stepCritter` — idle when far; alert
  the instant the player is inside `fleeRadius`; frozen for `alertDur`
  before fleeing; flees straight away; rests after `fleeDur`; idle again
  after the rest timer; flees toward a supplied target. `placeCritterHomes` —
  deterministic, one per count, in the plot, clear of obstacles.
  `nearestPoint` — closest within range, null beyond, null for empty.
  Factories — a named group per species, deterministic, a hare bolts away
  with finite positions, a squirrel flees toward a perch, hide and dispose
  without throwing.
- Look at it: a hare and a squirrel by the hut.

Commit: `feat: wildlife — hare and squirrel through a shared critter framework`

## Task 2 — the snake (2/3)

- `SNAKE_SPECIES`: small `fleeRadius`, low `fleeSpeed` — the same machine
  gives "slides slowly away" instead of bolting.
- The pose is the one new thing: five tapering segments, each offset back
  along the heading with a standing sine wave sideways driven by time, not by
  distance travelled — a cheap writhe with no path history.
- Two per wood.
- Tests: a named group; deterministic; creeps away much slower than a hare;
  every segment finite after a long run; hide and dispose without throwing.

Commit: `feat: wildlife — the snake (2/3)`

## Task 3 — the wild hive, bees and dragonflies (3/3)

- New `src/world/insects.ts`: `createSwarm(scene, name, rand, count,
  anchors, orbitRadius, …)` (the spec's `SwarmSpecies` collapses into
  plain arguments — two species do not need a registry) — each insect a fixed phase on an elliptical orbit of
  `orbitRadius` round its anchor, with a vertical bob; no states, no reaction
  to the player. `createBees(scene, rand, count, hive)`,
  `createDragonflies(scene, rand, count, anchors)`.
- New `src/world/hive.ts`: `placeHive(trees, seed)` — on the trunk of a
  random tree, up off the ground; `null` when the wood has no trees.
  `hiveObstacle`, `buildHiveMesh`.
- `game/scene.ts`: dragonfly anchors only over rings where
  `classifyWater(ring) === 'pond'` — still water, not a running stream.
- Tests: `test/world/insects.test.ts` — a named group; deterministic; every
  insect within `orbitRadius` (+ slack) of its anchor in xz; several insects
  spread across several anchors; hide and dispose; bees circle the hive;
  dragonflies circle each anchor with finite positions over a long run.
  `test/world/hive.test.ts` — null without trees; deterministic; against one
  of the wood's own trees, up the trunk; a small obstacle at the hive; the
  mesh at the hive position.
- Look at it: the hive and a bee on its trunk. (The pond scene frames badly
  through dense trees — the orbit tests cover the dragonflies.)

Commit: `feat: wildlife — a wild hive, bees, dragonflies (3/3)`

## Task 4 — a real head for the hare and the squirrel

Live feedback the same day: both read as "a couple of oddly coloured shapes".
The cause is shape, not colour — the ears sat straight on the body, so both
read as a legless lump.

- `critters.ts`: `headGeometry()` — a squashed icosahedron forward of and
  above the body centre; the ears attach to it, leaned back with the same
  fixed-tilt quaternion trick `birds.ts` uses for a perched bird's neck; a
  tail nub for the hare. Body stays instance index 0, so the existing tests
  hold.
- Look at it: one screenshot of each — a separate head with ears.

Commit: `feat: the hare and the squirrel get a real head`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push.
