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
const camPos = new THREE.Vector3()
const forward = new THREE.Vector3()
const toObj = new THREE.Vector3()

/** Half-angle of the aim-forgiveness cone for a small object, radians —
 *  generous enough that a berry cluster a couple of metres out no longer
 *  needs pixel-precise aim, tight enough that it never grabs something
 *  merely nearby in the view. */
const SMALL_OBJECT_CONE_COS = Math.cos((2.5 * Math.PI) / 180)

/**
 * The nearest small object roughly under the crosshair, within a forgiving
 * cone rather than an exact ray — a fallback for when the exact raycast in
 * `nearestInView` misses. `smallObjects` is expected to be a short list (see
 * game/scene.ts), since this scans it in full.
 *
 * Does not check occluders: a small object genuinely hidden behind a bush
 * can still be picked by distance and angle alone. Accepted for now — grass
 * and bushes are sparse next to how often "aimed roughly at open air near a
 * tiny berry" is the actual case this exists for.
 */
function nearestSmallInCone(
  camera: THREE.Camera,
  smallObjects: THREE.Object3D[],
  maxDistance: number,
): THREE.Object3D | null {
  camera.getWorldPosition(camPos)
  camera.getWorldDirection(forward)
  let best: THREE.Object3D | null = null
  let bestDist = Infinity
  for (const obj of smallObjects) {
    if (!obj.visible) continue
    obj.getWorldPosition(toObj).sub(camPos)
    const dist = toObj.length()
    if (dist < 1e-6 || dist > maxDistance || dist >= bestDist) continue
    if (toObj.divideScalar(dist).dot(forward) < SMALL_OBJECT_CONE_COS) continue
    best = obj
    bestDist = dist
  }
  return best
}

/**
 * What is under the crosshair. A ray from the centre of the screen: a forager
 * looks at what they are reaching for, so aim decides the pick, not proximity.
 *
 * `occluders` — grass, undergrowth — are cast against too but never returned:
 * they exist here only so a mushroom truly hidden behind one is hidden from
 * the ray as well as the eye. That falls out of the geometry for free — the
 * closest hit wins, and if it is a tuft of grass rather than a mushroom, the
 * walk up to `userData.placement` below runs out of parents and returns null.
 *
 * `smallObjects` — berries, herbs, nuts, finds — get a second chance if the
 * exact ray missed: real enough at their real size to subtend only a few
 * pixels, which made a mushroom-grade exact aim effectively broken for them
 * (see TODO.md, 2026-09-08).
 */
export function nearestInView(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
  occluders: THREE.Object3D[] = [],
  smallObjects: THREE.Object3D[] = [],
): THREE.Object3D | null {
  raycaster.setFromCamera(centre, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(occluders.length > 0 ? [...objects, ...occluders] : objects, true)
  if (hits.length > 0) {
    // The ray hit something — a cap, a stipe, or an occluder in front of one.
    // Walk up to the mushroom it belongs to; an occluder with no placement of
    // its own returns null here, same as before, and does NOT fall through
    // to the cone below — a mushroom truly hidden behind grass must stay
    // hidden, not get picked up by the small-object forgiveness meant for
    // "nothing was hit at all".
    let o: THREE.Object3D | null = hits[0].object
    while (o && !o.userData.placement) o = o.parent
    return o
  }
  return nearestSmallInCone(camera, smallObjects, maxDistance)
}
