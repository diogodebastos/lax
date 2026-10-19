// The page, kept on the phone (lax.js registers it, in the browser only: the app has its own offline page). Always from
// the Mac first; when the Mac can't answer (asleep behind the relay, 503; down behind the tunnel, 5xx or no network),
// the last copy, so a reload still shows Lax asleep as it last looked. Only the page's own files: never /api/, never
// another site's. Nothing of yours is kept here; what the page remembers is in its own storage (lax.js, lax_last).
const CACHE = 'lax-page-v1';
const PAGE = /^\/(|index\.html|lax\.js|heard\.js|body\.js|favicon\.svg|demo\/favicon\.svg)$/;

// Kept from the start, not only from the second load (the first one's files came before this worker was there).
const FILES = ['/', '/lax.js', '/heard.js', '/body.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !PAGE.test(url.pathname)) return;
  // One copy per file, whatever the query (?t=token, ?v=N): the token is never part of what's kept.
  const key = url.origin + (url.pathname === '/index.html' ? '/' : url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const r = await fetch(e.request); // the Mac answers no-store, so this is always fresh
      if (r.ok) { e.waitUntil(cache.put(key, r.clone())); return r; }
      if (r.status < 500) return r;
      return (await cache.match(key)) || r;
    } catch (err) {
      const kept = await cache.match(key);
      if (kept) return kept;
      throw err;
    }
  })());
});
