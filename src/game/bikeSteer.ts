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

/** One frame of easing `current` toward `target`. Frame-rate independent: the
 *  same wall-clock time gives the same result at any `dt`. */
export function smoothSteer(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-STEER_RESPONSE * dt))
}
