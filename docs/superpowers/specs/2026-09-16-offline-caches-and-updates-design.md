# A place you built once works offline; a long session learns about updates — design

Date: 2026-09-16
Status: approved, to implement when the current batch is out.
Builds on: `geo/cache.ts` (the Overpass cache in IndexedDB, ported from
`race-the-city`), `public/sw.js` (the app shell precache), the PWA design in
`2026-09-09-touch-and-pwa-design.md`.

## 0. Why

Two gaps in "works offline", found by following one real place through the
loading pipeline: place name → **geocode** (Nominatim) → **map data**
(Overpass) → **terrain** (AWS Terrarium tiles).

- Only the middle step is cached. A place visited yesterday still asks
  Nominatim for its coordinates and AWS for its elevation tiles. With the
  network down, it fails at the first step and falls back to the demo wood —
  even though its map data sits right there in IndexedDB.
- The service worker installs a new release in the background
  (`skipWaiting()`/`clients.claim()`), but a session that never navigates
  never finds out. The player keeps an old build until they happen to reload,
  and reports bugs that are already fixed.

## 1. Decisions

### Caches

| Decision | Why |
|---|---|
| The whole pipeline becomes cache-first: geocode, Overpass, tiles | A place built once is a place that works offline, and the network is never asked twice for the same thing. |
| A small shared helper, `util/idbCache.ts` (`idbGet`, `idbPut`, `idbKeys`, `idbDelete`), one database and store per cache | Three caches with the same open/upgrade/transaction boilerplate is the moment to share it. Each keeps its own DB so clearing one never touches another. |
| Geocode results are keyed by a normalised query: `geocodeKey` — case-insensitive, trimmed, inner whitespace collapsed | "Polistovsky reserve" and " polistovsky  Reserve" are one place. Different places stay apart. |
| Elevation tiles are cached as raw bytes by `tileKey(z, x, y)`, with a last-used time | Decoding is cheap; the network is not. |
| The tile cache is **capped** (`TILE_CACHE_CAP` 1500) and evicts least-recently-used tiles past it (`pickEvictions`, pure) | A plot is a few to a couple of dozen tiles at zoom 14; 1500 keeps many places offline without a store that grows forever in a long-lived tab. Geocode answers are tiny and are not capped. |
| A cache read or write that fails is ignored, never fatal | Private browsing, a full disk or a blocked IndexedDB must degrade to "fetch every time", not to an error screen — the same honest-fallback rule as the demo wood. |

### Updates

| Decision | Why |
|---|---|
| A banner — "a new version is here", reload now or dismiss — shown once a new service worker has **taken over** (`controllerchange`) | Reloading by itself mid-walk would drop whatever the player is doing. A banner that stays until acted on (unlike a toast) means missing it costs only playing on the old build a little longer. |
| Told apart from a first visit by whether a controller already existed when the new worker started installing (`updatefound`) | A first visit also fires `controllerchange`; it must not announce an "update". |
| Poll `registration.update()` every 30 minutes (`UPDATE_CHECK_INTERVAL_MS`) and when the tab becomes visible | The browser checks for a new worker on navigation; a game tab never navigates. |

## 2. Out of scope

- Caching the species YAML or audio separately — they are in the app shell.
- Prefetching places the player has not visited.

## 3. Testing

- Pure: `geocodeKey` (case, trim, inner whitespace, different places apart);
  `tileKey` (names by z/x/y, keeps tiles apart); `pickEvictions` (nothing
  under the cap, least recently used down to the cap, input not mutated).
- IndexedDB itself is not available in the node test environment; check it
  live: build a real place online, go offline (`Network.emulateNetworkConditions`),
  reload, type the same name — it builds, with no request leaving the page.
- The banner: build twice with different versions, serve the first, load it,
  swap in the second, trigger an update check — the banner shows; a fresh
  profile's first visit shows nothing.
