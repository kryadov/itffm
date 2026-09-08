import { mulberry32 } from '../util/rng'
import { distanceToRing } from '../util/geometry'
import type { ElevationProvider } from '../terrain/provider'
import type { Tree } from '../world/trees'
import type { Biome, Substrate, TreeGenus } from '../species/schema'
import type { Vec2 } from '../geo/types'

export interface HostRef {
  genus: TreeGenus
  /** Distance to the tree, metres. */
  distance: number
}

export interface Site {
  x: number
  z: number
  y: number
  biome: Biome
  /** Nearby trees, nearest first. */
  hosts: HostRef[]
  substrate: Substrate
  /** 0 dry, 1 wet. */
  moisture: number
}

/** How far around we look when reading the concavity, metres. */
const PROBE = 4
/** Beyond this a tree is no longer a partner. */
const HOST_RADIUS = 8
/** Beyond this a pond or stream no longer wets the ground around it, metres. */
const WATER_REACH = 12

/**
 * A site's moisture, read from the shape of the ground.
 *
 * The mean height of four neighbours minus the height here: in a hollow the
 * neighbours are higher, the difference is positive, and water collects; on a
 * rise it is the other way round. A cheap stand-in for a hydrological model,
 * and enough — the player needs a habit of reading the ground, not a number.
 */
export function moistureAt(provider: ElevationProvider, x: number, z: number): number {
  const h = provider.heightAt(x, z)
  const around =
    (provider.heightAt(x + PROBE, z) +
      provider.heightAt(x - PROBE, z) +
      provider.heightAt(x, z + PROBE) +
      provider.heightAt(x, z - PROBE)) /
    4
  const concavity = (around - h) / PROBE
  return Math.max(0, Math.min(1, 0.5 + concavity * 4))
}

/**
 * Candidate sites where a mushroom could grow.
 *
 * Each knows its own ecology: biome, nearby host genera, substrate, moisture.
 * Choosing the species is spawn.ts's job — this is only the description of a
 * place.
 *
 * @param biomeAt biome at a given point — a plain constant for a procedural
 *   wood, or a real map built from OpenStreetMap tags. Sites need not all
 *   share one biome: a real plot can cross from wood into a clearing.
 * @param deadwoodPoints where a real fallen log or stump stands (see
 *   world/deadwood.ts). Each becomes exactly one site with `substrate:
 *   'deadwood'` — a guess at "probably rotting, it's near a tree" used to
 *   grow deadwood mushrooms on bare ground with nothing under them; now they
 *   grow only where there is an actual log to grow on.
 * @param mossPoints where moss grows around a real boulder (see
 *   world/boulders.ts). Each becomes one site with `substrate: 'moss'`; the
 *   site's own measured moisture still decides whether anything moss-loving
 *   actually wants to grow there.
 * @param water outlines of ponds and streams (see world/water.ts): ground
 *   within `WATER_REACH` of one reads wetter than the terrain shape alone
 *   would say, the way a real bank does.
 */
export function buildSites(
  provider: ElevationProvider,
  trees: Tree[],
  halfSize: number,
  seed: number,
  biomeAt: (x: number, z: number) => Biome,
  count = 1200,
  deadwoodPoints: { x: number; z: number }[] = [],
  mossPoints: { x: number; z: number }[] = [],
  water: Vec2[][] = [],
): Site[] {
  const rng = mulberry32(seed)
  const sites: Site[] = []

  const hostsNear = (x: number, z: number): HostRef[] => {
    const hosts: HostRef[] = []
    for (const t of trees) {
      const d = Math.hypot(t.x - x, t.z - z)
      if (d <= HOST_RADIUS) hosts.push({ genus: t.genus, distance: d })
    }
    hosts.sort((a, b) => a.distance - b.distance)
    return hosts
  }

  const moistureNear = (x: number, z: number): number => {
    const ground = moistureAt(provider, x, z)
    let nearestWater = Infinity
    for (const ring of water) nearestWater = Math.min(nearestWater, distanceToRing(x, z, ring))
    const bankBoost = Math.max(0, 1 - nearestWater / WATER_REACH)
    return Math.max(ground, bankBoost)
  }

  const siteAt = (x: number, z: number, substrate: Substrate): Site => ({
    x,
    z,
    y: provider.heightAt(x, z),
    biome: biomeAt(x, z),
    hosts: hostsNear(x, z),
    substrate,
    moisture: moistureNear(x, z),
  })

  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize
    sites.push(siteAt(x, z, rng() < 0.3 ? 'litter' : 'soil'))
  }

  for (const p of deadwoodPoints) sites.push(siteAt(p.x, p.z, 'deadwood'))
  for (const p of mossPoints) sites.push(siteAt(p.x, p.z, 'moss'))

  return sites
}
