/**
 * The honey quest: take the empty jar off the shelf in the hut, send it up to
 * the wild hive under the quadcopter (the hive is high on a trunk, and the
 * bees would not let anyone near on foot), bring it back full and set it on
 * the shelf again. Pure — no DOM, no three.js — like the rest of `quest/`.
 *
 *   shelf ──E at the shelf──▶ jar (in hand)
 *   jar ──launch the quadcopter──▶ drone (hanging under it)
 *   drone ──hover by the hive for FILL_SECONDS──▶ filled
 *   drone ──lands──▶ jar          filled ──lands──▶ full (in hand)
 *   full ──E at the shelf (or the hut's door)──▶ done: a jar of honey on the shelf
 */
export type HoneyStage = 'shelf' | 'jar' | 'drone' | 'filled' | 'full' | 'done'

export interface Honey {
  stage: HoneyStage
  /** Seconds spent by the hive so far (only while `drone`). */
  fill: number
}

/** How long the quadcopter has to hang by the hive, seconds. */
export const FILL_SECONDS = 3
/** How near the hive counts as by it, metres (straight-line, height included). */
export const HIVE_REACH = 3.2
/** On foot with the jar, this near the hive and the bees see you off. */
export const BEES_REACH = 6

export const NO_HONEY: Honey = { stage: 'shelf', fill: 0 }

export type HoneyEvent =
  | 'tookJar' | 'needDrone' | 'launched' | 'byHive' | 'filled' | 'backEmpty' | 'backFull' | 'delivered' | null

/** `E` at the shelf in the hut. `droneOwned`: whether the quadcopter is yours
 *  yet (the jar can be taken either way; the toast says what it is for). */
export function honeyAtShelf(h: Honey, droneOwned: boolean): { honey: Honey; event: HoneyEvent } {
  if (h.stage === 'shelf') return { honey: { stage: 'jar', fill: 0 }, event: droneOwned ? 'tookJar' : 'needDrone' }
  if (h.stage === 'full') return { honey: { stage: 'done', fill: 0 }, event: 'delivered' }
  return { honey: h, event: null }
}

/** The quadcopter takes off: an empty jar in hand goes up hanging under it. */
export function honeyOnLaunch(h: Honey): { honey: Honey; event: HoneyEvent } {
  if (h.stage !== 'jar') return { honey: h, event: null }
  return { honey: { stage: 'drone', fill: 0 }, event: 'launched' }
}

/**
 * A moment of flight: by the hive (within `HIVE_REACH`), the jar fills over
 * `FILL_SECONDS`; away from it the count starts over.
 */
export function honeyInFlight(h: Honey, distToHive: number, dt: number): { honey: Honey; event: HoneyEvent } {
  if (h.stage !== 'drone') return { honey: h, event: null }
  if (distToHive > HIVE_REACH) return { honey: h.fill > 0 ? { stage: 'drone', fill: 0 } : h, event: null }
  const fill = h.fill + dt
  if (fill >= FILL_SECONDS) return { honey: { stage: 'filled', fill: 0 }, event: 'filled' }
  return { honey: { stage: 'drone', fill }, event: h.fill === 0 ? 'byHive' : null }
}

/** The quadcopter lands: whatever hangs under it comes back to hand. */
export function honeyOnLand(h: Honey): { honey: Honey; event: HoneyEvent } {
  if (h.stage === 'drone') return { honey: { stage: 'jar', fill: 0 }, event: 'backEmpty' }
  if (h.stage === 'filled') return { honey: { stage: 'full', fill: 0 }, event: 'backFull' }
  return { honey: h, event: null }
}

/** Whether the jar is being carried by hand (drawn in view while walking). */
export function jarInHand(h: Honey): 'empty' | 'full' | null {
  return h.stage === 'jar' ? 'empty' : h.stage === 'full' ? 'full' : null
}

/** Whether the jar hangs under the quadcopter. */
export function jarOnDrone(h: Honey): 'empty' | 'full' | null {
  return h.stage === 'drone' ? 'empty' : h.stage === 'filled' ? 'full' : null
}

/** `raw` if it is a real honey state, else the fresh one. */
export function readHoney(raw: unknown): Honey {
  if (typeof raw !== 'object' || raw === null) return NO_HONEY
  const { stage } = raw as Record<string, unknown>
  const stages: HoneyStage[] = ['shelf', 'jar', 'drone', 'filled', 'full', 'done']
  if (typeof stage !== 'string' || !stages.includes(stage as HoneyStage)) return NO_HONEY
  // A save made mid-flight: the quadcopter is not in the air after a reload,
  // so whatever hung under it is back in hand.
  if (stage === 'drone') return { stage: 'jar', fill: 0 }
  if (stage === 'filled') return { stage: 'full', fill: 0 }
  return { stage: stage as HoneyStage, fill: 0 }
}
