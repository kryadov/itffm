import * as THREE from 'three'
import { speciesById } from '../species/load'
import { buildCollectible, toWorldMesh, withPickHitbox, buildCollectibleLod } from './build'
import type { Placement } from '../ecology/spawn'
import type { ElevationProvider } from '../terrain/provider'

export interface PlacementObject {
  /** What actually goes into the scene and into `Forest.mushroomObjects` —
   *  the bare `THREE.LOD` for a mushroom (its own cap is already a big
   *  enough target for `game/pick.ts`'s exact ray), or that LOD wrapped in a
   *  `withPickHitbox` for anything smaller (berry, herb, nut, find). */
  object: THREE.Object3D
  /** The LOD itself, always — `three.js` never updates a `THREE.LOD` on its
   *  own, so whoever owns this placement's lifetime needs the exact object
   *  to call `.update(camera)` on every frame, `object` above or not. */
  lod: THREE.LOD
}

/**
 * One spawned find, turned into the thing that actually goes into the scene
 * — shared by `game/scene.ts`'s home plot and `game/worldStream.ts`'s
 * streamed chunks, so a mushroom looks and picks the same whichever built it.
 *
 * @param ground resampled for the object's own y — a placement already
 *   carries a `y` from whenever its `Site` was built, but the mesh is
 *   positioned from the ground actually under it right now, the same
 *   redundancy `game/scene.ts` already accepted rather than trust a value
 *   that could have gone stale between generation and placement.
 */
export function buildPlacementObject(p: Placement, ground: ElevationProvider): PlacementObject | null {
  const species = speciesById(p.speciesId)
  if (!species) return null
  const lod = buildCollectibleLod(toWorldMesh(buildCollectible(species, p.seed, p.age)))
  let object: THREE.Object3D = lod
  if (species.kind !== 'mushroom') object = withPickHitbox(object)
  object.position.set(p.x, ground.heightAt(p.x, p.z), p.z)
  object.rotateY(p.rotationY)
  object.userData.placement = p
  return { object, lod }
}
