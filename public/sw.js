/* Service Worker: hält die App-Dateien vor, damit sie auch ohne Internet startet.
   Daten (/api/...) werden nie zwischengespeichert – darum kümmert sich die Offline-Warteschlange in offline.js. */
const CACHE = 'kayron-app-v5';
const ASSETS = ['/', '/style.css', '/offline.js', '/extra.js', '/app.js', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst (damit Updates sofort ankommen), bei fehlendem/langsamem Netz aus dem Speicher
function networkFirst(request, cacheKey) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(cacheKey || request).then((r) => r || caches.match('/'));
    const timer = setTimeout(() => {
      fromCache().then((r) => { if (r && !settled) { settled = true; resolve(r); } });
    }, 4000);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(cacheKey || request, copy));
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then((r) => { if (!settled) { settled = true; resolve(r || Response.error()); } });
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, '/'));
    return;
  }
  event.respondWith(networkFirst(req));
});
