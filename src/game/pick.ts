import * as THREE from 'three'
import type { Placement } from '../ecology/spawn'

export interface Basket {
  readonly items: Placement[]
  add(p: Placement): boolean
  readonly full: boolean
}

/**
 * The basket. Deliberately limited: the cap is what gives a foray its shape and
 * makes the player choose what is worth carrying home.
 */
export function createBasket(capacity = 24): Basket {
  const items: Placement[] = []
  return {
    items,
    add(p) {
      if (items.length >= capacity) return false
      items.push(p)
      return true
    },
    get full() {
      return items.length >= capacity
    },
  }
}

const raycaster = new THREE.Raycaster()
const centre = new THREE.Vector2(0, 0)

/**
 * What is under the crosshair. A ray from the centre of the screen: a forager
 * looks at what they are reaching for, so aim decides the pick, not proximity.
 *
 * `occluders` — grass, undergrowth — are cast against too but never returned:
 * a mushroom truly hidden behind one is hidden from the ray as well as the
 * eye. That falls out of the geometry for free — the closest hit wins, and
 * if it is a tuft of grass rather than a mushroom, the walk up to
 * `userData.placement` below runs out of parents and returns null.
 *
 * A berry, a nut or a find is only a few centimetres across in real life —
 * far smaller than a mushroom cap — and an exact ray aimed "at" one by eye
 * routinely missed outright. Two earlier attempts patched this at the aiming
 * end instead, with a second, angular "forgiveness cone" fallback for small
 * objects specifically — and both went through live regressions of their
 * own (a colony's own neighbours defeating the fallback, grass swallowing
 * it), because aiming and hit-testing disagreed about what counted as
 * "close enough" in two different ways (see TODO.md, 2026-09-09). The actual
 * fix lives where the mushroom already gets it for free: `collectible/
 * worldMesh.ts`'s `withPickHitbox()` gives every small collectible a real,
 * exact-ray-sized target the moment it is built (game/scene.ts) — there is
 * no separate aiming code path left to keep in sync with it.
 */
export function nearestInView(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
  occluders: THREE.Object3D[] = [],
): THREE.Object3D | null {
  raycaster.setFromCamera(centre, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(occluders.length > 0 ? [...objects, ...occluders] : objects, true)
  if (hits.length === 0) return null
  // The ray hit something — a cap, a stipe, a small object's own hitbox, or
  // an occluder in front of one. Walk up to the placement it belongs to; an
  // occluder with no placement of its own returns null here.
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.placement) o = o.parent
  return o
}
