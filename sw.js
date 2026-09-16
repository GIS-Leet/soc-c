/* Desk 앱 셸 오프라인 캐시.
   같은 출처의 셸 파일과 CDN 정적 자원만 다루고, 나머지(Firebase 등)는 건드리지 않는다. */
const CACHE_PREFIX = 'desk-shell-';
const CACHE = CACHE_PREFIX + 'v5';
const SHELL = [
  'desk.html',
  'assets/preview.mjs',
  'assets/session-scope.mjs',
  'material-viewer.html',
  'design-system/stratum.css',
  'design-system/geo.css',
  'design-system/stratum.js',
  'design-system/geo.js',
  'design-system/globe.js',
  'desk.webmanifest',
  'manifest.json',
  'icons/desk-icon-192.png',
  'icons/desk-icon-512.png',
  'icons/desk-apple-touch-icon.png',
  'icons/apple-touch-icon.png'
];
const CDN_HOSTS = new Set(['uicdn.toast.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com']);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin && SHELL.some(p => url.pathname === '/' + p);
  const isCDN = CDN_HOSTS.has(url.hostname);
  if (!isShell && !isCDN) return;   // Firebase·API 등은 네트워크 그대로

  // HTML 은 네트워크 먼저(업데이트 즉시 반영), 실패할 때만 캐시
  if (url.pathname.endsWith('.html')) {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        try { const res = await fetch(e.request, { cache: 'no-cache' }); if (res && res.ok) { try { await c.put(e.request, res.clone()); } catch {} } return res; }
        catch { return (await c.match(e.request)) || Response.error(); }
      })
    );
    return;
  }
  // 캐시 응답을 먼저 보내도 갱신과 저장의 이벤트 수명을 유지함.
  const cache = caches.open(CACHE);
  const hit = cache.then(c => c.match(e.request));
  const refresh = cache.then(async c => {
    const res = await fetch(e.request);
    if (res && (res.ok || res.type === 'opaque')) {
      try { await c.put(e.request, res.clone()); } catch { /* 캐시 부족은 네트워크 응답을 막지 않음. */ }
    }
    return res;
  });
  e.waitUntil(refresh.then(() => {}, () => {}));
  e.respondWith(hit.then(cached => cached || refresh.catch(() => Response.error())));
});
