// 지도 판(map-<id>.html)의 껍데기를 만든다 — 머리 · 메뉴 · 바닥은 다른 페이지와 같게, 본문은 assets/map-<id>.mjs 가 채운다.
// 실행: node scripts/new-map-page.mjs <id>   (이미 있으면 건드리지 않는다)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byId, COURSES } from '../assets/maps-list.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
const m = byId(id);
if (!m) throw new Error('assets/maps-list.mjs 에 없는 id: ' + id);
const out = join(ROOT, `map-${id}.html`);
if (existsSync(out)) { console.log('이미 있음', out); process.exit(0); }
const lib = readFileSync(join(ROOT, 'library.html'), 'utf8').split(/\r?\n/);
const header = lib.slice(166, 191).join('\n').replace('<a class="lg on" href="library.html">', '<a class="lg" href="library.html">');
const menu = lib.slice(228, 277).join('\n');
const desc = `${COURSES[m.course]} ${m.unit} — ${m.q}`;
const html = `<!DOCTYPE html>
<!-- 통합사회 GIS 지도 · ${m.title}. 껍데기는 scripts/new-map-page.mjs 로 만들었고, 본문은 assets/map-${id}.mjs 가 그린다. -->
<html lang="ko">
<head>
    <script>addEventListener('load',function(){setTimeout(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-E1W226W5M4';document.head.appendChild(s);},1500);});</script>   <!-- 방문 통계(약 180KB)는 화면이 다 뜬 뒤에 받는다 — 첫 화면과 다투지 않게 -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-E1W226W5M4');
    </script>
    <meta charset="UTF-8">
    <script>(function(){try{var t=localStorage.getItem('geo-theme');document.documentElement.dataset.theme='dark';}catch(e){}})();</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${m.title} — 통합사회 GIS 지도</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="design-system/stratum.css">
<link rel="stylesheet" href="design-system/geo.css">
<style>
/* ${m.title} — 이 판에만 있는 것. 공용은 geo.css 「지도 실험실 공용」 */
</style>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#121815">
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
<link rel="canonical" href="https://nyuheatgis.com/map-${id}.html">
<meta property="og:title" content="${m.title} · 통합사회 GIS 지도">
<meta property="og:description" content="${m.q.replace(/"/g, '&quot;')}">
<meta property="og:url" content="https://nyuheatgis.com/map-${id}.html">
<meta property="og:type" content="website">
</head>
<body>
${header}

    <main class="wrap mk" id="mk" data-map="${id}">
      <header class="mk-head" id="mkHead"></header>
      <div id="mkBody"><p class="mk-wait">지도를 불러오는 중…</p></div>
      <footer class="mk-source" id="mkSource"></footer>
      <nav class="mk-nav" id="mkNav" aria-label="다른 지도"></nav>
    </main>

    <footer class="geo-foot" style="max-width:1180px;margin:0 auto;padding-inline:var(--pad-x)">
      <span>KGGHS 통합사회<br>Copyright 2026 TaeHyun Lee. All rights reserved.</span>
      <a class="lg" href="maps.html">← 지도 목록</a>
    </footer>

<script type="module" src="assets/map-${id}.mjs"></script>
${menu}
<script src="design-system/stratum.js"></script>
<script src="design-system/geo.js"></script>
</body>
</html>
`;
writeFileSync(out, html);
console.log('만듦', out);
