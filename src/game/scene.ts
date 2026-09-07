import * as THREE from 'three'
import { proceduralTerrain } from '../terrain/procedural'
import { buildGround } from '../world/ground'
import { placeTrees, buildTreeMeshes, type Tree } from '../world/trees'
import { buildSites } from '../ecology/sites'
import { spawnMushrooms, type Placement } from '../ecology/spawn'
import { loadSpecies, speciesById } from '../species/load'
import { buildMushroom, toWorldMesh } from '../mushroom/build'
import type { ElevationProvider } from '../terrain/provider'

/** Half the plot's side, metres. Ninety is about a quarter-hour's slow walk across. */
export const HALF_SIZE = 90

export interface Forest {
  scene: THREE.Scene
  ground: ElevationProvider
  trees: Tree[]
  placements: Placement[]
  /** One object per mushroom, in the same order as placements. */
  mushroomObjects: THREE.Object3D[]
}

/**
 * Builds the wood: terrain, ground, trees, and mushrooms by their ecology.
 *
 * The month and the days since rain are fixed for now. September after recent
 * rain is the best week of the year, and for a first walk the wood should be
 * generous. A calendar arrives with the save file.
 */
export function createForest(seed: number): Forest {
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

  const ground = proceduralTerrain(seed)
  scene.add(buildGround(ground, HALF_SIZE, 160))

  const trees = placeTrees(ground, HALF_SIZE, seed + 1, ['betula', 'picea', 'pinus', 'populus'], 0.03)
  scene.add(buildTreeMeshes(trees))

  const sites = buildSites(ground, trees, HALF_SIZE, seed + 2, 'forest-mixed', 1600)
  const placements = spawnMushrooms(loadSpecies(), sites, { month: 9, seed: seed + 3, daysSinceRain: 2 })

  const mushroomObjects: THREE.Object3D[] = []
  for (const p of placements) {
    const species = speciesById(p.speciesId)
    if (!species) continue
    const mesh = toWorldMesh(buildMushroom(species.morphology, p.seed, p.age))
    mesh.position.set(p.x, ground.heightAt(p.x, p.z), p.z)
    mesh.rotateY(p.rotationY)
    mesh.userData.placement = p
    scene.add(mesh)
    mushroomObjects.push(mesh)
  }

  return { scene, ground, trees, placements, mushroomObjects }
}
