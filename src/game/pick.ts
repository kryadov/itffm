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
 * they exist here only so a mushroom truly hidden behind one is hidden from
 * the ray as well as the eye. That falls out of the geometry for free — the
 * closest hit wins, and if it is a tuft of grass rather than a mushroom, the
 * walk up to `userData.placement` below runs out of parents and returns null.
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
  // The ray hits a cap or a stipe; walk up to the mushroom it belongs to.
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.placement) o = o.parent
  return o
}
