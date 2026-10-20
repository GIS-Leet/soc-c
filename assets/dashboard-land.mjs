// 도시 · 인구 변화 실험 — 「도시화와 녹지」. 여섯 도시의 토지 피복 · 건물이 들어선 해 · 여름 지표면 온도를 위성 영상 위에 겹친다.
// 자료: data/dashboard/land.json + land-<도시>.png (scripts/build-dashboard-land.py).
//   PNG 한 장에 세 겹: R = 토지 피복 무리(1~6) · G = 건물 비율이 처음 기준 이상이 된 해의 차례(1 = 1975 … 10 = 2020)
//   · B = 지표면 온도 1 + (°C − tmin) × 4 (0 = 값 없음). 경계 밖은 세 값 모두 0.
// 위성 영상: EOX Sentinel-2 cloudless 연도별(map-kit satellite) 두 해를 밀기 손잡이로 견준다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, loadLeaflet, satellite } from './map-kit.mjs?v=affb9c7a';

const YEARS = [2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const LAYERS = [
  { id: 'cover', name: '토지 피복' },
  { id: 'built', name: '건물이 들어선 해' },
  { id: 'lst', name: '여름 지표면 온도' },
  { id: 'none', name: '위성 영상만' },
];
// 토지 피복 색 — geo.css 의 자료 색(--s1~s6, 검사기로 고른 값)
const COVER_COL = { built: '--s2', tree: '--s6', crop: '--s4', grass: '--s3', water: '--s1', bare: '--db-bare' };
// 건물이 들어선 해 — 다섯 칸(밝을수록 최근). 위성 영상 위에 겹치므로 어두운 칸이 없게 파랑 단계(geo.css --kr-* 다크 · 라이트 값)의 밝은 쪽 다섯을 쓴다
const BUILT_BINS = [
  { from: 1, to: 1, label: '~1975', col: '#256abf' },
  { from: 2, to: 4, label: "'76~'90", col: '#3987e5' },
  { from: 5, to: 6, label: "'91~'00", col: '#6da7ec' },
  { from: 7, to: 8, label: "'01~'10", col: '#b7d3f6' },
  { from: 9, to: 10, label: "'11~'20", col: '#e6f2fc' },
];
// 지표면 온도 — 도시 안 칸을 온도 순서로 다섯 등분(각 20%). 파랑 = 시원한 쪽, 주황 = 뜨거운 쪽.
// 위성 영상 위에서 가운데 칸이 묻히지 않게 라이트 테마의 갈라지는 단계(geo.css --kr-p2 · p1 · mid · n1)와 --clim-temp 값을 쓴다
const LST_COLS = ['#256abf', '#9ec5f4', '#d6d8d3', '#f0b28c', '#e0603a'];

let J, L, map, satA, satB, overlay, line, root;
const st = { c: 'seoul', l: 'cover', a: 2016, b: 2025, x: 0.5, op: 80 };
const cache = {};

const city = () => J.cities.find((c) => c.id === st.c);
const group = (id) => J.groups.find((g) => g.id === id);
const pct = (v) => fmt(v * 100, 1) + '%';
const cssColor = (v) => (v.startsWith('#') ? v : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888');
const bg = (v) => (v.startsWith('#') ? v : `var(${v})`);
const hex = (h) => { const m = h.replace('#', ''); const n = parseInt(m.length === 3 ? m.replace(/./g, '$&$&') : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const kst = (utc) => { const [h, m] = utc.split(':').map(Number); const t = (h + 9) % 24; return `${t < 12 ? '오전' : '오후'} ${t > 12 ? t - 12 : t}시 ${m}분`; };
const fit = (sel, lo, hi) => Math.max(lo, Math.min(hi, Math.round($(sel)?.clientWidth || hi)));
const builtYear = (k) => (k === 1 ? '1975년에 이미' : `${J.epochs[k - 2] + 1}~${J.epochs[k - 1]}년 사이에`);

// ── PNG 풀기 ──
async function pixels(c) {
  if (cache[c.id]) return cache[c.id];
  const img = new Image();
  img.src = c.img;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  // 온도 다섯 등분의 경계(부호 값 B)
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] && d[i + 2]) { hist[d[i + 2]]++; n++; }
  const brk = [];
  for (let k = 1, acc = 0, q = 1; k < 256 && q < 5; k++) { acc += hist[k]; while (q < 5 && acc >= (n * q) / 5) { brk.push(k + 1); q++; } }
  return (cache[c.id] = { w: cv.width, h: cv.height, d, brk, painted: {} });
}

function paint(c, P, layer) {
  if (P.painted[layer]) return P.painted[layer];
  const cv = document.createElement('canvas');
  cv.width = P.w; cv.height = P.h;
  const g = cv.getContext('2d');
  const out = g.createImageData(P.w, P.h);
  const o = out.data, d = P.d;
  const coverCols = [null, ...J.groups.map((x) => hex(cssColor(COVER_COL[x.id])))];
  const builtCols = new Array(11).fill(null);
  for (const b of BUILT_BINS) for (let k = b.from; k <= b.to; k++) builtCols[k] = hex(cssColor(b.col));
  const lstCols = LST_COLS.map((x) => hex(cssColor(x)));
  const lstOf = new Array(256).fill(null);
  for (let k = 1; k < 256; k++) lstOf[k] = lstCols[P.brk.filter((x) => k >= x).length];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r === 0) { o[i + 3] = 0; continue; }
    let col = null;
    if (layer === 'cover') col = coverCols[r];
    else if (layer === 'built') col = builtCols[gg];
    else if (layer === 'lst' && b > 0) col = lstOf[b];
    if (col) { o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2]; o[i + 3] = 255; } else o[i + 3] = 0;
  }
  g.putImageData(out, 0, 0);
  return (P.painted[layer] = cv.toDataURL('image/png'));
}

// ── 지도 ──
function merc([lat, lon]) { return [(lon * Math.PI) / 180 * 6378137, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137]; }

async function drawOverlay() {
  const c = city();
  const P = await pixels(c);
  if (c.id !== st.c) return;
  if (overlay) { map.removeLayer(overlay); overlay = null; }
  if (line) map.removeLayer(line);
  line = L.polygon(c.outline, { pane: 'line', className: 'db-line', fill: false, weight: 1.6, interactive: false }).addTo(map);
  const url = paint(c, P, st.l === 'none' ? 'none' : st.l);
  overlay = L.imageOverlay(url, c.bounds, { pane: 'over', interactive: false, className: 'db-ov', opacity: st.l === 'none' ? 1 : st.op / 100 }).addTo(map);
  $('#dbMap').classList.toggle('is-over', st.l !== 'none');
  $('#dbLegend').innerHTML = legend();
}

function setYears() {
  if (satA) map.removeLayer(satA);
  if (satB) map.removeLayer(satB);
  satA = satellite(L, st.a); satA.options.pane = 'satA'; satA.options.className = 'db-sat';
  satB = satellite(L, st.b); satB.options.pane = 'satB'; satB.options.className = 'db-sat';
  satA.addTo(map); satB.addTo(map);
  satB.on('load', clipSwipe); satA.on('load', clipSwipe);
  clipSwipe();
  $('#dbYa').textContent = st.a; $('#dbYb').textContent = st.b;
}
function clipSwipe() {
  if (!satB || !map.hasLayer(satB) || !satB.getContainer()) return;
  const size = map.getSize();
  const nw = map.containerPointToLayerPoint([0, 0]);
  const se = map.containerPointToLayerPoint(size);
  const cx = nw.x + size.x * st.x;
  satB.getContainer().style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${cx}px)`;
  satA.getContainer().style.clip = `rect(${nw.y}px, ${cx}px, ${se.y}px, ${nw.x}px)`;
  const h = $('#dbSwipe');
  h.style.left = `${st.x * 100}%`;
  h.setAttribute('aria-valuenow', Math.round(st.x * 100));
  h.setAttribute('aria-valuetext', `왼쪽 ${st.a}년, 오른쪽 ${st.b}년, 경계 ${Math.round(st.x * 100)}%`);
}

/** 가리킨 칸의 값 */
function here(latlng) {
  const c = city(), P = cache[c.id];
  if (!P) return;
  const [x0, y0] = merc(c.bounds[0]), [x1, y1] = merc(c.bounds[1]);
  const [x, y] = merc([latlng.lat, latlng.lng]);
  const col = Math.floor(((x - x0) / (x1 - x0)) * P.w), row = Math.floor(((y1 - y) / (y1 - y0)) * P.h);
  const out = $('#dbHere');
  if (col < 0 || row < 0 || col >= P.w || row >= P.h || P.d[(row * P.w + col) * 4] === 0) {
    out.innerHTML = `<span>${esc(c.name)} 경계 밖입니다.</span>`;
    return;
  }
  const i = (row * P.w + col) * 4, r = P.d[i], g = P.d[i + 1], b = P.d[i + 2];
  const t = b > 0 ? c.lst.tmin + (b - 1) / 4 : null;
  out.innerHTML = `<b>${esc(J.groups[r - 1].name)}</b>
    <span>${g ? `${builtYear(g)} 건물이 들어선 칸` : `2020년까지 건물이 ${Math.round(J.built_t * 100)}% 넘게 덮지 않은 칸`}</span>
    <span>${t == null ? '지표면 온도 값 없음' : `지표면 온도 ${fmt(t, 1)}°C (도시 가운데값보다 ${t >= c.lst.median ? '+' : ''}${fmt(t - c.lst.median, 1)}°C)`}</span>`;
}

// ── 그림 · 글 ──
function legend() {
  const c = city();
  if (st.l === 'cover') return `<div class="mk-keys">${J.groups.map((g) => `<span><i style="background:var(${COVER_COL[g.id]})"></i>${esc(g.name)}</span>`).join('')}</div>
    <p class="mk-note">ESA WorldCover 2021(10m 칸)을 지도에서는 약 55m 칸으로 줄여 가장 많은 피복으로 칠했습니다.</p>`;
  if (st.l === 'built') return `<div class="db-steps">${BUILT_BINS.map((b) => `<span><i style="background:${bg(b.col)}"></i>${esc(b.label)}</span>`).join('')}</div>
    <p class="mk-note">칸(약 90m)의 ${Math.round(J.built_t * 100)}% 넘게 건물이 덮게 된 때. 비어 있는 칸은 2020년까지 그만큼 덮이지 않은 곳입니다.</p>`;
  if (st.l === 'lst') {
    const P = cache[c.id];
    const T = (k) => c.lst.tmin + (k - 1) / 4;
    const lab = P ? [`${fmt(T(P.brk[0]), 1)} 아래`, ...P.brk.slice(0, 3).map((k, i) => `${fmt(T(k), 1)}~${fmt(T(P.brk[i + 1]), 1)}`), `${fmt(T(P.brk[3]), 1)} 위`] : ['', '', '', '', ''];
    return `<div class="db-steps">${LST_COLS.map((x, i) => `<span><i style="background:${bg(x)}"></i>${lab[i]}</span>`).join('')}</div>
      <p class="mk-note">°C. 도시 안 칸을 온도 순서로 다섯 등분했습니다(칸마다 20%). ${esc(c.lst.date.replace(/-/g, '.'))} ${kst(c.lst.time_utc)}쯤 Landsat ${esc(c.lst.platform.replace('landsat-', ''))}호가 잰 땅 표면의 온도로, 공기의 온도(기온)와는 다릅니다.${c.lst.valid < 0.97 ? ` 경계의 ${fmt((1 - c.lst.valid) * 100, 0)}%는 원자료에 값이 없어 비워 두었습니다.` : ''}</p>`;
  }
  return '<p class="mk-note">겹친 자료 없이 위성 영상만 봅니다. 손잡이를 밀어 두 해를 견주어 보세요.</p>';
}

function why() {
  const c = city();
  const b0 = c.built[0], b1 = c.built.at(-1);
  const bt = c.lst.by.built, tr = c.lst.by.tree;
  return `<p>${esc(c.name)}는 2021년 땅의 <b>${pct(c.cover.built)}</b>가 시가지, <b>${pct(c.cover.tree)}</b>가 나무, ${pct(c.cover.crop)}가 농경지입니다.</p>
    <p>건물이 덮은 땅은 1975년 ${fmt(b0.km2, 1)}km²에서 2020년 <b>${fmt(b1.km2, 1)}km²</b>로 ${fmt(b1.km2 / b0.km2, 1)}배가 되었습니다.</p>
    ${bt && tr ? `<p>여름 장면에서 시가지 칸의 평균 지표면 온도는 <b>${fmt(bt.mean, 1)}°C</b>, 나무 칸은 <b>${fmt(tr.mean, 1)}°C</b>로 ${fmt(bt.mean - tr.mean, 1)}°C 차이 납니다.</p>` : ''}`;
}

function builtChart() {
  const c = city();
  const W = fit('#dbBuilt', 300, 560), H = 230, l = 44, r = 10, t = 26, b = 28;
  const max = Math.ceil(Math.max(...c.built.map((x) => x.km2)) / 20) * 20;
  const bw = (W - l - r) / c.built.length;
  const y = (v) => t + (H - t - b) * (1 - v / max);
  let g = '';
  for (let v = 0; v <= max; v += max / 4) g += `<line class="cg-grid" x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}"/><text class="cg-tick" x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  c.built.forEach((x, i) => {
    const x0 = l + i * bw + 3, h = H - b - y(x.km2);
    const tip = `${x.y}년|건물이 덮은 땅 ${fmt(x.km2, 1)}km²|${esc(c.name)} 넓이의 ${pct(x.share)}`;
    g += `<g data-tip="${esc(tip)}"><rect class="cg-hit" x="${l + i * bw}" y="${t}" width="${bw}" height="${H - t - b}"/>
      <path class="db-bar" d="M${x0},${H - b} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bw - 14} q4,0 4,4 v${Math.max(0, h - 4)} z"/></g>`;
    if (i % 2 === 0 || i === c.built.length - 1) g += `<text class="cg-tick" x="${l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${String(x.y).slice(i === 0 ? 0 : 2).replace(/^(\d\d)$/, "'$1")}</text>`;
  });
  [0, c.built.length - 1].forEach((i) => {
    const x = c.built[i];
    g += `<text class="db-val" x="${l + i * bw + bw / 2}" y="${y(x.km2) - 7}" text-anchor="middle">${fmt(x.km2, 0)}</text>`;
  });
  g += `<text class="cg-unit" x="${l - 6}" y="${t - 14}" text-anchor="end">km²</text>`;
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)} 건물이 덮은 땅 1975~2020">${g}</svg>`;
}

function lstChart() {
  const c = city();
  const rows = J.groups.map((g) => ({ ...g, v: c.lst.by[g.id] })).filter((x) => x.v).sort((a, b) => b.v.mean - a.v.mean);
  const W = fit('#dbLst', 300, 560), rowH = 30, l = 78, r = 54, t = 8, b = 26, H = t + b + rows.length * rowH;
  const lo = Math.floor(Math.min(...rows.map((x) => x.v.mean)) - 1), hi = Math.ceil(Math.max(...rows.map((x) => x.v.mean)) + 1);
  const X = (v) => l + ((v - lo) / (hi - lo)) * (W - l - r);
  let g = '';
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) g += `<line class="cg-grid" x1="${X(v)}" x2="${X(v)}" y1="${t}" y2="${H - b}"/><text class="cg-tick" x="${X(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
  g += `<line class="db-med" x1="${X(c.lst.median)}" x2="${X(c.lst.median)}" y1="${t}" y2="${H - b}"/>`;
  rows.forEach((x, i) => {
    const cy = t + i * rowH + rowH / 2;
    const tip = `${x.name}|평균 ${fmt(x.v.mean, 1)}°C|도시 가운데값보다 ${x.v.mean >= c.lst.median ? '+' : ''}${fmt(x.v.mean - c.lst.median, 1)}°C|잰 칸 ${fmt(x.v.n)}개(30m)`;
    g += `<g data-tip="${esc(tip)}"><rect class="cg-hit" x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}"/>
      <text class="db-lab" x="${l - 10}" y="${cy + 4}" text-anchor="end">${esc(x.name)}</text>
      <line class="db-stem" x1="${X(lo)}" x2="${X(x.v.mean)}" y1="${cy}" y2="${cy}"/>
      <circle class="db-dot" cx="${X(x.v.mean)}" cy="${cy}" r="6" style="fill:var(${COVER_COL[x.id]})"/>
      <text class="db-val" x="${X(x.v.mean) + 12}" y="${cy + 4}">${fmt(x.v.mean, 1)}</text></g>`;
  });
  g += `<text class="cg-unit" x="${W - r + 40}" y="${H - 8}" text-anchor="end">°C</text>`;
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)} 토지 피복별 평균 지표면 온도">${g}</svg>
    <p class="mk-note">세로 점선은 도시 전체 칸의 가운데값(${fmt(c.lst.median, 1)}°C). ${esc(c.lst.date.replace(/-/g, '.'))} 장면, 구름 · 그림자 칸은 뺐습니다.</p>`;
}

function compare() {
  const rows = J.cities.map((c) => {
    const bt = c.lst.by.built, tr = c.lst.by.tree;
    const bar = J.groups.map((g) => `<i style="flex:${c.cover[g.id]} 1 0;background:var(${COVER_COL[g.id]})"></i>`).join('');
    const tip = `${c.name}|${J.groups.map((g) => `${g.name} ${pct(c.cover[g.id])}`).join(' · ')}`;
    return `<tr data-c="${c.id}" class="${c.id === st.c ? 'is-sel' : ''}" tabindex="0">
      <th scope="row">${esc(c.name)}</th>
      <td class="db-stack" data-tip="${esc(tip)}"><span>${bar}</span></td>
      <td>${pct(c.cover.built)}</td><td>${pct(c.cover.tree)}</td>
      <td>${fmt(c.built[0].km2, 0)} → ${fmt(c.built.at(-1).km2, 0)} <small>(${fmt(c.built.at(-1).km2 / c.built[0].km2, 1)}배)</small></td>
      <td>${bt && tr ? `+${fmt(bt.mean - tr.mean, 1)}°C` : '—'} <small>${esc(c.lst.date.slice(2).replace(/-/g, '.'))}</small></td></tr>`;
  }).join('');
  return `<div class="db-tablewrap"><table class="db-table">
    <thead><tr><th scope="col">도시</th><th scope="col">토지 피복 2021</th><th scope="col">시가지</th><th scope="col">나무</th><th scope="col">건물이 덮은 땅 1975 → 2020(km²)</th><th scope="col">시가지 − 나무 온도</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="mk-keys">${J.groups.map((g) => `<span><i style="background:var(${COVER_COL[g.id]})"></i>${esc(g.name)}</span>`).join('')}</div>
    <p class="mk-note">줄을 누르면 지도가 그 도시로 옮겨 갑니다. 온도 차이는 도시마다 찍은 날이 달라(표의 날짜) 차이끼리만 견줍니다.</p>`;
}

function sync({ fly = false } = {}) {
  const c = city();
  $$('#dbCities [data-c]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === st.c)));
  $$('#dbLayers [data-l]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === st.l)));
  $('#dbLegend').innerHTML = legend();
  $('#dbOpField').hidden = st.l === 'none';
  $('#dbWhy').innerHTML = why();
  $('#dbBuiltH').textContent = `건물이 덮은 땅 — ${c.name}`;
  $('#dbBuilt').innerHTML = builtChart();
  $('#dbLstH').textContent = `토지 피복별 여름 지표면 온도 — ${c.name}`;
  $('#dbLst').innerHTML = lstChart();
  $('#dbCompare').innerHTML = compare();
  $('#dbHere').innerHTML = '<span>지도를 가리키거나 누르면 그 칸의 값을 보여 줍니다.</span>';
  if (fly) map.fitBounds(c.bounds, { padding: [10, 10] });
  drawOverlay();
  syncUrl();
}
function syncUrl() {
  if (document.body.dataset.tab && document.body.dataset.tab !== 'land') return;
  setParams({ c: st.c === 'seoul' ? null : st.c, l: st.l === 'cover' ? null : st.l, a: st.a === 2016 ? null : st.a, b: st.b === 2025 ? null : st.b });
}

export function shown() { map?.invalidateSize(); clipSwipe(); if (J) { $('#dbBuilt').innerHTML = builtChart(); $('#dbLst').innerHTML = lstChart(); } syncUrl(); }

export async function main(el) {
  root = el;
  const q = params();
  [J, L] = await Promise.all([fetch('data/dashboard/land.json').then((r) => r.json()), loadLeaflet()]);
  if (J.cities.some((c) => c.id === q.get('c'))) st.c = q.get('c');
  if (LAYERS.some((x) => x.id === q.get('l'))) st.l = q.get('l');
  if (YEARS.includes(Number(q.get('a')))) st.a = Number(q.get('a'));
  if (YEARS.includes(Number(q.get('b')))) st.b = Number(q.get('b'));
  el.innerHTML = `
    <p class="db-lead">여섯 도시의 땅을 위성 자료로 나누어 봅니다. 시가지 · 나무 · 농경지의 비율, 건물이 들어선 해, 여름 낮의 지표면 온도를 위성 영상 위에 겹칩니다.</p>
    <div class="mk-stage mk-stage--left">
      <figure class="mk-map mk-map--tall db-map" id="dbMap" aria-label="위성 영상과 토지 자료 지도">
        <div class="db-years" aria-hidden="true"><span id="dbYa"></span><span id="dbYb"></span></div>
        <div class="db-swipe" id="dbSwipe" role="slider" tabindex="0" aria-label="두 해 영상의 경계" aria-valuemin="0" aria-valuemax="100"><i></i><b><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6-6 6 6 6M15 6l6 6-6 6"/></svg></b></div>
      </figure>
      <aside class="mk-panel" aria-label="도시와 지도 고르기">
        <h2>도시</h2>
        <div class="mk-tools" id="dbCities">${J.cities.map((c) => `<button type="button" class="opt" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>
        <h2>지도에 겹칠 것</h2>
        <div class="mk-tools" id="dbLayers">${LAYERS.map((x) => `<button type="button" class="opt" data-l="${x.id}">${esc(x.name)}</button>`).join('')}</div>
        <div id="dbLegend" class="db-legend"></div>
        <div class="mk-field" id="dbOpField"><label for="dbOp"><span>겹친 자료의 진하기</span><output id="dbOpO">${st.op}%</output></label><input type="range" id="dbOp" min="20" max="100" step="5" value="${st.op}"></div>
        <h2>위성 영상 두 해</h2>
        <div class="mk-field"><label for="dbA"><span>왼쪽</span><output id="dbAo">${st.a}</output></label><input type="range" id="dbA" min="0" max="${YEARS.length - 1}" step="1" value="${YEARS.indexOf(st.a)}"></div>
        <div class="mk-field"><label for="dbB"><span>오른쪽</span><output id="dbBo">${st.b}</output></label><input type="range" id="dbB" min="0" max="${YEARS.length - 1}" step="1" value="${YEARS.indexOf(st.b)}"></div>
        <p class="mk-note">지도 가운데 손잡이를 밀면 왼쪽과 오른쪽 해의 영상이 바뀝니다. 해마다 구름이 적은 날을 모아 만든 영상이라 계절빛이 조금씩 다릅니다.</p>
        <div class="db-here" id="dbHere" role="status" aria-live="polite"></div>
        <div class="mk-why" id="dbWhy"></div>
        <div class="mk-tools"><button type="button" class="share-btn" id="dbShare">공유</button></div>
      </aside>
    </div>
    <div class="db-row db-row--2">
      <section class="mk-panel mk-tiphost"><h2 id="dbBuiltH"></h2><div id="dbBuilt"></div>
        <p class="mk-note">유럽연합 공동연구센터(JRC)가 해마다의 Landsat · Sentinel 영상으로 칸마다 건물 바닥 넓이를 추정한 값의 합입니다. 도로 · 주차장은 들어가지 않습니다.</p></section>
      <section class="mk-panel mk-tiphost"><h2 id="dbLstH"></h2><div id="dbLst"></div></section>
    </div>
    <section class="mk-panel db-row mk-tiphost"><h2>여섯 도시 견주기</h2><div id="dbCompare"></div></section>
    <section class="mk-panel db-row">
      <h2>시가지와 열섬</h2>
      <div class="mk-why">
        <p>콘크리트 · 아스팔트 · 지붕은 햇빛을 받으면 빨리 데워지고, 물을 머금지 못해 물이 증발하며 열을 가져가는 일도 적습니다.</p>
        <p>나무와 풀은 그늘을 만들고 잎에서 물을 내보내며(증산) 열을 씁니다. 물은 데워지는 데 열이 많이 들어 천천히 데워집니다.</p>
        <p>그래서 시가지가 넓고 녹지가 적은 곳일수록 땅이 더 뜨겁고, 그 열이 공기를 데워 도시가 주변보다 따뜻한 <b>열섬</b>이 나타나기 쉽습니다. 건물이 내뿜는 열(냉방 · 자동차)도 보탭니다.</p>
      </div>
    </section>
    <section class="mk-panel db-row">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>세종과 화성을 고르고 위성 영상만 켠 뒤 2016년과 2025년을 견주어 보세요. 새로 생긴 시가지는 원래 산 · 논 · 밭 가운데 어떤 땅이었나요? 「건물이 들어선 해」 지도와 함께 보세요.</li>
        <li>「여름 지표면 온도」에서 가장 뜨거운 곳과 가장 시원한 곳을 찾아 눌러 보세요. 그 칸의 토지 피복은 무엇인가요?</li>
        <li>도시마다 위성이 지나간 날이 다릅니다. 도시끼리 온도 자체가 아니라 「시가지 − 나무」 차이를 견주는 까닭은 무엇인가요?</li>
        <li>도시 안에 공원과 하천을 늘리면 열섬이 줄어드는 까닭을 이 지도의 값으로 설명해 보세요.</li>
      </ol>
    </section>
    <footer class="mk-source">
      <p><b>자료</b> 토지 피복: ESA WorldCover 10m 2021 v200(© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium), CC BY 4.0. 건물 넓이: European Commission JRC, GHSL GHS-BUILT-S R2023A(1975~2020, 5년 간격), CC BY 4.0. 지표면 온도: 미국 지질조사국(USGS) Landsat 8 · 9 Collection 2 Level-2 ST_B10, 저작권 없음 — Microsoft Planetary Computer에서 읽음. 위성 영상: Sentinel-2 cloudless by EOX IT Services GmbH(Copernicus Sentinel data), 2016년판 CC BY 4.0 · 2018년판부터 CC BY-NC-SA 4.0. 경계: 옛 통계청(현 국가데이터처) 2018년 행정 경계(southkorea-maps). 모두 2026년 10월 20일에 받았습니다.</p>
      <p><b>계산</b> 도시 경계 안의 칸만 세고, 칸 넓이는 위도에 맞추어 셈했습니다. 토지 피복 열한 가지를 여섯 무리로 묶었습니다(풀 · 덤불에는 습지 · 이끼, 맨땅에는 눈 · 얼음을 넣음). 지표면 온도는 6월~9월 중순 장면 가운데 경계 안에 구름이 가장 적은 장면 하나를 골라, 구름 · 구름 그림자 칸을 빼고 토지 피복 무리마다 평균했습니다. 광주는 옛 광주광역시 구역(2026년 7월부터 전남광주통합특별시), 제주시는 추자도를 뺀 제주섬 부분입니다. 만든 방법: scripts/build-dashboard-land.py.</p>
      <p><b>한계</b> WorldCover는 2020년판과 2021년판의 만드는 방법이 달라, ESA는 두 판의 차이에 실제 변화와 방법의 차이가 섞여 있다고 안내합니다. 그래서 2021년판 하나만 쓰고, 해에 따른 변화는 위성 영상과 GHSL로 봅니다. GHSL의 옛 해(1970~1990년대) 값은 그때 영상의 해상도가 낮아 덜 정확합니다. 지표면 온도는 위성이 지나간 오전 11시쯤 한순간의 땅 표면 온도이고, 기온이나 밤의 열섬과는 다릅니다.</p>
    </footer>`;
  injectStyle();
  // 지도
  map = L.map($('#dbMap'), { zoomSnap: 1, minZoom: 8, maxZoom: 15, attributionControl: true });
  map.attributionControl.setPrefix(false);
  map.createPane('satA'); map.getPane('satA').style.zIndex = 210;
  map.createPane('satB'); map.getPane('satB').style.zIndex = 220;
  map.createPane('over'); map.getPane('over').style.zIndex = 400;
  map.createPane('line'); map.getPane('line').style.zIndex = 450;
  map.fitBounds(city().bounds, { padding: [10, 10] });
  setYears();
  map.on('move zoom resize viewreset zoomend moveend', clipSwipe);
  map.on('mousemove click', (e) => here(e.latlng));
  // 밀기 손잡이
  const sw = $('#dbSwipe');
  L.DomEvent.disableClickPropagation(sw);
  L.DomEvent.disableScrollPropagation(sw);
  const moveTo = (x) => { const r = $('#dbMap').getBoundingClientRect(); st.x = Math.min(0.98, Math.max(0.02, (x - r.left) / r.width)); clipSwipe(); };
  sw.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sw.setPointerCapture(e.pointerId); moveTo(e.clientX); });
  sw.addEventListener('pointermove', (e) => { if (sw.hasPointerCapture(e.pointerId)) moveTo(e.clientX); });
  sw.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05, Home: -1, End: 1 }[e.key];
    if (d == null) return;
    e.preventDefault();
    st.x = Math.min(0.98, Math.max(0.02, st.x + d)); clipSwipe();
  });
  // 조작
  tips(el);
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (c) { st.c = c.dataset.c; sync({ fly: true }); if (c.tagName === 'TR') $('#dbMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const l = e.target.closest('[data-l]');
    if (l) { st.l = l.dataset.l; sync(); }
  });
  el.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-c]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.c = tr.dataset.c; sync({ fly: true }); }
  });
  el.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'dbOp') { st.op = Number(e.target.value); $('#dbOpO').textContent = st.op + '%'; overlay?.setOpacity(st.l === 'none' ? 1 : st.op / 100); return; }
    if (id === 'dbA' || id === 'dbB') {
      const y = YEARS[Number(e.target.value)];
      if (id === 'dbA') { st.a = y; $('#dbAo').textContent = y; } else { st.b = y; $('#dbBo').textContent = y; }
      setYears(); syncUrl();
    }
  });
  shareButton($('#dbShare'), () => location.href, () => `${city().name} · ${LAYERS.find((x) => x.id === st.l).name} · 위성 ${st.a}년과 ${st.b}년`);
  sync();
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!root.hidden) { $('#dbBuilt').innerHTML = builtChart(); $('#dbLst').innerHTML = lstChart(); } }, 160); });
  document.body.dataset.ready = 'true';
}

function injectStyle() {
  const s = document.createElement('style');
  s.textContent = `
    :root { --db-bare: #8d918c; }
    .db-map { min-height: 420px; }
    .db-map .leaflet-container, .db-map > .leaflet-pane { background: var(--st-bedrock-sunken); }
    .db-map.is-over .db-sat { filter: brightness(0.62) saturate(0.7); }
    .db-ov { image-rendering: pixelated; }
    .db-map .leaflet-pane svg { max-width: none !important; max-height: none !important; }
    .db-line { stroke: #fff; stroke-opacity: 0.9; }
    .mk-map.db-map .leaflet-control-attribution { background: rgba(18,24,21,0.72); color: var(--st-label-3); }
    .mk-map.db-map .leaflet-control-attribution a { color: var(--st-label-2); }
    .db-years { position: absolute; z-index: 700; bottom: 30px; left: 12px; right: 12px; display: flex; justify-content: space-between; pointer-events: none; }
    .db-years span { padding: 4px 10px; border-radius: var(--st-r-full); background: rgba(0,0,0,0.62); color: #fff; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .db-swipe { position: absolute; z-index: 690; top: 0; bottom: 0; width: 44px; margin-left: -22px; cursor: ew-resize; touch-action: none; display: grid; place-items: center; }
    .db-swipe i { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; background: rgba(255,255,255,0.85); }
    .db-swipe b { position: relative; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #111; }
    .db-swipe:focus-visible b { outline: 3px solid var(--st-accent); outline-offset: 2px; }
    .db-legend { display: grid; gap: 8px; }
    .db-steps { display: flex; gap: 0; font-size: 11px; color: var(--st-label-3); font-variant-numeric: tabular-nums; }
    .db-steps span { flex: 1; display: grid; gap: 4px; justify-items: center; text-align: center; white-space: nowrap; }
    .db-steps i { display: block; width: 100%; height: 10px; }
    .db-steps span:first-child i { border-radius: 5px 0 0 5px; } .db-steps span:last-child i { border-radius: 0 5px 5px 0; }
    .db-here { display: grid; gap: 2px; min-height: 58px; padding: 10px 12px; border-radius: var(--st-r-element); background: var(--st-fill-3); font-size: 12.5px; line-height: 1.5; color: var(--st-label-2); letter-spacing: var(--track-ko); font-variant-numeric: tabular-nums; }
    .db-here b { color: var(--st-label); font-weight: 700; }
    .db-bar { fill: var(--s2); }
    .db-val { fill: var(--st-label); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .db-lab { fill: var(--st-label-2); font-size: 12.5px; }
    .db-stem { stroke: var(--st-separator-strong); stroke-width: 2; }
    .db-dot { stroke: var(--st-surface); stroke-width: 2; }
    .db-med { stroke: var(--st-label-3); stroke-width: 1; stroke-dasharray: 3 3; }
    .db-stack { width: 34%; }
    .db-stack span { display: flex; gap: 2px; height: 14px; min-width: 160px; }
    .db-stack i { display: block; height: 100%; min-width: 0; }
    .db-stack i:first-child { border-radius: 4px 0 0 4px; } .db-stack i:last-child { border-radius: 0 4px 4px 0; }
    @media (max-width: 900px) { .mk-map--tall.db-map { height: 62vh; } }
  `;
  document.head.append(s);
}
