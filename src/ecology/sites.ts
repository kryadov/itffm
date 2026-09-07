import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Tree } from '../world/trees'
import type { Biome, Substrate, TreeGenus } from '../species/schema'

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
 */
export function buildSites(
  provider: ElevationProvider,
  trees: Tree[],
  halfSize: number,
  seed: number,
  biome: Biome,
  count = 1200,
): Site[] {
  const rng = mulberry32(seed)
  const sites: Site[] = []

  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * halfSize
    const z = (rng() * 2 - 1) * halfSize

    const hosts: HostRef[] = []
    for (const t of trees) {
      const d = Math.hypot(t.x - x, t.z - z)
      if (d <= HOST_RADIUS) hosts.push({ genus: t.genus, distance: d })
    }
    hosts.sort((a, b) => a.distance - b.distance)

    // Dead wood turns up where the trees are: stumps and fallen trunks. Close
    // to a bole, a share of the sites count as wood rather than soil.
    const nearTrunk = hosts.length > 0 && hosts[0].distance < 1.2
    const roll = rng()
    const substrate: Substrate = nearTrunk && roll < 0.35 ? 'deadwood' : roll < 0.5 ? 'litter' : 'soil'

    sites.push({
      x,
      z,
      y: provider.heightAt(x, z),
      biome,
      hosts,
      substrate,
      moisture: moistureAt(provider, x, z),
    })
  }

  return sites
}
