const CACHE_PREFIX = 'fundroom-offline-';
const CACHE_NAME = `${CACHE_PREFIX}6`;
const OFFLINE_PAGE = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_PAGE, '/install.css', '/brand.css', '/assets/signature-mark.svg', '/icon-192.png', '/offline.mjs', '/i18n.mjs'];
const ROOT_PAGES = new Set(['/', '/index.html']);

function offlineRequest(path) {
  return new Request(new URL(path, self.location.origin), { credentials: 'omit', cache: 'reload', redirect: 'error' });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(OFFLINE_ASSETS.map(offlineRequest));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldVersions = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    await Promise.all(oldVersions.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function fallback(path) {
  const cache = await caches.open(CACHE_NAME);
  return await cache.match(new URL(path, self.location.origin)) ?? Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && ROOT_PAGES.has(url.pathname)) {
    event.respondWith(fetch(request).catch(() => fallback(OFFLINE_PAGE)));
  } else if (url.search === '' && OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => fallback(url.pathname)));
  }
});
