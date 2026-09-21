import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, randRange } from '../util/rng'
import {
  RAIL_GAUGE, RAIL_HEIGHT, LOCO_LENGTH, WAGON_LENGTH, TRAIN_CARS, CAR_OFFSETS, HEAD_TO_FRONT,
  PORTAL_MOUTH, STATION_OVERHANG, lineLength, pointAt, stationsFor, yawOf,
  type RailLine,
} from './railway'

export interface Train {
  update(dt: number): void
  /** 0 by day, 1 at full night — the locomotive's headlight and every
   *  wagon's windows glow, the same day/night rule the shelter's own
   *  windows and lamp already follow (`world/shelter.ts`'s `setNight`). */
  setNight(t: number): void
  /** While the train stands at a station: which end (0 where the line starts,
   *  1 where it finishes) and where each car is, world x and z; otherwise null. */
  stopped(): { end: 0 | 1; cars: { x: number; z: number }[] } | null
  /** Where the locomotive is, or null while the train is inside a tunnel. */
  locomotive(): { x: number; z: number } | null
  /** Ask a train standing at a platform to be on its way in a few seconds. */
  departSoon(seconds?: number): void
  dispose(): void
}

/** How fast it runs between stops, metres a second, and how briskly it gets
 *  going and stops. */
const CRUISE_SPEED = 6
const ACCEL = 1
const BRAKE = 1
/** How long the train sits at a platform. */
const STATION_DWELL_RANGE: [number, number] = [45, 90]
/** How long it is gone between coming out of one tunnel and the other. */
const AWAY_RANGE: [number, number] = [15, 40]
/** The most a car may lean into a bend, radians, and how many radians for each m/s²
 *  of sideways pull — enough to see, the way a real body rolls on its springs. */
const LEAN_MAX = 0.09
const LEAN_GAIN = 0.075
/** A nose dip under braking, radians per m/s². */
const PITCH_GAIN = 0.02

const CAR_WIDTH = 1.0
const CAR_HEIGHT = 1.05
const WAGON_COLORS = [0x7a4a32, 0x5f6b52, 0x8a3b34, 0x4a5a6b, 0x8a6a2e]

const LOCO_COLOR = 0x2f5a44
const LOCO_ROOF_COLOR = 0x2b2f2c
const STRIPE_COLOR = 0xe3c65c
const IRON_COLOR = 0x1c1e1c
const GLASS_COLOR = 0x9fc4cc
const WINDOW_EMISSIVE = 0xffcf8a

/** Wheels: two axles a car, a wheel on each rail. The body rides
 *  `UNDERFRAME` above the rail head so the wheels have somewhere to be. */
const WHEEL_RADIUS = 0.16
const WHEEL_WIDTH = 0.06
const UNDERFRAME = WHEEL_RADIUS * 2
const AXLE_X = 0.75
const CHASSIS_HEIGHT = 0.09

/** Cylinder with a lighter bar across each face, in vertex colour: a wheel whose
 *  turning shows. One geometry shared by every wheel of the train. */
function makeWheelGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14)
  disc.rotateX(Math.PI / 2)
  const parts: [THREE.BufferGeometry, number][] = [[disc, 0x24262a]]
  for (const zs of [-1, 1]) {
    const bar = new THREE.BoxGeometry(WHEEL_RADIUS * 1.5, 0.045, 0.012)
    bar.translate(0, 0, zs * (WHEEL_WIDTH / 2 + 0.004))
    parts.push([bar, 0x9a948a])
  }
  const painted = parts.map(([g, hex]) => {
    const out = g.toNonIndexed()
    const c = new THREE.Color(hex)
    const n = out.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) { arr[k * 3] = c.r; arr[k * 3 + 1] = c.g; arr[k * 3 + 2] = c.b }
    out.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return out
  })
  return mergeGeometries(painted, false)
}

const wheelGeo = makeWheelGeometry()

interface Gear {
  wheels: THREE.Mesh[]
}

/** The running gear every car shares: an underframe slab with buffers at both
 *  ends, and four wheels — in the car's own local space (y = 0 is the floor). */
function addRunningGear(group: THREE.Group, length: number): Gear {
  const ironMat = new THREE.MeshStandardMaterial({ color: IRON_COLOR, roughness: 0.6, metalness: 0.5 })
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, CHASSIS_HEIGHT, CAR_WIDTH * 0.72), ironMat)
  chassis.name = 'chassis'
  chassis.position.y = -CHASSIS_HEIGHT / 2
  group.add(chassis)
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 })
  const wheels: THREE.Mesh[] = []
  for (const ax of [-1, 1]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.name = 'wheel'
      wheel.position.set(ax * AXLE_X, WHEEL_RADIUS - UNDERFRAME, (side * RAIL_GAUGE) / 2)
      group.add(wheel)
      wheels.push(wheel)
    }
  }
  // Buffers and a coupling hook at each end.
  const bufferGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8)
  bufferGeo.rotateZ(Math.PI / 2)
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(bufferGeo, ironMat)
      b.name = 'buffer'
      b.position.set(end * (length / 2 + 0.03), 0.2, side * 0.32)
      group.add(b)
    }
  }
  return { wheels }
}

/** A closed side profile (x along the car, y up) extruded across its width, centred on z. */
function extrudeProfile(points: [number, number][], width: number, bevel = 0.035): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  })
  geo.translate(0, 0, -(width - bevel * 2) / 2)
  return geo
}

/**
 * A loco built for a narrow-gauge logging line: a low bonnet in front, a tall
 * cab behind with a windscreen and a window each side, a bumper beam with
 * buffers, a radiator grille, handrails, a yellow stripe along the flank, an
 * exhaust stack that puffs drifting sprite smoke (the same recipe
 * `world/shelter.ts`'s chimney uses) and a real headlight (`THREE.SpotLight`,
 * off by day) aimed along local +x.
 */
function buildLocomotive(): {
  group: THREE.Group
  gear: Gear
  windowMat: THREE.MeshStandardMaterial
  setNight: (t: number) => void
  updateSmoke: (elapsed: number) => void
} {
  const group = new THREE.Group()
  group.name = 'locomotive'
  const gear = addRunningGear(group, LOCO_LENGTH)

  const bodyMat = new THREE.MeshStandardMaterial({ color: LOCO_COLOR, flatShading: true, roughness: 0.7 })
  const roofMat = new THREE.MeshStandardMaterial({ color: LOCO_ROOF_COLOR, flatShading: true, roughness: 0.8 })
  const ironMat = new THREE.MeshStandardMaterial({ color: IRON_COLOR, roughness: 0.6, metalness: 0.5 })
  const stripeMat = new THREE.MeshStandardMaterial({ color: STRIPE_COLOR, roughness: 0.7 })

  // The cab: rear 55 percent, its front edge sloped back at the top.
  const cabFront = 0.05
  const cab = new THREE.Mesh(
    extrudeProfile([[-1.35, 0], [cabFront + 0.2, 0], [cabFront + 0.2, 1.5], [cabFront + 0.02, 1.78], [-1.2, 1.78], [-1.35, 1.62]], CAR_WIDTH),
    bodyMat,
  )
  cab.name = 'cab'
  group.add(cab)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, CAR_WIDTH + 0.14), roofMat)
  roof.name = 'roof'
  roof.position.set(-0.6, 1.8, 0)
  group.add(roof)

  // The bonnet: narrower than the cab, its nose sloped.
  const bonnet = new THREE.Mesh(
    extrudeProfile([[cabFront + 0.2, 0], [1.28, 0], [1.35, 0.14], [1.35, 0.78], [1.18, 0.98], [cabFront + 0.2, 0.98]], CAR_WIDTH * 0.8),
    bodyMat,
  )
  bonnet.name = 'bonnet'
  group.add(bonnet)
  // A yellow stripe along the bonnet's flank.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.01), stripeMat)
    stripe.position.set(0.72, 0.5, side * (CAR_WIDTH * 0.4 + 0.008))
    group.add(stripe)
  }

  // Bumper beam across the nose (hazard yellow) and the buffers on it.
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, CAR_WIDTH + 0.1), stripeMat)
  bumper.name = 'bumper'
  bumper.position.set(1.4, 0.2, 0)
  group.add(bumper)
  const stub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.3), ironMat)
  stub.name = 'coupler'
  stub.position.set(1.5, 0.2, 0)
  group.add(stub)
  // The grille, and the headlight above it.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.5), ironMat)
  grille.name = 'grille'
  grille.position.set(1.365, 0.48, 0)
  group.add(grille)

  // Handrails along the bonnet.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6), ironMat)
    rail.rotation.z = Math.PI / 2
    rail.position.set(0.72, 1.08, side * (CAR_WIDTH * 0.4 + 0.06))
    rail.name = 'handrail'
    group.add(rail)
  }

  // Glass: a windscreen, two side windows and a rear window; the cab is one lit box at night.
  const windowMat = new THREE.MeshStandardMaterial({
    color: GLASS_COLOR, roughness: 0.15, metalness: 0.2, emissive: WINDOW_EMISSIVE, emissiveIntensity: 0, side: THREE.DoubleSide,
  })
  const addGlass = (w: number, h: number, x: number, y: number, z: number, rotY: number): void => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), windowMat)
    g.name = 'window'
    g.position.set(x, y, z)
    g.rotation.y = rotY
    group.add(g)
  }
  const sideZ = CAR_WIDTH / 2 + 0.008
  for (const side of [-1, 1]) {
    addGlass(0.5, 0.5, -0.95, 1.2, side * sideZ, side > 0 ? 0 : Math.PI)
    addGlass(0.5, 0.5, -0.32, 1.2, side * sideZ, side > 0 ? 0 : Math.PI)
  }
  addGlass(0.75, 0.5, cabFront + 0.2 + 0.035 + 0.006, 1.22, 0, Math.PI / 2) // windscreen
  addGlass(0.6, 0.45, -1.35 - 0.035 - 0.006, 1.2, 0, -Math.PI / 2) // rear window
  // Window frames: dark bars between the panes, so they read as glass in a body.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.012), roofMat)
  for (const side of [-1, 1]) {
    for (const x of [-1.22, -0.64, -0.08]) {
      const f = frame.clone()
      f.position.set(x, 1.2, side * (sideZ - 0.002))
      group.add(f)
    }
  }

  const stackMat = new THREE.MeshStandardMaterial({ color: IRON_COLOR, roughness: 0.9 })
  const stackLocal = new THREE.Vector3(0.95, 1.0 + 0.16, 0)
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.32, 8), stackMat)
  stack.name = 'stack'
  stack.position.copy(stackLocal)
  group.add(stack)

  const smokeMat = new THREE.SpriteMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0, depthWrite: false })
  const smoke: THREE.Sprite[] = []
  for (let i = 0; i < 4; i++) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    sprite.userData.phase = i / 4
    sprite.scale.setScalar(0.001)
    group.add(sprite)
    smoke.push(sprite)
  }
  const updateSmoke = (elapsed: number): void => {
    for (const sprite of smoke) {
      const t = (elapsed * 0.5 + sprite.userData.phase) % 1
      sprite.position.set(
        stackLocal.x + Math.sin(t * Math.PI * 2 + sprite.userData.phase * 6) * 0.05,
        stackLocal.y + 0.16 + t * 0.9,
        stackLocal.z + Math.cos(t * Math.PI * 2 + sprite.userData.phase * 4) * 0.05,
      )
      sprite.scale.setScalar(0.1 + t * 0.3)
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - t)
    }
  }

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8, roughness: 0.3, emissive: 0xffcf8a, emissiveIntensity: 0,
  })
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), ironMat)
  housing.rotation.z = Math.PI / 2
  housing.position.set(1.33, 0.85, 0)
  group.add(housing)
  const headlightGlow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), headlightMat)
  headlightGlow.name = 'headlightGlow'
  headlightGlow.position.set(1.375, 0.85, 0)
  headlightGlow.rotation.y = Math.PI / 2
  group.add(headlightGlow)
  const headlight = new THREE.SpotLight(0xfff2cc, 500, 25, 0.3, 0.4, 2)
  headlight.position.set(LOCO_LENGTH / 2, 0.85, 0)
  const headlightTarget = new THREE.Object3D()
  headlightTarget.position.set(LOCO_LENGTH / 2 + 5, 0.85, 0)
  group.add(headlight, headlightTarget)
  headlight.target = headlightTarget
  headlight.visible = false

  const setNight = (t: number): void => {
    headlightMat.emissiveIntensity = t * 2.2
    headlight.visible = t > 0.02
    headlight.intensity = 500 * t
  }

  return { group, gear, windowMat, setNight, updateSmoke }
}

type WagonKind = 'coach' | 'boxcar' | 'logs'

/** Wagons, in the order they are coupled behind the locomotive. */
const WAGON_KINDS: WagonKind[] = ['coach', 'boxcar', 'logs', 'coach', 'coach']

/** An arched cross-section (across the car, y up) extruded the car's length. */
function archedBody(width: number, wallHeight: number, crown: number, length: number): THREE.BufferGeometry {
  const w = width / 2
  const shape = new THREE.Shape()
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(w, wallHeight)
  shape.quadraticCurveTo(w, crown, 0, crown)
  shape.quadraticCurveTo(-w, crown, -w, wallHeight)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 6 })
  geo.translate(0, 0, -length / 2)
  geo.rotateY(Math.PI / 2) // its length onto x
  return geo
}

/** One wagon: a coach with a row of windows and an arched roof, a boxcar with a
 *  sliding door, or a flatcar loaded with logs. */
function buildWagon(kind: WagonKind, color: number): {
  group: THREE.Group
  gear: Gear
  windowMat: THREE.MeshStandardMaterial | null
} {
  const group = new THREE.Group()
  group.name = 'wagon'
  group.userData.kind = kind
  const gear = addRunningGear(group, WAGON_LENGTH)
  const bodyMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75 })
  const darkMat = new THREE.MeshStandardMaterial({ color: LOCO_ROOF_COLOR, flatShading: true, roughness: 0.85 })
  let windowMat: THREE.MeshStandardMaterial | null = null

  if (kind === 'logs') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(WAGON_LENGTH, 0.1, CAR_WIDTH), darkMat)
    bed.name = 'body'
    bed.position.y = 0.05
    group.add(bed)
    // Stakes at the four corners, and a stack of logs held between them.
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), darkMat)
        stake.position.set(x * (WAGON_LENGTH / 2 - 0.08), 0.45, z * (CAR_WIDTH / 2 - 0.04))
        group.add(stake)
      }
    }
    const logMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1, flatShading: true })
    const logGeo = new THREE.CylinderGeometry(0.11, 0.11, WAGON_LENGTH - 0.24, 8)
    logGeo.rotateZ(Math.PI / 2)
    const rows: [number, number][] = [[-0.3, 0.2], [0, 0.2], [0.3, 0.2], [-0.15, 0.41], [0.15, 0.41], [0, 0.62]]
    for (const [z, y] of rows) {
      const log = new THREE.Mesh(logGeo, logMat)
      log.name = 'log'
      log.position.set(0, y + 0.1, z)
      group.add(log)
    }
    return { group, gear, windowMat }
  }

  const body = new THREE.Mesh(archedBody(CAR_WIDTH, CAR_HEIGHT * 0.86, CAR_HEIGHT * 1.14, WAGON_LENGTH), bodyMat)
  body.name = 'body'
  group.add(body)
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(WAGON_LENGTH * 0.9, 0.03, 0.4), darkMat)
  roofCap.position.y = CAR_HEIGHT * 1.14 + 0.005
  group.add(roofCap)

  if (kind === 'coach') {
    windowMat = new THREE.MeshStandardMaterial({
      color: GLASS_COLOR, roughness: 0.3, emissive: WINDOW_EMISSIVE, emissiveIntensity: 0, side: THREE.DoubleSide,
    })
    const windowGeo = new THREE.PlaneGeometry(0.34, 0.36)
    const frameGeo = new THREE.BoxGeometry(0.4, 0.42, 0.006)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.6
        const frame = new THREE.Mesh(frameGeo, darkMat)
        frame.position.set(x, CAR_HEIGHT * 0.58, side * (CAR_WIDTH / 2 + 0.002))
        group.add(frame)
        const win = new THREE.Mesh(windowGeo, windowMat)
        win.name = 'window'
        win.position.set(x, CAR_HEIGHT * 0.58, side * (CAR_WIDTH / 2 + 0.006))
        win.rotation.y = side > 0 ? 0 : Math.PI
        group.add(win)
      }
    }
    // A door on the end, its step below.
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.6), darkMat)
    step.position.set(-WAGON_LENGTH / 2 - 0.05, 0.05, 0)
    group.add(step)
  } else {
    // Boxcar: a sliding door with a rail above it, planks marked by dark lines.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, CAR_HEIGHT * 0.7, 0.03), darkMat)
      door.name = 'door'
      door.position.set(0.1, CAR_HEIGHT * 0.42, side * (CAR_WIDTH / 2 + 0.012))
      group.add(door)
      const track = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.05), darkMat)
      track.position.set(0.3, CAR_HEIGHT * 0.8, side * (CAR_WIDTH / 2 + 0.03))
      group.add(track)
    }
  }
  return { group, gear, windowMat }
}

/** One stop in the run: the platform of one end, the direction of travel it is reached in,
 *  and where the locomotive's centre halts. */
interface Stop {
  head: number
  end: 0 | 1
}

/**
 * A train that runs the length of `line` and back, through two tunnels: it comes
 * out of one, halts at the platform, runs on to the other platform, halts, and
 * goes into the far tunnel and out of sight for a while — then comes back the same
 * way. It leaves the tunnel and brakes for the platform rather than jumping to
 * speed, its cars follow the bends and the slope on their two axles each, and lean
 * out of a curve. The locomotive always leads.
 */
export function createTrain(scene: THREE.Scene, line: RailLine, seed: number): Train {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'train'

  const loco = buildLocomotive()
  group.add(loco.group)
  const cars: THREE.Object3D[] = [loco.group]
  const gears: Gear[] = [loco.gear]
  const windowMats: THREE.MeshStandardMaterial[] = [loco.windowMat]
  const colorStart = Math.floor(rng() * WAGON_COLORS.length)
  for (let i = 1; i < TRAIN_CARS; i++) {
    const wagon = buildWagon(WAGON_KINDS[(i - 1) % WAGON_KINDS.length], WAGON_COLORS[(colorStart + i - 1) % WAGON_COLORS.length])
    group.add(wagon.group)
    cars.push(wagon.group)
    gears.push(wagon.gear)
    if (wagon.windowMat) windowMats.push(wagon.windowMat)
  }
  scene.add(group)

  const length = lineLength(line)
  const stations = stationsFor(line)
  // Head positions where the train halts: in each direction, the nose stops
  // `STATION_OVERHANG` short of the platform's far end.
  const stops: Record<'1' | '-1', Stop[]> = {
    '1': stations.map((st) => ({ head: st.s1 - STATION_OVERHANG - HEAD_TO_FRONT, end: st.end })),
    '-1': [...stations].reverse().map((st) => ({ head: st.s0 + STATION_OVERHANG + HEAD_TO_FRONT, end: st.end })),
  }
  // Where a train inside a tunnel is out of sight, and where it comes out.
  const mouthA = PORTAL_MOUTH
  const mouthB = length - PORTAL_MOUTH
  const hidden = (s: number, halfLen: number): boolean => s < mouthA - halfLen - 0.7 || s > mouthB + halfLen + 0.7

  let dir: 1 | -1 = rng() < 0.5 ? 1 : -1
  let head = 0
  let speed = 0
  let stopIndex = 0
  let phase: 'run' | 'dwell' | 'away' = 'run'
  let dwell = 0
  let away = 0
  let stopEnd: 0 | 1 | null = null
  let accel = 0
  let elapsed = 0
  const rolls = cars.map(() => 0)

  function enter(): void {
    stopIndex = 0
    speed = 0
    phase = 'run'
    head = dir > 0 ? mouthA - 0.7 - HEAD_TO_FRONT : mouthB + 0.7 + HEAD_TO_FRONT
  }
  enter()

  function step(dt: number): void {
    if (phase === 'dwell') {
      dwell -= dt
      accel = 0
      if (dwell <= 0) {
        phase = 'run'
        stopEnd = null
        stopIndex++
      }
      return
    }
    if (phase === 'away') {
      away -= dt
      accel = 0
      if (away <= 0) {
        dir = dir > 0 ? -1 : 1
        enter()
      }
      return
    }
    const list = stops[dir > 0 ? '1' : '-1']
    const before = speed
    const next = stopIndex < list.length ? list[stopIndex] : null
    if (next) {
      const remaining = (next.head - head) * dir
      if (remaining <= 0.04) {
        head = next.head
        speed = 0
        accel = 0
        phase = 'dwell'
        dwell = randRange(rng, STATION_DWELL_RANGE)
        stopEnd = next.end
        return
      }
      const limit = Math.sqrt(2 * BRAKE * remaining)
      speed = Math.min(speed + ACCEL * dt, CRUISE_SPEED, limit)
      speed = Math.max(speed, Math.min(0.4, limit))
    } else {
      speed = Math.min(speed + ACCEL * dt, CRUISE_SPEED)
    }
    head += dir * speed * dt
    accel = dt > 0 ? (speed - before) / dt : 0
    if (!next) {
      // Past the last platform: on into the far tunnel until the whole train is inside.
      const tail = head - dir * (HEAD_TO_FRONT + (CAR_OFFSETS[TRAIN_CARS - 1] + WAGON_LENGTH / 2))
      if (dir > 0 ? tail > mouthB + 0.7 : tail < mouthA - 0.7) {
        phase = 'away'
        away = randRange(rng, AWAY_RANGE)
        speed = 0
      }
    }
  }

  let locoVisible = true
  function pose(dt: number): void {
    const travelled = speed * dt
    for (let i = 0; i < cars.length; i++) {
      const halfLen = (i === 0 ? LOCO_LENGTH : WAGON_LENGTH) / 2
      const s = head - dir * CAR_OFFSETS[i]
      const car = cars[i]
      const isHidden = phase === 'away' || hidden(s, halfLen)
      car.visible = !isHidden
      if (i === 0) locoVisible = !isHidden
      if (isHidden) continue
      const front = pointAt(line, s + dir * AXLE_X)
      const rear = pointAt(line, s - dir * AXLE_X)
      const dx = front.x - rear.x
      const dz = front.z - rear.z
      const flat = Math.hypot(dx, dz) || 1
      const yaw = yawOf(dx / flat, dz / flat)
      const pitch = Math.atan2(front.y - rear.y, flat)
      // Sideways pull from the bend, taken from how far the track turns between the two axles.
      const turn = (() => {
        let d = yawOf(dir * front.tx, dir * front.tz) - yawOf(dir * rear.tx, dir * rear.tz)
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        return d / (2 * AXLE_X)
      })()
      const target = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, speed * speed * turn * LEAN_GAIN))
      rolls[i] += (target - rolls[i]) * Math.min(1, dt / 0.5)
      car.position.set((front.x + rear.x) / 2, (front.y + rear.y) / 2 + RAIL_HEIGHT + UNDERFRAME, (front.z + rear.z) / 2)
      // The train's forward is the direction of travel; the car's own +x follows it.
      car.rotation.set(rolls[i], yaw, pitch + accel * PITCH_GAIN, 'YZX') // roll about x, yaw about y, pitch about z
      for (const w of gears[i].wheels) w.rotation.z -= travelled / WHEEL_RADIUS
    }
  }

  // Start somewhere in its day rather than always at the tunnel: run it ahead a while.
  const warm = rng() * 240
  for (let t = 0; t < warm; t += 0.5) step(0.5)
  pose(0)

  return {
    update(dt) {
      step(dt)
      elapsed += dt
      pose(dt)
      loco.updateSmoke(elapsed)
    },
    stopped() {
      if (phase !== 'dwell' || stopEnd === null) return null
      return { end: stopEnd, cars: cars.map((c) => ({ x: c.position.x, z: c.position.z })) }
    },
    locomotive() {
      return locoVisible ? { x: cars[0].position.x, z: cars[0].position.z } : null
    },
    departSoon(seconds = 4) {
      if (phase === 'dwell') dwell = Math.min(dwell, seconds)
    },
    setNight(nt) {
      loco.setNight(nt)
      for (const mat of windowMats) mat.emissiveIntensity = nt * 2.2
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          if (!Array.isArray(o.material)) o.material.dispose()
        }
        if (o instanceof THREE.Sprite) o.material.dispose()
      })
    },
  }
}
