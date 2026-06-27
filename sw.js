const CACHE = 'gachi-fit-v11';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js', 'js/lib/insights.js',
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js', 'js/lib/duration.js', 'js/lib/calendar.js', 'js/lib/localdate.js', 'js/lib/timerange.js', 'js/lib/volume.js', 'js/lib/obsidian.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'js/views/body.js', 'js/views/more.js', 'js/views/components.js', 'js/views/set-editor.js', 'js/views/calendar.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 個別に取得し、1ファイルの失敗で全体を壊さない（addAllはall-or-nothing）
      .then((c) => Promise.all(ASSETS.map((a) =>
        fetch(a, { cache: 'no-cache' }).then((res) => res.ok && c.put(a, res)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// ネットワーク優先：オンライン時は常に最新の一貫したファイルを取得し、
// 更新直後に新旧ファイルが混在して app.js のモジュール読み込みが壊れるのを防ぐ。
// オフライン時のみキャッシュにフォールバックする。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部API(Gemini等)は介入しない

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('index.html')))
  );
});
