import { mulberry32, pickWeighted } from '../util/rng'
import type { Site } from './sites'
import type { Species, Frequency, Gregarious } from '../species/schema'

export interface Placement {
  speciesId: string
  x: number
  z: number
  y: number
  rotationY: number
  /** 0 young, 1 mature. */
  age: number
  /** This specimen's own seed: its shape, size and lean. */
  seed: number
  /** Set only for a `gregarious: rings` colony: the circle its fruiting
   *  bodies share, so the wood can mark the ring itself, not just draw the
   *  mushrooms sitting on it. */
  ring?: { cx: number; cz: number; radius: number }
}

export interface SpawnContext {
  /** Month, 1..12. */
  month: number
  seed: number
  /** Days since the last rain: the longer, the drier the wood. */
  daysSinceRain: number
}

const FREQUENCY_WEIGHT: Record<Frequency, number> = {
  common: 1,
  occasional: 0.4,
  rare: 0.12,
}

/** How many fruiting bodies one colony puts up. */
const COLONY_SIZE: Record<Gregarious, [number, number]> = {
  solitary: [1, 1],
  scattered: [1, 3],
  troops: [3, 8],
  clustered: [4, 12],
  rings: [6, 14],
}

/** How tightly a colony's fruiting bodies crowd together, metres. */
const COLONY_SPREAD: Record<Gregarious, number> = {
  solitary: 0,
  scattered: 1.6,
  troops: 1.2,
  clustered: 0.35,
  rings: 2.2,
}

/** Share of sites that grow anything at all. A wood is not a carpet. */
const OCCUPANCY = 0.12

/**
 * How well this species suits this site. Zero means impossible.
 *
 * The hard conditions — season, biome, substrate, a partner tree — rule it out
 * outright. What is left becomes a weight: the closer the partner and the
 * better the moisture matches, the more often the species turns up here. The
 * player never sees this number, but it is what teaches them which tree to look
 * under and which hollow to check.
 */
export function speciesScore(species: Species, site: Site, ctx: SpawnContext): number {
  const eco = species.ecology
  if (!eco.season.includes(ctx.month)) return 0
  if (!eco.biomes.includes(site.biome)) return 0
  if (eco.substrate !== site.substrate) return 0

  let score = FREQUENCY_WEIGHT[eco.frequency]

  // A mycorrhizal species must have its partner; a saprotroph does not care.
  if (eco.mycorrhizal.length > 0) {
    const host = site.hosts.find((h) => eco.mycorrhizal.includes(h.genus))
    if (!host) return 0
    score *= 1 / (1 + host.distance * 0.35)
  }

  // Moisture: full weight inside the range, falling away fast outside it.
  const [lo, hi] = eco.moisture
  if (site.moisture < lo) score *= Math.max(0.05, 1 - (lo - site.moisture) * 4)
  else if (site.moisture > hi) score *= Math.max(0.05, 1 - (site.moisture - hi) * 4)

  // Drought hits everything alike: a week without rain and the wood empties.
  score *= 1 / (1 + Math.max(0, ctx.daysSinceRain - 1) * 0.18)

  return score
}

/**
 * Places mushrooms across the sites: first where a colony sits at all, then
 * which species forms it, then the fruiting bodies scattered around it.
 */
export function spawnMushrooms(species: Species[], sites: Site[], ctx: SpawnContext): Placement[] {
  const rng = mulberry32(ctx.seed)
  const out: Placement[] = []

  for (const site of sites) {
    if (rng() > OCCUPANCY) continue

    const chosen = pickWeighted(rng, species, (s) => speciesScore(s, site, ctx))
    if (!chosen) continue

    const [min, max] = COLONY_SIZE[chosen.ecology.gregarious]
    const spread = COLONY_SPREAD[chosen.ecology.gregarious]
    const n = min + Math.floor(rng() * (max - min + 1))

    for (let k = 0; k < n; k++) {
      const angle = rng() * Math.PI * 2
      // A fairy ring grows on a circle; everything else grows as a patch.
      const dist =
        chosen.ecology.gregarious === 'rings' ? spread * (0.85 + rng() * 0.3) : spread * Math.sqrt(rng())
      out.push({
        speciesId: chosen.id,
        x: site.x + Math.cos(angle) * dist,
        z: site.z + Math.sin(angle) * dist,
        y: site.y,
        rotationY: rng() * Math.PI * 2,
        age: 0.25 + rng() * 0.75,
        seed: Math.floor(rng() * 0xffffff),
        ring: chosen.ecology.gregarious === 'rings' ? { cx: site.x, cz: site.z, radius: spread } : undefined,
      })
    }
  }

  return out
}

/**
 * One marker per fairy-ring colony, deduplicated from its fruiting bodies —
 * the ground decal (world/fairyRing.ts) draws one circle per colony, not one
 * per mushroom sitting on it.
 */
export function fairyRingMarkers(placements: Placement[]): { x: number; z: number; radius: number }[] {
  const seen = new Map<string, { x: number; z: number; radius: number }>()
  for (const p of placements) {
    if (!p.ring) continue
    const key = `${p.ring.cx},${p.ring.cz}`
    if (!seen.has(key)) seen.set(key, { x: p.ring.cx, z: p.ring.cz, radius: p.ring.radius })
  }
  return [...seen.values()]
}
