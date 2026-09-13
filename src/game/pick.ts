import * as THREE from 'three'
import type { Placement } from '../ecology/spawn'
import type { Species } from '../species/schema'

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

/**
 * The rod's own gate: a fish can be aimed at and seen before the fishing rod
 * quest is delivered, but pressing `E` on one is a no-op until then — the
 * same class of gate as any other quest ability (docs/superpowers/specs/
 * 2026-09-13-quest-items-design.md). Every other kind is always pickable;
 * this only ever refuses `kind: 'fish'`.
 */
export function canPick(species: Species, rodOwned: boolean): boolean {
  return species.kind !== 'fish' || rodOwned
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
 *
 * @param point where on screen to aim, in NDC (-1..1, default the crosshair
 *   at the centre) — touch has no crosshair worth centring on
 *   (game/touchControls.ts): a tap lands wherever the finger actually is.
 */
export function nearestInView(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
  occluders: THREE.Object3D[] = [],
  point: THREE.Vector2 = centre,
): THREE.Object3D | null {
  raycaster.setFromCamera(point, camera)
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

/**
 * The same crosshair-aim idea as `nearestInView`, for the hatchet's own
 * targets instead of a collectible's: a flat list of scrub meshes, no
 * occluders, no walk-up-to-`userData.placement` — a scrub mesh IS the object
 * to remove, tagged with `userData.scrubId` directly (see world/scrub.ts).
 * Kept separate from `nearestInView` rather than folded into it: a scrub
 * object is never a `Placement` and never belongs in the basket/inspect flow
 * that function's callers assume.
 */
export function nearestScrubInView(
  camera: THREE.Camera,
  scrubs: THREE.Object3D[],
  maxDistance: number,
  point: THREE.Vector2 = centre,
): THREE.Object3D | null {
  raycaster.setFromCamera(point, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(scrubs, false)
  return hits.length > 0 ? hits[0].object : null
}

/**
 * The exact same raycast `nearestInView` runs, but reporting every hit along
 * the ray instead of only resolving the first one — for `?debug=1`
 * (main.ts) to show, since "the label doesn't show up" has no other way to
 * see what the crosshair's own ray actually touched this frame.
 */
export interface DebugHit {
  name: string
  distance: number
  hasPlacement: boolean
}

export function debugRaycastHits(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  maxDistance: number,
  occluders: THREE.Object3D[] = [],
): DebugHit[] {
  raycaster.setFromCamera(centre, camera)
  raycaster.far = maxDistance
  const hits = raycaster.intersectObjects(occluders.length > 0 ? [...objects, ...occluders] : objects, true)
  return hits.map((h) => {
    let o: THREE.Object3D | null = h.object
    let hasPlacement = false
    while (o) {
      if (o.userData.placement) {
        hasPlacement = true
        break
      }
      o = o.parent
    }
    return { name: h.object.name || h.object.type, distance: h.distance, hasPlacement }
  })
}
