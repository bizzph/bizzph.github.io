const CACHE_NAME = 'picklepulse-v32-0-0';
const ASSETS = [
  './index.html',
  './styles.css?v=32',
  './src/picklepulse-core.js?v=32',
  './src/qrcode-offline.js?v=32',
  './src/live-sync.js?v=32',
  './manifest.webmanifest',
  './assets/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

const SHELL_PATHS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).pathname));
const INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(INDEX_URL)));
    return;
  }

  if (!SHELL_PATHS.has(url.pathname)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
