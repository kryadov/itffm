import { mulberry32, randRange, hashString } from '../util/rng'
import { QUEST_ITEM_IDS, type QuestItemId } from './types'
import type { Vec2 } from '../geo/types'

/** Structurally identical to game/player.ts's Obstacle (a plain circle) —
 *  kept local, same reasoning as world/water.ts's own WaterObstacle: this
 *  stays a pure core module with no import from game/ (CLAUDE.md's layering
 *  table). */
export interface QuestObstacle {
  x: number
  z: number
  radius: number
  /** Stable identity for one scrub circle, scoped by which quest item's own
   *  detour it belongs to (`${ownerId}-scrub-${i}`) — the hatchet (see
   *  main.ts) needs to remove exactly one bush, not the whole band, and two
   *  different items' bands must never collide on the same id. */
  id: string
}

/** How far from the shelter the lost basket is placed, metres. */
const MIN_DISTANCE = 30
const MAX_DISTANCE = 45
/** How close a mapped water ring has to pass to the shelter-item line before
 *  it counts as already blocking the way — a body of water metres off to the
 *  side is not a detour, only one the straight line actually meets. */
const WATER_MARGIN = 4
const THICKET_MIN_COUNT = 8
const THICKET_MAX_COUNT = 14
const THICKET_MIN_RADIUS = 0.5
const THICKET_MAX_RADIUS = 0.8
/** How far a thicket bush can stray perpendicular to the straight line —
 *  wide enough with the circles' own radius that walking the line fails,
 *  narrow enough that the band still reads as a bounded thicket, not a wall
 *  spanning the whole plot. */
const THICKET_MAX_OFFSET = 2.2

/** Distance between two line segments, in the plane — the general case
 *  `util/geometry.ts`'s point-to-segment helpers don't cover, needed here
 *  only to test whether a water ring's own edge crosses near the shelter-
 *  item line (not just near one point of it). */
function segmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  const d1x = a2.x - a1.x
  const d1z = a2.z - a1.z
  const d2x = b2.x - b1.x
  const d2z = b2.z - b1.z

  function pointToSegment(px: number, pz: number, sx: number, sz: number, ex: number, ez: number): number {
    const dx = ex - sx
    const dz = ez - sz
    const lenSq = dx * dx + dz * dz
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * dx + (pz - sz) * dz) / lenSq))
    return Math.hypot(px - (sx + dx * t), pz - (sz + dz * t))
  }

  // Proper segment intersection would need a full cross-product test; sampling
  // the shortest of "each endpoint to the other segment" already catches
  // every case that matters here (two short, roughly-straight lines), and
  // stays simple.
  const denom = d1x * d2z - d1z * d2x
  if (Math.abs(denom) > 1e-9) {
    const t = ((b1.x - a1.x) * d2z - (b1.z - a1.z) * d2x) / denom
    const u = ((b1.x - a1.x) * d1z - (b1.z - a1.z) * d1x) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0 // they actually cross
  }

  return Math.min(
    pointToSegment(a1.x, a1.z, b1.x, b1.z, b2.x, b2.z),
    pointToSegment(a2.x, a2.z, b1.x, b1.z, b2.x, b2.z),
    pointToSegment(b1.x, b1.z, a1.x, a1.z, a2.x, a2.z),
    pointToSegment(b2.x, b2.z, a1.x, a1.z, a2.x, a2.z),
  )
}

/**
 * A band of bush-radius circles laid across the middle third of the
 * shelter-item line, offset in a noisy zig-zag perpendicular to it. Walking
 * the straight line fails — the band is wider than a player can slip past —
 * but both ends (the first and last sixth of the segment) are left clear, so
 * going around either end always works. No maze: one obstacle, one detour.
 */
export function thicketObstacles(
  seed: number,
  shelterPos: { x: number; z: number },
  item: { x: number; z: number },
  /** Which quest item this band belongs to — folded into every obstacle's
   *  own `id` so two items' bands never collide (see QuestObstacle's own
   *  doc comment). Empty for a standalone/test call with only one band. */
  ownerId = '',
): QuestObstacle[] {
  const rng = mulberry32(seed)
  const dx = item.x - shelterPos.x
  const dz = item.z - shelterPos.z
  const len = Math.hypot(dx, dz) || 1
  const dirX = dx / len
  const dirZ = dz / len
  const perpX = -dirZ
  const perpZ = dirX

  const count = Math.floor(randRange(rng, [THICKET_MIN_COUNT, THICKET_MAX_COUNT + 1]))
  const obstacles: QuestObstacle[] = []
  for (let i = 0; i < count; i++) {
    const t = 1 / 3 + (i / Math.max(1, count - 1)) * (1 / 3)
    const along = randRange(rng, [-0.5, 0.5]) // a little jitter along the line too, not just across it
    const baseX = shelterPos.x + dirX * (t * len + along)
    const baseZ = shelterPos.z + dirZ * (t * len + along)
    // A sine sweep plus per-bush jitter reads as a noisy zig-zag rather than
    // either a perfectly straight offset row or pure random scatter.
    const sweep = Math.sin(t * Math.PI * 2.5) * THICKET_MAX_OFFSET * 0.6
    const jitter = randRange(rng, [-THICKET_MAX_OFFSET * 0.4, THICKET_MAX_OFFSET * 0.4])
    const offset = sweep + jitter
    obstacles.push({
      x: baseX + perpX * offset,
      z: baseZ + perpZ * offset,
      radius: randRange(rng, [THICKET_MIN_RADIUS, THICKET_MAX_RADIUS]),
      id: `${ownerId}-scrub-${i}`,
    })
  }
  return obstacles
}

/**
 * Places the wood's one quest item ("lost basket") 30-45m from the shelter
 * in a direction picked deterministically from `seed`, and decides what
 * stands between the shelter and it: real mapped water if the straight line
 * actually meets one (in which case `game/scene.ts`'s own `waterObstacles`
 * already blocks it — this returns no extra obstacles so the two systems
 * don't double up), or a generated thicket band otherwise.
 */
export function placeQuestItem(
  seed: number,
  shelterPos: { x: number; z: number },
  water: Vec2[][],
  heightAt: (x: number, z: number) => number,
  /** Threaded through to `thicketObstacles` — see its own doc comment. */
  ownerId = '',
): { position: { x: number; y: number; z: number }; obstacles: QuestObstacle[] } {
  const rng = mulberry32(seed)
  const angle = randRange(rng, [0, Math.PI * 2])
  const distance = randRange(rng, [MIN_DISTANCE, MAX_DISTANCE])
  const x = shelterPos.x + Math.cos(angle) * distance
  const z = shelterPos.z + Math.sin(angle) * distance
  const item = { x, z }

  const waterBlocks = water.some((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      if (segmentDistance(shelterPos, item, ring[i], ring[i + 1]) <= WATER_MARGIN) return true
    }
    return false
  })

  const obstacles = waterBlocks ? [] : thicketObstacles(seed, shelterPos, item, ownerId)

  return { position: { x, y: heightAt(x, z), z }, obstacles }
}

/**
 * Places all four quest items from one world seed, each getting its own
 * derived seed (`seed + hashString(id)`, folded into 32 bits the same way
 * `mulberry32` itself already truncates its own input) so the four never
 * draw from the same random stream and never collide — same shape as
 * `world/railway.ts`'s own small fixed seed offsets, just derived from the
 * item id instead of a hand-picked integer, since there are four of them.
 */
export function placeQuestItems(
  seed: number,
  shelterPos: { x: number; z: number },
  water: Vec2[][],
  heightAt: (x: number, z: number) => number,
): Record<QuestItemId, { position: { x: number; y: number; z: number }; obstacles: QuestObstacle[] }> {
  const result = {} as Record<QuestItemId, ReturnType<typeof placeQuestItem>>
  for (const id of QUEST_ITEM_IDS) {
    const itemSeed = (seed + hashString(id)) >>> 0
    result[id] = placeQuestItem(itemSeed, shelterPos, water, heightAt, id)
  }
  return result
}
