/**
 * The start screen's own live backdrop: a quadcopter looping around the home
 * plot while the place picker sits over it. A separate, cinematic path, not
 * derived from the gameplay drone's own tuning (`world/drone.ts`'s `DRONE`) —
 * that one is picked for how flying feels, this one for how the shot looks,
 * and the two are free to keep changing independently of each other.
 *
 * Pure: no THREE, no clock, no scene — a camera pose is a function of
 * elapsed time alone, so the loop never drifts and never needs its own
 * state beyond "how long has this been running."
 */

export interface OrbitPose {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
}

/** A steady circle around (centerX, centerZ) at a fixed radius and height,
 *  always looking down at a point above the centre — the simplest shot that
 *  keeps the whole plot in frame throughout the loop. */
export function attractOrbitPose(
  t: number,
  centerX: number,
  centerZ: number,
  radius: number,
  height: number,
  lookHeight: number,
  angularSpeed: number,
): OrbitPose {
  const a = t * angularSpeed
  return {
    x: centerX + Math.cos(a) * radius,
    y: height,
    z: centerZ + Math.sin(a) * radius,
    lookX: centerX,
    lookY: lookHeight,
    lookZ: centerZ,
  }
}
