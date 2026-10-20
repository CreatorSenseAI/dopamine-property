/* Auction Empires service worker: the game is one HTML file that changes often, so pages are network-first with the last copy as the offline fallback; photos and icons are cache-first. */
const V = 'ae-v1', PAGES = 'ae-pages', ASSETS = 'ae-assets';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(PAGES).then(c => c.add('/').catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return;
  if (u.pathname.startsWith('/img/') || u.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(ASSETS).then(async c => { const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }));
    return;
  }
  if (e.request.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(PAGES).then(c => c.put('/', r.clone())); return r; }).catch(() => caches.match('/')));
  }
});
