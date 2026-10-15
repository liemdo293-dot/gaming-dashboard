// Service Worker: App startet schnell und auch ohne Internet (Uhr läuft dann trotzdem).
const CACHE = 'gd-1.0.0';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/settings.js', 'js/spotify.js', 'js/weather.js', 'js/calendar.js', 'js/qr.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];
const FONT_CACHE = 'gd-fonts';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Schriften: einmal laden, dann aus dem Speicher
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Eigene Dateien: erst Netz (für Updates), sonst Speicher
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !url.search) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const c = await caches.open(CACHE);
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return c.match('index.html');
        throw new Error('offline');
      }
    })());
  }
  // Alles andere (Spotify, Wetter, Kalender) geht direkt ins Netz.
});
