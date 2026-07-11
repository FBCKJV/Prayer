// Prayer Chain service worker — offline app shell + OneSignal web push.
// Firebase / Firestore traffic (cross-origin) is never cached; it always
// goes to the network so data stays live.

// OneSignal push support. Wrapped so that if the CDN is unreachable on an
// offline restart, the app's own caching below still works. Harmless until
// OneSignal is configured (see SETUP-NOTIFICATIONS.md).
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) { /* offline or not set up yet — ignore */ }

const CACHE = 'prayer-chain-v11';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/firebase-config.js',
  './js/notify.js',
  './js/notify-config.js',
  './js/prayer-list-seed.js',
  './manifest.json',
  './assets/logo-display.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let Firebase & CDN hit the network

  if (req.mode === 'navigate') {
    // Network-first for the page so new deploys show up promptly.
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for static assets, refreshing the cache in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
