import type { ElevationProvider } from '../terrain/provider'
import type { Tree } from '../world/trees'

/**
 * The quadcopter's flight, pure: no scene, no DOM, no clock — the same shape as
 * `game/player.ts`'s `stepPlayer`. `main.ts` feeds it the pilot's input every
 * frame and puts the camera where it says.
 *
 * Arcade, not a simulation: the sticks set a target velocity, the drone eases
 * toward it. Range from the pilot, a battery and a ceiling above the ground keep
 * it a scouting tool for the wood, not a way out of it.
 */
export const DRONE = {
  /** Top horizontal speed, m/s. */
  maxSpeed: 9,
  /** Top vertical speed, m/s. */
  maxClimb: 5,
  /** How quickly velocity follows the sticks, per second (an exponential ease). */
  accel: 3.5,
  /** Highest it may fly above the ground directly beneath it, metres. */
  maxHeight: 40,
  /** Lowest it may fly above that ground. */
  minClearance: 0.5,
  /** The radio's reach from the pilot, metres: it cannot be flown further. */
  range: 150,
  /** Beyond this the signal starts to fade. */
  weakSignalFrom: 100,
  /** Seconds of flight a full battery gives. */
  batterySeconds: 120,
  /** Its own size, for bumping into trunks. */
  radius: 0.35,
  minPitch: -1.3,
  maxPitch: 0.5,
  /** How high it climbs, above the ground beneath it, to fly home over the trees. */
  cruiseHeight: 32,
  /** How close to the pilot, horizontally, it counts as home. */
  homeRadius: 1.5,
  /** How high above the pilot's ground it hovers when it arrives. */
  hoverHeight: 1.6,
}

export interface DroneState {
  x: number
  y: number
  z: number
  /** Turn about the vertical, radians — the same convention as the player's
   *  `yaw`: 0 looks down -z. */
  yaw: number
  /** Camera tilt, radians, positive looks up. */
  pitch: number
  /** A cosmetic lean into a sideways move. */
  roll: number
  vx: number
  vy: number
  vz: number
  /** 1 full, 0 empty. */
  battery: number
  /** Flying itself home: asked for, or the battery ran out. */
  returning: boolean
  /** Back with the pilot: the flight is over. */
  landed: boolean
  /** Radio signal, 1 near the pilot down to 0 at the edge of the range. */
  signal: number
}

export interface DroneInput {
  /** -1..1, forward positive. */
  forward: number
  /** -1..1, right positive. */
  strafe: number
  /** -1..1, up positive. */
  lift: number
  dYaw: number
  dPitch: number
  /** Asks it to fly home. */
  returnHome: boolean
}

/** A vertical cylinder the drone cannot fly through, from `y0` to `y1`. */
export interface DroneObstacle {
  x: number
  z: number
  radius: number
  y0: number
  y1: number
}

export interface DroneEnv {
  ground: ElevationProvider
  obstacles: DroneObstacle[]
  /** Where the pilot stands: the range is measured from here, and it flies home to here. */
  pilot: { x: number; z: number }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export function launchDrone(
  pilot: { x: number; z: number; yaw: number },
  ground: ElevationProvider,
  battery: number,
): DroneState {
  return {
    x: pilot.x,
    y: ground.heightAt(pilot.x, pilot.z) + DRONE.hoverHeight,
    z: pilot.z,
    yaw: pilot.yaw,
    pitch: 0,
    roll: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    battery,
    returning: false,
    landed: false,
    signal: 1,
  }
}

/** A solid trunk for each tree, from the ground nearly to the top. The crowns are
 *  NOT solid: they overlap in this wood, and a drone at crown height wedged
 *  between them with the keys doing nothing (43 of 120 random spots). Foliage
 *  is soft; a drone flies through it, and bumps into what it would really hit. */
export function treeObstacles(trees: Tree[]): DroneObstacle[] {
  return trees.map((t) => ({ x: t.x, z: t.z, radius: t.radius, y0: t.y, y1: t.y + t.height * 0.9 }))
}

/** One frame of flight. Returns `s` itself once landed. */
export function stepDrone(s: DroneState, input: DroneInput, env: DroneEnv, dt: number): DroneState {
  if (s.landed) return s

  const yaw = s.yaw + input.dYaw
  const pitch = clamp(s.pitch + input.dPitch, DRONE.minPitch, DRONE.maxPitch)
  const battery = Math.max(0, s.battery - dt / DRONE.batterySeconds)
  const returning = s.returning || input.returnHome || battery <= 0

  const groundHere = env.ground.heightAt(s.x, s.z)
  let targetVx = 0
  let targetVz = 0
  let targetVy = 0

  if (returning) {
    // Up over the trees first, then across, then down onto the pilot.
    const dx = env.pilot.x - s.x
    const dz = env.pilot.z - s.z
    const d = Math.hypot(dx, dz)
    const pilotGround = env.ground.heightAt(env.pilot.x, env.pilot.z)
    const far = d > 12
    const goalY = far
      ? groundHere + Math.min(DRONE.cruiseHeight, DRONE.maxHeight - 1)
      : pilotGround + DRONE.hoverHeight
    targetVy = clamp((goalY - s.y) * 1.2, -DRONE.maxClimb, DRONE.maxClimb)
    // Only sets off once it is well above the tree line.
    const high = far ? clamp((s.y - groundHere - 12) / 10, 0, 1) : 1
    const speed = Math.min(DRONE.maxSpeed * 0.9, d * 1.2) * high
    if (d > 1e-6) {
      targetVx = (dx / d) * speed
      targetVz = (dz / d) * speed
    }
  } else {
    let fwd = input.forward
    let side = input.strafe
    const len = Math.hypot(fwd, side)
    if (len > 1) {
      fwd /= len
      side /= len
    }
    // Forward is where it looks: yaw 0 looks down -z (see PlayerState.yaw).
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    targetVx = (-sin * fwd + cos * side) * DRONE.maxSpeed
    targetVz = (-cos * fwd - sin * side) * DRONE.maxSpeed
    targetVy = clamp(input.lift, -1, 1) * DRONE.maxClimb
  }

  const ease = 1 - Math.exp(-DRONE.accel * dt)
  let vx = s.vx + (targetVx - s.vx) * ease
  let vy = s.vy + (targetVy - s.vy) * ease
  let vz = s.vz + (targetVz - s.vz) * ease

  let x = s.x + vx * dt
  let y = s.y + vy * dt
  let z = s.z + vz * dt

  // Trunks and crowns: pushed out sideways, sliding along them, never through.
  const reach = DRONE.radius
  for (const o of env.obstacles) {
    if (y < o.y0 - reach || y > o.y1 + reach) continue
    const ox = x - o.x
    const oz = z - o.z
    const min = o.radius + reach
    if (Math.abs(ox) >= min || Math.abs(oz) >= min) continue
    const dist = Math.hypot(ox, oz)
    if (dist >= min) continue
    const nx = dist > 1e-9 ? ox / dist : 1
    const nz = dist > 1e-9 ? oz / dist : 0
    x = o.x + nx * min
    z = o.z + nz * min
    const into = vx * nx + vz * nz
    if (into < 0) {
      vx -= into * nx
      vz -= into * nz
    }
  }

  // The ground below (it may have risen under it) and the ceiling above it.
  const groundNow = env.ground.heightAt(x, z)
  if (y < groundNow + DRONE.minClearance) {
    y = groundNow + DRONE.minClearance
    if (vy < 0) vy = 0
  }
  if (y > groundNow + DRONE.maxHeight) {
    y = groundNow + DRONE.maxHeight
    if (vy > 0) vy = 0
  }

  // The radio: no further than its range from the pilot.
  const rx = x - env.pilot.x
  const rz = z - env.pilot.z
  const rd = Math.hypot(rx, rz)
  if (rd > DRONE.range) {
    const k = DRONE.range / rd
    x = env.pilot.x + rx * k
    z = env.pilot.z + rz * k
    const out = (vx * rx + vz * rz) / rd
    if (out > 0) {
      vx -= (out * rx) / rd
      vz -= (out * rz) / rd
    }
  }
  const dist = Math.min(rd, DRONE.range)
  const signal = clamp(1 - (dist - DRONE.weakSignalFrom) / (DRONE.range - DRONE.weakSignalFrom), 0, 1)

  // A lean into a sideways move: cosmetic, the camera's roll.
  const lateral = vx * Math.cos(yaw) - vz * Math.sin(yaw)
  const targetRoll = clamp(-lateral / DRONE.maxSpeed, -1, 1) * 0.3
  const roll = s.roll + (targetRoll - s.roll) * (1 - Math.exp(-6 * dt))

  // Home: over the pilot and low.
  const pilotGround = env.ground.heightAt(env.pilot.x, env.pilot.z)
  const landed =
    returning &&
    Math.hypot(x - env.pilot.x, z - env.pilot.z) < DRONE.homeRadius &&
    y - pilotGround < DRONE.hoverHeight + 0.8

  return { x, y, z, yaw, pitch, roll, vx, vy, vz, battery, returning, landed, signal }
}

/** What the pilot reads off the screen. */
export interface DroneReadout {
  /** Height above the ground beneath it, metres. */
  altitude: number
  /** Distance from the pilot, metres. */
  distance: number
  /** Ground speed, m/s. */
  speed: number
  /** 0..100. */
  batteryPercent: number
  /** 0..100. */
  signalPercent: number
  /** Which way home lies relative to where the camera looks, radians: 0
   *  straight ahead, positive to the right, ±π behind. */
  homeAngle: number
}

export function droneReadout(s: DroneState, env: DroneEnv): DroneReadout {
  // Forward at yaw θ is (-sin θ, -cos θ) and right is (cos θ, -sin θ).
  const dx = env.pilot.x - s.x
  const dz = env.pilot.z - s.z
  const ahead = -Math.sin(s.yaw) * dx - Math.cos(s.yaw) * dz
  const right = Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz
  return {
    altitude: Math.max(0, s.y - env.ground.heightAt(s.x, s.z)),
    distance: Math.hypot(s.x - env.pilot.x, s.z - env.pilot.z),
    speed: Math.hypot(s.vx, s.vz),
    batteryPercent: Math.round(clamp(s.battery, 0, 1) * 100),
    signalPercent: Math.round(clamp(s.signal, 0, 1) * 100),
    homeAngle: Math.atan2(right, ahead),
  }
}
