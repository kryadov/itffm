import * as THREE from 'three'
import { buildGround } from '../world/ground'
import { buildTreeMeshes, treePerches, type Tree } from '../world/trees'
import { createBirds } from '../world/birds'
import { createHares, createSquirrels, createSnakes, placeCritterHomes } from '../world/critters'
import { placeHive, hiveObstacle, buildHiveMesh } from '../world/hive'
import { createBees, createDragonflies } from '../world/insects'
import { mulberry32 } from '../util/rng'
import {
  placeLogs,
  placeStumps,
  placeLeaningTrees,
  logObstacles,
  leaningTreeObstacle,
  logSpawnPoints,
  buildDeadwoodMeshes,
  buildLeaningTreeMeshes,
} from '../world/deadwood'
import { placeBoulders, boulderObstacle, mossSpawnPoints, buildBoulderMeshes } from '../world/boulders'
import { placeBushes, bushObstacle, buildBushMeshes } from '../world/undergrowth'
import { placeFlora, buildFloraMeshes } from '../world/flora'
import { placeGrass, buildGrassMesh } from '../world/grass'
import {
  placeShelter, shelterObstacle, buildShelterMesh, wallObstacles, interiorObstacles, doorPosition,
  nearestBikeSpot, type ShelterFx, type BikeSpot,
} from '../world/shelter'
import { collectScatterCullers, sweepAll, STATIC_SCATTER_GROUP_NAMES } from '../world/instanceCulling'
import { placeCampfire, campfireObstacle, buildCampfireMesh } from '../world/campfire'
import { placeFisherHut, fisherHutObstacle, buildFisherHutMesh, buildBoatMesh } from '../world/fisherHut'
import { placeMine, mineObstacles, diamondSpotInMine, type Mine } from '../world/mine'
import { createMineTerrain } from '../world/mineTerrain'
import { buildMineMesh, setMineLighting, clearScatterOnMine } from '../world/mineMesh'
import { placeRailLine, buildRailMesh, createTrain, RAIL_SEED_OFFSET, type RailLine, type Train } from '../world/railway'
import { buildSky } from '../world/sky'
import { sampleDayNight, sunElevation, nightFactor } from '../world/daynight'
import { gameMonth, daysSinceRain } from '../world/calendar'
import { moonPhase } from '../world/moonPhase'
import { buildClouds } from '../world/clouds'
import { buildWeather, type Weather } from '../world/weather'
import { buildPathMeshes } from '../world/paths'
import {
  buildWaterMeshes, placeSprings, buildSpringMeshes, classifyWater, waterLevel, waterObstacles,
} from '../world/water'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, fairyRingMarkers, type Placement } from '../ecology/spawn'
import { buildFairyRingMesh } from '../world/fairyRing'
import { loadSpecies } from '../species/load'
import { buildPlacementObject } from '../collectible/placement'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'
import type { Vec2 } from '../geo/types'
import { densify } from '../util/geometry'

/** Default half the plot's side, metres. Ninety is about a quarter-hour's
 *  slow walk across — the player can ask for a bigger or smaller wood on the
 *  place-picker screen (see ui/worldSize.ts), and this is what they get if
 *  they don't. */
export const DEFAULT_HALF_SIZE = 90
/** Site count spawnMushrooms works from at the default plot size — scaled by
 *  area for any other size, so a bigger wood is not just an emptier one. */
const DEFAULT_SITE_COUNT = 1600
/** Sun position on a circle whose radius sets how high overhead it swings
 *  — matches the old fixed light's rough distance from the origin. */
const SUN_DISTANCE = 90
/** Trees within this many metres of the origin (the home plot's own
 *  clearing) cast a real shadow — see the sun light's own setup below for
 *  why this stays a small, fixed radius rather than the whole wood. */
const TREE_SHADOW_RADIUS = 45

/**
 * Ground mesh resolution per side, for a plot of this half-size. Shared with
 * loadForest.ts so a real DEM is resampled onto exactly the same grid the
 * mesh renders — otherwise the visible surface (linear between mesh
 * vertices) and heightAt() (the source's own curve) disagree between
 * vertices, and the player floats or sinks. Scales with the plot so a larger
 * wood does not go coarse, but is capped: segments squared is the real
 * mesh cost, and it must not run away as the plot grows.
 */
export function groundSegmentsFor(halfSize: number): number {
  return Math.round(Math.max(100, Math.min(220, 160 * (halfSize / DEFAULT_HALF_SIZE))))
}

/**
 * Where a wood's terrain and trees come from. Procedural noise for now (plan 1);
 * OpenStreetMap and a real DEM (plan 2, via game/loadForest.ts) build the very
 * same shape without createForest knowing the difference.
 */
export interface ForestSource {
  ground: ElevationProvider
  trees: Tree[]
  biomeAt: (x: number, z: number) => Biome
  /** Trails, in local metres — empty for a source that has none. */
  paths?: Vec2[][]
  /** Ponds and streams, in local metres — empty for a source that has none. */
  water?: Vec2[][]
  /** A real hut/shelter/tower a surveyor actually found, in local metres —
   *  empty for a source with none, which is every source before plan 2 and
   *  most real woods since huts are rarely mapped at all. */
  shelters?: Vec2[]
  /** A real cave/adit/mineshaft mouth (`geo/parse.ts`'s `CaveEntrance`), in
   *  local metres — empty for a source with none, which is every source
   *  before plan 2 and the offline demo wood (`world/demoForest.ts`) always. */
  caves?: Vec2[]
  /** The rail line (`world/railway.ts`), sited by `game/loadForest.ts`
   *  before `trees` so `placeOsmTrees` could keep trees off it — reused
   *  here rather than sited a second time. Undefined only for a source built
   *  by hand (tests) rather than through `loadForestData`, in which case
   *  this falls back to siting one of its own. */
  railLine?: RailLine
}

export interface Forest {
  scene: THREE.Scene
  ground: ElevationProvider
  trees: Tree[]
  placements: Placement[]
  /** One object per mushroom, in the same order as placements. A non-mushroom
   *  kind (berry, herb, nut, find) is wrapped in `withPickHitbox` before it
   *  ever lands here (game/scene.ts's own placement loop) — every entry is
   *  pickable by the same plain exact-ray test in game/pick.ts. */
  mushroomObjects: THREE.Object3D[]
  /** Everything besides standing trees that blocks the player — fallen logs,
   *  stumps, boulders, bushes — as collision circles for the same obstacle
   *  list `stepPlayer` and `chooseStartPose` already use for tree trunks. */
  extraObstacles: { x: number; z: number; radius: number; topHeight?: number }[]
  /** The wood's one hut — game/main.ts starts the player beside it. */
  shelter: { x: number; z: number }
  /** The wood's one campfire — audio/audio.ts's music bed checks the
   *  player's distance to this to swap the day/night ambience for
   *  campfire.mp3. */
  campfire: { x: number; z: number }
  /** The wood's one mine entrance — a fixed landmark, same as `shelter`/
   *  `campfire` above, for ui/minimap.ts's markers (see the 2026-09-15
   *  addendum). */
  mine: { x: number; z: number }
  /** Where the hut's own doorway is, in world space — main.ts checks the
   *  player's plain distance to this to decide whether `E` should open/close
   *  the door instead of examining a mushroom. */
  shelterDoor: { x: number; z: number }
  isShelterDoorOpen: () => boolean
  toggleShelterDoor: () => void
  /** Grass and undergrowth: not pickable, but game/pick.ts casts against them
   *  too, so a mushroom genuinely hidden behind a tuft or a bush is hidden
   *  from the aim ray, not just from the eye. */
  occluders: THREE.Object3D[]
  /** Keeps the sky dome centred on the camera and applies the time of day to
   *  the sun, ambient light, fog and sky — call every frame with the current
   *  clock (see world/daynight.ts's `timeFor`) and the camera's position. */
  updateDayNight: (t: number, camPos: THREE.Vector3) => void
  /** Drifts the cloud layer with the camera — call every frame. */
  updateClouds: (camPos: THREE.Vector3, dt: number) => void
  /** Switches between clear/rain/snow/fog — cheap, call only on change. */
  setWeather: (w: Weather) => void
  /** Animates rain/snow and keeps them centred on the camera — call every frame. */
  updateWeather: (camPos: THREE.Vector3, dt: number) => void
  /** Toggles the flashlight — cheap, call only on change (the `F` key). */
  setFlashlight: (on: boolean) => void
  /** Aims the flashlight from the camera along its view direction — call
   *  every frame while it is on. */
  updateFlashlight: (camPos: THREE.Vector3, camDir: THREE.Vector3) => void
  /** Whether (x, z) is close enough to this wood's own mine entrance to
   *  count as "inside" it, for the lamp's own on/off rule. Every wood has a
   *  mine now (world/mine.ts's own procedural fallback), so this is never
   *  vacuously false the way it was before that existed. */
  playerInsideMine: (x: number, z: number) => boolean
  /** Where the diamond quest item sits, inside the wood's own mine. */
  diamondSpot: { x: number; y: number; z: number }
  /** Turns the lamp quest's own PointLight on or off and keeps it at the
   *  player's position — call every frame with whatever `quest/lamp.ts`'s
   *  `lampIsOn` decided this frame. */
  updatePlayerLamp: (on: boolean, pos: THREE.Vector3) => void
  /** Shows/hides each delivered quest item's own trophy at the shelter —
   *  the diamond on the table, the rod leaned by it, the bike parked
   *  outside — see world/shelter.ts's own setters. */
  setDiamondPlaced: (on: boolean) => void
  setRodPlaced: (on: boolean) => void
  setBikePlaced: (on: boolean, spot?: BikeSpot) => void
  /** Which wall of the hut is nearest `p`, where along it, and the point on
   *  the hut's outline that is (for a range check) — where a bicycle handed
   *  over from `p` would be left. */
  bikeSpotNear: (p: { x: number; z: number }) => { spot: BikeSpot; point: { x: number; z: number } }
  /** Drifts the shelter's chimney smoke — call every frame. */
  updateShelter: (dt: number) => void
  /** Drifts the campfire's smoke and flickers its embers — call every frame. */
  updateCampfire: (dt: number) => void
  /** Drifts the flock — call every frame with the player's own position. */
  updateBirds: (dt: number, playerX: number, playerZ: number) => void
  /** Every bird's current position, for `audio/birdCalls.ts` to pick a
   *  caller from — a snapshot, not a live reference. */
  birdPositions: () => { x: number; y: number; z: number }[]
  /** Steps hares and squirrels — call every frame with the player's own
   *  position, same as `updateBirds`. */
  updateCritters: (dt: number, playerX: number, playerZ: number) => void
  /** Shuttles the train along its line — call every frame. Ambient: no
   *  player position needed, same as `updateInsects` below. */
  updateTrain: (dt: number) => void
  /** Drifts bees around the hive and dragonflies over the water, if either
   *  exists in this wood — call every frame. Ambient: unlike `updateCritters`,
   *  it needs no player position. */
  updateInsects: (dt: number) => void
  /** Ripples every stream, breathes every waterfall's spray and bobs every
   *  spring — call every frame. */
  updateWater: (dt: number) => void
  /** Picks each collectible's own THREE.LOD level by distance from the
   *  camera — three.js's LOD does not do this on its own. Call every frame;
   *  cheap (one pass over the placements, no rebuilding). */
  updateMushroomLod: (camera: THREE.Camera) => void
  /** How many spawned finds still have no mesh — always 0 unless
   *  `createForest` was asked to defer them (see its `deferPlacements`). */
  pendingPlacements: () => number
  /** Builds meshes for still-pending finds until `budgetMs` has passed (at
   *  least one, so it always makes progress), and returns how many remain.
   *  `mushroomObjects` grows in place. */
  buildPlacements: (budgetMs: number) => number
  /** Real distance culling for the wood's static InstancedMesh scatter
   *  (trees, boulders, deadwood, undergrowth, flora, grass) — see
   *  world/instanceCulling.ts. Meant to be called periodically (every few
   *  dozen frames), not every frame; main.ts owns that throttle. */
  updateScatterCulling: (camX: number, camZ: number, radius: number) => void
}

/**
 * Builds the wood: ground, trees, and mushrooms by their ecology.
 *
 * The season follows the real calendar month; days-since-rain is fixed for now
 * — a real weather system is future work (see TODO.md).
 */
export function createForest(
  source: ForestSource,
  seed: number,
  halfSize: number = DEFAULT_HALF_SIZE,
  groundSegments?: number,
  /** The wood's own accelerated calendar (`world/calendar.ts`'s
   *  `gameDaysElapsed`), for spawn's `month`/`daysSinceRain` below — 0 (day
   *  one, month one, no rain yet) is a fine default for callers (tests,
   *  mainly) that don't care about the calendar at all. */
  gameDays = 0,
  /** Leave every find's mesh unbuilt and let the caller spend it out in
   *  slices through `buildPlacements` — building them all here is by far the
   *  biggest single block of a load (~85% of it), and a loading screen that
   *  is blocked for all of it cannot animate. Off by default: a caller with
   *  no loading screen (the tests) wants the whole wood back at once. */
  deferPlacements = false,
): Forest {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xa8c0a2, 30, 140)

  // Under a closed canopy almost all the light is bounced, not direct. A
  // strong sky term with a lit ground colour is what keeps the undersides of
  // the crowns from reading as black lids. Its intensity, like the sun's,
  // now follows the time of day (see below) — 2.6 was simply noon's value.
  const hemi = new THREE.HemisphereLight(0xe6f2e0, 0x6b6a4a, 2.6)
  scene.add(hemi)
  const sunPosition = new THREE.Vector3(40, 80, 20)
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.1)
  sun.position.copy(sunPosition)
  scene.add(sun)
  // A real ground shadow under trees, but only near the home plot's own
  // clearing (TREE_SHADOW_RADIUS below) — 1500 honest shadow casters across
  // a whole wood is a real, unmeasured perf question on real (non-desktop)
  // hardware (see TODO.md); a small, fixed-size radius around the one point
  // that matters (where the player actually starts and lingers) keeps the
  // shadow map's own resolution sharp instead of stretched over 200m, and
  // bounds the shadow-casting tree count regardless of the wood's density.
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -TREE_SHADOW_RADIUS
  sun.shadow.camera.right = TREE_SHADOW_RADIUS
  sun.shadow.camera.top = TREE_SHADOW_RADIUS
  sun.shadow.camera.bottom = -TREE_SHADOW_RADIUS
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = SUN_DISTANCE * 2
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0015
  sun.target.position.set(0, 0, 0)
  scene.add(sun.target)

  // Replaces the old flat background colour: a dome the fog never quite
  // hides above the treeline, rather than a solid fill with a visible seam
  // at the horizon.
  const sky = buildSky()
  scene.add(sky.mesh)
  // Tonight's real moon phase — no in-game calendar exists yet to track its
  // own (see TODO.md), and this reads honestly regardless rather than
  // always drawing a full disc. Computed once: it moves too slowly for a
  // session to notice it hasn't been resampled since load.
  const moonPhaseNow = moonPhase(new Date())
  // Set once the shelter/train exist, further down — updateDayNight runs
  // once at noon before that, when there is nothing to light anyway.
  let shelterFx: ShelterFx | null = null
  let trainFx: Train | null = null
  // The mine's own group, set once it is built below — updateDayNight (defined
  // first) feeds it how much daylight spills in at the mouth.
  let mineGroup: THREE.Group | null = null
  const updateDayNight = (t: number, camPos: THREE.Vector3): void => {
    const sample = sampleDayNight(t)
    const elevation = sunElevation(t)
    const az = t * Math.PI * 2
    sunPosition.set(
      Math.cos(az) * SUN_DISTANCE * 0.6,
      Math.max(-30, elevation * SUN_DISTANCE),
      Math.sin(az) * SUN_DISTANCE * 0.6,
    )
    sun.position.copy(sunPosition)
    sun.color.setHex(sample.sun)
    sun.intensity = sample.sunI
    hemi.intensity = sample.ambI
    if (scene.fog) (scene.fog as THREE.Fog).color.setHex(sample.sky)
    // The disc fades out the instant the sun dips below the horizon; the
    // star field and moon fade in over the same stretch, not instantly —
    // dusk should read as a gradient, not a light switch.
    const sunVis = Math.max(0, elevation)
    const night = nightFactor(t)
    sky.update(camPos, sample.sky, sample.sun, sunPosition, sunVis, night, moonPhaseNow)
    shelterFx?.setNight(night)
    trainFx?.setNight(night)
    if (mineGroup) setMineLighting(mineGroup, { day: 1 - night })
  }
  updateDayNight(0.5, new THREE.Vector3()) // noon by default: the wood's original fixed look

  // A clear sky by default — the settings menu (M) reaches setCover/setWeather.
  const clouds = buildClouds(seed + 12)
  scene.add(clouds.mesh)
  const updateClouds = (camPos: THREE.Vector3, dt: number): void => {
    clouds.update(camPos, dt, source.ground.heightAt(camPos.x, camPos.z))
  }

  const weather = buildWeather(seed + 13, scene.fog as THREE.Fog)
  scene.add(weather.group)
  const setWeather = (w: Weather): void => {
    weather.setWeather(w)
    clouds.setCover(w === 'clear' ? 0 : w === 'fog' ? 0.4 : 1)
  }
  const updateWeather = (camPos: THREE.Vector3, dt: number): void => {
    weather.update(camPos, dt)
  }

  // Off by default: only worth reaching for once night exists (v0.16.0), and
  // even then only when the player wants it.
  // Intensity looks small next to the sun's ~1.1, but three's physically
  // correct lighting (default since r150) has a spot/point light's candela
  // fall off with the square of distance — 150 here is roughly a torch's
  // worth of light a few metres out, not a runaway floodlight.
  const flashlight = new THREE.SpotLight(0xfff2cc, 600, 30, 0.35, 0.4, 2)
  flashlight.visible = false
  scene.add(flashlight, flashlight.target)
  const setFlashlight = (on: boolean): void => {
    flashlight.visible = on
    if (mineGroup) setMineLighting(mineGroup, { flashOn: on })
  }
  const updateFlashlight = (camPos: THREE.Vector3, camDir: THREE.Vector3): void => {
    flashlight.position.copy(camPos)
    flashlight.target.position.copy(camPos).add(camDir)
    if (mineGroup) setMineLighting(mineGroup, { flashPos: camPos, flashDir: camDir })
  }

  // The ground mesh and the trail ribbons are built further down, once the
  // mine is placed: the mine reshapes the hillside around its mouth (see
  // world/mineTerrain.ts), and they have to be drawn from that surface.
  const groundCells = groundSegments ?? groundSegmentsFor(halfSize)

  // A narrow-gauge line and a small train shuttling along it — the lowest-
  // priority TODO item, a live request ported from race-the-city's own
  // idea, not its city-scale code (see world/railway.ts's own doc comment).
  const railLine = source.railLine ?? placeRailLine(source.ground, halfSize, seed + RAIL_SEED_OFFSET)
  scene.add(buildRailMesh(railLine))
  const train = createTrain(scene, railLine, seed + 30)
  trainFx = train
  const updateTrain = (dt: number): void => train.update(dt)
  const water = buildWaterMeshes(source.water ?? [], source.ground)
  scene.add(water.group)
  const springs = placeSprings(source.water ?? [], halfSize, mulberry32(seed + 16), 3)
  const springFx = buildSpringMeshes(springs, source.ground)
  scene.add(springFx.group)
  let waterClock = 0
  const updateWater = (dt: number): void => {
    waterClock += dt
    water.update(waterClock)
    springFx.update(waterClock)
  }
  scene.add(buildTreeMeshes(source.trees, TREE_SHADOW_RADIUS))

  const logs = placeLogs(source.ground, halfSize, seed + 5)
  const stumps = placeStumps(source.ground, halfSize, seed + 6)
  scene.add(buildDeadwoodMeshes(logs, stumps))
  // Kept apart so the mine's clearing (below) never lets the player walk into water.
  const waterCircles = waterObstacles(source.water ?? [])
  const extraObstacles = [
    ...logs.flatMap((l) => logObstacles(l)),
    ...stumps.map((s) => ({ x: s.x, z: s.z, radius: s.radius, topHeight: s.height })),
    // Real water becomes a real obstacle everywhere, not just near the quest
    // item — it was already parsed and drawn (buildWaterMeshes above) but had
    // no collision at all (see world/water.ts's own doc comment).
    ...waterCircles,
  ]

  const leaningTrees = placeLeaningTrees(source.ground, halfSize, seed + 14)
  scene.add(buildLeaningTreeMeshes(leaningTrees))
  extraObstacles.push(...leaningTrees.map(leaningTreeObstacle))

  const boulders = placeBoulders(source.ground, halfSize, seed + 7)
  scene.add(buildBoulderMeshes(boulders))
  extraObstacles.push(...boulders.map(boulderObstacle))

  const bushes = placeBushes(source.ground, halfSize, seed + 8)
  const bushMeshes = buildBushMeshes(bushes)
  scene.add(bushMeshes)
  extraObstacles.push(...bushes.map(bushObstacle))

  // Pure decoration: no substrate, no collision, nothing ecology.ts needs to
  // know about. Its only job is to give the eye something to search through.
  scene.add(buildFloraMeshes(placeFlora(source.ground, halfSize, seed + 9)))
  const grassMesh = buildGrassMesh(placeGrass(source.ground, halfSize, seed + 11))
  scene.add(grassMesh)
  const occluders = [grassMesh, bushMeshes]

  // One hut per wood, sited clear of everything already standing.
  const treeCircles = source.trees.map((tr) => ({ x: tr.x, z: tr.z, radius: tr.radius }))
  const shelter = placeShelter(
    source.ground, halfSize, seed + 10, [...treeCircles, ...extraObstacles], source.shelters ?? [],
  )
  shelterFx = buildShelterMesh(shelter, source.ground)
  scene.add(shelterFx.group)
  // The player's own collision uses the fine wall ring + door below, so they
  // can actually walk in through the doorway (a live request, 2026-09-09) —
  // NOT shelterObstacle's single big circle, which would block the doorway
  // along with everything else. Siting anything ELSE near the hut (the
  // campfire, next) still wants the whole footprint kept clear, so that
  // stays a one-off argument to its own findOpenSpot call instead.
  const shelterFootprint = shelterObstacle(shelter)
  extraObstacles.push(...wallObstacles(shelter), shelterFx.doorObstacle, ...interiorObstacles(shelter))
  const updateShelter = (dt: number): void => shelterFx!.update(dt)

  // A second everyday fixture, deliberately apart from the hut — see
  // world/campfire.ts's own doc comment for why (a live request, 2026-09-09).
  const campfire = placeCampfire(
    source.ground, halfSize, seed + 18, [...treeCircles, ...extraObstacles, shelterFootprint], shelter,
  )
  const campfireFx = buildCampfireMesh(campfire)
  scene.add(campfireFx.group)
  extraObstacles.push(campfireObstacle(campfire))
  const updateCampfire = (dt: number): void => campfireFx.update(dt)

  // A fishing shack and its boat, but only where the wood actually has water
  // to fish in — a live request, 2026-09-09. placeFisherHut returns null
  // outright rather than a hut standing in dry woods.
  const fisherHut = placeFisherHut(
    source.water ?? [], source.ground, halfSize, seed + 19, [...treeCircles, ...extraObstacles, shelterFootprint],
  )
  if (fisherHut) {
    scene.add(buildFisherHutMesh(fisherHut))
    scene.add(buildBoatMesh(fisherHut.boat))
    extraObstacles.push(fisherHutObstacle(fisherHut))
  }

  // A mine/cave interior — a real OSM cave/adit/mineshaft mouth wins when
  // this plot has one (world/mine.ts's own `mapped` filters it to this
  // plot's bounds, the same "in range of the loaded plot" check
  // world/shelter.ts's `mapped` already does), otherwise `placeMine` sites
  // one itself. Every wood gets a mine now — the diamond quest item needs
  // somewhere to be regardless of what OSM happened to survey here.
  const mine: Mine = placeMine(
    source.ground, halfSize, seed + 32, [...treeCircles, ...extraObstacles, shelterFootprint], shelter,
    source.caves ?? [], source.paths ?? [],
  )
  const diamondSpot = diamondSpotInMine(mine)

  // The mine reshapes the hillside around its mouth (world/mineTerrain.ts): a
  // level apron in front of the doorway, a mound over the tunnels with a rock
  // face at the mouth. `mineTerrain.meshGround` is what the ground mesh is
  // drawn from, `mineTerrain.surface` is what the player, the camera and the
  // trail ribbons stand on — and, being in this file's `Forest.ground`, what
  // every other consumer of the ground reads too, so they all agree.
  const mineTerrain = createMineTerrain(mine, source.ground, (2 * halfSize) / groundCells)
  const groundWithMine: ElevationProvider = mineTerrain.surface
  // What things laid on the hill stand on (mushrooms, animals): the same surface,
  // but not switching with where the player is — see MineTerrain.outsideSurface.
  const staticGround: ElevationProvider = mineTerrain.outsideSurface
  scene.add(buildGround(mineTerrain.meshGround, halfSize, groundCells, source.biomeAt, seed + 17))
  // Trails stop short of the mound: a ribbon laid across a rock face is a
  // ramp through a wall.
  const trails = (source.paths ?? []).flatMap((rawPath) => {
    const path = densify(rawPath, 2)
    const runs: Vec2[][] = []
    let run: Vec2[] = []
    for (const p of path) {
      if (mineTerrain.onMound(p.x, p.z, 1)) {
        if (run.length > 1) runs.push(run)
        run = []
      } else {
        run.push(p)
      }
    }
    if (run.length > 1) runs.push(run)
    return runs
  })
  scene.add(buildPathMeshes(trails, groundWithMine, halfSize))
  mineGroup = buildMineMesh(mine, mineTerrain)
  scene.add(mineGroup)
  // Clear the mound and the doorstep of everything the scatter already put
  // there at the raw ground height (a trunk standing in a passage, a bush
  // under the mound): the meshes go (world/mineMesh.ts), and so do their
  // collision circles and their trees. Nothing is left behind as an invisible
  // obstacle, and nothing keeps its own collision without its mesh.
  for (const child of scene.children) {
    if (STATIC_SCATTER_GROUP_NAMES.has(child.name)) clearScatterOnMine(child, (x, z) => mineTerrain.occupies(x, z))
  }
  for (let i = extraObstacles.length - 1; i >= 0; i--) {
    if (!waterCircles.includes(extraObstacles[i]) && mineTerrain.occupies(extraObstacles[i].x, extraObstacles[i].z)) {
      extraObstacles.splice(i, 1)
    }
  }
  const woodTrees = source.trees.filter((tr) => !mineTerrain.occupies(tr.x, tr.z, tr.radius))
  extraObstacles.push(...mineObstacles(mine, mineTerrain.deckRadius))
  // Whether the player is in the tunnels is a state of the walk in (through the
  // doorway) and out again, not a function of where they stand — the hill
  // above a tunnel is over the same x/z. This is called every frame with the
  // player's position (the lamp rule reads it), which is also what keeps the
  // height under the player's feet (`groundWithMine`) in step with it.
  const playerInsideMine = (x: number, z: number): boolean => mineTerrain.update(x, z)

  // The lamp quest's own ability: a PointLight that follows the player,
  // toggled by `main.ts` (via `quest/lamp.ts`'s pure `lampIsOn`) rather than
  // driven by anything in here — this file only owns the light itself and
  // where it sits, same division as the existing flashlight above. Warmer
  // and gentler than the flashlight (no cone/aim, see the design doc), so it
  // reads as "carrying a lamp" rather than "holding a torch out in front."
  const playerLamp = new THREE.PointLight(0xffdca0, 9, 11)
  playerLamp.visible = false
  scene.add(playerLamp)
  const updatePlayerLamp = (on: boolean, pos: THREE.Vector3): void => {
    playerLamp.visible = on
    playerLamp.position.copy(pos)
    if (mineGroup) setMineLighting(mineGroup, { lampOn: on, lampPos: pos })
  }

  const birds = createBirds(scene, mulberry32(seed + 15), 8, source.ground, treePerches(woodTrees))
  const updateBirds = (dt: number, playerX: number, playerZ: number): void => birds.update(dt, playerX, playerZ)
  const birdPositions = (): ReturnType<typeof birds.positions> => birds.positions()

  // Ground fauna: see docs/superpowers/specs/2026-09-10-wildlife-design.md.
  // Homes are scattered independently of the tree perches birds/squirrels
  // land in — a squirrel idles on the ground and only takes to a trunk when
  // it flees.
  const perches = treePerches(woodTrees)
  const hareHomes = placeCritterHomes(staticGround, halfSize, seed + 20, 5, [...treeCircles, ...extraObstacles])
  const hares = createHares(scene, mulberry32(seed + 21), 5, staticGround, hareHomes)
  const squirrelHomes = placeCritterHomes(staticGround, halfSize, seed + 22, 5, [...treeCircles, ...extraObstacles])
  const squirrels = createSquirrels(scene, mulberry32(seed + 23), 5, staticGround, squirrelHomes, perches)
  // Rare, per the brainstorm: two snakes to a wood, not five — same species
  // count order of magnitude smaller than hares/squirrels.
  const snakeHomes = placeCritterHomes(staticGround, halfSize, seed + 24, 2, [...treeCircles, ...extraObstacles])
  const snakes = createSnakes(scene, mulberry32(seed + 25), 2, staticGround, snakeHomes)
  const updateCritters = (dt: number, playerX: number, playerZ: number): void => {
    hares.update(dt, playerX, playerZ)
    squirrels.update(dt, playerX, playerZ)
    snakes.update(dt, playerX, playerZ)
  }

  // Insects: ambient, no state machine — see docs/superpowers/specs/
  // 2026-09-10-wildlife-design.md. A wild hive against a real tree (or none,
  // honestly, same as the fisherman's hut with no water); dragonflies only
  // where the wood actually has a pond to hover over.
  const hive = placeHive(woodTrees, seed + 26)
  let bees: ReturnType<typeof createBees> | null = null
  if (hive) {
    scene.add(buildHiveMesh(hive))
    extraObstacles.push(hiveObstacle(hive))
    bees = createBees(scene, mulberry32(seed + 27), 10, hive)
  }
  const pondAnchors = (source.water ?? [])
    .filter((ring) => ring.length >= 2 && classifyWater(ring) === 'pond')
    .flatMap((ring) => {
      const y = waterLevel(ring, source.ground) + 0.15
      const picks = [ring[0], ring[Math.floor(ring.length / 2)]]
      return picks.map((p) => ({ x: p.x, y, z: p.z }))
    })
  const dragonflies = pondAnchors.length > 0 ? createDragonflies(scene, mulberry32(seed + 28), 6, pondAnchors) : null
  const updateInsects = (dt: number): void => {
    bees?.update(dt)
    dragonflies?.update(dt)
  }

  const onFree = (p: { x: number; z: number }): boolean => !mineTerrain.occupies(p.x, p.z)
  const deadwoodPoints = logs.flatMap((l) => logSpawnPoints(l)).filter(onFree)
  const mossPoints = boulders.flatMap((b) => mossSpawnPoints(b)).filter(onFree)
  const siteCount = Math.round(DEFAULT_SITE_COUNT * (halfSize / DEFAULT_HALF_SIZE) ** 2)
  const sites = buildSites(
    staticGround, woodTrees, halfSize, seed + 2, source.biomeAt, siteCount, deadwoodPoints, mossPoints,
    source.water ?? [],
  )
  const month = gameMonth(gameDays)
  // Nothing grows on the mine's rock mound or its levelled doorstep.
  const placements = spawnMushrooms(loadSpecies(), sites, {
    month, seed: seed + 3, daysSinceRain: daysSinceRain(seed + 3, gameDays),
  }).filter((p) => !mineTerrain.occupies(p.x, p.z))

  for (const marker of fairyRingMarkers(placements)) {
    scene.add(buildFairyRingMesh(marker, staticGround))
  }

  const mushroomObjects: THREE.Object3D[] = []
  // Every placement's own THREE.LOD, kept apart from mushroomObjects (which
  // for a berry/nut/find is the withPickHitbox wrapper, not the LOD itself)
  // — three.js's LOD does not update itself, so updateMushroomLod below
  // needs the exact objects to call .update(camera) on every frame.
  const lods: THREE.LOD[] = []
  let placementCursor = 0
  const pendingPlacements = (): number => placements.length - placementCursor
  const buildPlacements = (budgetMs: number): number => {
    const deadline = performance.now() + budgetMs
    while (placementCursor < placements.length) {
      const built = buildPlacementObject(placements[placementCursor++], staticGround)
      if (built) {
        lods.push(built.lod)
        scene.add(built.object)
        mushroomObjects.push(built.object)
      }
      if (performance.now() >= deadline) break
    }
    return pendingPlacements()
  }
  if (!deferPlacements) buildPlacements(Infinity)
  const updateMushroomLod = (camera: THREE.Camera): void => {
    for (const lod of lods) lod.update(camera)
  }

  // Snapshotted once, here, after every scatter group (trees/boulders/
  // deadwood/leaning-trees/undergrowth/flora/grass) already carries its real,
  // final per-instance transforms — see world/instanceCulling.ts's own doc
  // comment for why fog alone doesn't already do this.
  const scatterCullers = collectScatterCullers(scene)
  const updateScatterCulling = (camX: number, camZ: number, radius: number): void => {
    sweepAll(scatterCullers, camX, camZ, radius)
  }

  return {
    scene, ground: groundWithMine, trees: woodTrees, placements, mushroomObjects, extraObstacles,
    shelter: { x: shelter.x, z: shelter.z }, shelterDoor: doorPosition(shelter),
    campfire: { x: campfire.x, z: campfire.z },
    mine: { x: mine.x, z: mine.z },
    isShelterDoorOpen: () => shelterFx!.isDoorOpen(), toggleShelterDoor: () => shelterFx!.toggleDoor(),
    occluders, updateDayNight, updateClouds,
    setWeather, updateWeather, setFlashlight, updateFlashlight, playerInsideMine, diamondSpot, updatePlayerLamp,
    setDiamondPlaced: (on: boolean) => shelterFx!.setDiamondPlaced(on),
    setRodPlaced: (on: boolean) => shelterFx!.setRodPlaced(on),
    setBikePlaced: (on: boolean, spot?: BikeSpot) => shelterFx!.setBikePlaced(on, spot),
    bikeSpotNear: (p: { x: number; z: number }) => nearestBikeSpot(shelter, p),
    updateShelter, updateCampfire, updateBirds,
    birdPositions, updateCritters, updateTrain, updateInsects, updateWater,
    updateMushroomLod, pendingPlacements, buildPlacements, updateScatterCulling,
  }
}
