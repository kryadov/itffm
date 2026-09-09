// Offline play. No build step generates this — vite's own output filenames
// are content-hashed (assets/index-XXXX.js), so a hand-written precache list
// would drift out of date the moment it is written.
//
// A passive "cache whatever gets fetched" strategy sounds like it would solve
// that on its own, but does not: a browser does not hand a freshly-registering
// service worker control of the very page that called register() until that
// worker has finished installing and activating, so the page's own first
// batch of requests (index.html, the hashed JS itself) are already over the
// network before there is anything to intercept — `clients.claim()` in
// `activate` closes the gap for requests still in flight, but by then there
// is usually nothing left to catch. Confirmed by testing offline reload
// right after a first (online) visit: the passive version cached nothing.
//
// The fix: read index.html for its own current `<script src>`/`<link href>`
// references at install time and fetch+cache those explicitly, rather than
// waiting to see them requested. The filenames are still never hardcoded —
// this reads them from whatever the current index.html actually says.
const CACHE = 'itffm-static'

async function precache() {
  const cache = await caches.open(CACHE)
  await cache.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg'])
  const html = await (await cache.match('./index.html')).text()
  const assetUrls = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1])
  await Promise.all(
    assetUrls.map(async (url) => {
      const res = await fetch(url)
      if (res.ok) await cache.put(url, res)
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) void cache.put(event.request, res.clone())
          return res
        })
        .catch(() => cached)
      // Serve the cached copy immediately when there is one — a real visit
      // never waits on the network — while the fetch above still refreshes
      // it (a later release's precache overwrites these same URLs anyway,
      // but a page loaded straight from cache under `fetch` alone, without
      // going through install, still gets to update itself this way too).
      return cached ?? network
    }),
  )
})
