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
 */
export function nearestInView(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
): THREE.Object3D | null {
  raycaster.setFromCamera(centre, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(objects, true)
  if (hits.length === 0) return null
  // The ray hits a cap or a stipe; walk up to the mushroom it belongs to.
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.placement) o = o.parent
  return o
}
