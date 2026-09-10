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
  type ShelterFx,
} from '../world/shelter'
import { placeCampfire, campfireObstacle, buildCampfireMesh } from '../world/campfire'
import { placeFisherHut, fisherHutObstacle, buildFisherHutMesh, buildBoatMesh } from '../world/fisherHut'
import { placeMine, mineObstacles, buildMineMesh } from '../world/mine'
import { placeRailLine, buildRailMesh, createTrain } from '../world/railway'
import { buildSky } from '../world/sky'
import { sampleDayNight, sunElevation } from '../world/daynight'
import { moonPhase } from '../world/moonPhase'
import { buildClouds } from '../world/clouds'
import { buildWeather, type Weather } from '../world/weather'
import { buildPathMeshes } from '../world/paths'
import { buildWaterMeshes, placeSprings, buildSpringMeshes, classifyWater, waterLevel } from '../world/water'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, fairyRingMarkers, type Placement } from '../ecology/spawn'
import { buildFairyRingMesh } from '../world/fairyRing'
import { loadSpecies } from '../species/load'
import { buildPlacementObject } from '../collectible/placement'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'
import type { Vec2 } from '../geo/types'

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
}

/**
 * Builds the wood: ground, trees, and mushrooms by their ecology.
 *
 * The season follows the real calendar month; days-since-rain is fixed for now
 * — a real weather system is future work (see TODO.md).
 */
export function createForest(source: ForestSource, seed: number, halfSize: number = DEFAULT_HALF_SIZE): Forest {
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
  // Set once the shelter exists, further down — updateDayNight runs once at
  // noon before that, when there is nothing to light anyway.
  let shelterFx: ShelterFx | null = null
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
    const night = Math.max(0, Math.min(1, -elevation * 1.5))
    sky.update(camPos, sample.sky, sample.sun, sunPosition, sunVis, night, moonPhaseNow)
    shelterFx?.setNight(night)
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
  }
  const updateFlashlight = (camPos: THREE.Vector3, camDir: THREE.Vector3): void => {
    flashlight.position.copy(camPos)
    flashlight.target.position.copy(camPos).add(camDir)
  }

  scene.add(buildGround(source.ground, halfSize, groundSegmentsFor(halfSize), source.biomeAt, seed + 17))
  scene.add(buildPathMeshes(source.paths ?? [], source.ground, halfSize))

  // A narrow-gauge line and a small train shuttling along it — the lowest-
  // priority TODO item, a live request ported from race-the-city's own
  // idea, not its city-scale code (see world/railway.ts's own doc comment).
  const railLine = placeRailLine(source.ground, halfSize, seed + 29)
  scene.add(buildRailMesh(railLine))
  const train = createTrain(scene, railLine, seed + 30)
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
  const extraObstacles = [
    ...logs.flatMap((l) => logObstacles(l)),
    ...stumps.map((s) => ({ x: s.x, z: s.z, radius: s.radius, topHeight: s.height })),
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
  shelterFx = buildShelterMesh(shelter)
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

  // A mine/cave interior, but only where a surveyor actually found one — see
  // world/mine.ts's own doc comment for why there is no procedural fallback.
  // In range of the loaded plot at all: OSM's own query area is not the same
  // shape as this circle, same filter world/shelter.ts's `mapped` uses.
  const caveEntrance = (source.caves ?? []).find((c) => Math.abs(c.x) <= halfSize && Math.abs(c.z) <= halfSize)
  if (caveEntrance) {
    const mine = placeMine(caveEntrance, source.ground)
    scene.add(buildMineMesh(mine))
    extraObstacles.push(...mineObstacles(mine))
  }

  const birds = createBirds(scene, mulberry32(seed + 15), 8, source.ground, treePerches(source.trees))
  const updateBirds = (dt: number, playerX: number, playerZ: number): void => birds.update(dt, playerX, playerZ)
  const birdPositions = (): ReturnType<typeof birds.positions> => birds.positions()

  // Ground fauna: see docs/superpowers/specs/2026-09-10-wildlife-design.md.
  // Homes are scattered independently of the tree perches birds/squirrels
  // land in — a squirrel idles on the ground and only takes to a trunk when
  // it flees.
  const perches = treePerches(source.trees)
  const hareHomes = placeCritterHomes(source.ground, halfSize, seed + 20, 5, [...treeCircles, ...extraObstacles])
  const hares = createHares(scene, mulberry32(seed + 21), 5, source.ground, hareHomes)
  const squirrelHomes = placeCritterHomes(source.ground, halfSize, seed + 22, 5, [...treeCircles, ...extraObstacles])
  const squirrels = createSquirrels(scene, mulberry32(seed + 23), 5, source.ground, squirrelHomes, perches)
  // Rare, per the brainstorm: two snakes to a wood, not five — same species
  // count order of magnitude smaller than hares/squirrels.
  const snakeHomes = placeCritterHomes(source.ground, halfSize, seed + 24, 2, [...treeCircles, ...extraObstacles])
  const snakes = createSnakes(scene, mulberry32(seed + 25), 2, source.ground, snakeHomes)
  const updateCritters = (dt: number, playerX: number, playerZ: number): void => {
    hares.update(dt, playerX, playerZ)
    squirrels.update(dt, playerX, playerZ)
    snakes.update(dt, playerX, playerZ)
  }

  // Insects: ambient, no state machine — see docs/superpowers/specs/
  // 2026-09-10-wildlife-design.md. A wild hive against a real tree (or none,
  // honestly, same as the fisherman's hut with no water); dragonflies only
  // where the wood actually has a pond to hover over.
  const hive = placeHive(source.trees, seed + 26)
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

  const deadwoodPoints = logs.flatMap((l) => logSpawnPoints(l))
  const mossPoints = boulders.flatMap((b) => mossSpawnPoints(b))
  const siteCount = Math.round(DEFAULT_SITE_COUNT * (halfSize / DEFAULT_HALF_SIZE) ** 2)
  const sites = buildSites(
    source.ground, source.trees, halfSize, seed + 2, source.biomeAt, siteCount, deadwoodPoints, mossPoints,
    source.water ?? [],
  )
  const month = new Date().getMonth() + 1
  const placements = spawnMushrooms(loadSpecies(), sites, { month, seed: seed + 3, daysSinceRain: 2 })

  for (const marker of fairyRingMarkers(placements)) {
    scene.add(buildFairyRingMesh(marker, source.ground))
  }

  const mushroomObjects: THREE.Object3D[] = []
  // Every placement's own THREE.LOD, kept apart from mushroomObjects (which
  // for a berry/nut/find is the withPickHitbox wrapper, not the LOD itself)
  // — three.js's LOD does not update itself, so updateMushroomLod below
  // needs the exact objects to call .update(camera) on every frame.
  const lods: THREE.LOD[] = []
  for (const p of placements) {
    const built = buildPlacementObject(p, source.ground)
    if (!built) continue
    lods.push(built.lod)
    scene.add(built.object)
    mushroomObjects.push(built.object)
  }
  const updateMushroomLod = (camera: THREE.Camera): void => {
    for (const lod of lods) lod.update(camera)
  }

  return {
    scene, ground: source.ground, trees: source.trees, placements, mushroomObjects, extraObstacles,
    shelter: { x: shelter.x, z: shelter.z }, shelterDoor: doorPosition(shelter),
    isShelterDoorOpen: () => shelterFx!.isDoorOpen(), toggleShelterDoor: () => shelterFx!.toggleDoor(),
    occluders, updateDayNight, updateClouds,
    setWeather, updateWeather, setFlashlight, updateFlashlight, updateShelter, updateCampfire, updateBirds,
    birdPositions, updateCritters, updateTrain, updateInsects, updateWater,
    updateMushroomLod,
  }
}
