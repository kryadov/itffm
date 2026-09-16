# Offline caches and update notices — implementation plan

Spec: `docs/superpowers/specs/2026-09-16-offline-caches-and-updates-design.md`.

Branch: current branch. TDD for every pure helper; IndexedDB and the service
worker are checked live in headless Chrome. One commit per task. Update
`FEATURES.md` ("Saves and offline", "Start screen") and `CHANGELOG.md` in the
same change.

## Task 1 — cache-first geocoding and elevation tiles

- New `src/util/idbCache.ts`: `idbGet<T>(db, store, key)`, `idbPut(db, store,
  key, value)`, `idbKeys(db, store)`, `idbDelete(db, store, key)` — each
  opens (creating the store on upgrade), runs one transaction, resolves
  `undefined`/no-op on any error.
- New `src/geo/geocodeCache.ts`: `geocodeKey(query)`, `geocodeCacheGet`,
  `geocodeCachePut` over DB `itffm-geocode`.
- `src/geo/geocode.ts`: read the cache first; on a network answer, store it.
- `src/terrain/terrarium.ts`: `tileKey(z, x, y)`; `pickEvictions(entries,
  cap)`; tiles stored as `{ bytes, usedAt }` in DB `itffm-terrain`; read
  cache-first, refresh `usedAt` on read; after writing, if over
  `TILE_CACHE_CAP`, evict `pickEvictions(...)`.
- Tests: `test/geo/geocodeCache.test.ts` (`geocodeKey`);
  `test/terrain/terrarium.test.ts` (`tileKey`, `pickEvictions`).
- Live: the offline rebuild in the spec's §3.

Commit: `feat: cache geocoding and elevation tiles offline, alongside the existing OSM cache`

## Task 2 — a banner when a new version has shipped

- New `src/ui/updateBanner.ts`: `createUpdateBanner(onUpdate)` → `{ show() }`
  — fixed at the bottom, "Reload" and "Later", no timeout.
- `main.ts`: on registration, remember whether a controller existed; update
  that flag on `updatefound`; on `controllerchange`, show the banner only if
  it did. `setInterval(reg.update, UPDATE_CHECK_INTERVAL_MS)` and on
  `visibilitychange` to visible. "Reload" calls `location.reload()`.
- `i18n`: the banner's strings in RU and EN.
- Live: the two-build swap in the spec's §3.

Commit: `feat: tell a long play session when a new version has shipped`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Release when the owner says
so.
