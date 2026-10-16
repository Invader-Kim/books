// sw.js: the "service worker" that makes Lamplight work offline.
// On first visit it saves a copy of every app file on the phone. After that the
// app loads from that copy, with or without internet. Book covers are saved the
// first time they are shown. Change VERSION whenever you edit any app file so
// phones pick up the new copy. A new version installs itself straight away
// (no "Update" button needed) and the app reloads into it.

const VERSION = 'lamplight-v1.9.0';
const APP_CACHE = `${VERSION}-app`;
const COVER_CACHE = 'lamplight-covers';

const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/store.js',
  'js/ui.js',
  'js/stats.js',
  'js/lookup.js',
  'js/scanner.js',
  'js/sample.js',
  'js/celebrate.js',
  'widget/lamplight-widget.js',
  'widget/lamplight-widget-core.js',
  'vendor/html5-qrcode.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's own HTTP cache, so the new version never
  // gets saved with old copies of files mixed in
  event.waitUntil(caches.open(APP_CACHE)
    .then((c) => c.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.endsWith('-app') && k !== APP_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const COVER_HOSTS = ['covers.openlibrary.org', 'archive.org', 'books.google.com', 'books.googleusercontent.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: answer from the saved copy, fall back to the network.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
      return;
    }
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }

  // Book covers: keep a copy the first time each one loads.
  if (req.destination === 'image' && COVER_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
    event.respondWith((async () => {
      const cache = await caches.open(COVER_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
  }
  // Everything else (book lookups) goes straight to the network.
});
