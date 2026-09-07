# Dressing the wood — design

Date: 2026-09-07
Status: approved, in implementation.
Builds on: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md` (the
ecology section — substrates, tree partners).

## 0. Why

The playable slice gives the player a terrain mesh, one sphere-on-a-stick per
tree and a few hundred mushrooms. It reads as a spawn table on a lawn. Two
things are wrong with that, and only one of them is about looks:

1. **Substrate has no body.** The species data already says the oyster
   mushroom grows on dead wood and some species grow among moss on stone.
   With no logs and no boulders in the world, `substrate: deadwood` and
   `substrate: moss` can only be honoured by pretending — a mushroom on bare
   ground that the encyclopedia says grows on a log.
2. **Finding is too easy.** On an open lawn every cap is visible from fifty
   metres. Real foraging is looking under things. The wood needs visual noise
   at mushroom height — grass, fern, flowers, bushes — and that noise has to
   hide a mushroom from the aim, not only from the eye.

## 1. Decisions

| Decision | Why |
|---|---|
| Logs, stumps and boulders are **substrate first, decoration second** | `world/deadwood.ts` and `world/boulders.ts` expose spawn points (`logSpawnPoints`, `mossSpawnPoints`) that feed `ecology/sites.ts` as real `deadwood`/`moss` sites. The model exists because the species needs it. |
| Moss favours the north face of a boulder (`mossSpawnPoints` biases toward −z) | It is the one field mark of moss growth every forager knows; cheap to honour. |
| Leaning (half-fallen) trees are a third deadwood shape, rarer than logs and stumps, and never climbable | Root in place, crown hanging — a wall, not a step. `leaningTreeObstacle` sits at the root. |
| A low obstacle can be stepped onto: `Obstacle.topHeight` ≤ `MAX_STEP_HEIGHT` (0.55 m) lifts the player instead of pushing them back | Stumps, thin logs and small boulders are things a person climbs onto without thinking. A tall boulder or a thick trunk still blocks. |
| Bushes grow in **patches**, filtered by a noise field (`PATCH_SCALE` 22 m) | Even scatter reads as a lawn of identical shrubs. Patches give the player places — "the hazel thicket" — the same reason tree genera are laid down in stands. |
| Bushes are not an ecology input | A bush blocks the view; no species in the data names a shrub as a partner. Keeping it out of `ecology/` keeps the pure core honest. |
| Flowers and fern are dense, cheap, instanced ground cover (`world/flora.ts`) | Their whole job is visual noise at cap height. Three flower colours, one fern; nothing to collect. |
| Grass is denser where the ground is wetter (`MOISTURE_WEIGHT`), capped at `MAX_TUFTS` 9000 | Damp hollows are lush, dry ridges sparse — the same moisture field mushrooms already read, so grass becomes a hint about where to look. |
| Grass and undergrowth are **occluders** for the aim (`game/pick.ts`) | The ray is cast against them too but they are never returned: a mushroom hidden behind a tuft cannot be picked through it. Hiding from the eye but not the aim would be a lie the player discovers instantly. |
| Clearings and glades are a noise threshold (`world/clearings.ts`'s `isClearing`, scale 55 m) that thins trees | One pure predicate, so anything else that wants a glade — a landmark, a fairy ring — asks the same question. |
| Pits and hollows are an `ElevationProvider` decorator (`terrain/pits.ts`'s `withPits`) | Digs only down, rarely (`CHANCE` 0.14 per 14 m cell), and raises moisture inside — a pit is a wet spot. Decorating the provider keeps the seam in `terrain/provider.ts` one method wide. |
| Broadleaf crowns get three silhouettes (`BROADLEAF_CROWNS`: round, wide, tall), picked per tree by position | A thousand identical spheres is the first thing anyone notices. A finite set of shapes in instanced batches keeps draw calls flat. |
| Conifers get a shape per genus (`CONIFER_SHAPES`): spruce and fir a narrow drooping spire, pine and larch a tiered crown raised higher | One cone for every conifer made a pine wood look like a spruce wood. |
| A broadleaf crown is scaled by the genus's own `LOOK.crown` radius | An oak and a birch of one height are not one width. |
| Forest-floor litter is vertex colour from `fbm2` noise (`world/ground.ts`, `LITTER_SCALE` 3.2 m), not a texture | The project draws without images. Dunes and wetland keep their own biome colour, unmottled. |
| Everything here is an `InstancedMesh` + `setMatrixAt` | Same arithmetic as the trees: a few draw calls per kind, whatever the count. |
| Every placer takes a seed and draws from `mulberry32` | The wood must be the same for everyone and survive a reload. |

## 2. Out of scope

- Shadows. Nothing in the wood casts one yet; turning them on for a thousand
  trees is a performance question of its own.
- Trees keeping off paths — that belongs with the paths themselves.

## 3. Testing

Each placer is pure and gets the same battery: deterministic for one seed,
different for another, inside the plot, standing on the ground, plausible
dimensions, more at a higher density. Then one test per decision above:
patches cluster (`undergrowth`), wetter is thicker (`grass`), pits only dig
down and are rare (`pits`), moss favours the north (`boulders`), a leaning
tree is never upright and never fully down (`deadwood`), the oak's crown is
wider than the birch's (`trees`). Then look at it: a headless screenshot of
the home clearing for each kind before calling it done.
