// 햇빛과 바람의 지도 — 태양광 · 풍력 발전기를 세울 곳을 조건으로 찾는다(적지 분석: 이진 중첩 · 가중 중첩).
// 자료: data/maps/energy/(scripts/build-map-energy.py 가 Global Solar Atlas · Global Wind Atlas · Copernicus DEM · WorldPop ·
// OpenStreetMap 국립공원에서 만든 2km 격자). a.png = 햇빛 · 바람 · 경사, b.png = 높이 · 인구 밀도 · 국립공원 비율, c.png = 땅/바다 · 해안 거리.
// 핵심은 「자원이 많은 곳이 곧 좋은 곳은 아니다」 — 바람이 센 땅은 높은 산 능선이라 가파르고 국립공원과 겹친다.
import { $, $$, esc, fmt, SEQ, legendBar, params, setParams, shareButton, loadLeaflet, darkBase, initPage } from './map-kit.mjs?v=9af662e6';

const POP = [10, 30, 100, 300, 1000, 3000, Infinity];
const popTxt = (i) => (POP[i] === Infinity ? '따지지 않음' : `${fmt(POP[i])}명 이하`);
// 기술마다 조건 — 출발값은 정해진 기준이 아니라 실험의 시작점
const TECH = {
  solar: { name: '태양광', res: 'ghi', resName: '햇빛', unit: 'kWh/m²·년', where: 'land',
    cond: { r: 1450, s: 10, p: 3, n: 1 }, rng: { r: [1300, 1540, 10] }, conds: ['r', 's', 'p', 'n'] },
  wind: { name: '육상 풍력', res: 'ws', resName: '바람', unit: 'm/s', where: 'land',
    cond: { r: 6, s: 15, p: 2, n: 1 }, rng: { r: [4, 8.5, 0.1] }, conds: ['r', 's', 'p', 'n'] },
  sea: { name: '해상 풍력', res: 'ws', resName: '바람', unit: 'm/s', where: 'sea',
    cond: { r: 7.5, d0: 5, d1: 40, n: 1 }, rng: { r: [6, 8.7, 0.1] }, conds: ['r', 'd', 'n'] },
};
const CLAB = { r: '자원', s: '경사', p: '인구', n: '국립공원', d: '해안 거리' };
const st = { v: 'fit', t: 'wind', mm: 'bin', c: { ...TECH.wind.cond }, w: { r: 3, s: 2, p: 1, d: 1 }, hl: null };
let G, N, L, map, overlay, pick = null;
let grid; // { ghi, ws, slope, elev, pop, np, kind, dist } Float32Array (NaN = 없음)

const tech = () => TECH[st.t];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(v) {
  const s = css(v);
  const m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)];
  const a = s.match(/rgba?\(([^)]+)\)/);
  if (!a) return [128, 128, 128];
  const n = a[1].split(',').map((x) => Number(x));
  return [n[0], n[1], n[2], n[3] ?? 1];
}

async function px(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}
async function load() {
  G = await fetch('data/maps/energy/grid.json').then((r) => r.json());
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((k) => px(`data/maps/energy/${k}.png`)));
  N = G.w * G.h;
  const f = () => new Float32Array(N).fill(NaN);
  grid = { ghi: f(), ws: f(), slope: f(), elev: f(), pop: f(), np: f(), kind: new Uint8Array(N), dist: f(), coast: f(), area: new Float32Array(N) };
  const E = G.enc;
  for (let i = 0; i < N; i++) {
    const j = i * 4;
    const dec = (v, [o, s]) => (v === 255 ? NaN : o + v * s);
    grid.ghi[i] = dec(a[j], E.ghi); grid.ws[i] = dec(a[j + 1], E.ws); grid.slope[i] = dec(a[j + 2], E.slope);
    grid.elev[i] = dec(b[j], E.elev); grid.pop[i] = b[j + 1] === 255 ? NaN : 10 ** (b[j + 1] / 50) - 1;
    grid.np[i] = b[j + 2] === 255 ? 0 : b[j + 2] / E.np;
    grid.kind[i] = c[j]; grid.dist[i] = c[j] === 2 ? c[j + 1] : NaN; grid.coast[i] = c[j] === 1 ? c[j + 1] : NaN;
    grid.area[i] = G.rowArea[(i / G.w) | 0];
  }
}

// ── 조건 검사 — 칸 하나가 각 조건을 넘는지 ──
function inScope(i) { return tech().where === 'land' ? grid.kind[i] === 1 : grid.kind[i] === 2; }
function checks(i, c = st.c) {
  const T = tech(), v = grid[T.res][i];
  const ok = { r: Number.isFinite(v) && v >= c.r };
  if (T.where === 'land') {
    ok.s = Number.isFinite(grid.slope[i]) && grid.slope[i] <= c.s;
    ok.p = POP[c.p] === Infinity || !Number.isFinite(grid.pop[i]) || grid.pop[i] <= POP[c.p];
  } else ok.d = grid.dist[i] >= c.d0 && grid.dist[i] <= c.d1;
  ok.n = !c.n || grid.np[i] < 0.5;
  return ok;
}
// 가중 점수(0~1)
function score(i) {
  const T = tech(), w = st.w;
  const v = grid[T.res][i];
  if (!Number.isFinite(v)) return NaN;
  if (st.c.n && grid.np[i] >= 0.5) return NaN;
  const [lo, hi] = T.res === 'ghi' ? [G.stats.ghi[1], G.stats.ghi[3]] : T.where === 'sea' ? [G.stats.ws_sea[1], G.stats.ws_sea[3]] : [G.stats.ws_land[1], G.stats.ws_land[3]];
  const cl = (x) => Math.max(0, Math.min(1, x));
  const parts = [[w.r, cl((v - lo) / (hi - lo))]];
  if (T.where === 'land') {
    parts.push([w.s, Number.isFinite(grid.slope[i]) ? cl(1 - grid.slope[i] / 25) : 0]);
    parts.push([w.p, Number.isFinite(grid.pop[i]) ? cl(1 - Math.log10(grid.pop[i] + 1) / 4) : 1]);
  } else parts.push([w.d, cl(1 - grid.dist[i] / 80)]);
  const sw = parts.reduce((a, p) => a + p[0], 0) || 1;
  return parts.reduce((a, p) => a + p[0] * p[1], 0) / sw;
}
const resClasses = (key, where) => {
  const v = [];
  for (let i = 0; i < N; i++) if ((where === 'land' ? grid.kind[i] === 1 : grid.kind[i] > 0) && Number.isFinite(grid[key][i])) v.push(grid[key][i]);
  v.sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { br: [q(0.2), q(0.4), q(0.6), q(0.8)], min: v[0], max: v[v.length - 1] };
};
let RC = {};
const cls = (br, x) => br.filter((b) => x >= b).length;

// ── 그리기 ──
function compute() {
  const T = tech();
  const out = { pass: 0, scope: 0, only: { r: 0, s: 0, p: 0, d: 0, n: 0 }, onlyMask: null, sc: null };
  if (st.v !== 'fit') return out;
  if (st.mm === 'bin') {
    const mask = new Uint8Array(N); // 1 통과, 2~ 하나만 못 넘음(조건 번호)
    const keys = T.where === 'land' ? ['r', 's', 'p', 'n'] : ['r', 'd', 'n'];
    for (let i = 0; i < N; i++) {
      if (!inScope(i)) continue;
      out.scope += grid.area[i];
      const ok = checks(i);
      const bad = keys.filter((k) => !ok[k]);
      if (!bad.length) { out.pass += grid.area[i]; mask[i] = 1; } else if (bad.length === 1) { out.only[bad[0]] += grid.area[i]; mask[i] = 2 + keys.indexOf(bad[0]); }
    }
    out.mask = mask; out.keys = keys;
  } else {
    const sc = new Float32Array(N).fill(NaN), vals = [];
    for (let i = 0; i < N; i++) { if (!inScope(i)) continue; out.scope += grid.area[i]; const s = score(i); sc[i] = s; if (Number.isFinite(s)) vals.push(s); }
    vals.sort((a, b) => a - b);
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    out.sc = sc; out.br = [q(0.5), q(0.7), q(0.85), q(0.95)];
    out.top = 0;
    for (let i = 0; i < N; i++) if (sc[i] >= out.br[3]) out.top += grid.area[i];
  }
  return out;
}

async function paint(R) {
  const c = document.createElement('canvas');
  c.width = G.w; c.height = G.h;
  const g = c.getContext('2d');
  const img = g.createImageData(G.w, G.h), o = img.data;
  const seq = SEQ.map(rgb), base = rgb('--map-land'), hl = rgb('--kr-n2');
  const bA = Math.round((base[3] ?? 1) * 255);
  const T = tech(), line = rgb('--st-label-3');
  const showLine = st.v === 'ws' || (st.v === 'fit' && T.where === 'sea');
  const set = (i, col, a = 235) => { const j = i * 4; o[j] = col[0]; o[j + 1] = col[1]; o[j + 2] = col[2]; o[j + 3] = a; };
  for (let i = 0; i < N; i++) {
    const k = grid.kind[i];
    if (!k) continue;
    if (st.v === 'ghi' || st.v === 'ws') {
      const v = grid[st.v][i];
      if (!Number.isFinite(v) || (st.v === 'ghi' && k !== 1)) continue;
      set(i, seq[cls(RC[st.v].br, v)]);
      continue;
    }
    if (!inScope(i)) { if (k === 1) set(i, base, bA); continue; }
    if (st.mm === 'bin') {
      const m = R.mask[i];
      if (m === 1) set(i, seq[cls(RC[T.res === 'ghi' ? 'ghi' : 'ws'].br, grid[T.res][i])]);
      else if (st.hl && m === 2 + R.keys.indexOf(st.hl)) set(i, hl);
      else set(i, base, k === 1 ? bA : Math.round(bA * 0.5));
    } else {
      const s = R.sc[i];
      if (Number.isFinite(s)) set(i, seq[cls(R.br, s)]);
      else set(i, base, bA);
    }
  }
  if (showLine) for (let i = 0; i < N; i++) if (grid.kind[i] === 2 && grid.dist[i] === 22) set(i, line, 200);
  g.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), 'image/png'));
}

const LINE_KEY = '<div class="mk-keys"><span><i class="en-k-line"></i>해안에서 22km(12해리) 줄</span></div>';
let lastUrl = null;
async function draw() {
  const T = tech();
  const R = compute();
  const url = await paint(R);
  if (!overlay) overlay = L.imageOverlay(url, G.bounds, { className: 'en-ov', interactive: false }).addTo(map);
  else overlay.setUrl(url);
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = url;
  // 보기 · 기술 · 방법
  seg('#enView', 'v', st.v); seg('#enTech', 't', st.t); seg('#enMethod', 'mm', st.mm);
  $('#enFitTools').hidden = st.v !== 'fit';
  $('#enCondBox').hidden = st.v !== 'fit';
  // 범례 · 수치
  let legend = '', num = '', cap = '';
  if (st.v === 'ghi') { legend = legendBar(SEQ, `${fmt(RC.ghi.min)}`, `${fmt(RC.ghi.max)} kWh/m²·년`); num = `${fmt(G.stats.ghi[2])}`; cap = '땅 칸 가운데값(kWh/m²·년) · 다섯 칸은 각각 땅의 20%씩'; }
  else if (st.v === 'ws') { legend = legendBar(SEQ, `${fmt(RC.ws.min, 1)}`, `${fmt(RC.ws.max, 1)} m/s`) + LINE_KEY; num = `${fmt(G.stats.ws_land[2], 1)} · ${fmt(G.stats.ws_sea[2], 1)}`; cap = '가운데값(m/s) — 땅 · 바다(해안 80km 안) · 다섯 칸은 각각 20%씩'; }
  else if (st.mm === 'bin') {
    legend = `${legendBar(SEQ, `${T.resName} 약함`, '강함')}<div class="mk-keys"><span><i class="en-k-base"></i>조건을 못 넘은 ${T.where === 'land' ? '땅' : '바다'}</span>${st.hl ? `<span><i style="background:var(--kr-n2)"></i>「${CLAB[st.hl]}」 하나 때문에 빠진 곳</span>` : ''}</div>${T.where === 'sea' ? LINE_KEY : ''}`;
    num = fmt(R.pass); cap = `조건을 모두 넘은 ${T.where === 'land' ? '땅' : '바다'}(km²) · ${T.where === 'land' ? '우리나라 땅' : '해안 80km 안 바다'} ${fmt(R.scope)} km²의 ${fmt((R.pass / R.scope) * 100, 1)}%`;
  } else {
    legend = `${legendBar(SEQ, '점수 아래 50%', '위 5%')}<div class="mk-keys"><span><i class="en-k-base"></i>${st.c.n ? '국립공원 · 자료 없음' : '자료 없음'}</span></div>`;
    num = fmt(R.top); cap = `점수 위 5% 칸의 넓이(km²) — 가장 밝은 칸`;
  }
  $('#enLegend').innerHTML = legend;
  $('#enNum').innerHTML = `<b>${num}</b>${st.v === 'fit' ? '<span>km²</span>' : ''}`;
  $('#enCap').textContent = cap;
  // 조건
  if (st.v === 'fit') { if (condKey !== `${st.t}|${st.mm}`) buildConds(); onlyList(R); }
  $('#enCompare').innerHTML = compare();
  $('#enPick').innerHTML = pickText();
  setParams({
    v: st.v !== 'fit' ? st.v : null, t: st.t, mm: st.mm === 'wt' ? 'wt' : null,
    r: st.c.r, s: st.c.s, p: st.c.p, d0: st.c.d0, d1: st.c.d1, n: st.c.n ? null : 0,
    w: st.mm === 'wt' ? `${st.w.r}${T.where === 'land' ? `${st.w.s}${st.w.p}` : st.w.d}` : null,
  });
}
function seg(sel, key, val) {
  $$(`${sel} [data-${key}]`).forEach((b) => { const on = b.dataset[key] === val; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
}

let condKey = '';
function buildConds() {
  condKey = `${st.t}|${st.mm}`;
  const T = tech(), c = st.c, [r0, r1, rs] = T.rng.r;
  const dp = rs < 1 ? 1 : 0;
  const rows = [];
  rows.push(`<div class="mk-field"><label for="enR"><span>${T.resName} ${T.res === 'ghi' ? '(연간 일사량)' : '(지상 100m 평균 풍속)'} — 이 값 이상</span><output>${fmt(c.r, dp)} ${T.unit}</output></label>
    <input type="range" id="enR" data-c="r" min="${r0}" max="${r1}" step="${rs}" value="${c.r}"></div>`);
  if (T.where === 'land') {
    rows.push(`<div class="mk-field"><label for="enS"><span>경사 — 이 값 이하</span><output>${fmt(c.s)}°</output></label>
      <input type="range" id="enS" data-c="s" min="0" max="30" step="1" value="${c.s}"></div>`);
    rows.push(`<div class="mk-field"><label for="enP"><span>인구 밀도 — 1km²에</span><output>${popTxt(c.p)}</output></label>
      <input type="range" id="enP" data-c="p" min="0" max="${POP.length - 1}" step="1" value="${c.p}" aria-valuetext="${esc(popTxt(c.p))}"></div>`);
  } else {
    rows.push(`<div class="mk-field"><label for="enD0"><span>해안에서 — 이만큼 떨어진 바다부터</span><output>${fmt(c.d0)}km</output></label>
      <input type="range" id="enD0" data-c="d0" min="0" max="40" step="1" value="${c.d0}"></div>`);
    rows.push(`<div class="mk-field"><label for="enD1"><span>해안에서 — 이만큼까지</span><output>${fmt(c.d1)}km</output></label>
      <input type="range" id="enD1" data-c="d1" min="5" max="80" step="1" value="${c.d1}"></div>`);
  }
  rows.push(`<label class="en-check"><input type="checkbox" data-c="n" ${c.n ? 'checked' : ''}> 국립공원(칸의 절반 넘게 겹치는 곳)은 빼기</label>`);
  if (st.mm === 'wt') {
    const W = T.where === 'land' ? [['r', `${T.resName}이 셀수록`], ['s', '평평할수록'], ['p', '사람이 적게 살수록']] : [['r', '바람이 셀수록'], ['d', '해안에 가까울수록']];
    rows.push(`<p class="en-sub">점수에 넣는 무게 <small>가중 중첩은 문턱 대신 무게로 점수를 매깁니다</small></p>`);
    W.forEach(([k, lab]) => rows.push(`<div class="mk-field"><label for="enW${k}"><span>${lab}</span><output>${st.w[k]}</output></label>
      <input type="range" id="enW${k}" data-w="${k}" min="0" max="3" step="1" value="${st.w[k]}"></div>`));
  }
  $('#enConds').innerHTML = rows.join('');
  $$('#enConds .mk-field').forEach((f) => { if (st.mm === 'wt' && f.querySelector('[data-c="r"],[data-c="s"],[data-c="p"],[data-c="d0"],[data-c="d1"]')) f.hidden = true; });
}
function onlyList(R) {
  // 하나만 못 넘어 빠진 곳
  if (st.mm === 'bin') {
    $('#enOnly').hidden = false;
    $('#enOnlyList').innerHTML = R.keys.map((k) => `<li><button type="button" class="en-only${st.hl === k ? ' is-on' : ''}" data-hl="${k}" aria-pressed="${st.hl === k}">
      <span>${esc(CLAB[k])} 하나 때문에</span><b>${fmt(R.only[k])} km²</b></button></li>`).join('');
  } else $('#enOnly').hidden = true;
}

// 자원이 가장 많은 칸 10% 와 전체 비교
function compare() {
  const T = tech();
  const key = st.v === 'ghi' ? 'ghi' : st.v === 'ws' ? 'ws' : T.res;
  const where = st.v === 'fit' ? T.where : 'land';
  const ids = [];
  for (let i = 0; i < N; i++) if ((where === 'land' ? grid.kind[i] === 1 : grid.kind[i] === 2) && Number.isFinite(grid[key][i])) ids.push(i);
  ids.sort((a, b) => grid[key][b] - grid[key][a]);
  const top = ids.slice(0, Math.round(ids.length * 0.1));
  const mean = (arr, f) => { let s = 0, a = 0; for (const i of arr) { const v = f(i); if (Number.isFinite(v)) { s += v * grid.area[i]; a += grid.area[i]; } } return a ? s / a : NaN; };
  const med = (arr, f) => { const v = arr.map(f).filter(Number.isFinite).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const nm = key === 'ghi' ? '햇빛이 가장 많은' : '바람이 가장 센';
  const all = where === 'land' ? '우리나라 땅 전체' : '해안 80km 안 바다 전체';
  const rows = where === 'land'
    ? [['평균 ' + (key === 'ghi' ? '일사량' : '풍속'), (a) => mean(a, (i) => grid[key][i]), key === 'ghi' ? 0 : 1, key === 'ghi' ? 'kWh/m²' : 'm/s'],
      ['평균 높이', (a) => mean(a, (i) => grid.elev[i]), 0, 'm'],
      ['평균 경사', (a) => mean(a, (i) => grid.slope[i]), 1, '°'],
      ['국립공원 안', (a) => mean(a, (i) => (grid.np[i] >= 0.5 ? 100 : 0)), 1, '%'],
      ['인구 밀도 가운데값', (a) => med(a, (i) => grid.pop[i]), 0, '명/km²']]
    : [['평균 풍속', (a) => mean(a, (i) => grid.ws[i]), 1, 'm/s'],
      ['해안에서 평균 거리', (a) => mean(a, (i) => grid.dist[i]), 0, 'km'],
      ['해상 국립공원 안', (a) => mean(a, (i) => (grid.np[i] >= 0.5 ? 100 : 0)), 1, '%']];
  const vals = rows.map(([lab, f, dp, u]) => [lab, f(top), f(ids), dp, u]);
  const tbl = `<table class="en-cmp"><thead><tr><th></th><th>${esc(nm)} ${where === 'land' ? '땅' : '바다'} 10%</th><th>${esc(all)}</th></tr></thead><tbody>
    ${vals.map(([lab, a, b, dp, u]) => `<tr><th>${esc(lab)}</th><td>${fmt(a, dp)}${u}</td><td>${fmt(b, dp)}${u}</td></tr>`).join('')}</tbody></table>`;
  // 까닭 글 — 수치는 모두 위에서 계산한 값
  const cmpW = (a, b, end) => (a > b * 1.15 ? (end ? '더 높습니다' : '더 높고') : a < b * 0.87 ? (end ? '더 낮습니다' : '더 낮고') : end ? '비슷합니다' : '비슷하고');
  let say;
  if (where === 'sea') {
    const near = mean(top, (i) => (grid.dist[i] <= 22 ? 100 : 0));
    say = `<p>바람이 가장 센 바다는 해안에서 평균 ${fmt(vals[1][1], 0)}km 떨어져 있습니다(전체 ${fmt(vals[1][2], 0)}km). 그 가운데 해안에서 22km(12해리) 안에 드는 것은 ${fmt(near, 0)}%입니다. 바다 위에는 바람을 막는 산과 건물이 없어 뭍에서 멀어질수록 바람이 고르게 셉니다. 대신 멀어질수록 바다가 깊어지고, 전기를 뭍까지 끌어오는 선이 길어집니다.</p>`;
  } else {
    const coastShare = mean(top, (i) => (grid.coast[i] <= 5 ? 100 : 0));
    const hi = top.filter((i) => grid.elev[i] >= 500), lo = top.filter((i) => grid.coast[i] <= 5);
    const hiShare = (hi.length / top.length) * 100;
    const p1 = `<p>${esc(nm)} 땅 10%의 평균 높이는 ${fmt(vals[1][1], 0)}m로 전체(${fmt(vals[1][2], 0)}m)보다 ${cmpW(vals[1][1], vals[1][2])}, 평균 경사는 ${fmt(vals[2][1], 1)}°로 전체(${fmt(vals[2][2], 1)}°)와 견주어 ${cmpW(vals[2][1], vals[2][2], 1)}.</p>`;
    if (key === 'ws') {
      say = p1 + `<p>이 땅을 나눠 보면 ${fmt(coastShare, 0)}%는 바다에서 5km 안의 바닷가 · 섬이고, ${fmt(hiShare, 0)}%는 높이 500m가 넘는 산지입니다. 바다 위와 높은 산등성이에는 바람을 막는 것이 적기 때문입니다.</p>`
        + (hi.length ? `<p>산지 쪽은 평균 경사가 ${fmt(mean(hi, (i) => grid.slope[i]), 1)}°이고 ${fmt(mean(hi, (i) => (grid.np[i] >= 0.5 ? 100 : 0)), 1)}%가 국립공원 안입니다. 길을 내고 큰 날개를 실어 나르기 어려운 곳입니다. 바닷가 쪽은 인구 밀도 가운데값이 ${fmt(med(lo, (i) => grid.pop[i]), 0)}명/km²로, 사는 사람과 가까워집니다.</p>` : '');
    } else {
      const pt = vals[4][1], pa = vals[4][2];
      say = p1 + `<p>그 가운데 ${fmt(coastShare, 0)}%는 바다에서 5km 안에 있고, 인구 밀도 가운데값은 ${fmt(pt, 0)}명/km²로 전체(${fmt(pa, 0)}명/km²)보다 ${cmpW(pt, pa, 1)}.</p>`
        + (pt > pa * 1.15 ? `<p>햇빛이 좋은 낮고 평평한 땅에는 사람도 많이 삽니다. 넓은 땅을 차지하는 태양광은 그만큼 논밭 · 마을과 자리를 다투게 됩니다. 인구 밀도 조건을 바꿔 보세요.</p>` : `<p>인구 밀도 조건을 바꾸어 넓이가 어떻게 달라지는지 보세요.</p>`);
    }
  }
  return tbl + `<div class="mk-why">${say}</div>`;
}

function pickText() {
  if (!pick) return '지도를 누르면 그 칸의 값과, 지금 조건을 넘는지 보여 줍니다.';
  const [[la0, lo0], [la1, lo1]] = G.bounds;
  const my = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  const x = Math.floor(((pick.lng - lo0) / (lo1 - lo0)) * G.w);
  const y = Math.floor(((my(la1) - my(pick.lat)) / (my(la1) - my(la0))) * G.h);
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return '자료 범위 밖입니다.';
  const i = y * G.w + x, k = grid.kind[i];
  if (!k) return '자료 범위 밖입니다(다른 나라 땅이거나 해안에서 80km 넘는 바다).';
  const parts = [];
  if (k === 1) {
    parts.push(`햇빛 ${fmt(grid.ghi[i])} kWh/m²·년`, `바람 ${fmt(grid.ws[i], 1)} m/s`, `높이 ${fmt(grid.elev[i])}m`, `경사 ${fmt(grid.slope[i], 1)}°`,
      `인구 밀도 ${Number.isFinite(grid.pop[i]) ? fmt(grid.pop[i]) + '명/km²' : '자료 없음'}`);
  } else parts.push(`바람 ${fmt(grid.ws[i], 1)} m/s`, `해안에서 ${fmt(grid.dist[i])}km`);
  if (grid.np[i] > 0) parts.push(`국립공원 ${fmt(grid.np[i] * 100)}%`);
  let tail = '';
  if (st.v === 'fit' && st.mm === 'bin' && inScope(i)) {
    const ok = checks(i), bad = Object.keys(ok).filter((q) => !ok[q]);
    tail = bad.length ? ` — 못 넘은 조건: ${bad.map((q) => CLAB[q]).join(' · ')}` : ' — 조건을 모두 넘습니다';
  } else if (st.v === 'fit' && !inScope(i)) tail = ` — ${tech().name}은 ${tech().where === 'land' ? '땅' : '바다'}에서만 따집니다`;
  return `<b>누른 칸(약 2km)</b> ${parts.map(esc).join(' · ')}${esc(tail)}`;
}

export async function main() {
  await initPage('energy');
  await load();
  RC = { ghi: resClasses('ghi', 'land'), ws: resClasses('ws', 'all') };
  const q = params();
  if (['ghi', 'ws'].includes(q.get('v'))) st.v = q.get('v');
  if (TECH[q.get('t')]) { st.t = q.get('t'); st.c = { ...TECH[st.t].cond }; }
  if (q.get('mm') === 'wt') st.mm = 'wt';
  for (const k of ['r', 's', 'p', 'd0', 'd1']) if (q.has(k) && k in st.c && Number.isFinite(Number(q.get(k)))) st.c[k] = Number(q.get(k));
  if (q.get('n') === '0') st.c.n = 0;
  const wq = q.get('w');
  if (wq && /^[0-3]{2,3}$/.test(wq)) { if (wq.length === 3) { st.w.r = +wq[0]; st.w.s = +wq[1]; st.w.p = +wq[2]; } else { st.w.r = +wq[0]; st.w.d = +wq[1]; } }

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--below">
      <figure class="mk-map mk-map--tall en-map"><div class="en-leaf" id="enMap" role="region" aria-label="우리나라 햇빛 · 바람 자원과 발전 적지를 칠한 지도"></div></figure>
      <p class="mk-note en-pick" id="enPick" aria-live="polite"></p>
      <div class="en-panels">
        <section class="mk-panel" aria-label="보기 고르기">
          <h2>무엇을 볼까요?</h2>
          <div class="st-segmented en-seg" id="enView" role="tablist" aria-label="보기">
            <button type="button" class="st-segmented__item" role="tab" data-v="ghi">햇빛 자원</button>
            <button type="button" class="st-segmented__item" role="tab" data-v="ws">바람 자원</button>
            <button type="button" class="st-segmented__item" role="tab" data-v="fit">적지 찾기</button>
          </div>
          <div class="en-fit" id="enFitTools">
            <div class="st-segmented en-seg" id="enTech" role="tablist" aria-label="발전 방식">
              ${Object.entries(TECH).map(([k, t]) => `<button type="button" class="st-segmented__item" role="tab" data-t="${k}">${esc(t.name)}</button>`).join('')}
            </div>
            <div class="st-segmented en-seg" id="enMethod" role="tablist" aria-label="겹치는 방법">
              <button type="button" class="st-segmented__item" role="tab" data-mm="bin">모두 넘는 곳(이진 중첩)</button>
              <button type="button" class="st-segmented__item" role="tab" data-mm="wt">점수 매기기(가중 중첩)</button>
            </div>
          </div>
          <div class="en-num" aria-live="polite"><p class="en-big" id="enNum"></p><p class="mk-note" id="enCap"></p></div>
          <div id="enLegend"></div>
          <div class="mk-tools"><button type="button" class="share-btn" id="enShare">공유</button></div>
        </section>
        <section class="mk-panel" id="enCondBox" aria-label="조건">
          <h2>조건</h2>
          <div class="en-conds" id="enConds"></div>
          <div id="enOnly">
            <p class="en-sub">조건 하나만 못 넘어 빠진 곳 <small>눌러서 지도에 표시</small></p>
            <ul class="en-onlylist" id="enOnlyList"></ul>
          </div>
          <p class="mk-note">처음 값은 정해진 기준이 아니라 실험의 출발점입니다.</p>
        </section>
        <section class="mk-panel" aria-label="자원이 많은 곳과 견주기">
          <h2>자원이 많은 곳이 곧 좋은 곳일까요?</h2>
          <div id="enCompare"></div>
        </section>
      </div>
    </div>
    <div class="en-after">
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>「바람 자원」을 보고, 바람이 센 땅이 어디에 줄지어 있는지 찾아보세요. 「육상 풍력」에서 경사 조건을 30°까지 풀면 무엇이 달라지나요?</li>
          <li>「조건 하나만 못 넘어 빠진 곳」 가운데 가장 넓은 것은 무엇인가요? 그 조건을 풀어야 할까요, 지켜야 할까요? 누구의 입장에서 그렇게 생각하나요?</li>
          <li>태양광에서 인구 밀도 조건을 「따지지 않음」으로 바꾸면 넓이가 늘어납니다. 사람이 많이 사는 곳의 지붕 · 주차장 위 태양광은 이 지도에서 어떻게 보일까요?</li>
          <li>해상 풍력은 왜 해안에서 너무 가깝지도, 너무 멀지도 않은 곳을 찾게 될까요? 바다를 일터로 삼는 사람들에게는 무엇이 달라질까요?</li>
        </ol>
      </section>
      <section class="mk-panel">
        <h2>계산과 한계</h2>
        <div class="mk-why en-limits">
          <p>우리나라를 약 2km 칸(웹 메르카토르 2,000m)으로 나누고, 칸마다 일사량 · 풍속 · 높이 · 경사 · 인구 밀도를 원자료에서 평균했습니다. <b>이진 중첩</b>은 조건을 하나라도 못 넘으면 빼고, <b>가중 중첩</b>은 조건마다 0~1 점수를 매겨 무게를 곱해 더합니다(자원은 땅 칸의 하위 5% ~ 상위 5% 사이를 0~1로, 경사는 25° 이상을 0으로, 인구 밀도는 1만 명/km² 이상을 0으로).</p>
          <p><b>2km 칸은 거칩니다.</b> 칸 안의 평균이라 좁은 능선의 센 바람이나 작은 평지는 묻힙니다. 실제 발전소 자리는 수십~수백 m 단위로 따집니다.</p>
          <p><b>빠진 조건이 많습니다.</b> 전기를 보낼 송전선까지의 거리, 땅값과 소유, 숲과 논밭의 쓰임, 철새 길, 소음, 군사 시설, 주민의 동의는 들어 있지 않습니다. 바다에서는 물 깊이와 어업 · 뱃길이 중요하지만 이 지도에는 해안 거리만 있습니다.</p>
          <p><b>바다의 범위는 단순하게 정했습니다.</b> 가장 가까운 땅이 우리나라인 바다 가운데 해안에서 80km 안만 보였습니다. 실제 영해는 해안의 기준선에서 12해리(약 22km)를 재고, 이웃 나라와 맞닿은 곳은 따로 정합니다.</p>
          <p><b>자원 값은 오랜 기간의 평균입니다.</b> 햇빛은 2007~2018년 평균 모델 값, 바람은 지상 100m 높이의 모델 값이라 해마다 · 계절마다 다르고, 발전량은 설비에 따라 다릅니다.</p>
        </div>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>햇빛</b> Global Solar Atlas 2.0 — 연평균 수평면 전일사량(GHI, 2007~2018). Solar resource data © 2019 Solargis, <a href="https://globalsolaratlas.info/">globalsolaratlas.info</a>(World Bank Group · ESMAP), CC BY 4.0.</p>
    <p><b>바람</b> Data obtained from the Global Wind Atlas version 4.0, a free, web-based application developed, owned and operated by the Technical University of Denmark (DTU), released in partnership with the World Bank Group, utilizing data provided by Vortex, using funding provided by the Energy Sector Management Assistance Program (ESMAP). <a href="https://globalwindatlas.info">globalwindatlas.info</a>, CC BY 4.0. 지상 100m 평균 풍속.</p>
    <p><b>높이 · 경사</b> produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-90. 경사는 90m 칸에서 계산한 뒤 평균.</p>
    <p><b>인구</b> WorldPop 2020 인구 밀도(1km, UN 보정), University of Southampton, CC BY 4.0. <b>국립공원 · 육지</b> © OpenStreetMap contributors, ODbL — 국립공원 ${G.parks}곳 경계(2026-10-20), 육지 다각형(osmdata.openstreetmap.de, 2026-10-19판). 이웃 나라 경계는 Natural Earth. <b>바탕 지도</b> © OpenStreetMap contributors(어둡게 바꿔 보여 줌).</p>
    <p><b>계산</b> 자료는 모두 2026-10-20에 받았습니다. 만드는 과정은 scripts/build-map-energy.py.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .en-map { isolation: isolate; z-index: 0; height: min(72vh, 720px); }
    .en-leaf { position: absolute; inset: 0; }
    .en-ov { image-rendering: pixelated; }
    .en-pick { margin-top: 8px; min-height: 1.6em; }
    .en-pick b { color: var(--st-label-2); font-weight: 600; margin-right: 4px; }
    .en-panels { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 1100px) { .en-panels { grid-template-columns: 1fr 1fr; } .en-panels > :last-child { grid-column: 1 / -1; } }
    @media (max-width: 700px) { .en-panels { grid-template-columns: 1fr; } .en-map { height: 60vh; min-height: 340px; } }
    .en-seg { display: flex; flex-wrap: wrap; }
    .en-seg .st-segmented__item { flex: 1 1 auto; }
    .en-seg .st-segmented__item.is-on { background: var(--st-surface-raised); }
    .en-fit { display: grid; gap: 8px; }
    .en-fit[hidden] { display: none; }
    .en-num { display: grid; gap: 2px; }
    .en-big { display: flex; align-items: baseline; gap: 6px; color: var(--st-label); font-variant-numeric: tabular-nums; }
    .en-big b { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
    .en-big span { font-size: 14px; color: var(--st-label-2); }
    #enLegend { display: grid; gap: 8px; }
    .en-k-base { background: var(--map-land); }
    .en-k-line { height: 2px !important; background: var(--st-label-3); border-radius: 0 !important; }
    .en-conds { display: grid; gap: 12px; }
    .en-conds [hidden] { display: none; }
    .en-check { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--st-label-2); letter-spacing: var(--track-ko); }
    .en-check input { accent-color: var(--st-accent); }
    .en-sub { font-size: 12.5px; font-weight: 600; color: var(--st-label); letter-spacing: var(--track-ko); }
    .en-sub small { font-weight: 400; color: var(--st-label-3); margin-left: 4px; }
    .en-onlylist { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; }
    .en-only { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: var(--st-r-inner); font-size: 12.5px; color: var(--st-label-2); background: transparent; letter-spacing: var(--track-ko); font-variant-numeric: tabular-nums; }
    .en-only:hover, .en-only.is-on { background: var(--st-fill-2); color: var(--st-label); }
    .en-only b { color: var(--st-label); font-weight: 600; }
    .en-cmp { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; letter-spacing: var(--track-ko); }
    .en-cmp th, .en-cmp td { padding: 5px 4px; text-align: right; font-weight: 400; color: var(--st-label-2); }
    .en-cmp thead th { font-size: 11.5px; color: var(--st-label-3); vertical-align: bottom; }
    .en-cmp tbody th { text-align: left; color: var(--st-label-3); }
    .en-cmp td:nth-child(2) { color: var(--st-label); font-weight: 600; }
    .en-cmp tbody tr:nth-child(odd) { background: var(--st-fill-3); }
    #enCompare { display: grid; gap: 12px; }
    .en-after { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); margin-top: 16px; align-items: start; }
    @media (max-width: 900px) { .en-after { grid-template-columns: 1fr; } }
    .en-limits { font-size: 13px; color: var(--st-label-2); }
    .en-limits b { color: var(--st-label); font-weight: 600; }
  `;
  document.head.append(style);

  L = await loadLeaflet();
  map = L.map('enMap', { attributionControl: true });
  darkBase(L, map);
  map.attributionControl.addAttribution('Global Solar Atlas · Global Wind Atlas (CC BY 4.0) · Copernicus WorldDEM-90 · WorldPop');
  map.fitBounds([[33.1, 125.0], [38.65, 130.0]]);
  map.on('click', (e) => { pick = e.latlng; $('#enPick').innerHTML = pickText(); });

  const body = $('#mkBody');
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw()); };
  body.addEventListener('input', (e) => {
    const c = e.target.dataset.c, w = e.target.dataset.w;
    if (c === 'n') { st.c.n = e.target.checked ? 1 : 0; later(); return; }
    if (c) {
      st.c[c] = Number(e.target.value);
      if (c === 'd0' && st.c.d0 > st.c.d1) st.c.d1 = st.c.d0;
      if (c === 'd1' && st.c.d1 < st.c.d0) st.c.d0 = st.c.d1;
      // 조건 칸은 기술 · 방법이 바뀔 때만 새로 만든다 — 여기서는 글자만 바꾸고 지도를 다시 칠한다
      const out = e.target.parentElement.querySelector('output');
      if (out) out.textContent = c === 'p' ? popTxt(st.c.p) : c === 's' ? `${st.c.s}°` : c === 'r' ? `${fmt(st.c.r, tech().rng.r[2] < 1 ? 1 : 0)} ${tech().unit}` : `${st.c[c]}km`;
      if (c === 'd0' || c === 'd1') { const o = c === 'd0' ? 'd1' : 'd0', el = $(`#en${o.toUpperCase()}`); if (el) { el.value = st.c[o]; el.parentElement.querySelector('output').textContent = `${st.c[o]}km`; } }
      later();
      return;
    }
    if (w) { st.w[w] = Number(e.target.value); e.target.parentElement.querySelector('output').textContent = st.w[w]; later(); }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v],[data-t],[data-mm],[data-hl]');
    if (!b || !body.contains(b)) return;
    if (b.dataset.v) st.v = b.dataset.v;
    else if (b.dataset.t) { if (st.t !== b.dataset.t) { st.t = b.dataset.t; st.c = { ...TECH[st.t].cond }; st.hl = null; } st.v = 'fit'; }
    else if (b.dataset.mm) { st.mm = b.dataset.mm; st.hl = null; }
    else if (b.dataset.hl) st.hl = st.hl === b.dataset.hl ? null : b.dataset.hl;
    draw();
  });
  shareButton($('#enShare'), () => location.href, () => (st.v === 'fit' ? `${tech().name} 적지 찾기` : st.v === 'ghi' ? '햇빛 자원' : '바람 자원'));
  await draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
