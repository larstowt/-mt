// Service worker: gemmer spillet lokalt, så det kan spilles offline og installeres som app.
const CACHE = 'trampolin-v28';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/core.js', 'js/body.js', 'js/tricks.js', 'js/athlete.js', 'js/scoring.js', 'js/challenges.js', 'js/share.js',
  'js/input.js', 'js/audio.js', 'js/arenas.js', 'js/render.js', 'js/game.js', 'js/ui.js', 'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Netværk først (så nye versioner slår igennem), cache som reserve offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
