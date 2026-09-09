import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import { mulberry32 } from '../util/rng'
import { findOpenSpot, type Circle } from '../util/openSpot'

/**
 * Shared ground-fauna behaviour for hare, squirrel and snake — see
 * docs/superpowers/specs/2026-09-10-wildlife-design.md. One state machine,
 * not five ad hoc ones: a species is a config plus a geometry, not its own
 * file with its own copy of this cycle.
 */
export type CritterState = 'idle' | 'alert' | 'flee' | 'resting'

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

  if (c.state === 'idle' || c.state === 'resting') {
    const d2 = (c.x - playerX) ** 2 + (c.z - playerZ) ** 2
    if (d2 < species.fleeRadius * species.fleeRadius) {
      c.state = 'alert'
      c.stateT = 0
    } else if (c.state === 'resting' && c.stateT >= c.restDur) {
      c.state = 'idle'
      c.stateT = 0
    }
    return
  }

  if (c.state === 'alert') {
    if (c.stateT >= species.alertDur) {
      const target = findFleeTarget ? findFleeTarget(c.x, c.z) : null
      c.fleeHeading = target
        ? Math.atan2(target.z - c.z, target.x - c.x)
        : Math.atan2(c.z - playerZ, c.x - playerX)
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

/** A candidate resting/idle spot for a critter — open ground or a tree base. */
export interface HomeSpot {
  x: number
  y: number
  z: number
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
): HomeSpot[] {
  const rand = mulberry32(seed)
  const homes: HomeSpot[] = []
  for (let i = 0; i < count; i++) {
    const origin = { x: (rand() - 0.5) * 2 * halfSize * 0.85, z: (rand() - 0.5) * 2 * halfSize * 0.85 }
    const spot = findOpenSpot(obstacles, halfSize, origin, clearance)
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

/** Cosmetic-only wander around a home point while idle — never touches the
 *  critter's real x/z, exactly the way a perched bird's gait offset does. */
const WANDER_RADIUS = 0.5
const WANDER_SPEED = 0.6

/**
 * The generic ground-critter renderer: steps every critter's state machine
 * and drives a set of InstancedMeshes from it. A species supplies its own
 * geometry and per-instance pose (`buildParts`/`pose`) — the state machine
 * and the render loop around it are shared.
 *
 * @param homes one spot per critter (cycled if shorter than `count`) — where
 *   it idles and rests. `world/scene.ts` decides what "open" means (
 *   `findOpenSpot` for ground, `treePerches` bases for a squirrel).
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
  buildParts: (mat: THREE.Material, n: number) => THREE.InstancedMesh[],
  pose: (
    parts: THREE.InstancedMesh[],
    i: number,
    coreX: number,
    coreY: number,
    coreZ: number,
    heading: number,
    wanderPhase: number,
    time: number,
  ) => void,
  color: number,
  findFleeTarget?: (x: number, z: number) => { x: number; y: number; z: number } | null,
): CritterGroup {
  const group = new THREE.Group()
  group.name = name
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide })
  const n = Math.max(1, count)
  const parts = buildParts(mat, n)
  group.add(...parts)
  for (const p of parts) p.frustumCulled = false

  const critters: Critter[] = []
  const wanderPhases: number[] = []
  for (let i = 0; i < n; i++) {
    const home = homes.length > 0 ? homes[i % homes.length] : { x: 0, y: provider.heightAt(0, 0), z: 0 }
    critters.push({
      state: 'idle',
      stateT: rand() * 5,
      x: home.x,
      y: home.y,
      z: home.z,
      fleeHeading: 0,
      restDur: 0,
    })
    wanderPhases.push(rand() * Math.PI * 2)
  }

  let time = 0

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      for (const p of parts) p.geometry.dispose()
      mat.dispose()
      critters.length = 0
    },
    update(dt, playerX, playerZ) {
      time += dt
      for (let i = 0; i < n; i++) {
        const c = critters[i]
        stepCritter(c, dt, playerX, playerZ, species, rand, provider, findFleeTarget)

        let coreX: number, coreY: number, coreZ: number, heading: number
        if (c.state === 'flee') {
          coreX = c.x
          coreY = c.y
          coreZ = c.z
          heading = c.fleeHeading
        } else if (c.state === 'alert') {
          coreX = c.x
          coreY = c.y
          coreZ = c.z
          heading = Math.atan2(c.z - playerZ, c.x - playerX)
        } else {
          const wp = wanderPhases[i]
          const wobble = Math.sin(time * WANDER_SPEED + wp)
          coreX = c.x + Math.cos(wp) * WANDER_RADIUS * wobble
          coreZ = c.z + Math.sin(wp) * WANDER_RADIUS * wobble
          coreY = provider.heightAt(coreX, coreZ)
          heading = wp + Math.sin(time * WANDER_SPEED * 0.4 + wp) * 0.8
        }

        pose(parts, i, coreX, coreY, coreZ, heading, wanderPhases[i], time)
      }
      for (const p of parts) p.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------------------
// Species: hare and squirrel. Snake follows separately (its pose is a curve,
// not a heading — different enough to earn its own species module later).
// ---------------------------------------------------------------------------

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const pos = new THREE.Vector3()
const one = new THREE.Vector3(1, 1, 1)
const yAxis = new THREE.Vector3(0, 1, 0)
const off = new THREE.Vector3()

function bodyGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(1, 0)
  geo.scale(sx, sy, sz)
  return geo
}

function earGeometry(len: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.08, len, 5)
}

const HARE_SPECIES: CritterSpecies = {
  fleeRadius: 9,
  alertDur: 0.3,
  fleeSpeed: 6.5,
  fleeDur: 2.5,
  restMin: 6,
  restMax: 16,
}

/**
 * A hare: long body, long ears laid back, a small tail nub. Ground-only —
 * no flee target, it just bolts away from the player in a straight line.
 */
export function createHares(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
): CritterGroup {
  return createCritterGroup(
    scene,
    'hares',
    rand,
    count,
    HARE_SPECIES,
    provider,
    homes,
    (mat, n) => {
      const body = new THREE.InstancedMesh(bodyGeometry(0.5, 0.28, 0.32), mat, n)
      const earL = new THREE.InstancedMesh(earGeometry(0.6), mat, n)
      const earR = new THREE.InstancedMesh(earGeometry(0.6), mat, n)
      return [body, earL, earR]
    },
    ([body, earL, earR], i, x, y, z, heading) => {
      q.setFromAxisAngle(yAxis, heading)
      pos.set(x, y + 0.3, z)
      m.compose(pos, q, one)
      body.setMatrixAt(i, m)

      off.set(0.35, 0.35, 0.08).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + 0.3 + off.y, z + off.z)
      m.compose(pos, q, one)
      earL.setMatrixAt(i, m)

      off.set(0.35, 0.35, -0.08).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + 0.3 + off.y, z + off.z)
      m.compose(pos, q, one)
      earR.setMatrixAt(i, m)
    },
    0x9a8468, // sandy grey-brown fur
  )
}

const SQUIRREL_SPECIES: CritterSpecies = {
  fleeRadius: 7,
  alertDur: 0.3,
  fleeSpeed: 5.5,
  fleeDur: 2,
  restMin: 8,
  restMax: 20,
}

/**
 * A squirrel: smaller body, short ears, one bushy tail arched up over the
 * back. Flees to the nearest tree perch when one is close enough, else
 * bolts across the ground like a hare.
 */
export function createSquirrels(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
  perches: HomeSpot[],
  perchSearchRadius = 20,
): CritterGroup {
  return createCritterGroup(
    scene,
    'squirrels',
    rand,
    count,
    SQUIRREL_SPECIES,
    provider,
    homes,
    (mat, n) => {
      const body = new THREE.InstancedMesh(bodyGeometry(0.4, 0.24, 0.26), mat, n)
      const earL = new THREE.InstancedMesh(earGeometry(0.22), mat, n)
      const earR = new THREE.InstancedMesh(earGeometry(0.22), mat, n)
      const tail = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.42, 6), mat, n)
      return [body, earL, earR, tail]
    },
    ([body, earL, earR, tail], i, x, y, z, heading) => {
      q.setFromAxisAngle(yAxis, heading)
      pos.set(x, y + 0.24, z)
      m.compose(pos, q, one)
      body.setMatrixAt(i, m)

      off.set(0.28, 0.24, 0.07).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + 0.24 + off.y, z + off.z)
      m.compose(pos, q, one)
      earL.setMatrixAt(i, m)

      off.set(0.28, 0.24, -0.07).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + 0.24 + off.y, z + off.z)
      m.compose(pos, q, one)
      earR.setMatrixAt(i, m)

      // The tail arches up and back over the body — a fixed local offset and
      // tilt, carried along by heading the same way a bird's own tail is.
      off.set(-0.3, 0.42, 0).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + 0.24 + off.y, z + off.z)
      const qTail = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.3))
      m.compose(pos, qTail, one)
      tail.setMatrixAt(i, m)
    },
    0xa8542e, // rust-red fur
    (x, z) => nearestPoint(x, z, perches, perchSearchRadius),
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
}

/** Head to tail, metres — each bead a touch slimmer than the last. */
const SNAKE_RADII = [0.09, 0.08, 0.07, 0.055, 0.04]
const SNAKE_SPACING = 0.22
const SNAKE_UNDULATE_SPEED = 3.5
const SNAKE_UNDULATE_AMPLITUDE = 0.11
const SNAKE_PHASE_STEP = 1.1

/**
 * A snake: a beaded chain of shrinking segments behind the head, with a
 * standing sine wave along its length running in time — a cheap slither that
 * needs no path history, just the head's own current position and heading,
 * unlike a hare or squirrel's single-body pose. No flee target: it doesn't
 * climb or bolt, it just creeps (SNAKE_SPECIES's low fleeSpeed) away in a
 * straight line, same as a hare with the numbers turned down.
 */
export function createSnakes(
  scene: THREE.Scene,
  rand: () => number,
  count: number,
  provider: ElevationProvider,
  homes: HomeSpot[],
): CritterGroup {
  return createCritterGroup(
    scene,
    'snakes',
    rand,
    count,
    SNAKE_SPECIES,
    provider,
    homes,
    (mat, n) => SNAKE_RADII.map((r) => new THREE.InstancedMesh(new THREE.IcosahedronGeometry(r, 0), mat, n)),
    (parts, i, x, _y, z, heading, _wanderPhase, time) => {
      for (let k = 0; k < parts.length; k++) {
        // Each bead trails straight back from the head along `heading`, with
        // a side-to-side wiggle that grows toward the tail (a real snake's
        // head tracks nearly straight; the whip is in the back half) and
        // runs with time rather than distance travelled, so it animates even
        // while the snake is otherwise still.
        const back = -k * SNAKE_SPACING
        const wiggle =
          Math.sin(time * SNAKE_UNDULATE_SPEED - k * SNAKE_PHASE_STEP) *
          SNAKE_UNDULATE_AMPLITUDE *
          (k / (parts.length - 1))
        off.set(back, 0, wiggle).applyAxisAngle(yAxis, heading)
        const sx = x + off.x
        const sz = z + off.z
        const sy = provider.heightAt(sx, sz) + SNAKE_RADII[k] * 0.6
        q.setFromAxisAngle(yAxis, heading)
        pos.set(sx, sy, sz)
        m.compose(pos, q, one)
        parts[k].setMatrixAt(i, m)
      }
    },
    0x5a6b3c, // olive-green scales
  )
}
