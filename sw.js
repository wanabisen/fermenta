/* Fermenta · service worker
   ------------------------------------------------------------------
   HTML: red primero (un deploy nuevo se ve al instante; si no hay
   conexión, tira de caché).
   Todo lo demás, incluidos React y Babel que vienen de CDN: caché
   primero. Así la app abre aunque no haya cobertura en la cocina —
   y de paso no vuelve a quedarse en blanco si un CDN falla.          */

const VERSION  = 'fermenta-2026-10-23';
const SHELL    = VERSION + '-shell';
const RUNTIME  = VERSION + '-runtime';

const LOCAL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

const CDN = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
];

const isFont = (u) => u.hostname === 'fonts.gstatic.com' || u.hostname === 'fonts.googleapis.com';
const isAnalytics = (u) => /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/.test(u.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    for (const url of LOCAL) {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) {}
    }
    for (const url of CDN) {
      try { await cache.put(url, await fetch(url, { mode: 'no-cors', cache: 'reload' })); } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isAnalytics(url)) return;                       // la analítica va siempre a la red

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(SHELL);
        const hit = (await cache.match('./index.html')) || (await cache.match('./'));
        return hit || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (url.origin === self.location.origin || isFont(url) || res.type === 'opaque') {
        const cache = await caches.open(RUNTIME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
