import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'

export interface PlayerState {
  x: number
  z: number
  /** Turn around the vertical, radians. */
  yaw: number
  /** Look up and down, radians, clamped to ±π/2. */
  pitch: number
  /** 0 standing, 1 fully crouched. */
  crouch: number
  /** Vertical speed, m/s, positive upward. */
  vy: number
  /** Height above the ground surface, metres, always >= 0. */
  hop: number
  /** Whether the feet are off the ground — true exactly when hop > 0. */
  airborne: boolean
  /** Extra height the feet stand at above the terrain surface, metres — set
   *  by standing over a climbable obstacle's footprint (a boulder, a log, a
   *  stump), 0 on bare ground. Added to `hop`, not replacing it: jumping
   *  while already standing on a stump still leaves the ground beneath it. */
  stand: number
}

export interface PlayerInput {
  /** -1..1, forward positive. */
  forward: number
  /** -1..1, right positive. */
  strafe: number
  dYaw: number
  dPitch: number
  crouching: boolean
  /** Edge-triggered: true only on the frame the jump key was pressed. */
  jumping: boolean
  dt: number
}

export interface Obstacle {
  x: number
  z: number
  radius: number
  /** Height of this obstacle's top above the ground beneath it, metres — set
   *  only on a boulder, a log or a stump, the obstacles worth climbing.
   *  Left unset for anything else (a tree, a bush, the shelter), which keeps
   *  blocking the way outright regardless of MAX_STEP_HEIGHT. */
  topHeight?: number
}

/** Tallest obstacle top a step can climb onto outright, metres — above this,
 *  even a "climbable" obstacle still acts as a wall. */
const MAX_STEP_HEIGHT = 0.55

const WALK_SPEED = 2.4
const CROUCH_SPEED = 1.1
const STAND_EYE = 1.65
const CROUCH_EYE = 0.75
const CROUCH_RATE = 6
const PLAYER_RADIUS = 0.3
const MAX_PITCH = Math.PI / 2

/**
 * How far ahead to sample the ground when reading the slope underfoot,
 * metres. Short enough to catch a single steep step, not the whole hillside.
 */
const SLOPE_PROBE = 1
/** Grade (rise/run) where an uphill climb starts costing speed. tan(35°). */
const SLOPE_EASE_START = 0.7
/** Grade beyond which the slope is a wall, not a hill. tan(54°). */
const SLOPE_BLOCK = 1.4

const JUMP_SPEED = 3.4
const GRAVITY = 9.8

/** How much wetland ground costs, as a fraction of normal walking speed —
 *  the same "grounds you" idea as a steep slope (`slopeFactor`), applied to
 *  mud instead of a grade. */
const WETLAND_SPEED = 0.55

/** Walking-speed multiplier for the biome underfoot — 1 everywhere but the
 *  one substrate that is genuinely harder to cross on foot. */
export function biomeSpeedFactor(biome: Biome): number {
  return biome === 'wetland' ? WETLAND_SPEED : 1
}

/** Eye height above the ground, accounting for the crouch. */
export function eyeHeight(s: PlayerState): number {
  return STAND_EYE + (CROUCH_EYE - STAND_EYE) * s.crouch
}

/**
 * How much an uphill climb in this direction should slow you down: 1 at no
 * cost, sliding to 0 as the grade approaches a wall. A cozy walk in the woods
 * should tire you out on a real slope, not let you jog straight up a cliff.
 *
 * Downhill is never slowed — sliding down a slope is a different problem
 * (and not one this game models), not a reason to refuse the step.
 */
function slopeFactor(ground: ElevationProvider, x: number, z: number, dirX: number, dirZ: number): number {
  if (dirX === 0 && dirZ === 0) return 1
  const h0 = ground.heightAt(x, z)
  const h1 = ground.heightAt(x + dirX * SLOPE_PROBE, z + dirZ * SLOPE_PROBE)
  const grade = (h1 - h0) / SLOPE_PROBE
  if (grade <= SLOPE_EASE_START) return 1
  if (grade >= SLOPE_BLOCK) return 0
  return 1 - (grade - SLOPE_EASE_START) / (SLOPE_BLOCK - SLOPE_EASE_START)
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
  speedMultiplier = 1,
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

  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  const rawX = -sin * fx + cos * sx
  const rawZ = -cos * fx - sin * sx
  const rawLen = Math.hypot(rawX, rawZ)
  const dirX = rawLen > 1e-6 ? rawX / rawLen : 0
  const dirZ = rawLen > 1e-6 ? rawZ / rawLen : 0

  // Speed follows the posture the player held during this step, not the one
  // they end it in: reading the new crouch let someone straightening up jump to
  // full speed within the same frame.
  const slope = slopeFactor(ground, s.x, s.z, dirX, dirZ)
  const speed = (WALK_SPEED + (CROUCH_SPEED - WALK_SPEED) * s.crouch) * i.dt * slope * speedMultiplier
  let x = s.x + rawX * speed
  let z = s.z + rawZ * speed

  for (const o of obstacles) {
    const climbable = o.topHeight !== undefined && o.topHeight <= MAX_STEP_HEIGHT
    if (climbable) continue
    const dx = x - o.x
    const dz = z - o.z
    const d = Math.hypot(dx, dz)
    const min = o.radius + PLAYER_RADIUS
    if (d < min && d > 1e-6) {
      x = o.x + (dx / d) * min
      z = o.z + (dz / d) * min
    }
  }

  // Standing on top follows from where the feet ended up this step, not from
  // dodging the obstacle above — a boulder low enough to climb is simply never
  // pushed out of, so walking onto it is all it takes.
  let stand = 0
  for (const o of obstacles) {
    if (o.topHeight === undefined || o.topHeight > MAX_STEP_HEIGHT) continue
    if (Math.hypot(x - o.x, z - o.z) <= o.radius) stand = Math.max(stand, o.topHeight)
  }

  // Jumping does not carry you forward faster or farther — it only leaves the
  // ground for a moment. A crouched jump would clip through whatever you were
  // ducking under, so it is refused outright rather than half-allowed.
  let vy = s.vy - GRAVITY * i.dt
  if (s.hop <= 0 && i.jumping && crouch < 0.5) vy = JUMP_SPEED

  let hop = s.hop + vy * i.dt
  if (hop <= 0) {
    // Landed: the ground itself is read fresh by the caller every frame, so
    // this only has to stop the fall, not know how high the ground is.
    hop = 0
    vy = 0
  }

  return { x, z, yaw, pitch, crouch, vy, hop, airborne: hop > 0, stand }
}
