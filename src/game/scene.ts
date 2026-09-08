import * as THREE from 'three'
import { buildGround } from '../world/ground'
import { buildTreeMeshes, treePerches, type Tree } from '../world/trees'
import { createBirds } from '../world/birds'
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
import { placeShelter, shelterObstacle, buildShelterMesh, type ShelterFx } from '../world/shelter'
import { buildSky } from '../world/sky'
import { sampleDayNight, sunElevation } from '../world/daynight'
import { buildClouds } from '../world/clouds'
import { buildWeather, type Weather } from '../world/weather'
import { buildPathMeshes } from '../world/paths'
import { buildWaterMeshes } from '../world/water'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, fairyRingMarkers, type Placement } from '../ecology/spawn'
import { buildFairyRingMesh } from '../world/fairyRing'
import { loadSpecies, speciesById } from '../species/load'
import { buildCollectible, toWorldMesh } from '../collectible/build'
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
}

export interface Forest {
  scene: THREE.Scene
  ground: ElevationProvider
  trees: Tree[]
  placements: Placement[]
  /** One object per mushroom, in the same order as placements. */
  mushroomObjects: THREE.Object3D[]
  /** The subset of `mushroomObjects` for a non-mushroom kind (berry, herb,
   *  nut, find) — small enough that game/pick.ts gives them a forgiving aim
   *  cone the exact crosshair ray alone would too often miss. */
  smallObjects: THREE.Object3D[]
  /** Everything besides standing trees that blocks the player — fallen logs,
   *  stumps, boulders, bushes — as collision circles for the same obstacle
   *  list `stepPlayer` and `chooseStartPose` already use for tree trunks. */
  extraObstacles: { x: number; z: number; radius: number; topHeight?: number }[]
  /** The wood's one hut — game/main.ts starts the player beside it. */
  shelter: { x: number; z: number }
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
  /** Drifts the flock — call every frame with the player's own position. */
  updateBirds: (dt: number, playerX: number, playerZ: number) => void
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

  // Replaces the old flat background colour: a dome the fog never quite
  // hides above the treeline, rather than a solid fill with a visible seam
  // at the horizon.
  const sky = buildSky()
  scene.add(sky.mesh)
  /** Sun position on a circle whose radius sets how high overhead it swings
   *  — matches the old fixed light's rough distance from the origin. */
  const SUN_DISTANCE = 90
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
    sky.update(camPos, sample.sky, sample.sun, sunPosition, sunVis, night)
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

  scene.add(buildGround(source.ground, halfSize, groundSegmentsFor(halfSize), source.biomeAt))
  scene.add(buildPathMeshes(source.paths ?? [], source.ground, halfSize))
  scene.add(buildWaterMeshes(source.water ?? [], source.ground))
  scene.add(buildTreeMeshes(source.trees))

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
  const shelter = placeShelter(source.ground, halfSize, seed + 10, [...treeCircles, ...extraObstacles])
  shelterFx = buildShelterMesh(shelter)
  scene.add(shelterFx.group)
  extraObstacles.push(shelterObstacle(shelter))
  const updateShelter = (dt: number): void => shelterFx!.update(dt)

  const birds = createBirds(scene, mulberry32(seed + 15), 8, source.ground, treePerches(source.trees))
  const updateBirds = (dt: number, playerX: number, playerZ: number): void => birds.update(dt, playerX, playerZ)

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
  // A berry, a nut or a find is a few centimetres across — far smaller than a
  // mushroom cap — so it subtends only a few screen pixels at any reasonable
  // distance, and the crosshair's exact ray routinely misses it even when
  // aimed "at" it by eye (see TODO.md, 2026-09-08). Tagged here, once, so
  // game/pick.ts can give only these a forgiving cone instead of scanning
  // every mushroom in the wood for one that rarely needs it.
  const smallObjects: THREE.Object3D[] = []
  for (const p of placements) {
    const species = speciesById(p.speciesId)
    if (!species) continue
    const mesh = toWorldMesh(buildCollectible(species, p.seed, p.age))
    mesh.position.set(p.x, source.ground.heightAt(p.x, p.z), p.z)
    mesh.rotateY(p.rotationY)
    mesh.userData.placement = p
    scene.add(mesh)
    mushroomObjects.push(mesh)
    if (species.kind !== 'mushroom') smallObjects.push(mesh)
  }

  return {
    scene, ground: source.ground, trees: source.trees, placements, mushroomObjects, smallObjects, extraObstacles,
    shelter: { x: shelter.x, z: shelter.z }, occluders, updateDayNight, updateClouds,
    setWeather, updateWeather, setFlashlight, updateFlashlight, updateShelter, updateBirds,
  }
}
