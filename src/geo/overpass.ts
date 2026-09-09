import type { BBox } from './types'
import type { OverpassResponse } from './parse'

// Public mirrors, tried in order. overpass-api.de is the busiest and the first
// to rate-limit or hit its timeout wall; the others are the fallbacks. This app
// has no backend to proxy through, so resilience comes from asking the next
// server.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Server-side execution budget, seconds. */
const TIMEOUT_S = 60

/**
 * Client-side ceiling per mirror. `fetch` has no timeout of its own, so a
 * request a busy Overpass queues would hang until the browser's own ~5-minute
 * wall. We give up well before that and fail over.
 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Everything a wood is made of, as one query.
 *
 * Unlike a city a wood is light — a few dozen polygons and some paths — so it
 * does not need splitting into separate requests the way buildings did. What we
 * ask for is exactly what the ecology needs: the leaf type decides which
 * mushrooms can grow at all, water and terrain decide the moisture, and the
 * open-ground types are the other biomes we will grow into. The hut/shelter/
 * tower tags are the one deliberate exception to "no buildings" — see
 * `geo/types.ts`'s `WorldData` doc comment.
 */
export function forestQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way["natural"="wood"](${box});
  relation["natural"="wood"](${box});
  way["landuse"="forest"](${box});
  relation["landuse"="forest"](${box});
  way["natural"~"scrub|grassland|heath"](${box});
  way["landuse"~"meadow|grass"](${box});
  way["leisure"~"park|nature_reserve"](${box});
  way["natural"~"sand|beach|dune"](${box});
  way["natural"="wetland"](${box});
  relation["natural"="wetland"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["waterway"~"river|stream"](${box});
  way["highway"~"path|footway|track|bridleway|cycleway"](${box});
  node["natural"="tree"](${box});
  node["natural"="cave_entrance"](${box});
  node["man_made"~"adit|mineshaft"](${box});
  node["tourism"="wilderness_hut"](${box});
  way["tourism"="wilderness_hut"](${box});
  node["amenity"="shelter"](${box});
  way["amenity"="shelter"](${box});
  way["building"="hut"](${box});
  node["man_made"="tower"](${box});
  way["man_made"="tower"](${box});
);
out body;
>;
out skel qt;`
}

/**
 * Runs one Overpass query, trying each mirror until one answers cleanly.
 *
 * A timed-out response is a failure even though it arrives HTTP 200: Overpass
 * reports a server-side timeout in a `remark` field, not in the status code,
 * and the body that comes with it is partial or empty. Cached as-is it would
 * strand the wood half-built for good, so we throw and let the next mirror try.
 */
export async function fetchOsm(bbox: BBox, signal?: AbortSignal): Promise<OverpassResponse> {
  const query = forestQuery(bbox)
  let lastErr: unknown

  for (const url of OVERPASS_ENDPOINTS) {
    // Abort a mirror that hangs — queued behind a busy server — so we fail over
    // rather than waiting on the browser's own wall. An outer signal (the player
    // pressing Cancel) aborts it too, and is not retried against.
    const ctrl = new AbortController()
    const onOuterAbort = (): void => ctrl.abort()
    if (signal) {
      if (signal.aborted) ctrl.abort()
      else signal.addEventListener('abort', onOuterAbort)
    }
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass error ${res.status}`)
      const json = (await res.json()) as OverpassResponse & { remark?: string }
      if (json.remark && /timed out|out of memory/i.test(json.remark)) {
        throw new Error(`Overpass incomplete: ${json.remark}`)
      }
      return json
    } catch (e) {
      lastErr = e
      if (signal?.aborted) throw e // the player cancelled — do not try more mirrors
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Overpass request failed')
}
