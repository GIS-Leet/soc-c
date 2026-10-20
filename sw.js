/* Desk 앱 셸 오프라인 캐시.
   같은 출처의 셸 파일과 CDN 정적 자원만 다루고, 나머지(Firebase 등)는 건드리지 않는다. */
const CACHE_PREFIX = 'desk-shell-';
const CACHE = CACHE_PREFIX + 'v10';  // v10: 판 번호 없는 셸 파일은 네트워크 먼저, 판이 바뀌면 옛 판 항목 정리(2026-10-20)
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

  // HTML 과 판 번호(?v=) 없는 셸 파일은 네트워크 먼저(배포가 바로 보이게), 실패할 때만 캐시.
  // 판 번호가 붙은 파일은 내용이 바뀌면 주소도 바뀌므로 캐시를 먼저 내줘도 옛 판이 나오지 않는다.
  const versioned = url.origin === location.origin && url.searchParams.has('v');
  if (url.pathname.endsWith('.html') || (isShell && !versioned)) {
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
      if (versioned) {   // 같은 파일의 다른 판 번호 항목은 지운다 — 배포마다 캐시가 쌓이지 않게
        try { for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) await c.delete(k); } } catch { /* 정리 실패는 응답과 무관 */ }
      }
    }
    return res;
  });
  e.waitUntil(refresh.then(() => {}, () => {}));
  e.respondWith(hit.then(cached => cached || refresh.catch(() => Response.error())));
});
