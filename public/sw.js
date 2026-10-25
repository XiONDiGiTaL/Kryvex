/* Kryvex Web service worker.
 *
 * The shell is a hash-routed single page, so a navigation only needs `./` and
 * the hashed assets it references. Hashed files are cached the first time they
 * load; a navigation goes to the network first so a new release is picked up,
 * and falls back to the cached shell when the device is offline.
 */
const CACHE = 'kryvex-web-0.9.0-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

/**
 * The document names hashed bundles, so they are read from the built HTML
 * rather than listed here by hand. Pre-caching them is what makes the first
 * visit usable offline; runtime caching alone would only help a second visit.
 */
async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch('./index.html', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`index answered ${response.status}`);
  await cache.put('./index.html', response.clone());
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)]
    .map(match => `./${match[1]}`)
    .filter(url => /\.(?:js|css|png|svg|webmanifest)$/.test(url));
  await cache.addAll([...new Set([...SHELL, ...assets])]);
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          void caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      hit =>
        hit ||
        fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
