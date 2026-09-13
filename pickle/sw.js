const CACHE_NAME = 'picklepulse-v25-0-0';
const ASSETS = [
  './index.html',
  './styles.css',
  './src/picklepulse-core.js',
  './src/qrcode-offline.js',
  './src/live-sync.js',
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
    event.respondWith(
      fetch(event.request).catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  if (!SHELL_PATHS.has(url.pathname)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
