import type { LatLon } from './types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export function nominatimUrl(query: string): string {
  // Several hits, not one: the top hit for a name is often the wrong thing,
  // and we want to look further down the list before giving up.
  return `${NOMINATIM_URL}?format=json&limit=8&q=${encodeURIComponent(query)}`
}

interface NominatimHit {
  lat: string
  lon: string
  class?: string
  type?: string
}

/**
 * Place types worth foraging in, in the order we would rather have them. This
 * is the opposite priority from a driving game's geocoder, which wants a town
 * centre: we want the wood, not the settlement next to it.
 */
const NATURAL = new Set([
  'wood', 'forest', 'nature_reserve', 'national_park', 'scrub', 'heath', 'wetland',
])
const SETTLEMENTS = new Set(['city', 'town', 'village', 'hamlet', 'suburb'])

/**
 * Nominatim ranks by importance, and its top hit for a name is regularly the
 * wrong thing to walk into. Pick in tiers instead:
 *
 *  1. a natural feature — the actual wood, reserve or park;
 *  2. a settlement, for a query that names a village rather than its wood;
 *  3. whatever came first.
 */
export function parseNominatim(json: unknown): LatLon {
  const arr = json as NominatimHit[]
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('place not found')
  const hit =
    arr.find((h) => !!h.type && NATURAL.has(h.type)) ??
    arr.find((h) => !!h.type && SETTLEMENTS.has(h.type)) ??
    arr[0]
  return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) }
}

/** Accepts "lat,lon" directly, otherwise geocodes the free-text query. */
export async function geocode(query: string): Promise<LatLon> {
  const coord = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (coord) return { lat: parseFloat(coord[1]), lon: parseFloat(coord[2]) }
  const res = await fetch(nominatimUrl(query), { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Geocoding error ${res.status}`)
  return parseNominatim(await res.json())
}
