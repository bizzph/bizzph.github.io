'use strict';

const CACHE = 'minesweeper-hardened-v4';
const ALLOWED_PATHS = new Set([
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]);

const scopeURL = new URL(self.registration.scope);
const scopePath = scopeURL.pathname.endsWith('/') ? scopeURL.pathname : scopeURL.pathname + '/';

function relativePath(url) {
  if (url.origin !== scopeURL.origin || !url.pathname.startsWith(scopePath)) return null;
  let rel = '/' + url.pathname.slice(scopePath.length);
  if (rel === '/') return '/';
  return rel.replace(/\/+/g, '/');
}

function cacheURL(path) {
  if (path === '/') return new URL('./', self.registration.scope).href;
  return new URL('.' + path, self.registration.scope).href;
}

const PRECACHE = [...ALLOWED_PATHS].map(cacheURL);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const path = relativePath(url);

  // This PWA has no reason to fetch cross-origin or unknown resources.
  if (!path || !ALLOWED_PATHS.has(path)) {
    event.respondWith(new Response('Blocked by offline-only service worker policy.', {
      status: 403,
      headers: {'Content-Type': 'text/plain; charset=utf-8'}
    }));
    return;
  }

  event.respondWith(
    caches.match(request, {ignoreSearch: true}).then(cached => {
      if (cached) return cached;
      // Same-origin, allowlisted files only. Used for initial/update recovery.
      return fetch(request, {credentials: 'same-origin', redirect: 'error'}).then(response => {
        if (!response.ok || response.type === 'opaque') throw new Error('Invalid response');
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
