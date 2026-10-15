// Offline play. No build step generates this — vite's own output filenames
// are content-hashed (assets/index-XXXX.js), so a hand-written precache list
// would drift out of date the moment it is written. Instead every fresh copy
// of index.html is read for its own `<script src>`/`<link href>` references
// and those are fetched and cached (`cacheReferencedAssets`), and anything
// under assets/ that the current index.html no longer names is dropped.
//
// Strategy, per kind of request:
// - The page itself (a navigation): network first, the cache only when the
//   network fails. Serving a cached index.html first — what this worker used
//   to do — runs an index.html that names JS files from an earlier release.
//   Those are only in the cache if a normal load of that release ever went
//   through the worker; a Ctrl+F5 load bypasses it, so a player who reached
//   the last release by Ctrl+F5 got a cached index.html pointing at JS that
//   was neither cached nor still on the server: a black screen on every
//   release, curable only by another Ctrl+F5 (reported 2026-10-16).
// - assets/*: cache first. Their names are content hashes, so a cached copy
//   is never stale.
// - Everything else (audio, manifest, icon): the cached copy at once, while
//   the network refreshes it for next time.
//
// Changing this file is also what makes browsers install a new worker: they
// compare it byte for byte on every navigation.
const CACHE = 'itffm-static-v2'
const OLD_CACHES = ['itffm-static']
/** How long a navigation waits on the network before falling back to the
 *  cached page — long enough for any real connection to deliver ~1 KB of
 *  index.html, short enough that a dead one still opens the wood offline. */
const NAV_TIMEOUT_MS = 4000

function assetUrlsOf(html) {
  return [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map(
    (m) => new URL(m[1], self.registration.scope).href,
  )
}

/** Fetches whatever this index.html names under assets/ that the cache does
 *  not have yet, then forgets assets/ entries it no longer names. */
async function cacheReferencedAssets(html) {
  const cache = await caches.open(CACHE)
  const wanted = assetUrlsOf(html)
  if (wanted.length === 0) return
  await Promise.all(
    wanted.map(async (url) => {
      if (await cache.match(url)) return
      const res = await fetch(url)
      if (res.ok) await cache.put(url, res)
    }),
  )
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.includes('/assets/') && !wanted.includes(req.url)) {
      await cache.delete(req)
    }
  }
}

async function precache() {
  const cache = await caches.open(CACHE)
  await cache.addAll(['./manifest.webmanifest', './favicon.svg'])
  const res = await fetch('./', { cache: 'no-cache' })
  if (!res.ok) return
  await cache.put('./', res.clone())
  await cacheReferencedAssets(await res.text())
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all(OLD_CACHES.map((name) => caches.delete(name))).then(() => self.clients.claim()),
  )
})

/** The page: from the network (revalidating the HTTP cache, which GitHub
 *  Pages lets hold index.html for 10 minutes), from the cache only offline. */
async function navigate(event) {
  const cache = await caches.open(CACHE)
  const network = fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(
    async (res) => {
      // A redirected response cannot answer a navigation; let the browser
      // follow the redirect itself.
      if (res.redirected) return fetch(event.request)
      if (res.ok) {
        await cache.put('./', res.clone())
        event.waitUntil(
          res
            .clone()
            .text()
            .then(cacheReferencedAssets)
            .catch(() => {}),
        )
      }
      return res
    },
  )
  network.catch(() => {}) // raced below; a failure there is handled there
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS))
  try {
    const first = await Promise.race([network, timeout])
    if (first) return first
  } catch {
    // offline — fall through to the cached page
  }
  const cached = await cache.match('./')
  return cached ?? network
}

async function asset(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) void cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res.ok) void cache.put(request, res.clone())
      return res
    })
    .catch(() => cached)
  return cached ?? network
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return
  if (event.request.mode === 'navigate') event.respondWith(navigate(event))
  else if (url.pathname.includes('/assets/')) event.respondWith(asset(event.request))
  else event.respondWith(staleWhileRevalidate(event.request))
})
