import * as THREE from 'three'
import { buildGround } from '../world/ground'
import { buildTreeMeshes, type Tree } from '../world/trees'
import { placeLogs, placeStumps, logObstacles, logSpawnPoints, buildDeadwoodMeshes } from '../world/deadwood'
import { placeBoulders, boulderObstacle, mossSpawnPoints, buildBoulderMeshes } from '../world/boulders'
import { placeBushes, bushObstacle, buildBushMeshes } from '../world/undergrowth'
import { placeFlora, buildFloraMeshes } from '../world/flora'
import { placeGrass, buildGrassMesh } from '../world/grass'
import { placeShelter, shelterObstacle, buildShelterMesh } from '../world/shelter'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, fairyRingMarkers, type Placement } from '../ecology/spawn'
import { buildFairyRingMesh } from '../world/fairyRing'
import { loadSpecies, speciesById } from '../species/load'
import { buildMushroom, toWorldMesh } from '../mushroom/build'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'

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
}

export interface Forest {
  scene: THREE.Scene
  ground: ElevationProvider
  trees: Tree[]
  placements: Placement[]
  /** One object per mushroom, in the same order as placements. */
  mushroomObjects: THREE.Object3D[]
  /** Everything besides standing trees that blocks the player — fallen logs,
   *  stumps, boulders, bushes — as collision circles for the same obstacle
   *  list `stepPlayer` and `chooseStartPose` already use for tree trunks. */
  extraObstacles: { x: number; z: number; radius: number }[]
  /** The wood's one hut — game/main.ts starts the player beside it. */
  shelter: { x: number; z: number }
  /** Grass and undergrowth: not pickable, but game/pick.ts casts against them
   *  too, so a mushroom genuinely hidden behind a tuft or a bush is hidden
   *  from the aim ray, not just from the eye. */
  occluders: THREE.Object3D[]
}

/**
 * Builds the wood: ground, trees, and mushrooms by their ecology.
 *
 * The season follows the real calendar month; days-since-rain is fixed for now
 * — a real weather system is future work (see TODO.md).
 */
export function createForest(source: ForestSource, seed: number, halfSize: number = DEFAULT_HALF_SIZE): Forest {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xa8c0a2)
  scene.fog = new THREE.Fog(0xa8c0a2, 30, 140)

  // Under a closed canopy almost all the light is bounced, not direct. A
  // strong sky term with a lit ground colour is what keeps the undersides of
  // the crowns from reading as black lids.
  scene.add(new THREE.HemisphereLight(0xe6f2e0, 0x6b6a4a, 2.6))
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.1)
  sun.position.set(40, 80, 20)
  scene.add(sun)

  scene.add(buildGround(source.ground, halfSize, groundSegmentsFor(halfSize)))
  scene.add(buildTreeMeshes(source.trees))

  const logs = placeLogs(source.ground, halfSize, seed + 5)
  const stumps = placeStumps(source.ground, halfSize, seed + 6)
  scene.add(buildDeadwoodMeshes(logs, stumps))
  const extraObstacles = [
    ...logs.flatMap((l) => logObstacles(l)),
    ...stumps.map((s) => ({ x: s.x, z: s.z, radius: s.radius })),
  ]

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
  scene.add(buildShelterMesh(shelter))
  extraObstacles.push(shelterObstacle(shelter))

  const deadwoodPoints = logs.flatMap((l) => logSpawnPoints(l))
  const mossPoints = boulders.flatMap((b) => mossSpawnPoints(b))
  const siteCount = Math.round(DEFAULT_SITE_COUNT * (halfSize / DEFAULT_HALF_SIZE) ** 2)
  const sites = buildSites(
    source.ground, source.trees, halfSize, seed + 2, source.biomeAt, siteCount, deadwoodPoints, mossPoints,
  )
  const month = new Date().getMonth() + 1
  const placements = spawnMushrooms(loadSpecies(), sites, { month, seed: seed + 3, daysSinceRain: 2 })

  for (const marker of fairyRingMarkers(placements)) {
    scene.add(buildFairyRingMesh(marker, source.ground))
  }

  const mushroomObjects: THREE.Object3D[] = []
  for (const p of placements) {
    const species = speciesById(p.speciesId)
    if (!species) continue
    const mesh = toWorldMesh(buildMushroom(species.morphology, p.seed, p.age))
    mesh.position.set(p.x, source.ground.heightAt(p.x, p.z), p.z)
    mesh.rotateY(p.rotationY)
    mesh.userData.placement = p
    scene.add(mesh)
    mushroomObjects.push(mesh)
  }

  return {
    scene, ground: source.ground, trees: source.trees, placements, mushroomObjects, extraObstacles,
    shelter: { x: shelter.x, z: shelter.z }, occluders,
  }
}
