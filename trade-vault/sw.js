const BUILD = '20260921.3';
const CACHE = 'trade-vault-shell-v30';
const INDEX_PATH = `./index.html?tvbuild=${BUILD}`;
const SHELL = [
  INDEX_PATH,
  `./styles.css?v=${BUILD}`,
  `./app.js?v=${BUILD}`,
  `./manifest.webmanifest?v=${BUILD}`,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const NETWORK_TIMEOUT_MS = 3500;
const INSTALL_TIMEOUT_MS = 12000;

async function fetchWithTimeout(request, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFresh(path, timeoutMs = INSTALL_TIMEOUT_MS) {
  const request = new Request(path, { cache: 'reload', credentials: 'same-origin' });
  const response = await fetchWithTimeout(request, {}, timeoutMs);
  if (!response.ok || response.type !== 'basic') throw new Error(`Could not fetch app shell resource: ${path}`);
  return { request, response };
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const resources = await Promise.all(SHELL.map(path => fetchFresh(path)));
    await Promise.all(resources.map(({ request, response }) => cache.put(request, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldShells = keys.filter(key => key.startsWith('trade-vault-shell-') && key !== CACHE);
    await Promise.all(oldShells.map(key => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();

    // On an upgrade from an older Trade Vault worker, refresh any already-open
    // window once. This is intentionally skipped on a first-time install.
    if (oldShells.length) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.map(async client => {
        try {
          const url = new URL(client.url);
          if (url.origin !== self.location.origin || url.searchParams.get('tvbuild') === BUILD) return;
          url.searchParams.set('tvbuild', BUILD);
          await client.navigate(url.href);
        } catch {}
      }));
    }
  })());
});

async function cacheResponse(cacheKey, response) {
  if (response?.ok && response.type === 'basic') {
    await caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone()));
  }
  return response;
}

async function refreshIndex(indexUrl) {
  const response = await fetchWithTimeout(indexUrl, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow'
  }, NETWORK_TIMEOUT_MS);
  if (!response.ok || response.type !== 'basic') throw new Error('Could not refresh Trade Vault index');
  await cacheResponse(indexUrl, response);
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const scope = self.registration.scope;
  const indexUrl = new URL(INDEX_PATH, scope).href;

  // Navigations are local-first. This prevents installed-PWA startup from being
  // held hostage by an ISP/Wi-Fi route that reports online but stalls the origin.
  // A fresh document is fetched in the background and cached for the next launch.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(indexUrl);
      if (cached) {
        event.waitUntil((async () => {
          try {
            const preloaded = await Promise.race([
              event.preloadResponse.catch(() => null),
              new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
            ]);
            if (preloaded?.ok && preloaded.type === 'basic') {
              await cacheResponse(indexUrl, preloaded.clone());
              return;
            }
            await refreshIndex(indexUrl);
          } catch {}
        })());
        return cached;
      }

      try {
        const preloaded = await Promise.race([
          event.preloadResponse.catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
        ]);
        if (preloaded?.ok && preloaded.type === 'basic') {
          event.waitUntil(cacheResponse(indexUrl, preloaded.clone()));
          return preloaded;
        }
      } catch {}

      try {
        return await refreshIndex(indexUrl);
      } catch {
        return new Response('Trade Vault could not load the app shell. Open it once on a working connection so the offline copy can be created.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  const shellUrls = new Set(SHELL.map(path => new URL(path, scope).href));
  if (!shellUrls.has(request.url)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetchWithTimeout(request, { cache: 'reload', credentials: 'same-origin' }, INSTALL_TIMEOUT_MS);
      return await cacheResponse(request, response);
    } catch {
      return new Response('', { status: 504, statusText: 'App shell resource unavailable' });
    }
  })());
});
