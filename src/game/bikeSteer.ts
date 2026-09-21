/**
 * How far the handlebar is turned while the player turns: the bike you are
 * carrying shows its bar and front wheel in view (`main.ts`), and the front end
 * swings the way you are turning, then settles straight once you stop.
 *
 * Pure — no three.js, no DOM — so it stays testable like the rest of `game/`.
 */

/** The most the bar ever turns either way, radians (~30°). */
export const MAX_STEER = 0.55
/** Radians of bar per radian-per-second of turning: a brisk ~2.2 rad/s turn
 *  of the view gives the full lock. */
const STEER_PER_YAW_RATE = 0.25
/** How fast the bar follows its target, per second (an exponential ease). */
const STEER_RESPONSE = 9

/** The bar angle a turn of `yawRate` (radians/second, positive = left, the same
 *  sign as `PlayerState.yaw`) calls for. Soft-clamped, so a fast flick of the
 *  mouse eases into the stop instead of pinning at it. */
export function steerTarget(yawRate: number): number {
  return MAX_STEER * Math.tanh((yawRate * STEER_PER_YAW_RATE) / MAX_STEER)
}

/** One frame of easing `current` toward `target` at `rate` per second.
 *  Frame-rate independent: the same wall-clock time gives the same result at
 *  any `dt`. */
export function easeToward(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** One frame of the handlebar following its target angle. */
export function smoothSteer(current: number, target: number, dt: number): number {
  return easeToward(current, target, dt, STEER_RESPONSE)
}

/** How far the front wheel rolls for a turn: its tread to its axle — the wheel's
 *  own 0.32, its tyre's 0.025 and the tread's 0.004 (`world/questItemModels.ts`'s
 *  `buildBikeWheel`, checked by a test there). */
export const ROLLING_RADIUS = 0.349

/** Beyond this the player was moved outright (a teleport), not ridden — no
 *  wheel spins that fast. */
const MAX_WHEEL_SPEED = 30

/**
 * The wheel's angle after `dt` seconds of rolling at `forwardSpeed` m/s. The
 * bicycle model faces +x with its axle along z, so rolling forward is a NEGATIVE
 * turn (the top of the wheel moves ahead); backing up turns it the other way.
 */
export function wheelSpin(angle: number, forwardSpeed: number, dt: number): number {
  return angle - (forwardSpeed * dt) / ROLLING_RADIUS
}

/**
 * How fast the player moved along the way they face over a frame: `dx`, `dz` is
 * the displacement, `yaw` the facing (0 faces -z, as in `PlayerState`). Sideways
 * is nothing — the front wheel does not roll for a strafe — and backward is
 * negative. 0 for a frame with no time.
 */
export function forwardSpeedOf(dx: number, dz: number, yaw: number, dt: number): number {
  if (dt <= 0) return 0
  const ahead = -Math.sin(yaw) * dx - Math.cos(yaw) * dz
  // + 0 turns a -0 (standing still, or straight sideways) into a plain 0.
  return Math.max(-MAX_WHEEL_SPEED, Math.min(MAX_WHEEL_SPEED, ahead / dt)) + 0
}
