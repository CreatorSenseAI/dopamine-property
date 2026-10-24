/* Auction Empires service worker (v2). The game is one HTML file that changes often, so the page is network-first with the last copy as the
   offline fallback; photos, icons, 3D models, sounds and CDN libraries (three.js) are cache-first so the game, 3D street included, works offline
   after the first load. Uses Workbox 7.3 from jsDelivr; if that can't load, the hand-written handlers at the bottom do the same job. */
const V = 'v3', PAGES = 'ae-pages-' + V, ASSETS = 'ae-assets-' + V, MEDIA = 'ae-media-' + V, LIBS = 'ae-libs-' + V, META = 'ae-meta-' + V;
const KEEP = [PAGES, ASSETS, MEDIA, LIBS, META], WB = '7.3.0', DAY = 86400;
const CDN = ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'];
const skip = u => u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin') || u.pathname === '/ws';
/* v68: '/' is the marketing site and the game lives at /play. The game page is stored under '/play', so /play, /?app=…, /?src=reddit and
   /index.html share one offline copy; every other page (site, privacy, terms) keeps its own */
const GAME_Q = /[?&](app|src|debug|mkt|reg|night|3d|q|wn|tune|join|ref|gfx|lot)(=|&|$)/;
const isGame = u => u.pathname === '/play' || u.pathname === '/index.html' || (u.pathname === '/' && GAME_Q.test(u.search));
const pageKey = u => isGame(u) ? '/play' : u.pathname;
const isPage = (req, u) => req.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('.html');

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(PAGES).then(c => c.add('/play').catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ae-') && !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

let wb = null;
try {
  importScripts('https://cdn.jsdelivr.net/npm/workbox-sw@' + WB + '/build/workbox-sw.js');
  /* workbox-sw's modulePathPrefix expects every module next to workbox-sw.js, but on npm each module is its own package, so map them one by one */
  workbox.setConfig({ debug: false, modulePathCb: (name, debug) => `https://cdn.jsdelivr.net/npm/${name}@${WB}/build/${name}.${debug ? 'dev' : 'prod'}.js` });
  // modules must load now, during the worker's first run; importScripts is not allowed later
  const { registerRoute } = workbox.routing, { NetworkFirst, CacheFirst, StaleWhileRevalidate } = workbox.strategies;
  const { ExpirationPlugin } = workbox.expiration, { CacheableResponsePlugin } = workbox.cacheableResponse;
  const ok = new CacheableResponsePlugin({ statuses: [200] });
  const local = fn => ({ url, request }) => url.origin === self.location.origin && !skip(url) && fn(url, request);

  registerRoute(local((u, r) => isPage(r, u)), new NetworkFirst({ cacheName: PAGES, plugins: [ok, {
    cacheKeyWillBeUsed: async ({ request }) => pageKey(new URL(request.url)),
    handlerDidError: async ({ request }) => (await caches.match(pageKey(new URL(request.url)), { cacheName: PAGES })) || (await caches.match('/play', { cacheName: PAGES })) || Response.error(),
  }] }));
  registerRoute(local(u => u.pathname === '/img/manifest.json'), new StaleWhileRevalidate({ cacheName: META, plugins: [ok] }));
  registerRoute(local(u => u.pathname.startsWith('/img/')), new CacheFirst({ cacheName: ASSETS, plugins: [ok, new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })] }));
  registerRoute(local(u => u.pathname.startsWith('/icons/')), new CacheFirst({ cacheName: META, plugins: [ok, new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * DAY })] }));
  registerRoute(local(u => u.pathname.startsWith('/models/') || u.pathname.startsWith('/sfx/') || u.pathname.startsWith('/vendor/')), new CacheFirst({ cacheName: MEDIA, plugins: [ok, new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })] }));
  /* three.js and other libraries from the CDNs: versioned URLs, so cache-first is safe. Status 0 = opaque response from a plain <script> tag */
  registerRoute(({ url, request }) => request.method === 'GET' && CDN.includes(url.origin), new CacheFirst({ cacheName: LIBS, plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 90 * DAY, purgeOnQuotaError: true })] }));
  wb = workbox;
} catch (err) { wb = null; }

/* fallback without Workbox: the v1 handlers plus models, sounds and CDN libraries */
if (!wb) {
  const cacheFirst = (req, name, opaque) => caches.open(name).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok || (opaque && r.type === 'opaque')) c.put(req, r.clone()); return r; });
  self.addEventListener('fetch', e => {
    const req = e.request, u = new URL(req.url);
    if (req.method !== 'GET') return;
    if (u.origin !== location.origin) { if (CDN.includes(u.origin)) e.respondWith(cacheFirst(req, LIBS, true)); return; }
    if (skip(u)) return;
    if (u.pathname === '/img/manifest.json') { e.respondWith(fetch(req).then(r => { if (r.ok) caches.open(META).then(c => c.put(req, r.clone())); return r; }).catch(() => caches.match(req))); return; }
    if (u.pathname.startsWith('/img/') || u.pathname.startsWith('/icons/')) { e.respondWith(cacheFirst(req, ASSETS)); return; }
    if (u.pathname.startsWith('/models/') || u.pathname.startsWith('/sfx/') || u.pathname.startsWith('/vendor/')) { e.respondWith(cacheFirst(req, MEDIA)); return; }
    if (isPage(req, u)) { const key = pageKey(u); e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(PAGES).then(c => c.put(key, copy)); } return r; }).catch(async () => (await caches.match(key)) || caches.match('/play'))); }
  });
}
