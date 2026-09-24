import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { Species } from '../species/schema'
import {
  COLONY_SIZE, COLONY_SPREAD, FREQUENCY_WEIGHT, OFF_SEASON_WEIGHT, type Placement, type SpawnContext,
} from '../ecology/spawn'
import { mulberry32, pickWeighted } from '../util/rng'
import { distanceToPolyline, pointInPolygon } from '../util/geometry'
import { classifyWater, streamSurfaceAt, waterLevel, STREAM_WIDTH } from './water'
import { SWIM_MAX_ROAM } from '../fish/swim'

/** The room a fish is offered to swim in, largest first; it gets the first
 *  whose whole circle is water (and, in a pond, within reach of the bank). */
const ROAM_STEPS = [SWIM_MAX_ROAM, 1, 0.7, 0.45, 0.25]
const ROAM_SAMPLES = 16

/**
 * Where the wood's fish are: in its ponds and streams.
 *
 * Fish used to be an ordinary species whose only condition was wet ground, so
 * they lay on the meadow (a live report, 2026-09-20: "why is the roach in the
 * forest?"). Water is not a site on the land — `ecology/spawn.ts`'s
 * `speciesScore` gives a fish zero anywhere dry — so this places them directly,
 * from the water outlines (`world/water.ts`).
 *
 * Pure and deterministic, like every generator here: one seed, one shoal.
 */

/** How far in from a pond's bank a school is centred, metres. A pond can be far
 *  wider than the player can reach from its edge (`REACH`, 3 m, and the bank
 *  itself is an obstacle), and a fish out in the middle would be visible but
 *  never takeable — so schools keep to the shallows along the shore. */
export const SHORE_BAND = 2

/** A fish sits this far above the surface level: the water is 86% opaque, and a
 *  fish centred a touch above it shows its back instead of vanishing. */
const SURFACE_LIFT = 0.012

/** How far back from a bank a player stands: the bank itself is an obstacle
 *  (`waterObstacles`, 0.6 m) and the body has a radius (0.3 m). */
const STANDING_BACK = 0.95
/** Eye height standing (`game/player.ts`'s STAND_EYE). */
const EYE_HEIGHT = 1.65
/** How far a player reaches for a find (`main.ts`'s REACH, 3 m), less a little
 *  so a fish is not on the very edge of it. */
const MAX_REACH = 2.85

/** Metres of shore (or of stream) per school. */
const POND_SHORE_PER_SCHOOL = 14
const STREAM_LENGTH_PER_SCHOOL = 12
const MAX_POND_SCHOOLS = 14
const MAX_STREAM_SCHOOLS = 14
const SPOT_ATTEMPTS = 200

const closed = (ring: Vec2[]): Vec2[] => [...ring, ring[0]]

function pathLength(line: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < line.length - 1; i++) sum += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z)
  return sum
}

interface Spot {
  x: number
  z: number
}

/** The nearest point on a pond's bank to (x, z), and how far. */
function nearestBank(ring: Vec2[], x: number, z: number): { d: number; px: number; pz: number } {
  let best = { d: Infinity, px: 0, pz: 0 }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const d = Math.hypot(x - px, z - pz)
    if (d < best.d) best = { d, px, pz }
  }
  return best
}

/**
 * Whether someone standing on the bank nearest (x, z) can reach a fish there,
 * floating at `surface`: a pond floats at its lowest bed point, so its banks can
 * stand metres above the water, and a fish that is only a metre out can still be
 * more than `REACH` away from eyes that high.
 */
function reachableFromBank(
  ring: Vec2[], ground: ElevationProvider, x: number, z: number, surface: number,
): boolean {
  const b = nearestBank(ring, x, z)
  const back = b.d > 1e-6 ? STANDING_BACK / b.d : 0
  const sx = b.px + (b.px - x) * back
  const sz = b.pz + (b.pz - z) * back
  const eye = ground.heightAt(sx, sz) + EYE_HEIGHT
  return Math.hypot(b.d + STANDING_BACK, eye - surface) <= MAX_REACH
}

/** A place inside a pond, in the shore band and within reach of the bank; null
 *  if there is none to be found (a sliver of an outline, or banks too high). */
function pondSpot(
  ring: Vec2[], rng: () => number, ground: ElevationProvider, surface: number,
): Spot | null {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
  }
  const edge = closed(ring)
  for (let i = 0; i < SPOT_ATTEMPTS; i++) {
    const x = minX + rng() * (maxX - minX)
    const z = minZ + rng() * (maxZ - minZ)
    if (!pointInPolygon(x, z, ring)) continue
    if (distanceToPolyline(x, z, edge) > SHORE_BAND) continue
    if (!reachableFromBank(ring, ground, x, z, surface)) continue
    return { x, z }
  }
  return null
}

/** A place in the channel of a stream: a point along the line (longer segments
 *  in proportion), a little off its centre line, within the water's own width. */
function streamSpot(line: Vec2[], rng: () => number): Spot | null {
  const total = pathLength(line)
  if (total <= 0) return null
  let at = rng() * total
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (at > len) { at -= len; continue }
    const t = len > 0 ? at / len : 0
    const nx = len > 0 ? -(b.z - a.z) / len : 0
    const nz = len > 0 ? (b.x - a.x) / len : 0
    const across = (rng() * 2 - 1) * (STREAM_WIDTH / 2 - 0.25)
    return { x: a.x + (b.x - a.x) * t + nx * across, z: a.z + (b.z - a.z) * t + nz * across }
  }
  const last = line[line.length - 1]
  return { x: last.x, z: last.z }
}

/** How well a fish species suits this month. Season is a steep weight, not a
 *  gate — the same rule as for everything else (`OFF_SEASON_WEIGHT`). Biome,
 *  substrate and moisture are land conditions and do not apply to water. */
function fishScore(s: Species, ctx: SpawnContext): number {
  return FREQUENCY_WEIGHT[s.ecology.frequency] * (s.ecology.season.includes(ctx.month) ? 1 : OFF_SEASON_WEIGHT)
}

/**
 * Places schools of fish across `water`: pond schools in the shallows, stream
 * schools along the channel, each fish on its water's surface.
 *
 * @param species everything loaded; only `kind: 'fish'` is used
 * @param water the wood's water outlines, local metres (`world/water.ts`)
 */
export function spawnFish(
  species: Species[],
  water: Vec2[][],
  ground: ElevationProvider,
  ctx: SpawnContext,
): Placement[] {
  const fish = species.filter((s) => s.kind === 'fish')
  if (fish.length === 0) return []
  const rng = mulberry32((ctx.seed ^ 0x51f15e) >>> 0)
  const out: Placement[] = []

  for (const ring of water) {
    if (ring.length < 3) continue
    const isStream = classifyWater(ring) === 'stream'
    const level = isStream ? 0 : waterLevel(ring, ground)
    const surfaceAt = (x: number, z: number): number =>
      (isStream ? streamSurfaceAt(ground, x, z) : level) + SURFACE_LIFT
    // A fish may swim off from its school's centre, but only within the water and
    // (in a pond) only where it can still be reached from the bank.
    const inWater = (x: number, z: number): boolean =>
      isStream
        ? distanceToPolyline(x, z, ring) <= STREAM_WIDTH / 2
        : pointInPolygon(x, z, ring) && reachableFromBank(ring, ground, x, z, level + SURFACE_LIFT)
    const schools = isStream
      ? Math.min(MAX_STREAM_SCHOOLS, Math.max(1, Math.round(pathLength(ring) / STREAM_LENGTH_PER_SCHOOL)))
      : Math.min(MAX_POND_SCHOOLS, Math.max(2, Math.round(pathLength(closed(ring)) / POND_SHORE_PER_SCHOOL)))

    for (let s = 0; s < schools; s++) {
      const centre = isStream ? streamSpot(ring, rng) : pondSpot(ring, rng, ground, level + SURFACE_LIFT)
      if (!centre) continue
      const chosen = pickWeighted(rng, fish, (f) => fishScore(f, ctx))
      if (!chosen) continue

      const [min, max] = COLONY_SIZE[chosen.ecology.gregarious]
      const spread = COLONY_SPREAD[chosen.ecology.gregarious]
      const n = min + Math.floor(rng() * (max - min + 1))
      for (let k = 0; k < n; k++) {
        // Scattered around the school's centre, but never out of the water.
        const angle = rng() * Math.PI * 2
        const dist = spread * Math.sqrt(rng())
        let x = centre.x + Math.cos(angle) * dist
        let z = centre.z + Math.sin(angle) * dist
        if (!inWater(x, z)) { x = centre.x; z = centre.z }
        const roomFor = (r: number): boolean => {
          for (let k = 0; k < ROAM_SAMPLES; k++) {
            const a = (k / ROAM_SAMPLES) * Math.PI * 2
            if (!inWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false
          }
          return true
        }
        const roam = ROAM_STEPS.find(roomFor) ?? 0
        out.push({
          speciesId: chosen.id,
          x,
          z,
          y: surfaceAt(x, z),
          rotationY: rng() * Math.PI * 2,
          age: 0.25 + rng() * 0.75,
          seed: Math.floor(rng() * 0xffffff),
          roam,
          ...(isStream ? { onStream: true } : {}),
        })
      }
    }
  }
  return out
}
