// Service worker for the NYC trip site.
// Strategy:
//   - App shell (HTML, icon, manifest, Leaflet) → cache on install, serve cache-first.
//   - Map tiles (CARTO / OSM) → runtime cache, stale-while-revalidate, so visited
//     areas stay viewable on subways and other dead-zones.
//   - Live APIs (the Cloudflare Worker chat + Open-Meteo) → network-only;
//     returns a small JSON error if the network is unreachable so the UI can
//     surface that gracefully instead of hanging.

// Bump this whenever a deploy needs to invalidate stale clients
// (especially iOS Safari, which otherwise keeps serving v1 indefinitely).
const VERSION = 'trip-plan-v2-20260524';
const SHELL_CACHE = VERSION + '-shell';
const TILE_CACHE = VERSION + '-tiles';

const SHELL = [
  './',
  './index.html',
  './icon.svg',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL).catch(() => {
        // If a CDN URL fails (offline first install), don't block — runtime caching will pick it up.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isMapTile(url) {
  return url.hostname.includes('basemaps.cartocdn.com')
      || url.hostname.includes('tile.openstreetmap.org');
}

function isLiveApi(url) {
  return url.hostname.endsWith('workers.dev')
      || url.hostname.endsWith('open-meteo.com')
      || url.hostname.endsWith('anthropic.com')
      || url.hostname.endsWith('services.ai.azure.com');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Live APIs — network-only. Return a synthetic offline error JSON so the
  // browser doesn't hang waiting; the chat UI already surfaces error text.
  if (isLiveApi(url)) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: { message: '오프라인 — 네트워크 연결 후 다시 시도해 주세요.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Map tiles — stale-while-revalidate against a dedicated cache.
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fresh = fetch(event.request)
            .then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; })
            .catch(() => cached);
          return cached || fresh;
        })
      )
    );
    return;
  }

  // Everything else — cache-first with network fallback. Successful GETs are
  // added to the shell cache so subsequent loads are instant + offline-ready.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
