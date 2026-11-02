// Lumen service worker: makes the site installable and keeps it working on a weak connection.
// App files: network first (so updates show up), cache as backup. Pictures and the 3D library: cache first.
// The API (seats, bookings, logins) is never cached.
const VERSION = 'lumen-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'layout.js', 'ui.js', 'map2d.js', 'agent.js', 'nlu.js', 'db.js', 'auth.js', 'media.js',
  'partner.js', 'console.js', 'admin.js', 'hall3d.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms));
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    throw e;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/api/')) return; // live data only
    if (req.headers.has('range')) return;       // video streaming
    if (/\/uploads\/|\/icons\/|\/img\/|nlu-model\.json$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
    return e.respondWith(networkFirst(req));
  }
  if (/cdn\.jsdelivr\.net\/npm\/three@|fonts\.(googleapis|gstatic)\.com/.test(req.url)) e.respondWith(cacheFirst(req));
});
