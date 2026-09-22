import { idbGet, idbPut } from '../util/idbCache'
import type { NominatimHit } from './geocode'

const DB_NAME = 'itffm-geocode'
const STORE = 'geocode'

/**
 * The key a place name is cached under: trimmed, lowercased, internal
 * whitespace collapsed — so "Kavgolovo", " kavgolovo " and "Kavgolovo  " all
 * share one cache entry instead of three.
 */
export function geocodeKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The raw Nominatim answer is what gets cached, not the picked-out lat/lon —
 * the same reasoning `geo/cache.ts` caches the raw Overpass response for: a
 * future change to `parseNominatim`'s own tiering (which hit to prefer) then
 * applies to an old cache entry too, instead of needing every cached place
 * re-geocoded to benefit from it.
 */
export async function geocodeCacheGet(query: string): Promise<NominatimHit[] | undefined> {
  return idbGet<NominatimHit[]>(DB_NAME, STORE, geocodeKey(query))
}

export async function geocodeCachePut(query: string, hits: NominatimHit[]): Promise<void> {
  return idbPut(DB_NAME, STORE, geocodeKey(query), hits)
}
