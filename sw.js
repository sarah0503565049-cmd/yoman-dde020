
const CACHE = 'torim-v3';
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/calendar.css',
  'css/forms.css',
  'css/lists.css',
  'css/cards.css',
  'css/reports.css',
  'vendor/preact-htm.js',
  'js/app.js',
  'js/boot.js',
  'js/config.js',
  'js/screens/login.js',
  'js/data/sync-storage.js',
  'js/data/remote-supabase.js',
  'js/lib/sync.js',
  'vendor/supabase.js',
  'js/router.js',
  'js/routes.js',
  'js/ui/bits.js',
  'js/ui/icons.js',
  'js/ui/hooks.js',
  'fonts/AmaticSC-Bold.ttf',
  'fonts/Assistant-400.ttf',
  'fonts/Assistant-600.ttf',
  'fonts/Assistant-700.ttf',
  'icons/icon-192.png',
  'img/clinic-chair.jpg',
  'img/logo-round.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isDatabase = (url) => /(^|\.)supabase\.(co|in)$/.test(url.hostname)
  || /^\/(auth|rest|realtime|storage|functions|graphql)\/v1(\/|$)/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (isDatabase(url)) return;   // לא נוגעים: הדפדפן שולח לרשת כרגיל, ושום דבר לא נשמר
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return shell;
        }
        return new Response('', { status: 504, statusText: 'offline' });
      }),
  );
});
