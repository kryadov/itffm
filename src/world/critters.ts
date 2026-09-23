import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import { mulberry32 } from '../util/rng'
import { findOpenSpot, type Circle } from '../util/openSpot'
import {
  HARE_RIG, SQUIRREL_RIG, SNAKE_RIG, MOOSE_RIG, BEAR_RIG, BOAR_RIG, BEAVER_RIG, type Rig,
} from './animalRigs'

/**
 * Shared ground-fauna behaviour — hare, squirrel, snake, moose, bear, boar,
 * beaver — see docs/superpowers/specs/2026-09-10-wildlife-design.md. One
 * state machine, not seven ad hoc ones: a species is a config plus a rig
 * (`world/animalRigs.ts`, what it looks like and how its legs move), not its
 * own file with its own copy of this cycle.
 */
export type CritterState = 'idle' | 'alert' | 'flee' | 'resting'

/** How an idle animal gets about: it stands (grazing) for a while, then walks
 *  to another spot near its home, and so on. */
export interface WanderSpec {
  /** How far from home it strays, metres. 0 keeps it on its home spot. */
  radius: number
  /** m/s at a walk. */
  speed: number
  /** Seconds it stands between walks. */
  pauseMin: number
  pauseMax: number
}

export interface CritterSpecies {
  /** Player distance, metres, that trips idle/resting → alert. */
  fleeRadius: number
  /** Seconds frozen in `alert` before the flee leg actually starts. */
  alertDur: number
  /** m/s while fleeing. */
  fleeSpeed: number
  /** Seconds spent fleeing — a fixed leg, like a bird's cruise, not a
   *  target-seek loop: simpler to reason about and to test. */
  fleeDur: number
  restMin: number
  restMax: number
  /** Leave it out and an idle animal stays exactly where it is. */
  wander?: WanderSpec
}

export interface Critter {
  state: CritterState
  stateT: number
  x: number
  y: number
  z: number
  /** Heading (radians) picked once, at the alert→flee transition. */
  fleeHeading: number
  /** This cycle's rest length, rolled once flee ends. */
  restDur: number
  /** Where it lives: an idle animal wanders around here, and walks back here
   *  after it has fled. Defaults to where it first stood. */
  homeX?: number
  homeZ?: number
  /** Where an idle animal is walking to, or null while it stands. */
  walkTo?: { x: number; z: number } | null
  /** Seconds left standing before the next walk. */
  pause?: number
  /** Seconds left turning toward `walkTo` before it sets off. */
  turning?: number
  /** The way it last moved, radians (the same sense as `fleeHeading`). */
  heading?: number
}

/**
 * One tick of one critter's state machine.
 *
 * @param findFleeTarget optional — when given (the squirrel: "climbsTrees"),
 *   the flee heading points at the nearest returned point (a TreePerch)
 *   instead of straight away from the player, e.g. `world/trees.ts`'s
 *   `treePerches()`. Returning null falls back to fleeing the player.
 */
export function stepCritter(
  c: Critter,
  dt: number,
  playerX: number,
  playerZ: number,
  species: CritterSpecies,
  rand: () => number,
  ground: ElevationProvider,
  findFleeTarget?: (x: number, z: number) => { x: number; y: number; z: number } | null,
): void {
  c.stateT += dt
  if (c.homeX === undefined || c.homeZ === undefined) {
    c.homeX = c.x
    c.homeZ = c.z
  }

  if (c.state === 'idle' || c.state === 'resting') {
    const d2 = (c.x - playerX) ** 2 + (c.z - playerZ) ** 2
    if (d2 < species.fleeRadius * species.fleeRadius) {
      c.state = 'alert'
      c.stateT = 0
      c.walkTo = null
    } else if (c.state === 'resting' && c.stateT >= c.restDur) {
      c.state = 'idle'
      c.stateT = 0
      c.pause = 0
    } else if (c.state === 'idle' && species.wander) {
      wanderStep(c, dt, species.wander, rand, ground)
    }
    return
  }

  if (c.state === 'alert') {
    if (c.stateT >= species.alertDur) {
      const target = findFleeTarget ? findFleeTarget(c.x, c.z) : null
      c.fleeHeading = target
        ? Math.atan2(target.z - c.z, target.x - c.x)
        : Math.atan2(c.z - playerZ, c.x - playerX)
      c.heading = c.fleeHeading
      c.state = 'flee'
      c.stateT = 0
    }
    return
  }

  if (c.state === 'flee') {
    c.x += Math.cos(c.fleeHeading) * species.fleeSpeed * dt
    c.z += Math.sin(c.fleeHeading) * species.fleeSpeed * dt
    c.y = ground.heightAt(c.x, c.z)
    if (c.stateT >= species.fleeDur) {
      c.state = 'resting'
      c.stateT = 0
      c.restDur = species.restMin + rand() * (species.restMax - species.restMin)
    }
  }
}

/** An idle animal's own slow round: stand a while, walk to another spot near
 *  home, stand again. Its home stays put, so one that fled walks back. */
function wanderStep(c: Critter, dt: number, w: WanderSpec, rand: () => number, ground: ElevationProvider): void {
  if (c.walkTo) {
    const dx = c.walkTo.x - c.x
    const dz = c.walkTo.z - c.z
    const d = Math.hypot(dx, dz)
    const step = w.speed * dt
    if (d > 1e-6) c.heading = Math.atan2(dz, dx)
    // Turn first, then walk: setting straight off while still facing the old
    // way reads as sliding sideways.
    if ((c.turning ?? 0) > 0) {
      c.turning! -= dt
      return
    }
    if (d <= step) {
      c.x = c.walkTo.x
      c.z = c.walkTo.z
      c.walkTo = null
      c.pause = w.pauseMin + rand() * (w.pauseMax - w.pauseMin)
    } else {
      c.x += (dx / d) * step
      c.z += (dz / d) * step
    }
    c.y = ground.heightAt(c.x, c.z)
    return
  }
  c.pause = (c.pause ?? 0) - dt
  if (c.pause > 0) return
  const a = rand() * Math.PI * 2
  const r = w.radius * Math.sqrt(rand())
  const tx = c.homeX! + Math.cos(a) * r
  const tz = c.homeZ! + Math.sin(a) * r
  if (Math.hypot(tx - c.x, tz - c.z) < 0.05) {
    // Already there (a spot with no room to wander): just keep standing.
    c.pause = w.pauseMin + rand() * (w.pauseMax - w.pauseMin)
    return
  }
  c.walkTo = { x: tx, z: tz }
  c.turning = TURN_FIRST
}

/** Seconds an animal spends turning toward where it is going before it walks. */
const TURN_FIRST = 0.7

/** A candidate resting/idle spot for a critter — open ground or a tree base. */
export interface HomeSpot {
  x: number
  y: number
  z: number
  /** The way to face while standing at home — a beaver at its trunk. */
  face?: number
}

/**
 * A scatter of `count` idle/resting spots for a ground species, each nudged
 * clear of `obstacles` by `findOpenSpot` — the same "where is there room?"
 * question the hut and campfire already ask, asked `count` times over instead
 * of once.
 */
export function placeCritterHomes(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  count: number,
  obstacles: Circle[],
  clearance = 1.5,
  chunkOrigin: { x: number; z: number } = { x: 0, z: 0 },
): HomeSpot[] {
  const rand = mulberry32(seed)
  const homes: HomeSpot[] = []
  for (let i = 0; i < count; i++) {
    const candidate = {
      x: chunkOrigin.x + (rand() - 0.5) * 2 * halfSize * 0.85,
      z: chunkOrigin.z + (rand() - 0.5) * 2 * halfSize * 0.85,
    }
    const spot = findOpenSpot(obstacles, halfSize, candidate, clearance, undefined, chunkOrigin)
    homes.push({ x: spot.x, y: ground.heightAt(spot.x, spot.z), z: spot.z })
  }
  return homes
}

/**
 * Nearest of `points` to (x, z) within `maxDist`, or null. Shared by the
 * squirrel's flee-to-a-tree target and anything else that wants "closest
 * known spot" — the same question `world/birds.ts`'s private `findPerch`
 * answers, generalised so it isn't copied a second time here.
 */
export function nearestPoint<T extends { x: number; z: number }>(
  x: number,
  z: number,
  points: T[],
  maxDist: number,
): T | null {
  let best: T | null = null
  let bestD2 = maxDist * maxDist
  for (const p of points) {
    const d2 = (p.x - x) ** 2 + (p.z - z) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = p
    }
  }
  return best
}

export interface CritterGroup {
  update(dt: number, playerX: number, playerZ: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** How fast the drawn heading swings round to the real one, per second: a
 *  turn, not a snap. Faster when bolting. */
const TURN_RATE = 4
const TURN_RATE_FLEE = 12
/** How fast the head goes down to the food and comes up again, per second. */
const GRAZE_RATE = 2.5

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/**
 * The generic ground-critter renderer: steps every critter's state machine
 * and poses its rig's InstancedMeshes from it. The rig supplies the shapes
 * and how legs and head move (`world/animalRigs.ts`); this supplies where the
 * animal is, which way it faces, how fast it goes and whether its head is
 * down at the food.
 *
 * @param homes one spot per critter (cycled if shorter than `count`) — where
 *   it idles and rests.
 * @param findFleeTarget see `stepCritter` — squirrels flee toward a tree.
 */
export function createCritterGroup(
  scene: THREE.Scene,
  name: string,
  rand: () => number,
  count: number,
  species: CritterSpecies,
  provider: ElevationProvider,
  homes: HomeSpot[],
  rig: Rig,
  findFleeTarget?: (x: number, z: number) => { x: number; y: number; z: number } | null,
  /** Called roughly every `trackSpacing` metres a fleeing critter actually
   *  covers — its own footprints/paw marks (`world/tracks.ts`). Omit to
   *  leave a species trackless. */
  onStep?: (x: number, z: number, heading: number) => void,
  trackSpacing = 0.35,
): CritterGroup {
  const group = new THREE.Group()
  group.name = name
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
  const n = Math.max(1, count)
  const parts = rig.build(mat, n)
  group.add(...parts)
  for (const p of parts) p.frustumCulled = false

  const critters: Critter[] = []
  const variants: number[] = []
  const drawnHeading: number[] = []
  const gait: number[] = []
  const graze: number[] = []
  const prevX: number[] = []
  const prevZ: number[] = []
  const shade = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const home = homes.length > 0 ? homes[i % homes.length] : { x: 0, y: provider.heightAt(0, 0), z: 0 }
    const facing = home.face ?? rand() * Math.PI * 2
    critters.push({
      state: 'idle',
      stateT: rand() * 5,
      x: home.x,
      y: home.y,
      z: home.z,
      fleeHeading: 0,
      restDur: 0,
      homeX: home.x,
      homeZ: home.z,
      walkTo: null,
      pause: species.wander ? rand() * species.wander.pauseMax : 0,
      heading: facing,
    })
    variants.push(rand())
    drawnHeading.push(facing)
    gait.push(rand() * Math.PI * 2)
    graze.push(1)
    prevX.push(home.x)
    prevZ.push(home.z)
    // No two quite the same coat: a small brightness spread per animal.
    const b = 0.88 + rand() * 0.24
    shade.setRGB(b, b, b)
    for (const p of parts) p.setColorAt(i, shade)
  }
  for (const p of parts) if (p.instanceColor) p.instanceColor.needsUpdate = true

  let time = 0
  // Last spot each critter actually left a mark at, in flee-distance terms —
  // reset to null so the very first flee step always lays one.
  const lastTrackX: (number | null)[] = new Array(n).fill(null)
  const lastTrackZ: (number | null)[] = new Array(n).fill(null)
  const heightAt = (x: number, z: number): number => provider.heightAt(x, z)

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      const geos = new Set(parts.map((p) => p.geometry))
      for (const g of geos) g.dispose()
      mat.dispose()
      critters.length = 0
    },
    update(dt, playerX, playerZ) {
      time += dt
      for (let i = 0; i < n; i++) {
        const c = critters[i]
        stepCritter(c, dt, playerX, playerZ, species, rand, provider, findFleeTarget)

        const moved = Math.hypot(c.x - prevX[i], c.z - prevZ[i])
        prevX[i] = c.x
        prevZ[i] = c.z
        // A jump bigger than any animal runs in a frame is a teleport (a
        // fresh chunk, a reset), not a stride.
        const stepped = moved < 2 ? moved : 0
        const speed = dt > 0 ? stepped / dt : 0
        gait[i] = (gait[i] + (stepped / rig.stride) * Math.PI * 2) % (Math.PI * 64)

        // Which way it faces: the way it moves; toward the player while it
        // stands frozen, watching; its home's own facing while it stands
        // there (a beaver at its trunk).
        let want = c.heading ?? drawnHeading[i]
        if (c.state === 'alert') want = Math.atan2(playerZ - c.z, playerX - c.x)
        else if (c.state === 'idle' && !c.walkTo) {
          const home = homes.length > 0 ? homes[i % homes.length] : undefined
          if (home?.face !== undefined && Math.hypot(c.x - home.x, c.z - home.z) < 0.3) want = home.face
        }
        const rate = c.state === 'flee' ? TURN_RATE_FLEE : TURN_RATE
        drawnHeading[i] += wrapAngle(want - drawnHeading[i]) * (1 - Math.exp(-rate * dt))

        const grazing = (c.state === 'idle' && !c.walkTo) || (c.state === 'resting' && c.stateT > 1.5)
        graze[i] += ((grazing ? 1 : 0) - graze[i]) * (1 - Math.exp(-GRAZE_RATE * dt))

        if (c.state === 'flee' && onStep) {
          const lx = lastTrackX[i]
          const lz = lastTrackZ[i]
          if (lx === null || Math.hypot(c.x - lx, c.z - lz!) >= trackSpacing) {
            onStep(c.x, c.z, c.fleeHeading)
            lastTrackX[i] = c.x
            lastTrackZ[i] = c.z
          }
        }

        rig.pose(parts, i, {
          x: c.x,
          y: provider.heightAt(c.x, c.z),
          z: c.z,
          heading: drawnHeading[i],
          speed,
          gait: gait[i],
          graze: graze[i],
          time,
          variant: variants[i],
          heightAt,
        })
      }
      for (const p of parts) p.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------------------
// Species.
// ---------------------------------------------------------------------------

type OnStep = (x: number, z: number, heading: number) => void

const HARE_SPECIES: CritterSpecies = {
  fleeRadius: 9,
  alertDur: 0.3,
  fleeSpeed: 6.5,
  fleeDur: 2.5,
  restMin: 6,
  restMax: 16,
  wander: { radius: 2.5, speed: 0.9, pauseMin: 3, pauseMax: 9 },
}

/** A hare: long ears, long hind feet, big haunches, a white scut. Ground-only
 *  — it bolts away from the player in a straight line, in bounds. */
export function createHares(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(scene, 'hares', rand, count, HARE_SPECIES, provider, homes, HARE_RIG, undefined, onStep)
}

const SQUIRREL_SPECIES: CritterSpecies = {
  fleeRadius: 7,
  alertDur: 0.3,
  fleeSpeed: 5.5,
  fleeDur: 2,
  restMin: 8,
  restMax: 20,
  wander: { radius: 1.5, speed: 1.2, pauseMin: 2, pauseMax: 6 },
}

/**
 * A red squirrel: tufted ears, a bushy tail in an S over its back. Flees to
 * the nearest tree perch when one is close enough, else bolts across the
 * ground like a hare.
 */
export function createSquirrels(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  perches: HomeSpot[],
  perchSearchRadius = 20,
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(
    scene, 'squirrels', rand, count, SQUIRREL_SPECIES, provider, homes, SQUIRREL_RIG,
    (x, z) => nearestPoint(x, z, perches, perchSearchRadius),
    onStep,
  )
}

const SNAKE_SPECIES: CritterSpecies = {
  // Small and slow next to the hare/squirrel species above — "creeps away",
  // not "bolts", per the brainstorm (docs/superpowers/specs/
  // 2026-09-10-wildlife-design.md). Rests far longer too: rare and
  // unhurried, not a flighty prey animal.
  fleeRadius: 4,
  alertDur: 0.6,
  fleeSpeed: 2.2,
  fleeDur: 3.5,
  restMin: 15,
  restMax: 40,
  wander: { radius: 1.2, speed: 0.25, pauseMin: 10, pauseMax: 30 },
}

/**
 * An adder: a broad flat head, a body thickest a third of the way down,
 * a dark zigzag along its back, lying along a wave that slides along itself
 * as it moves. It creeps away slowly rather than bolting.
 */
export function createSnakes(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(
    scene, 'snakes', rand, count, SNAKE_SPECIES, provider, homes, SNAKE_RIG, undefined, onStep,
    0.15, // closer spacing than hare/squirrel — a sinuous trail, not two dots
  )
}

const MOOSE_SPECIES: CritterSpecies = {
  // Big and unhurried: it lets you come fairly close, then trots off rather
  // than bolting, and does not go far.
  fleeRadius: 15,
  alertDur: 1.5,
  fleeSpeed: 3.8,
  fleeDur: 6,
  restMin: 8,
  restMax: 20,
  wander: { radius: 7, speed: 0.9, pauseMin: 6, pauseMax: 16 },
}

/** A moose: long pale legs, a hump over the shoulders, a heavy overhanging
 *  muzzle and a bell under the throat. Bulls carry broad palmate antlers,
 *  cows none. It browses, wanders slowly, and trots off if you come close. */
export function createMoose(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(scene, 'moose', rand, count, MOOSE_SPECIES, provider, homes, MOOSE_RIG, undefined, onStep, 1.1)
}

const BEAR_SPECIES: CritterSpecies = {
  // Wary of people, as a wild brown bear is: it moves off at a walk rather
  // than a run once you are close.
  fleeRadius: 14,
  alertDur: 1.2,
  fleeSpeed: 2.6,
  fleeDur: 7,
  restMin: 10,
  restMax: 25,
  wander: { radius: 4, speed: 0.7, pauseMin: 8, pauseMax: 20 },
}

/** A brown bear: a shoulder hump, a broad head with small round ears and a
 *  paler muzzle. It lives by the berries and mushrooms (its homes are where
 *  they grow — `game/scene.ts`) and spends most of its time head down,
 *  eating them. */
export function createBears(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(scene, 'bears', rand, count, BEAR_SPECIES, provider, homes, BEAR_RIG, undefined, onStep, 0.8)
}

const BOAR_SPECIES: CritterSpecies = {
  fleeRadius: 11,
  alertDur: 0.6,
  fleeSpeed: 5,
  fleeDur: 4,
  restMin: 6,
  restMax: 15,
  wander: { radius: 5, speed: 0.8, pauseMin: 3, pauseMax: 10 },
}

/** A wild boar: a wedge of a body high at the shoulders with a bristly crest,
 *  a long snout, small tusks. It roots about, nose to the ground, and runs
 *  off if you come close. */
export function createBoars(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  onStep?: OnStep,
): CritterGroup {
  return createCritterGroup(scene, 'boars', rand, count, BOAR_SPECIES, provider, homes, BOAR_RIG, undefined, onStep, 0.5)
}

const BEAVER_SPECIES: CritterSpecies = {
  fleeRadius: 6,
  alertDur: 0.5,
  fleeSpeed: 2.2,
  fleeDur: 3,
  restMin: 10,
  restMax: 25,
  // It stays at its tree, gnawing; after a scare it waddles back to it.
  wander: { radius: 0, speed: 0.5, pauseMin: 20, pauseMax: 40 },
}

/**
 * A beaver: low and heavy, a flat scaly tail, orange front teeth. Its home is
 * the foot of a tree, facing the trunk (`HomeSpot.face`), where it gnaws. It
 * flees to the nearest water when there is some within reach, else away from
 * the player.
 */
export function createBeavers(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  water: { x: number; z: number }[] = [],
): CritterGroup {
  return createCritterGroup(
    scene, 'beavers', rand, count, BEAVER_SPECIES, provider, homes, BEAVER_RIG,
    (x, z) => {
      const p = nearestPoint(x, z, water, 40)
      return p ? { x: p.x, y: provider.heightAt(p.x, p.z), z: p.z } : null
    },
  )
}

/**
 * Where a bear lives: at the richest patch of food (berries and mushrooms) —
 * of a sample of food spots, the ones with the most others close around them,
 * kept well apart from each other. Empty when there is no food at all.
 */
export function placeBearHomes(
  food: { x: number; z: number }[],
  count: number,
  rand: () => number,
  ground: ElevationProvider,
  apart = 40,
): HomeSpot[] {
  if (food.length === 0 || count <= 0) return []
  const sample = Array.from({ length: Math.min(60, food.length) }, () => food[Math.floor(rand() * food.length)])
  const scored = sample.map((p) => ({
    p,
    n: food.reduce((acc, f) => acc + ((f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 64 ? 1 : 0), 0),
  }))
  scored.sort((a, b) => b.n - a.n)
  const homes: HomeSpot[] = []
  for (const { p } of scored) {
    if (homes.length >= count) break
    if (homes.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < apart)) continue
    homes.push({ x: p.x, y: ground.heightAt(p.x, p.z), z: p.z })
  }
  return homes
}

/**
 * Where a beaver lives: at the foot of a tree near water, on the water's side
 * of the trunk, facing it (`face`) — that is the tree it is gnawing. Empty
 * when the wood has no water, or no tree near it: no beaver is better than a
 * beaver in the middle of a dry pine wood.
 */
export function placeBeaverHomes(
  trees: { x: number; z: number; radius: number }[],
  water: { x: number; z: number }[],
  count: number,
  rand: () => number,
  ground: ElevationProvider,
  maxFromWater = 25,
): HomeSpot[] {
  if (water.length === 0 || count <= 0) return []
  const near = trees
    .map((t) => ({ t, w: nearestPoint(t.x, t.z, water, maxFromWater) }))
    .filter((c): c is { t: (typeof trees)[number]; w: { x: number; z: number } } => c.w !== null)
  const homes: HomeSpot[] = []
  for (let k = 0; k < count && near.length > 0; k++) {
    const { t, w } = near.splice(Math.floor(rand() * near.length), 1)[0]
    const d = Math.hypot(w.x - t.x, w.z - t.z) || 1
    const off = t.radius + 0.3
    const x = t.x + ((w.x - t.x) / d) * off
    const z = t.z + ((w.z - t.z) / d) * off
    homes.push({ x, y: ground.heightAt(x, z), z, face: Math.atan2(t.z - z, t.x - x) })
  }
  return homes
}

/** `count` homes in a loose group around `centre` — a sounder of boar keeps
 *  together. */
export function familyHomes(centre: HomeSpot, count: number, rand: () => number, ground: ElevationProvider, spread = 3): HomeSpot[] {
  return Array.from({ length: count }, (_, k) => {
    if (k === 0) return centre
    const a = rand() * Math.PI * 2
    const r = spread * (0.5 + rand() * 0.5)
    const x = centre.x + Math.cos(a) * r
    const z = centre.z + Math.sin(a) * r
    return { x, y: ground.heightAt(x, z), z }
  })
}
