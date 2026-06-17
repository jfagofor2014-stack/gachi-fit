const CACHE = 'gachi-fit-v3';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js', 'js/lib/insights.js',
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'js/views/body.js', 'js/views/more.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached))
  );
});
