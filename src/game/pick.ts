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

/**
 * Half-angle of the aim-forgiveness cone for a small object, radians.
 *
 * A `clustered` colony (ecology/spawn.ts's COLONY_SPREAD) scatters its
 * fruiting bodies up to ~0.35m from the site centre — at the roughly 1m the
 * player actually stands from one to pick it, that is atan(0.35/1) ≈ 19° off
 * dead centre for the far side of the same cluster. 2.5° (the first attempt)
 * only ever caught whichever one the exact ray happened to hit outright,
 * which read as "only the first berry works" — everything else in the same
 * clump fell outside a cone that tight.
 */
const SMALL_OBJECT_CONE_COS = Math.cos((16 * Math.PI) / 180)

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
 * a big mushroom truly hidden behind one is hidden from the ray as well as
 * the eye. That falls out of the geometry for free — the closest hit wins,
 * and if it is a tuft of grass rather than a mushroom, the walk up to
 * `userData.placement` below runs out of parents and returns null, so a
 * regular mushroom (never in `smallObjects`, see game/scene.ts) never gets a
 * second chance through the cone below.
 *
 * `smallObjects` — berries, herbs, nuts, finds — get that second chance
 * whenever the exact ray did not land on a real placement: they are real
 * enough at their real size to subtend only a few pixels, which made a
 * mushroom-grade exact aim effectively broken for them (see TODO.md,
 * 2026-09-08). This is deliberately unconditional once the exact ray misses
 * — an earlier version only tried the cone when NOTHING real lay anywhere
 * along the exact ray, meant to keep a mushroom genuinely hidden behind a
 * bush hidden. In practice a `clustered` colony (ecology/spawn.ts's
 * COLONY_SPREAD) packs several real specimens within centimetres of each
 * other, so the exact ray very often grazes some OTHER berry in the same
 * clump on its way past — a real placement, just not the one the cone was
 * about to find — and that alone silently swallowed the fallback for almost
 * every berry (2026-09-09 live report: "works for mushrooms, but the
 * berry's name never shows, except once"). A genuine big mushroom staying
 * hidden behind an occluder is still exactly right — it is simply never a
 * concern here, because a regular mushroom is never added to `smallObjects`
 * in the first place (see game/scene.ts).
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
    // Walk up to the mushroom it belongs to; an occluder (or some other real
    // specimen not on this exact ray's intended target) with no placement of
    // its own falls through to the small-object cone below.
    let o: THREE.Object3D | null = hits[0].object
    while (o && !o.userData.placement) o = o.parent
    if (o) return o
  }
  return nearestSmallInCone(camera, smallObjects, maxDistance)
}
