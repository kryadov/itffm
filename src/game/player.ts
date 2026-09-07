import type { ElevationProvider } from '../terrain/provider'

export interface PlayerState {
  x: number
  z: number
  /** Turn around the vertical, radians. */
  yaw: number
  /** Look up and down, radians, clamped to ±π/2. */
  pitch: number
  /** 0 standing, 1 fully crouched. */
  crouch: number
}

export interface PlayerInput {
  /** -1..1, forward positive. */
  forward: number
  /** -1..1, right positive. */
  strafe: number
  dYaw: number
  dPitch: number
  crouching: boolean
  dt: number
}

export interface Obstacle {
  x: number
  z: number
  radius: number
}

const WALK_SPEED = 2.4
const CROUCH_SPEED = 1.1
const STAND_EYE = 1.65
const CROUCH_EYE = 0.75
const CROUCH_RATE = 6
const PLAYER_RADIUS = 0.3
const MAX_PITCH = Math.PI / 2

/** Eye height above the ground, accounting for the crouch. */
export function eyeHeight(s: PlayerState): number {
  return STAND_EYE + (CROUCH_EYE - STAND_EYE) * s.crouch
}

/**
 * One simulation step for the player: a new state from the old one. Pure, so
 * the movement maths is testable without a browser.
 *
 * Collisions push the player out along the radius rather than stopping them
 * dead — walking into a trunk and sticking there spoils a quiet walk more than
 * sliding past it ever could.
 */
export function stepPlayer(
  s: PlayerState,
  i: PlayerInput,
  ground: ElevationProvider,
  obstacles: Obstacle[],
): PlayerState {
  const yaw = s.yaw + i.dYaw
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch + i.dPitch))

  const target = i.crouching ? 1 : 0
  const crouch =
    s.crouch + Math.sign(target - s.crouch) * Math.min(Math.abs(target - s.crouch), CROUCH_RATE * i.dt)

  // Normalise the input, or moving diagonally would be 1.41 times faster.
  let fx = i.forward
  let sx = i.strafe
  const len = Math.hypot(fx, sx)
  if (len > 1) {
    fx /= len
    sx /= len
  }

  // Speed follows the posture the player held during this step, not the one
  // they end it in: reading the new crouch let someone straightening up jump to
  // full speed within the same frame.
  const speed = (WALK_SPEED + (CROUCH_SPEED - WALK_SPEED) * s.crouch) * i.dt
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  let x = s.x + (-sin * fx + cos * sx) * speed
  let z = s.z + (-cos * fx - sin * sx) * speed

  for (const o of obstacles) {
    const dx = x - o.x
    const dz = z - o.z
    const d = Math.hypot(dx, dz)
    const min = o.radius + PLAYER_RADIUS
    if (d < min && d > 1e-6) {
      x = o.x + (dx / d) * min
      z = o.z + (dz / d) * min
    }
  }

  // Read the ground here so callers cannot forget to.
  ground.heightAt(x, z)

  return { x, z, yaw, pitch, crouch }
}
