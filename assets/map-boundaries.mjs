// 동아시아 바다의 경계 — 바다 위의 선(영해 · 배타적 경제 수역 · 경계선)을 한 층씩 쌓아 보고, 두 해안 사이 거리를 직접 재 본다.
// 자료: data/maps/boundaries/boundaries.json (scripts/build-map-boundaries.py — Marine Regions(VLIZ) CC BY 4.0 · Natural Earth).
// 핵심은 「바다가 좁아 200해리가 서로 겹친다」 — 그래서 바다의 경계는 협상으로 정해야 하고, 정해지지 않은 곳이 남는다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, initPage } from './map-kit.mjs?v=affb9c7a';

const NM = 1.852; // 1해리 = 1.852 km
const LAYERS = [
  { id: 't12', n: 1, name: '영해', sub: '기선에서 12해리(약 22 km)까지' },
  { id: 'eez', n: 2, name: '배타적 경제 수역', sub: '200해리(약 370 km)까지 · 원자료의 경계' },
  { id: 'ov', n: 3, name: '200해리가 겹치는 바다', sub: '해안선에서 200해리를 다 그었을 때(계산)' },
  { id: 'sp', n: 4, name: '공동 개발 · 주장이 겹치는 수역', sub: '원자료가 따로 나눈 곳' },
];
const COUNTRY = { KR: '--s1', KP: '--s4', CN: '--s2', JP: '--s5', RU: '--s3' };
const LINE = {
  treaty: { name: '조약으로 정한 선', dash: '' },
  joint: { name: '공동 개발 구역 가장자리(조약)', dash: '' },
  median: { name: '중간선 — 원자료가 계산, 합의 아님', dash: '7 5' },
  unsettled: { name: '합의되지 않은 선(한쪽 주장)', dash: '1.5 4' },
  limit: { name: '200해리 바깥 끝', dash: '' },
  baseline: { name: '직선 기선', dash: '' },
};
const SPECIAL_KO = {
  21796: '한일 대륙붕 공동 개발 구역',
  48954: '센카쿠 열도(댜오위다오) 둘레',
  8321: '타이완 둘레',
  49003: '남중국해 섬들 둘레',
  48950: '쿠릴 열도 남부 둘레',
  64440: '말레이시아 · 싱가포르 사이',
};
// 지명 글자 — 지도 읽기를 돕는 자리(자료 아님). v: 어느 보기에서 보일지
const LABELS = [
  { t: '대한민국', lon: 127.9, lat: 36.4, k: 'land', v: 'kr ea' },
  { t: '북한', lon: 127.0, lat: 40.1, k: 'land', v: 'kr ea' },
  { t: '중국', lon: 121.3, lat: 41.6, k: 'land', v: 'kr' },
  { t: '중국', lon: 109, lat: 33, k: 'land', v: 'ea' },
  { t: '일본', lon: 133.6, lat: 35.0, k: 'land', v: 'kr' },
  { t: '일본', lon: 138.6, lat: 36.4, k: 'land', v: 'ea' },
  { t: '러시아', lon: 134, lat: 47.5, k: 'land', v: 'ea' },
  { t: '타이완', lon: 121, lat: 23.6, k: 'land', v: 'ea' },
  { t: '필리핀', lon: 122.2, lat: 12.6, k: 'land', v: 'ea' },
  { t: '베트남', lon: 106.2, lat: 20.8, k: 'land', v: 'ea' },
  { t: '말레이시아', lon: 113.4, lat: 2.6, k: 'land', v: 'ea' },
  { t: '동해', lon: 131.4, lat: 39.6, k: 'sea', v: 'kr' },
  { t: '동해', lon: 134.5, lat: 40.8, k: 'sea', v: 'ea' },
  { t: '황해', lon: 123.6, lat: 35.6, k: 'sea', v: 'kr ea' },
  { t: '동중국해', lon: 127.8, lat: 30.9, k: 'sea', v: 'kr' },
  { t: '동중국해', lon: 125.2, lat: 28.6, k: 'sea', v: 'ea' },
  { t: '남중국해', lon: 114.2, lat: 15.2, k: 'sea', v: 'ea' },
  { t: '태평양', lon: 144, lat: 26, k: 'sea', v: 'ea' },
];

const st = { on: new Set(['t12']), v: 'kr', m: [], preset: null, place: null };
let B, PROJ, svg, vb = null, anim = 0;

// ── 람베르트 정각 원추 도법(구) — scripts/build-map-boundaries.py 의 pyproj 식과 같다. 단위 km, 화면 y는 아래로 + ──
function lcc({ lat1, lat2, lat0, lon0, R }) {
  const r = (d) => (d * Math.PI) / 180;
  const f1 = r(lat1), f2 = r(lat2), f0 = r(lat0), l0 = r(lon0);
  const t = (f) => Math.tan(Math.PI / 4 + f / 2);
  const n = Math.log(Math.cos(f1) / Math.cos(f2)) / Math.log(t(f2) / t(f1));
  const F = (Math.cos(f1) * t(f1) ** n) / n;
  const rho0 = (R * F) / t(f0) ** n;
  return {
    fwd(lon, lat) {
      const rho = (R * F) / t(r(lat)) ** n, th = n * (r(lon) - l0);
      return [rho * Math.sin(th), -(rho0 - rho * Math.cos(th))];
    },
    inv(x, y) {
      const yy = -y, rho = Math.sign(n) * Math.hypot(x, rho0 - yy);
      const th = Math.atan2(x, rho0 - yy);
      const lat = 2 * Math.atan((R * F / rho) ** (1 / n)) - Math.PI / 2;
      return [((l0 + th / n) * 180) / Math.PI, (lat * 180) / Math.PI];
    },
  };
}
/** 대권 거리(km) */
function dist([lo1, la1], [lo2, la2]) {
  const r = (d) => (d * Math.PI) / 180, R = 6371.0088;
  const h = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** 대권을 따라 점을 이어 곧은 선이 아닌 실제 최단 경로로 그린다 */
function greatCircle(a, b, n = 24) {
  const r = (d) => (d * Math.PI) / 180, g = (x) => (x * 180) / Math.PI;
  const [l1, p1, l2, p2] = [r(a[0]), r(a[1]), r(b[0]), r(b[1])];
  const d = dist(a, b) / 6371.0088;
  if (d < 1e-9) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), Bc = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + Bc * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + Bc * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + Bc * Math.sin(p2);
    out.push([g(Math.atan2(y, x)), g(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

const preset = (id) => B.presets.find((p) => p.id === id);
const km = (v) => fmt(v, v < 100 ? 1 : 0);

function graticule() {
  let d = '';
  for (let lon = 95; lon <= 160; lon += 5) {
    d += 'M' + Array.from({ length: 33 }, (_, i) => PROJ.fwd(lon, -5 + i * 2).map((v) => v.toFixed(0)).join(',')).join('L');
  }
  for (let lat = 0; lat <= 55; lat += 5) {
    d += 'M' + Array.from({ length: 33 }, (_, i) => PROJ.fwd(95 + i * 2.1, lat).map((v) => v.toFixed(0)).join(',')).join('L');
  }
  return d;
}

function buildMap() {
  const ko = (c) => (c.c && COUNTRY[c.c] ? c.ko : '그 밖의 나라');
  const fillOf = (c) => (COUNTRY[c.c] ? `var(${COUNTRY[c.c]})` : 'var(--st-label-4)');
  const eez = B.eez.map((e) => `<path class="bd-eez" d="${e.d}" style="fill:${fillOf(e)}" data-name="${esc(e.ko)} 배타적 경제 수역" data-tip="${esc(`${e.ko} 배타적 경제 수역|원자료 넓이 ${fmt(e.area)} km²${e.c === 'KR' ? '|독도 둘레 영해를 포함' : ''}`)}"/>`).join('');
  const t12 = B.t12.map((t) => `<path class="bd-t12" d="${t.d}" style="fill:${fillOf(t)}" data-name="${esc(t.ko)} 영해" data-tip="${esc(`${t.ko} 영해|원자료 넓이 ${fmt(t.area)} km²`)}"/>`).join('');
  const sp = B.special.map((s) => {
    const nm = SPECIAL_KO[s.id] || s.name;
    const kind = s.kind === 'joint' ? '공동 개발 구역' : '여러 나라(쪽)의 주장이 겹치는 수역';
    return `<path class="bd-sp bd-sp--${s.kind}" d="${s.d}" style="fill:url(#bdHatch${s.kind === 'joint' ? 'X' : 'B'})" data-name="${esc(nm)} — ${kind}" data-tip="${esc(`${nm}|${kind}(원자료 분류)|${s.who.join(' · ')} · 원자료 넓이 ${fmt(s.area)} km²`)}"/>`;
  }).join('');
  const lineOf = (l) => {
    const L = LINE[l.t];
    const who = [l.a, l.b].filter(Boolean).join(' – ') || '주장이 겹치는 수역 가장자리';
    const year = l.date ? l.date.slice(0, 4) : '';
    return `<path class="bd-line bd-line--${l.t}" d="${l.d}" ${L.dash ? `stroke-dasharray="${L.dash}"` : ''} data-tip="${esc(`${L.name}|${who}${l.t === 'treaty' || l.t === 'joint' ? ` · ${year}년 협정` : ''}${l.len ? ` · 길이 ${fmt(l.len)} km` : ''}`)}"/>`;
  };
  const lines = B.lines.filter((l) => l.t !== 'baseline').map(lineOf).join('');
  const bases = B.lines.filter((l) => l.t === 'baseline').map(lineOf).join('');
  const places = B.places.map((p) => {
    const [x, y] = PROJ.fwd(p.lon, p.lat);
    const mark = p.id === 'dokdo' ? `<circle class="bd-pm" cx="${x}" cy="${y}" r="5"/>` : `<rect class="bd-pm" x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" transform="rotate(45 ${x} ${y})"/>`;
    return `<g class="bd-place" data-place="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)} 설명 보기" data-tip="${esc(`${p.name}|${p.id === 'dokdo' ? '대한민국 영토 · 섬' : '바닷속 암초 · 해양 과학 기지'}|눌러서 설명 보기`)}">${mark}<text class="bd-pl" x="${x + 9}" y="${y + 4}">${esc(p.name)}</text></g>`;
  }).join('');
  const labels = LABELS.map((l) => { const [x, y] = PROJ.fwd(l.lon, l.lat); return `<text class="bd-lab bd-lab--${l.k}" data-v="${l.v}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle">${esc(l.t)}</text>`; }).join('');
  const [x, y, w, h] = B.views[st.v];
  vb = [x, y, w, h];
  return `<svg class="bd-svg" viewBox="${vb.join(' ')}" role="img" aria-label="동아시아 바다의 영해 · 배타적 경제 수역 · 경계선 지도. 지도를 두 번 누르면 두 곳 사이 거리를 잽니다." preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id="bdHatchO" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><rect width="10" height="10" fill="transparent"/><line x1="0" y1="0" x2="0" y2="10" class="bd-hl"/></pattern>
      <pattern id="bdHatchB" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="10" class="bd-hl bd-hl--b"/></pattern>
      <pattern id="bdHatchX" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" class="bd-hl bd-hl--b"/><line x1="0" y1="0" x2="10" y2="0" class="bd-hl bd-hl--b"/></pattern>
    </defs>
    <rect class="bd-sea" x="-6000" y="-6000" width="14000" height="14000"/>
    <path class="bd-grat" d="${graticule()}"/>
    <g data-layer="eez">${eez}</g>
    <g data-layer="ov"><path class="bd-ov" d="${B.overlap.d}" style="fill:url(#bdHatchO)" data-name="200해리가 겹치는 바다(계산)" data-tip="200해리가 겹치는 바다|두 나라 이상의 해안에서 200해리 안(계산)"/><path class="bd-kr200" d="${B.kr200}" data-tip="대한민국 해안에서 200해리|해안선에서 잰 계산 선(실제 경계 아님)"/></g>
    <g data-layer="sp">${sp}</g>
    <g data-layer="t12">${t12}</g>
    <path class="bd-land" id="bdLandP" d="${B.land}"/><use href="#bdLandP" class="bd-land2"/>
    <g data-layer="t12">${bases}</g>
    <g data-layer="eez">${lines}</g>
    <path class="bd-mdl" d="${B.mdl}" data-tip="남북 경계|군사 분계선 부근 · Natural Earth 국경선"/>
    <g class="bd-labs">${labels}</g>
    <g id="bdMeasure"></g>
    <g class="bd-places">${places}</g>
  </svg>`;
}

/** 보기(viewBox) 크기에 맞춰 글자 · 무늬 · 표시를 화면 픽셀 기준으로 맞춘다 */
function scaleUi() {
  const px = svg.getBoundingClientRect().width || 800;
  const k = Math.max(vb[2] / px, vb[3] / (svg.getBoundingClientRect().height || px));
  svg.style.setProperty('--k', k);
  $$('pattern', svg).forEach((p) => { p.setAttribute('width', 7 * k); p.setAttribute('height', 7 * k); $$('line', p).forEach((l) => { if (l.getAttribute('x2') !== '0') l.setAttribute('x2', 7 * k); if (l.getAttribute('y2') !== '0') l.setAttribute('y2', 7 * k); }); });
  $$('.bd-lab', svg).forEach((t) => { t.setAttribute('font-size', (t.classList.contains('bd-lab--sea') ? 12 : 13) * k); t.style.display = t.dataset.v.includes(st.v) ? '' : 'none'; });
  $$('.bd-place', svg).forEach((g) => {
    const p = B.places.find((q) => q.id === g.dataset.place);
    const [x, y] = PROJ.fwd(p.lon, p.lat);
    const s = 1.4 * k;
    const m = g.firstElementChild;
    if (m.tagName === 'circle') m.setAttribute('r', 5 * k);
    else { m.setAttribute('x', x - 4.2 * k); m.setAttribute('y', y - 4.2 * k); m.setAttribute('width', 8.4 * k); m.setAttribute('height', 8.4 * k); }
    const t = g.lastElementChild; t.setAttribute('x', x + 8 * k); t.setAttribute('y', y + 4.5 * k); t.setAttribute('font-size', 13 * k);
    g.style.setProperty('--s', s);
  });
  drawMeasure();
}

function setView(v, animate = true) {
  st.v = v;
  const to = B.views[v].slice();
  const from = vb.slice();
  cancelAnimationFrame(anim);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduce) { vb = to; svg.setAttribute('viewBox', vb.join(' ')); scaleUi(); return; }
  const t0 = performance.now(), dur = 520;
  const step = (t) => {
    const f = Math.min(1, (t - t0) / dur), e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    vb = from.map((a, i) => a + (to[i] - a) * e);
    svg.setAttribute('viewBox', vb.join(' '));
    if (f < 1) anim = requestAnimationFrame(step); else scaleUi();
  };
  anim = requestAnimationFrame(step);
}

function drawMeasure() {
  const g = $('#bdMeasure');
  if (!g) return;
  const k = parseFloat(svg.style.getPropertyValue('--k')) || 1;
  let h = '';
  if (st.m.length === 2) {
    const d = 'M' + greatCircle(st.m[0], st.m[1]).map(([lo, la]) => PROJ.fwd(lo, la).map((v) => v.toFixed(1)).join(',')).join('L');
    h += `<path class="bd-mline" d="${d}"/>`;
    const D = dist(st.m[0], st.m[1]);
    const [mx, my] = PROJ.fwd(...greatCircle(st.m[0], st.m[1], 2)[1]);
    h += `<text class="bd-mlab" x="${mx + 8 * k}" y="${my - 8 * k}" font-size="${13 * k}">${esc(km(D))} km</text>`;
  }
  st.m.forEach((p, i) => { const [x, y] = PROJ.fwd(...p); h += `<circle class="bd-mpt" cx="${x}" cy="${y}" r="${4.5 * k}"/><text class="bd-mlab" x="${x - 14 * k}" y="${y + 4 * k}" font-size="${12 * k}" text-anchor="middle">${i ? 'B' : 'A'}</text>`; });
  g.innerHTML = h;
}

/** 지도 위 한 점이 어느 수역 안에 있는지 — 그린 도형으로 판정 */
function whereIs(lonlat) {
  const [x, y] = PROJ.fwd(...lonlat);
  const pt = new DOMPoint(x, y);
  const hit = [];
  for (const sel of ['.bd-land', '.bd-t12', '.bd-eez', '.bd-ov', '.bd-sp']) {
    for (const el of $$(sel, svg)) {
      try { if (el.isPointInFill(pt)) { hit.push(sel === '.bd-land' ? '육지' : el.dataset.name); } } catch { /* 옛 브라우저 */ }
    }
  }
  return hit;
}

function sayMeasure() {
  const out = $('#bdResult');
  if (st.m.length < 2) {
    out.innerHTML = st.m.length ? '<p>한 곳을 골랐습니다. 다른 해안을 한 번 더 누르세요.</p>' : '<p>지도를 두 번 누르면 두 곳 사이를 잽니다. 아래 단추로 미리 골라 둔 곳도 잴 수 있습니다.</p>';
    return;
  }
  const D = dist(st.m[0], st.m[1]);
  const nm = D / NM;
  const p = st.preset ? preset(st.preset) : null;
  const verdict = nm < 24
    ? '24해리보다 짧습니다. 두 해안의 영해(12해리)부터 겹칩니다.'
    : nm < 400
      ? `400해리(${fmt(400 * NM)} km)보다 짧습니다. 두 해안에서 각각 200해리를 그으면 <b>${fmt(400 - nm)}해리만큼 겹칩니다</b>. 그래서 두 나라가 경계를 나눠야 합니다.`
      : '400해리보다 깁니다. 두 해안에서 각각 200해리를 그어도 겹치지 않습니다.';
  const wa = whereIs(st.m[0]), wb = whereIs(st.m[1]);
  out.innerHTML = `<p>${p ? `<b>${esc(p.label)}</b> — ` : ''}<b>${esc(km(D))} km</b> = ${fmt(nm, 1)}해리</p><p>${verdict}</p>
    <p class="bd-where">A: ${esc(wa.join(' · ') || '어느 나라 수역도 아닌 바다(공해) 또는 원자료 밖')}<br>B: ${esc(wb.join(' · ') || '어느 나라 수역도 아닌 바다(공해) 또는 원자료 밖')}</p>`;
}

const PLACE = {
  dokdo: () => {
    const u = preset('dokdo'), j = preset('dokjp');
    return `<h3>독도 — 대한민국의 섬</h3>
      <p>독도는 대한민국 영토이며, 경상북도 울릉군에 속한 섬입니다. 섬이므로 둘레 12해리가 대한민국 영해입니다. 이 지도는 독도 둘레 영해를 대한민국 영해로 칠했습니다.</p>
      <p>이 지도 자료로 재면 울릉도에서 독도까지 <b>${km(u.km)} km</b>, 독도에서 가장 가까운 일본 땅(오키 제도)까지 <b>${km(j.km)} km</b>입니다. 단추를 눌러 직접 재 보세요.</p>
      <div class="mk-tools"><button type="button" class="opt" data-preset="dokdo">울릉도 ↔ 독도 재기</button><button type="button" class="opt" data-preset="dokjp">독도 ↔ 일본 땅 재기</button></div>`;
  },
  ieodo: () => {
    const k = preset('ieokr'), c = preset('ieocn'), j = preset('ieojp');
    return `<h3>이어도 — 섬이 아닌 바닷속 암초</h3>
      <p>이어도는 가장 얕은 곳도 바닷물 아래에 잠겨 있는 암초입니다. 섬이 아니므로 영토가 될 수 없고, 영해도 갖지 않습니다. 우리나라는 이곳에 이어도 종합 해양 과학 기지를 세워(2003년 완공) 바다와 날씨를 관측합니다.</p>
      <p>이 지도 자료로 재면 이어도는 대한민국 땅(제주도)에서 <b>${km(k.km)} km</b>, 중국 땅에서 <b>${km(c.km)} km</b>, 일본 땅에서 <b>${km(j.km)} km</b> 떨어져 있습니다. 모두 200해리(${fmt(200 * NM)} km) 안이므로 이어도는 여러 나라의 200해리가 겹치는 바다에 있습니다.</p>
      <p>그래서 이어도는 영토 문제가 아니라, 한중이 배타적 경제 수역의 경계를 어디에 그을지의 문제입니다. 원자료가 계산한 중간선으로 나누면 이어도는 대한민국 쪽에 있지만, 그 선은 아직 합의된 선이 아닙니다.</p>
      <div class="mk-tools"><button type="button" class="opt" data-preset="ieokr">이어도 ↔ 제주도 재기</button><button type="button" class="opt" data-preset="ieocn">이어도 ↔ 중국 땅 재기</button></div>`;
  },
};

function draw() {
  $$('[data-layer]', svg).forEach((g) => g.classList.toggle('is-off', !st.on.has(g.dataset.layer)));
  $$('#bdLayers [data-l]').forEach((b) => b.setAttribute('aria-pressed', String(st.on.has(b.dataset.l))));
  $$('#bdViews [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.v)));
  $$('#bdPresets [data-preset], #bdPlace [data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === st.preset)));
  $$('#bdPlaces [data-place]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === st.place)));
  $$('.bd-place', svg).forEach((g) => g.classList.toggle('is-sel', g.dataset.place === st.place));
  const keys = $('#bdKeys');
  keys.innerHTML = [
    st.on.has('t12') || st.on.has('eez') ? Object.entries(COUNTRY).map(([c, v]) => `<span><i style="background:var(${v})"></i>${esc(B.eez.find((e) => e.c === c)?.ko || '')}</span>`).join('') + '<span><i style="background:var(--st-label-4)"></i>그 밖의 나라</span>' : '',
    st.on.has('t12') ? `<span><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" class="bd-line bd-line--baseline"/></svg>${LINE.baseline.name}</span>` : '',
    st.on.has('eez') ? Object.entries(LINE).filter(([t]) => t !== 'joint' && t !== 'baseline').map(([t, l]) => `<span><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" class="bd-line bd-line--${t}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''}/></svg>${esc(l.name)}</span>`).join('') : '',
    st.on.has('ov') ? '<span><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" class="bd-key-ov"/></svg>200해리가 겹치는 바다(계산)</span><span><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" class="bd-kr200"/></svg>대한민국 해안에서 200해리(계산)</span>' : '',
    st.on.has('sp') ? '<span><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" class="bd-key-b"/></svg>주장이 겹치는 수역(원자료)</span><span><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" class="bd-key-x"/></svg>공동 개발 구역(원자료)</span>' : '',
    '<span><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" class="bd-mdl"/></svg>남북 경계(군사 분계선 부근)</span>',
  ].join('');
  $('#bdPlace').innerHTML = st.place ? PLACE[st.place]() : '<p class="mk-note">지도의 <b>독도</b>(동그라미)나 <b>이어도</b>(마름모)를 누르거나, 위 단추를 눌러 보세요.</p>';
  drawMeasure();
  sayMeasure();
  const m = st.m.length === 2 && !st.preset ? st.m.flat().map((v) => v.toFixed(3)).join(',') : null;
  setParams({ l: [...st.on].map((id) => LAYERS.find((l) => l.id === id).n).sort().join('') || '0', v: st.v === 'ea' ? 'ea' : null, p: st.preset, m, pl: st.place });
}

function pickPreset(id) {
  const p = preset(id);
  if (!p) return;
  st.preset = id;
  st.m = [p.a, p.b];
  // 재는 두 곳이 지금 보기 밖이면 넓은 보기로
  const inside = (ll) => { const [x, y] = PROJ.fwd(...ll); return x > vb[0] && x < vb[0] + vb[2] && y > vb[1] && y < vb[1] + vb[3]; };
  if (!inside(p.a) || !inside(p.b)) setView('ea');
  draw();
}

export async function main() {
  await initPage('boundaries');
  B = await fetch('data/maps/boundaries/boundaries.json').then((r) => r.json());
  PROJ = lcc(B.proj);
  const q = params();
  if (/^[0-4]{1,4}$/.test(q.get('l') || '')) st.on = new Set([...q.get('l')].map((n) => LAYERS.find((l) => l.n === Number(n))?.id).filter(Boolean));
  if (q.get('v') === 'ea') st.v = 'ea';
  if (q.get('pl') && ['dokdo', 'ieodo'].includes(q.get('pl'))) st.place = q.get('pl');
  const pkey = q.get('p');
  const mm = (q.get('m') || '').split(',').map(Number);

  const s = B.stat;
  const pctOv = (100 * s.krOverlap) / s.kr200;
  const krjp = preset('krjp'), krcn = preset('krcn');
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left">
      <aside class="mk-panel bd-side" aria-label="층과 거리 재기">
        <h2>층 고르기</h2>
        <div class="bd-layers" id="bdLayers">${LAYERS.map((l) => `<button type="button" class="bd-layer" data-l="${l.id}" aria-pressed="false"><span class="bd-n">${l.n}</span><span><b>${esc(l.name)}</b><small>${esc(l.sub)}</small></span></button>`).join('')}</div>
        <div class="mk-tools"><button type="button" class="opt" id="bdNext">다음 층 더하기</button><button type="button" class="opt" id="bdReset">처음부터</button></div>
        <div class="mk-field"><span class="mk-l">보기</span><div class="mk-tools" id="bdViews"><button type="button" class="opt" data-v="kr">한반도 주변</button><button type="button" class="opt" data-v="ea">동아시아 전체</button></div></div>
        <h2>두 해안 사이 재기</h2>
        <div class="mk-why" id="bdResult" aria-live="polite"></div>
        <div class="mk-tools" id="bdPresets">${['krjp', 'krcn', 'ieocn'].map((id) => `<button type="button" class="opt" data-preset="${id}">${esc(preset(id).label)}</button>`).join('')}<button type="button" class="opt" id="bdClear">지우기</button></div>
        <div class="mk-tools"><button type="button" class="share-btn" id="bdShare">공유</button></div>
      </aside>
      <div class="bd-main">
        <figure class="mk-map mk-tiphost bd-mapbox" id="bdMap">${buildMap()}</figure>
        <div class="mk-keys bd-keys" id="bdKeys"></div>
        <section class="mk-panel bd-placebox">
          <div class="mk-tools" id="bdPlaces"><button type="button" class="opt" data-place="dokdo">독도</button><button type="button" class="opt" data-place="ieodo">이어도</button></div>
          <div class="mk-why" id="bdPlace" aria-live="polite"></div>
        </section>
      </div>
    </div>
    <div class="bd-below">
      <section class="mk-panel">
        <h2>바다의 경계를 정하는 방법</h2>
        <div class="mk-why">
          <p>바다의 선은 해안의 기준선(기선)에서 잰 거리로 긋습니다. 유엔 해양법 협약은 기선에서 12해리까지를 영해, 200해리까지를 배타적 경제 수역으로 정합니다. 1해리는 1.852 km입니다.</p>
          <p>두 나라 해안이 400해리(${fmt(400 * NM)} km)보다 가까우면 200해리가 서로 겹칩니다. 이 지도 자료로 재면 우리나라와 일본 땅 사이 가장 가까운 곳은 <b>${km(krjp.km)} km</b>, 중국 땅과는 <b>${km(krcn.km)} km</b>입니다.</p>
          <p>대한민국 해안에서 200해리를 다 그으면 그 바다(약 ${fmt(s.kr200 / 1e4)}만 km²)의 <b>${fmt(pctOv, 1)}%</b>가 중국 · 일본 · 러시아 해안의 200해리와 겹칩니다. 동아시아 바다에서는 200해리를 그대로 가질 수 있는 나라가 없고, 이웃 나라와 나눠야 합니다.</p>
          <p>나누는 방법은 협상입니다. 우리나라와 일본은 1974년 협정으로 대한 해협 쪽 대륙붕 경계(실선)와 그 남쪽의 공동 개발 구역을 정했습니다. 협상이 끝나지 않은 바다는 원자료가 두 해안에서 같은 거리인 중간선(파선)을 계산해 나눠 두었을 뿐, 나라끼리 합의한 선이 아닙니다.</p>
          <p>그래서 고기잡이처럼 당장 필요한 일은 어업 협정으로 먼저 정했습니다. 한일 어업 협정(1999년 발효)의 중간 수역과 한중 어업 협정(2001년 발효)의 잠정 조치 수역이 그것입니다. 이 두 수역은 원자료(Marine Regions)에 없어 지도에 그리지 않았습니다.</p>
        </div>
      </section>
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>1번 층만 켜고 대한 해협을 보세요. 부산과 쓰시마 사이 영해가 다른 해안보다 좁은 까닭은 무엇일까요? 두 해안 사이를 재 보세요.</li>
          <li>3번 층(200해리가 겹치는 바다)을 켜고 2번 층의 경계선과 견주어 보세요. 겹치는 바다 한가운데를 지나는 선은 어떤 종류의 선인가요?</li>
          <li>독도와 이어도는 둘 다 우리 바다에 있지만 성격이 다릅니다. 섬과 바닷속 암초는 무엇이 다르고, 그 차이가 영해에 어떤 차이를 만들까요?</li>
          <li>동아시아 전체로 넓혀 4번 층을 켜 보세요. 여러 나라의 주장이 겹치는 수역은 대개 어떤 곳(섬 · 바다의 폭)에 있나요?</li>
        </ol>
      </section>
    </div>`;
  const yrs = B.lines.filter((l) => l.t === 'treaty' && l.a === '대한민국').map((l) => l.date?.slice(0, 4));
  $('#mkSource').innerHTML = `<p><b>자료</b> Marine Regions(벨기에 플랑드르 해양 연구소 VLIZ) 해양 경계 자료 — 배타적 경제 수역 v12(2023) · 영해 v4(2023) · 해양 경계선 v12(2023), <a href="https://www.marineregions.org">marineregions.org</a>, CC BY 4.0, 2026-10-20 받음. 독도 · 이어도 좌표는 Marine Regions 지명 사전(MRGID 48935 · 33988). 육지 · 남북 경계는 Natural Earth 1:10m(퍼블릭 도메인). 협정 연도는 원자료 경계선에 붙은 문서 날짜(${esc([...new Set(yrs)].join(' · '))}).</p>
    <p><b>계산</b> 200해리가 겹치는 바다는 나라(남북은 하나로)마다 Natural Earth 해안선에서 200해리(370.4 km)를 그은 뒤 둘 이상이 겹치는 곳을 구했습니다. 실제 경계는 직선 기선에서 재므로 근삿값입니다. 거리는 두 육지 사이 가장 가까운 두 점의 대권 거리이며, 해안선 자료에 아주 작은 섬(마라도 등)이 빠져 있어 공식 거리와 몇 km 다를 수 있습니다.</p>
    <p><b>그리지 않은 것</b> 원자료는 독도 둘레 12해리를 별도 다각형으로 나눠 두었으나, 이 지도는 대한민국 영토인 독도의 영해로 합쳐 칠했습니다. 남북 사이 바다에는 합의된 경계가 없습니다. 지도의 남북 수역 색 경계는 원자료가 계산한 중간선을 따른 것이고, 선으로 긋지 않았습니다. 서해의 북방 한계선(NLL)은 정확한 좌표를 공개 자료로 확인하지 못해 그리지 않았습니다. 타이완 둘레 영해는 원자료 영해 층에 없습니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .bd-main { display: grid; gap: 12px; min-width: 0; }
    .bd-mapbox { aspect-ratio: 1 / 1; max-height: min(82vh, 820px); background: var(--map-sea); touch-action: manipulation; }
    .bd-svg { display: block; width: 100%; height: 100%; cursor: crosshair; user-select: none; -webkit-user-select: none; }
    .bd-sea { fill: var(--map-sea); }
    .bd-grat { fill: none; stroke: var(--map-line); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .bd-eez { fill-opacity: 0.32; }
    .bd-t12 { fill-opacity: 0.9; }
    .bd-land { fill: var(--st-surface-raised); stroke: var(--st-label-4); stroke-width: 0.6; vector-effect: non-scaling-stroke; pointer-events: none; }
    .bd-land2 { fill: var(--map-land); pointer-events: none; }
    .bd-hl { stroke: var(--st-label-2); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .bd-hl--b { stroke: var(--st-label); stroke-width: 1.4; }
    .bd-ov { stroke: none; }
    .bd-kr200 { fill: none; stroke: var(--st-label); stroke-width: 1.4; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
    .bd-sp { stroke: var(--st-label); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .bd-line { fill: none; stroke: var(--st-label); vector-effect: non-scaling-stroke; stroke-linecap: round; }
    .bd-line--treaty, .bd-line--joint { stroke-width: 2.2; }
    .bd-line--median { stroke-width: 1.4; stroke: var(--st-label-2); }
    .bd-line--unsettled { stroke-width: 2; stroke: var(--st-label-2); }
    .bd-line--limit { stroke-width: 0.8; stroke: var(--st-label-3); }
    .bd-line--baseline { stroke-width: 1; stroke: var(--st-label-3); }
    .bd-mdl { fill: none; stroke: var(--st-label); stroke-width: 1.6; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; }
    .is-off { display: none; }
    .bd-lab { fill: var(--st-label-2); stroke: var(--map-sea); stroke-width: 3; paint-order: stroke; font-weight: 600; pointer-events: none; vector-effect: non-scaling-stroke; letter-spacing: 0.02em; }
    .bd-lab--sea { fill: var(--st-label-3); font-weight: 500; font-style: italic; }
    .bd-place { cursor: pointer; outline: none; }
    .bd-pm { fill: var(--st-label); stroke: var(--map-sea); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .bd-place.is-sel .bd-pm, .bd-place:focus-visible .bd-pm { stroke: var(--st-accent); stroke-width: 3; }
    .bd-pl { fill: var(--st-label); stroke: var(--map-sea); stroke-width: 3; paint-order: stroke; font-weight: 700; vector-effect: non-scaling-stroke; }
    .bd-mline { fill: none; stroke: var(--st-label); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .bd-mpt { fill: var(--st-label); stroke: var(--map-sea); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .bd-mlab { fill: var(--st-label); stroke: var(--map-sea); stroke-width: 3; paint-order: stroke; font-weight: 700; vector-effect: non-scaling-stroke; pointer-events: none; }
    .bd-keys { padding: 0 4px; }
    .bd-keys svg { flex-shrink: 0; }
    .bd-key-ov { fill: url(#bdKeyO); }
    .bd-layers { display: grid; gap: 4px; }
    .bd-layer { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; text-align: left; padding: 9px 10px; border-radius: var(--st-r-element); background: transparent; color: var(--st-label-3); cursor: pointer; transition: background var(--st-dur-fast) var(--st-ease), color var(--st-dur-fast) var(--st-ease); }
    .bd-layer:hover { background: var(--st-fill-3); }
    .bd-layer[aria-pressed="true"] { background: var(--st-fill-2); color: var(--st-label); }
    .bd-layer b { display: block; font-size: 13.5px; font-weight: 700; letter-spacing: var(--track-ko); }
    .bd-layer small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--st-label-3); letter-spacing: var(--track-ko); }
    .bd-n { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--st-fill-2); font-size: 11.5px; font-weight: 700; color: var(--st-label-3); font-variant-numeric: tabular-nums; }
    .bd-layer[aria-pressed="true"] .bd-n { background: var(--st-label); color: var(--st-bedrock); }
    .bd-side h2 + .mk-why { margin-top: -4px; }
    .bd-where { font-size: 12px; line-height: 1.6; color: var(--st-label-3); }
    .bd-placebox h3 { font-size: 14px; font-weight: 700; color: var(--st-label); margin-bottom: 6px; }
    .bd-below { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
    @media (max-width: 900px) { .bd-below { grid-template-columns: 1fr; } .bd-mapbox { max-height: none; } .bd-main { order: -2; } }
  `;
  document.head.append(style);
  svg = $('#bdMap svg');
  // 범례용 무늬(화면 픽셀 고정)
  document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <pattern id="bdKeyO" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="bd-hl"/></pattern>
    <pattern id="bdKeyB" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" class="bd-hl bd-hl--b"/></pattern>
    <pattern id="bdKeyX" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="bd-hl bd-hl--b"/><line x1="0" y1="0" x2="5" y2="0" class="bd-hl bd-hl--b"/></pattern></defs></svg>`);
  const st2 = document.createElement('style');
  st2.textContent = '.bd-key-b { fill: url(#bdKeyB); stroke: var(--st-label); stroke-dasharray: 2 2; } .bd-key-x { fill: url(#bdKeyX); stroke: var(--st-label); stroke-dasharray: 2 2; } .bd-key-ov { stroke: none; }';
  document.head.append(st2);

  if (pkey && preset(pkey)) { st.preset = pkey; st.m = [preset(pkey).a, preset(pkey).b]; }
  else if (mm.length === 4 && mm.every(Number.isFinite)) st.m = [[mm[0], mm[1]], [mm[2], mm[3]]];

  const body = $('#mkBody');
  tips(body);
  // 지도 누르기 — 두 번 눌러 재기(끌기와 구분)
  let down = null;
  svg.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  svg.addEventListener('click', (e) => {
    const pl = e.target.closest('.bd-place');
    if (pl) { st.place = pl.dataset.place; draw(); return; }
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const ll = PROJ.inv(p.x, p.y).map((v) => Math.round(v * 1000) / 1000);
    st.preset = null;
    st.m = st.m.length >= 2 ? [ll] : [...st.m, ll];
    draw();
    // 터치에서는 말풍선 대신 결과 칸에 수역 이름이 나온다
  });
  svg.addEventListener('keydown', (e) => {
    const pl = e.target.closest('.bd-place');
    if (pl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.place = pl.dataset.place; draw(); }
  });
  body.addEventListener('click', (e) => {
    const l = e.target.closest('[data-l]');
    if (l) { st.on.has(l.dataset.l) ? st.on.delete(l.dataset.l) : st.on.add(l.dataset.l); draw(); return; }
    const v = e.target.closest('#bdViews [data-v]');
    if (v) { setView(v.dataset.v); draw(); return; }
    const p = e.target.closest('[data-preset]');
    if (p) { pickPreset(p.dataset.preset); return; }
    const pl = e.target.closest('#bdPlaces [data-place]');
    if (pl) { st.place = st.place === pl.dataset.place ? null : pl.dataset.place; draw(); return; }
    if (e.target.closest('#bdClear')) { st.m = []; st.preset = null; draw(); return; }
    if (e.target.closest('#bdNext')) { const nx = LAYERS.find((x) => !st.on.has(x.id)); if (nx) st.on.add(nx.id); draw(); return; }
    if (e.target.closest('#bdReset')) { st.on = new Set(['t12']); st.m = []; st.preset = null; st.place = null; setView('kr'); draw(); }
  });
  shareButton($('#bdShare'), () => location.href, () => `층: ${[...st.on].map((id) => LAYERS.find((l) => l.id === id).name).join(' · ') || '없음'}${st.m.length === 2 ? ` · 잰 거리 ${km(dist(st.m[0], st.m[1]))} km` : ''}`);
  new ResizeObserver(() => scaleUi()).observe(svg);
  scaleUi();
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
