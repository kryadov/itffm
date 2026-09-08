import * as THREE from 'three'
import { buildMushroom } from '../mushroom/build'
import { buildBerry } from '../berry/build'
import type { Species } from '../species/schema'

export { toWorldMesh } from './worldMesh'

/**
 * The detailed model for any species, dispatched by `kind` — the one place
 * that needs to know every kind's own build.ts exists. Everything downstream
 * (game/scene.ts, ui/inspect.ts, ui/encyclopedia.ts) calls this instead of a
 * specific `buildX`, so adding a new kind means adding one case here, not
 * touching every caller.
 */
export function buildCollectible(species: Species, seed: number, age: number): THREE.Group {
  switch (species.kind) {
    case 'mushroom':
      return buildMushroom(species.morphology, seed, age)
    case 'berry':
      return buildBerry(species.morphology, seed, age)
  }
}
