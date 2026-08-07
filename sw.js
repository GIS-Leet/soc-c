/* Desk 앱 셸 오프라인 캐시.
   같은 출처의 셸 파일과 CDN 정적 자원만 다루고, 나머지(Firebase 등)는 건드리지 않는다. */
const CACHE = 'desk-shell-v2';
const SHELL = [
  'desk.html',
  'design-system/stratum.css',
  'design-system/geo.css',
  'design-system/globe.js',
  'desk.webmanifest',
  'manifest.json',
  'icons/desk-icon-192.png',
  'icons/desk-icon-512.png',
  'icons/desk-apple-touch-icon.png',
  'icons/apple-touch-icon.png'
];
const CDN_HOSTS = /uicdn\.toast\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(p => c.add(p))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin && SHELL.some(p => url.pathname === '/' + p);
  const isCDN = CDN_HOSTS.test(url.host);
  if (!isShell && !isCDN) return;   // Firebase·API 등은 네트워크 그대로

  // stale-while-revalidate: 캐시를 먼저 주고 뒤에서 갱신
  e.respondWith(
    caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request);
      const refresh = fetch(e.request)
        .then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone()); return res; })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
