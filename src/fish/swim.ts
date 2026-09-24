import { mulberry32 } from '../util/rng'

/** The furthest any fish wanders from where it was placed, metres — far
 *  enough to read as swimming, near enough that a school stays a school and
 *  a fish in the shallows stays within reach of the bank. */
export const SWIM_MAX_ROAM = 1.4

export interface SwimHome {
  x: number
  z: number
  /** How far from (x, z) this fish may swim, metres — all of it water
   *  (`world/fishSpawn.ts` measures it). */
  roam: number
  seed: number
}

export interface SwimPose {
  x: number
  z: number
  /** Rotation about +y for the fish's group: its head is local −x. */
  heading: number
}

/**
 * Where a fish is at time `t` (seconds): pure, deterministic, and never
 * outside its `roam` circle.
 *
 * Each fish loops an ellipse of its own around its home — its size, tilt,
 * direction and speed from its seed — and its pace breathes: it glides,
 * slows almost to a hover, and picks up again, the way a fish in the
 * shallows actually moves, not a clockwork circle. It swims head first,
 * its body swinging a little from side to side with the tail beat, more
 * when it is moving fast than when it idles.
 */
export function swimPose(home: SwimHome, t: number): SwimPose {
  const rng = mulberry32((home.seed ^ 0x5a1f) >>> 0)
  const a = home.roam * (0.6 + rng() * 0.4)
  const b = home.roam * (0.35 + rng() * 0.45)
  const tilt = rng() * Math.PI * 2
  const dir = rng() < 0.5 ? 1 : -1
  const phase0 = rng() * Math.PI * 2
  const speed = 0.12 + rng() * 0.18
  const beatPhase = rng() * Math.PI * 2
  const pace = 0.25 + rng() * 0.3
  const pacePhase = rng() * Math.PI * 2
  const surge = 0.5 + rng() * 0.45

  if (a < 1e-3) {
    // No room: it holds its place, slowly turning.
    return { x: home.x, z: home.z, heading: phase0 + 0.35 * Math.sin(0.2 * t + pacePhase) }
  }
  const omega = speed / ((a + b) / 2)
  // The pulse in the pace: its angular rate never quite falls to zero, so the
  // fish always has a direction to face.
  const k = (surge * 0.85 * omega) / pace
  const phi = phase0 + dir * (omega * t + k * Math.sin(pace * t + pacePhase))
  const rate = dir * (omega + k * pace * Math.cos(pace * t + pacePhase))

  const lx = a * Math.cos(phi)
  const lz = b * Math.sin(phi)
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  const vlx = -a * Math.sin(phi) * rate
  const vlz = b * Math.cos(phi) * rate
  const vx = vlx * c - vlz * s
  const vz = vlx * s + vlz * c

  // THREE turns local −x (the head) to (−cos h, 0, sin h): face (vx, vz).
  const beat = 0.14 * Math.min(1, Math.abs(rate) / omega) * Math.sin(t * 9 + beatPhase)
  return {
    x: home.x + lx * c - lz * s,
    z: home.z + lx * s + lz * c,
    heading: Math.atan2(vz, -vx) + beat,
  }
}
