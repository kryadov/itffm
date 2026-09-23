import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Real-world-shaped models for the five quest items — shared by the mesh a
 * player picks up out in the wood (`main.ts`'s `showQuestItem`) and, for the
 * two that leave a trophy, the one `world/shelter.ts` displays once
 * delivered. One geometry per item, built once here, so the two can never
 * quietly drift apart the way two independent "good enough" primitives
 * would (live request, 2026-09-15: the pickup meshes read as unlabelled
 * coloured shapes, not the tools they are).
 *
 * Every model is built centred on its own local origin, standing as it
 * would rest on the ground — the caller positions, scales and (for the
 * rod/bike trophies) re-poses the returned group, none of that here.
 */

const WOOD_COLOR = 0x6b4a30
const METAL_COLOR = 0x8a8f96

/** A hand axe: a wooden haft with a wedge-shaped steel head near the top —
 *  the head a flattened, tapered box rather than a plain cube, so the
 *  silhouette reads as a blade and not a doorknob. */
export function buildAxeModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'axeModel'

  const haftMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.8 })
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.5, 8), haftMat)
  haft.position.y = 0.25
  group.add(haft)

  const headMat = new THREE.MeshStandardMaterial({ color: METAL_COLOR, roughness: 0.4, metalness: 0.6, flatShading: true })
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), headMat)
  head.name = 'head'
  head.rotation.z = -Math.PI / 2
  head.rotation.y = Math.PI / 4
  head.scale.set(1, 1, 0.45)
  head.position.set(0.05, 0.44, 0)
  group.add(head)

  return group
}

/** A hurricane lamp: a squat body, a warm glass chimney and a wire handle —
 *  the shape everyone already reads as "carried light," not just a coloured
 *  box. `chimneyMat` is returned too, so a caller can drive its own glow. */
export function buildLampModel(): { group: THREE.Group; chimneyMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group()
  group.name = 'lampModel'

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.5, metalness: 0.4 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10), bodyMat)
  base.position.y = 0.025
  group.add(base)

  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0xffb84d, emissiveIntensity: 0,
  })
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10), chimneyMat)
  chimney.name = 'chimney'
  chimney.position.y = 0.12
  group.add(chimney)

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 10), bodyMat)
  cap.position.y = 0.205
  group.add(cap)

  const handleMat = bodyMat
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 12, Math.PI), handleMat)
  handle.position.y = 0.25
  handle.rotation.x = Math.PI / 2
  group.add(handle)

  return { group, chimneyMat }
}

/** A fishing rod: a tapered pole and a reel near the grip — pose (leaning,
 *  lying flat) is entirely the caller's own rotation on the returned group,
 *  same convention `buildBikeModel` follows. */
export function buildRodModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'rodModel'
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.7 })
  const rodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 8), rodMat)
  rodPole.position.y = 0.75
  group.add(rodPole)
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.4 })
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), reelMat)
  reel.rotation.z = Math.PI / 2
  reel.position.set(0, 0.22, 0.015)
  group.add(reel)
  return group
}


/** A cylinder joining two points in the bike's own side-view (x, y) plane. */
function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), mat)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

// The bike is a side profile in the x-y plane, front wheel toward +x, wheels
// resting on y = 0. (The first version rotated the wheels a quarter turn about
// y, so they stood across the bike instead of along it and nothing read as a
// bicycle — a live report, 2026-09-19.)
export const BIKE_WHEEL_RADIUS = 0.32
const BIKE_TIRE_RADIUS = 0.025
/** How far the tread blocks stand proud of the tyre. */
const BIKE_TREAD_PROUD = 0.004
const BIKE_AXLE_Y = BIKE_WHEEL_RADIUS + BIKE_TIRE_RADIUS + BIKE_TREAD_PROUD
const BIKE_WHEELBASE = 1.0
const BIKE_REAR_AXLE = new THREE.Vector3(-BIKE_WHEELBASE / 2, BIKE_AXLE_Y, 0)
const BIKE_FRONT_AXLE = new THREE.Vector3(BIKE_WHEELBASE / 2, BIKE_AXLE_Y, 0)
const BIKE_BOTTOM_BRACKET = new THREE.Vector3(-0.08, 0.3, 0)
const BIKE_SEAT_TOP = new THREE.Vector3(-0.2, 0.78, 0)
const BIKE_HEAD_TOP = new THREE.Vector3(0.34, 0.82, 0)
const BIKE_STEM_TOP = new THREE.Vector3(0.31, 0.92, 0)
const BIKE_FRAME_RADIUS = 0.016

function bikeMaterials() {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x2f5f9e, roughness: 0.5, metalness: 0.3 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xa8adb3, roughness: 0.4, metalness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.8 }),
  }
}
type BikeMaterials = ReturnType<typeof bikeMaterials>

/** A spoked wheel in its own local space, centred on its axle, turning in x-y. */
/** The tyre's width over its thickness: a real bicycle tyre, not a motorcycle
 *  or offroad one. (It was 2 — twice as wide as thick — which read as a fat
 *  offroad tyre; a live report, 2026-09-22.) */
const BIKE_TYRE_WIDENING = 1.2
/** How many proud blocks the tread is built from. */
export const TREAD_BLOCKS = 6

function buildBikeWheel(m: BikeMaterials): THREE.Group {
  const wheel = new THREE.Group()
  wheel.name = 'wheel'
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(BIKE_WHEEL_RADIUS, BIKE_TIRE_RADIUS, 8, 24), m.tire)
  tyre.scale.z = BIKE_TYRE_WIDENING
  wheel.add(tyre)
  // Tread: TREAD_BLOCKS proud blocks all the way round the rim, in one matte
  // shade a touch lighter than the tyre itself — the raised, jointed geometry
  // gives the tread its own rhythm under the light, without the alternating
  // light/dark "barcode" round the rim that read as a sticker rather than
  // rubber (a live report, 2026-09-22). The blocks run edge to edge (no gaps),
  // so the tread stays a true circle and the wheel still sits exactly on
  // BIKE_AXLE_Y all the way round.
  const blockGeos: THREE.BufferGeometry[] = []
  for (let i = 0; i < TREAD_BLOCKS; i++) {
    const block = new THREE.TorusGeometry(
      BIKE_WHEEL_RADIUS, BIKE_TIRE_RADIUS + BIKE_TREAD_PROUD, 8, 4, (Math.PI * 2) / TREAD_BLOCKS,
    )
    block.scale(1, 1, BIKE_TYRE_WIDENING)
    block.rotateZ((i * Math.PI * 2) / TREAD_BLOCKS)
    blockGeos.push(block)
  }
  const tread = new THREE.Mesh(
    mergeGeometries(blockGeos, false),
    new THREE.MeshStandardMaterial({ color: 0x262624, roughness: 0.95 }),
  )
  tread.name = 'tread'
  wheel.add(tread)
  // Sixteen spokes (eight diameters), thin but many, so it reads as a wheel and
  // its turning shows as a shimmer, not a few sticks. A touch thicker and paler
  // than before, so they stay visible now that the tyre is slimmer and no
  // longer buries them under a wide tread (a live report, 2026-09-22: the
  // spokes had vanished).
  const spokeGeo = new THREE.CylinderGeometry(0.005, 0.005, BIKE_WHEEL_RADIUS * 2, 4)
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(spokeGeo, m.metal)
    spoke.name = 'spoke'
    spoke.rotation.z = (i * Math.PI) / 8
    wheel.add(spoke)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), m.metal)
  hub.rotation.x = Math.PI / 2
  wheel.add(hub)
  return wheel
}

/** A bell's own bright brass, distinct from the frame/spoke metal — it is
 *  a small, separately coloured fitting on a real bike, not another grey part. */
const BELL_COLOR = 0xcaa23a

/** The bar across the bike (along z) with a rubber grip at each end, a hand
 *  brake lever curving forward and down from just inboard of each grip, and
 *  a bell perched on top near the right grip — three details a bare tube
 *  and two grips left out, read as "not quite a real handlebar" (a live
 *  report, 2026-09-22). Centred where the bar is fixed to the stem. */
function buildBikeHandlebar(m: BikeMaterials): THREE.Group {
  const bar = new THREE.Group()
  bar.name = 'handlebar'
  const tubeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.44, 6), m.metal)
  tubeMesh.rotation.x = Math.PI / 2
  bar.add(tubeMesh)
  const gripGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.1, 8)
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(gripGeo, m.rubber)
    grip.rotation.x = Math.PI / 2
    grip.position.z = side * 0.19
    bar.add(grip)

    // A lever just inboard of the grip, reaching forward and down the way a
    // real brake lever does — one straight tube is enough at this size.
    const leverStart = new THREE.Vector3(0.012, 0, side * 0.145)
    const leverEnd = new THREE.Vector3(0.09, -0.05, side * 0.145)
    bar.add(tube(leverStart, leverEnd, 0.006, m.metal))
  }
  const bellMat = new THREE.MeshStandardMaterial({ color: BELL_COLOR, roughness: 0.35, metalness: 0.7 })
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.02, 12), bellMat)
  bell.position.set(0, 0.02, 0.1)
  bar.add(bell)
  const bellButton = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), m.metal)
  bellButton.position.set(0, 0.035, 0.1)
  bar.add(bellButton)
  bar.position.copy(BIKE_STEM_TOP)
  return bar
}

/** The parts that turn with the handlebar: the fork (head tube and blades in
 *  one line, down to the front axle), the front wheel, the stem and the bar.
 *  Built in the bike's own coordinates. */
function buildBikeSteering(m: BikeMaterials): THREE.Group {
  const steering = new THREE.Group()
  steering.name = 'steering'
  steering.add(tube(BIKE_HEAD_TOP, BIKE_FRONT_AXLE, BIKE_FRAME_RADIUS * 0.9, m.frame))
  const wheel = buildBikeWheel(m)
  wheel.position.copy(BIKE_FRONT_AXLE)
  steering.add(wheel)
  steering.add(tube(BIKE_HEAD_TOP, BIKE_STEM_TOP, 0.012, m.metal))
  steering.add(buildBikeHandlebar(m))
  return steering
}

/** A bicycle: two spoked wheels, a diamond frame, a fork, handlebar, saddle
 *  and a chainring, flat primitives only, same as everything else this
 *  project draws — see
 *  docs/superpowers/specs/2026-09-13-quest-items-design.md's own decision
 *  on the bike being a passive stat, never ridden or mounted. */
export function buildBikeModel(): THREE.Group {
  const bike = new THREE.Group()
  bike.name = 'bikeModel'
  const m = bikeMaterials()

  const rearWheel = buildBikeWheel(m)
  rearWheel.position.copy(BIKE_REAR_AXLE)
  bike.add(rearWheel)
  bike.add(buildBikeSteering(m))

  const headBottom = new THREE.Vector3(0.385, 0.66, 0)
  const frameTubes: [THREE.Vector3, THREE.Vector3][] = [
    [BIKE_BOTTOM_BRACKET, BIKE_SEAT_TOP], // seat tube
    [BIKE_SEAT_TOP, BIKE_HEAD_TOP], // top tube
    [BIKE_BOTTOM_BRACKET, headBottom], // down tube
    [BIKE_BOTTOM_BRACKET, BIKE_REAR_AXLE], // chain stay
    [BIKE_SEAT_TOP, BIKE_REAR_AXLE], // seat stay
  ]
  for (const [a, b] of frameTubes) bike.add(tube(a, b, BIKE_FRAME_RADIUS, m.frame))

  // Seat post and saddle.
  const postTop = new THREE.Vector3(-0.22, 0.86, 0)
  bike.add(tube(BIKE_SEAT_TOP, postTop, 0.012, m.metal))
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.09), m.rubber)
  saddle.position.set(-0.19, 0.88, 0)
  bike.add(saddle)

  // Chainring and a crank with its pedal.
  const bb = BIKE_BOTTOM_BRACKET
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14), m.metal)
  chainring.rotation.x = Math.PI / 2
  chainring.position.set(bb.x, bb.y, 0.035)
  bike.add(chainring)
  const crankEnd = new THREE.Vector3(bb.x + 0.06, bb.y - 0.1, 0.06)
  bike.add(tube(new THREE.Vector3(bb.x, bb.y, 0.06), crankEnd, 0.01, m.metal))
  const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.05), m.rubber)
  pedal.position.set(crankEnd.x, crankEnd.y, crankEnd.z + 0.02)
  bike.add(pedal)
  return bike
}

/** What a rider sees of their own bicycle: the bar and grips, the stem, the
 *  fork and the front wheel out ahead, plus the stub of the top tube behind
 *  them. Same parts, same dimensions as `buildBikeModel` (front toward +x),
 *  with the steering assembly on its own pivot: `steer(angle)` turns it about
 *  the fork's own axis, positive toward the rider's left (matching a positive
 *  camera yaw), so the bar and wheel swing together like a real front end. */
export function buildBikeCockpitModel(): {
  group: THREE.Group
  steer: (angle: number) => void
  /** Turns the front wheel about its own axle to `angle` radians. */
  spin: (angle: number) => void
} {
  const m = bikeMaterials()
  const group = new THREE.Group()
  group.name = 'bikeCockpit'

  const pivot = new THREE.Group()
  pivot.name = 'steeringPivot'
  pivot.position.copy(BIKE_HEAD_TOP)
  const steering = buildBikeSteering(m)
  steering.position.copy(BIKE_HEAD_TOP).negate() // its parts are in bike coordinates
  pivot.add(steering)
  group.add(pivot)

  // Reaches past where the view's own tilt and framing crop it, so the tube
  // reads as the rest of the bike continuing behind and below the rider, not
  // as a stub cut off in mid-air (a live report, 2026-09-22) — but only just
  // past it: the same fix's first attempt ran nearly twice this far and put
  // the tube uncomfortably close to the camera, reading as jammed up against
  // the screen (a live report, 2026-09-22, same day: "рама выглядит в упор
  // экрана не хорошо" — this end moves toward the camera as it lengthens,
  // since the model's -x is the view's near side once mounted, see bikeView.ts).
  const topTubeEnd = new THREE.Vector3(BIKE_HEAD_TOP.x - 0.38, BIKE_HEAD_TOP.y - 0.18, 0)
  group.add(tube(BIKE_HEAD_TOP, topTubeEnd, BIKE_FRAME_RADIUS, m.frame))

  // The wheel stands straight in line with the frame, the way a real one does
  // when the bar is centred: it only turns when `steer()` turns the whole front
  // end. Two earlier versions gave it a fixed extra turn about the vertical
  // (0.55, then 0.3 rad) so the rim would open into an ellipse — both read as a
  // wheel permanently cocked to one side (live reports, 2026-09-22 and -23).
  const wheel = steering.getObjectByName('wheel')!

  const axis = BIKE_HEAD_TOP.clone().sub(BIKE_FRONT_AXLE).normalize()
  return {
    group,
    steer: (angle) => {
      pivot.quaternion.setFromAxisAngle(axis, angle)
    },
    spin: (angle) => {
      wheel.rotation.z = angle
    },
  }
}

/** Half the length of the rod lying in the wood. */
export const ROD_PICKUP_HALF_LENGTH = 0.75

/**
 * The fishing rod as it lies out in the wood, waiting to be picked up: flat
 * along x (butt toward -x), centred on its own origin, its underside clear of
 * the ground by more than a trail ribbon's 3 cm. The realistic pole
 * (`buildRodModel`, 1-3 cm thick, standing against the hut's wall) vanished on
 * the ground: buried under a trail, lost in the grass. This one is chunkier, has
 * a pale cork handle and a reel, and rides high enough to be seen from a few
 * metres away — a live report, 2026-09-20: the rod's label showed, the rod did
 * not.
 */
export function buildRodPickupModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'rodPickupModel'
  const AXIS_Y = 0.075 // pole axis height; the butt (radius 0.032) bottoms out at 0.043
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a6634, roughness: 0.7 })
  const corkMat = new THREE.MeshStandardMaterial({ color: 0xe0c07a, roughness: 0.9 })
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.5 })
  const half = ROD_PICKUP_HALF_LENGTH

  // A cylinder built standing up, then laid along x: its own +y becomes +x.
  const along = (radiusTip: number, radiusButt: number, length: number, x: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusTip, radiusButt, length, 10), mat)
    m.rotation.z = -Math.PI / 2 // +y -> +x, so the tip (top) points toward +x
    m.position.set(x, AXIS_Y, 0)
    return m
  }
  // The pole: thin tip at +x, thick butt at -x.
  group.add(along(0.014, 0.03, 1.5, 0, poleMat))
  // A pale cork handle over the butt end.
  const handle = along(0.032, 0.036, 0.3, -half + 0.15, corkMat)
  handle.name = 'handle'
  group.add(handle)
  // The reel, on the side of the pole just past the handle.
  // Raised a little off the pole's axis so its underside (0.04) clears a trail too.
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 14), reelMat)
  reel.name = 'reel'
  reel.rotation.x = Math.PI / 2
  reel.position.set(-half + 0.42, AXIS_Y + 0.012, 0.05)
  group.add(reel)
  return group
}

/**
 * Height and pitch that lay something `2 * halfLength` long, along the world x
 * axis and centred on (x, z), on the real ground: pitched along the slope
 * between the ground under its two ends, and raised over a bump in the middle
 * rather than sunk into it. `y` is the height of the object's centre. A slope
 * across it (along z) does not tilt it — it lies flat across a hillside.
 */
export function layFlatOnGround(
  x: number, z: number, halfLength: number, heightAt: (x: number, z: number) => number,
): { y: number; pitch: number } {
  const back = heightAt(x - halfLength, z)
  const front = heightAt(x + halfLength, z)
  const middle = heightAt(x, z)
  return {
    y: Math.max((back + front) / 2, middle),
    pitch: Math.atan2(front - back, 2 * halfLength),
  }
}
