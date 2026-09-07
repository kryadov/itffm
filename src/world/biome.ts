import { pointInPolygon, boundsOf } from '../util/geometry'
import type { WorldData, OpenKind, LeafType, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'

/** How close to a cave mouth counts as being in it, metres. */
const CAVE_RADIUS = 12

/**
 * Treeline elevation by latitude, metres.
 *
 * A table rather than a formula, and rough on purpose: the real treeline turns
 * on aspect, wind and local climate, and a tidy equation here would pretend to
 * a precision the thing does not have. This only has to tell a Karelian bog
 * from an alpine meadow.
 */
const TREELINE: [lat: number, metres: number][] = [
  [0, 3900], [20, 3800], [30, 3500], [40, 2800], [46, 2100],
  [50, 1700], [55, 1200], [60, 900], [65, 600], [70, 300], [80, 0],
]

export function treelineAt(lat: number): number {
  const a = Math.min(80, Math.abs(lat))
  for (let i = 1; i < TREELINE.length; i++) {
    const [lat0, m0] = TREELINE[i - 1]
    const [lat1, m1] = TREELINE[i]
    if (a <= lat1) {
      const t = (a - lat0) / (lat1 - lat0)
      return m0 + (m1 - m0) * t
    }
  }
  return 0
}

const FOREST_BY_LEAF: Record<LeafType, Biome> = {
  needleleaved: 'forest-coniferous',
  broadleaved: 'forest-broadleaved',
  mixed: 'forest-mixed',
  // An untagged wood is a mixed wood: it is the honest default, and it lets
  // both conifer and broadleaf partners spawn rather than silently excluding half.
  unknown: 'forest-mixed',
}

const BIOME_BY_OPEN: Record<OpenKind, Biome> = {
  scrub: 'meadow-scrub',
  meadow: 'meadow-scrub',
  grassland: 'meadow-scrub',
  sand: 'dunes-coast',
  wetland: 'wetland',
  park: 'park-urban',
}

export interface BiomeMap {
  at(x: number, z: number): Biome
}

interface Region<T> {
  ring: Vec2[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  value: T
}

function toRegions<S, T>(items: S[], ring: (s: S) => Vec2[], value: (s: S) => T): Region<T>[] {
  const out: Region<T>[] = []
  for (const item of items) {
    const r = ring(item)
    const bounds = boundsOf(r)
    if (bounds) out.push({ ring: r, bounds, value: value(item) })
  }
  return out
}

function hit<T>(regions: Region<T>[], x: number, z: number): T | undefined {
  for (const r of regions) {
    const b = r.bounds
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
    if (pointInPolygon(x, z, r.ring)) return r.value
  }
  return undefined
}

/**
 * Which biome each point of the map belongs to.
 *
 * This is the one place where OpenStreetMap meets the ecology: everything the
 * spawner knows about what may grow somewhere comes through here.
 *
 * The order of resolution matters. A wood beats open ground because OSM
 * double-tags constantly — a forest inside a nature reserve carries both — and
 * of the two the trees are what the mushrooms actually care about. Altitude is
 * consulted only where no wood was mapped: a stand of spruce above our treeline
 * estimate means the estimate is wrong, not the map.
 */
export function buildBiomeMap(world: WorldData, ground: ElevationProvider, lat: number): BiomeMap {
  const woods = toRegions(world.woods, (w) => w.ring, (w) => FOREST_BY_LEAF[w.leafType])
  const open = toRegions(world.open, (o) => o.ring, (o) => BIOME_BY_OPEN[o.kind])
  const treeline = treelineAt(lat)
  const caves = world.caves
  const caveR2 = CAVE_RADIUS * CAVE_RADIUS

  return {
    at(x: number, z: number): Biome {
      for (const c of caves) {
        const dx = c.at.x - x
        const dz = c.at.z - z
        if (dx * dx + dz * dz <= caveR2) return 'cave-adit'
      }

      const wood = hit(woods, x, z)
      if (wood) return wood

      const openHere = hit(open, x, z)
      if (openHere) return openHere

      if (ground.heightAt(x, z) > treeline) return 'alpine'

      // Unmapped ground. Half of rural OSM is blank, and calling it nothing
      // would leave those places barren; meadow is the safest real answer.
      return 'meadow-scrub'
    },
  }
}
