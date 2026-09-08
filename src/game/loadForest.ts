import { geocode } from '../geo/geocode'
import { bboxAround, Projector } from '../geo/project'
import { fetchOsm } from '../geo/overpass'
import { bboxKey, cacheGet, cacheGetStale, cachePut } from '../geo/cache'
import { parseWorld, type OverpassResponse } from '../geo/parse'
import { loadTerrarium } from '../terrain/terrarium'
import { griddedProvider } from '../terrain/gridded'
import { withDetail } from '../terrain/detail'
import { proceduralTerrain } from '../terrain/procedural'
import { demoForest } from '../world/demoForest'
import { placeOsmTrees } from '../world/osmTrees'
import { buildBiomeMap } from '../world/biome'
import { hashString } from '../util/rng'
import { HALF_SIZE, GROUND_SEGMENTS, type ForestSource } from './scene'
import type { WorldData, BBox } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

export type LoadStage = 'geocode' | 'osm' | 'terrain' | 'build'

/** Margin requested beyond the play area, so trees near the edge have context. */
const OSM_RADIUS = HALF_SIZE + 60
/** Fixed seed for the offline demo wood, so it is the same every time. */
const DEMO_SEED = 2026
/** The Overpass query version baked into the cache key (see cache.ts). */
const QUERY_VERSION = 'forest-v1'

/**
 * Whether this OSM answer is worth building a wood from.
 *
 * Half of rural OpenStreetMap is unmapped outright, and an answer with no wood
 * and no open ground at all gives the ecology nothing to place a single
 * mushroom by. Open ground alone — a dune, a moor — is still a real place.
 */
export function chooseFallback(world: WorldData): 'demo' | null {
  return world.woods.length === 0 && world.open.length === 0 ? 'demo' : null
}

function proceduralGround(seed: number): ElevationProvider {
  return griddedProvider(proceduralTerrain(seed), HALF_SIZE, GROUND_SEGMENTS)
}

/**
 * Real elevation for the bbox, resampled onto the ground mesh's own grid (see
 * scene.ts). Falls back to procedural terrain on its own: a tile fetch failing
 * should not throw away OSM data that loaded just fine.
 */
async function realGround(bbox: BBox, projector: Projector, seed: number): Promise<ElevationProvider> {
  try {
    const dem = await loadTerrarium(bbox, projector)
    return griddedProvider(withDetail(dem, seed), HALF_SIZE, GROUND_SEGMENTS)
  } catch {
    return proceduralGround(seed)
  }
}

async function fetchWithCache(bbox: BBox): Promise<OverpassResponse> {
  const key = bboxKey(bbox, QUERY_VERSION)
  const cached = await cacheGet(key)
  if (cached) return cached

  try {
    const response = await fetchOsm(bbox)
    void cachePut(key, response)
    return response
  } catch (e) {
    const stale = await cacheGetStale(bbox)
    if (stale) return stale
    throw e
  }
}

function buildSource(world: WorldData, ground: ElevationProvider, lat: number, seed: number): ForestSource {
  const trees = placeOsmTrees(world, ground, lat, seed + 1, HALF_SIZE)
  const biomeMap = buildBiomeMap(world, ground, lat)
  return { ground, trees, biomeAt: (x, z) => biomeMap.at(x, z) }
}

export interface LoadResult {
  source: ForestSource
  /** Set when a real query was asked for but a demo wood was shown instead. */
  fellBackTo: 'demo' | null
  /** The seed the ecology was grown with — pass straight through to createForest. */
  seed: number
}

/**
 * Loads a real wood by name, or the baked-in demo wood on any failure.
 *
 * Nothing here throws outward. Geocoding can fail, every Overpass mirror can
 * be down, the tagging at a real place can be empty — any of it — and the
 * player still ends up standing in a wood, not staring at an error.
 *
 * @param query a place name, "lat,lon", or null to go straight to the demo wood
 */
export async function loadForestData(
  query: string | null,
  onStage: (s: LoadStage) => void,
): Promise<LoadResult> {
  if (query) {
    try {
      onStage('geocode')
      const center = await geocode(query)
      const projector = new Projector(center)
      const bbox = bboxAround(center, OSM_RADIUS)
      const seed = hashString(query)

      onStage('osm')
      const world = parseWorld(await fetchWithCache(bbox), projector)
      const fellBackTo = chooseFallback(world)

      if (!fellBackTo) {
        onStage('terrain')
        const ground = await realGround(bbox, projector, seed)
        onStage('build')
        return { source: buildSource(world, ground, center.lat, seed), fellBackTo: null, seed }
      }
      // Tagging here was too sparse to build anything from. Rather than mix a
      // demo wood's invented layout with this place's real elevation, show the
      // demo wood whole — a consistent, honest substitute.
    } catch {
      // Geocoding failed, every Overpass mirror refused — the demo wood below
      // is still a real wood, and it beats a blank screen with an error.
    }
  }

  onStage('build')
  const { world, center } = demoForest()
  return {
    source: buildSource(world, proceduralGround(DEMO_SEED), center.lat, DEMO_SEED),
    fellBackTo: 'demo',
    seed: DEMO_SEED,
  }
}
