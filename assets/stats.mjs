// 통계(stats.html) — 세계은행 세계 개발 지표로 우리나라와 세계를 견준다.
// 보기 넷: 지역별 분포(나라마다 점 하나) · 추이(해마다) · 관계(두 지표) · 표.
// 자료: data/stats/latest.json(가장 최근 값) · data/stats/series/<지표>.json(추이를 열 때만)
// 고른 지표 · 보기 · 함께 볼 나라는 주소에 담긴다.
import { TOPICS, INDICATORS, BY_CODE } from './stats-indicators.mjs?v=6646ba79';
import { openShare, SHARE_ICON } from './share-link.mjs?v=53919a56';
import { initKorea } from './stats-korea.mjs?v=aaf8d06d';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REG_SHORT = { EAS: '동아시아 · 태평양', ECS: '유럽 · 중앙아시아', LCN: '라틴 아메리카', MEA: '중동 · 북아프리카', NAC: '북아메리카', SAS: '남아시아', SSF: '사하라 이남 아프리카' };
const MAXPIN = 5; // 우리나라 말고 더 고를 수 있는 나라 수
const VIEWS = { dist: '지역별 분포', trend: '추이', xy: '관계', table: '표' };

let D = null;           // latest.json
let C = new Map();      // 나라 id → 나라
const seriesCache = new Map();
const state = { scope: 'world', i: 'SP.DYN.TFRT.IN', v: 'dist', x: 'NY.GNP.PCAP.PP.CD', pins: [], region: null, sort: 'desc' };

// ── 수 쓰기 ──
function num(v, ind, { unit = true } = {}) {
  if (v == null) return '—';
  const a = Math.abs(v);
  let s;
  if (ind.unit === '명' && a >= 1e8) s = (v / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억';
  else if (ind.unit === '명' && a >= 1e4) s = Math.round(v / 1e4).toLocaleString('ko-KR') + '만';
  else s = v.toLocaleString('ko-KR', { minimumFractionDigits: ind.dp ? Math.min(ind.dp, 1) : 0, maximumFractionDigits: ind.dp });
  return unit && ind.unit ? `${s}${ind.unit === '%' ? '%' : ' ' + ind.unit}` : s;
}
const nameOf = (id) => C.get(id)?.ko || D.agg[id] || id;

// ── 주소 ──
function fromUrl() {
  const q = new URLSearchParams(location.search);
  if (BY_CODE[q.get('i')]) state.i = q.get('i');
  if (VIEWS[q.get('v')]) state.v = q.get('v');
  if (BY_CODE[q.get('x')]) state.x = q.get('x');
  else state.x = BY_CODE[state.i].pair || 'NY.GNP.PCAP.PP.CD';
  if (D.regions.includes(q.get('r'))) state.region = q.get('r');
  state.pins = (q.get('pin') || '').split(',').filter((id) => C.has(id) && id !== 'KOR').slice(0, MAXPIN);
}
function toUrl() {
  const q = new URLSearchParams();
  q.set('i', state.i);
  if (state.v !== 'dist') q.set('v', state.v);
  if (state.v === 'xy') q.set('x', state.x);
  if (state.region) q.set('r', state.region);
  if (state.pins.length) q.set('pin', state.pins.join(','));
  const url = location.pathname.split('/').pop() + '?' + q.toString().replace(/%2C/g, ',');
  try { history.replaceState(null, '', url); } catch {}
  return new URL(url, location.href).href;
}

// 강조할 나라 — 우리나라가 늘 첫째(색 1), 나머지는 고른 순서대로. 하나를 빼도 남은 나라의 색은 그대로 두려고 자리 번호를 쓴다
const slotMap = new Map([['KOR', 0]]);
function slots() {
  for (const id of [...slotMap.keys()]) if (id !== 'KOR' && !state.pins.includes(id)) slotMap.delete(id);
  for (const id of state.pins) if (!slotMap.has(id)) { const used = new Set(slotMap.values()); let s = 1; while (used.has(s)) s++; slotMap.set(id, s); }
  return slotMap;
}
const focusIds = () => ['KOR', ...state.pins];

// ── 말풍선 ──
const tip = {
  el: null,
  show(e, lines, host) {
    if (!this.el || this.el.parentNode !== host) { this.el?.remove(); this.el = document.createElement('div'); this.el.className = 'clim-tip'; host.append(this.el); }
    this.el.innerHTML = lines.map((l, i) => (i ? `<span>${esc(l)}</span>` : `<b>${esc(l)}</b>`)).join('');
    const r = host.getBoundingClientRect();
    this.el.style.display = 'grid';
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + this.el.offsetWidth > r.width - 4) x = e.clientX - r.left - this.el.offsetWidth - 14;
    if (y + this.el.offsetHeight > r.height - 4) y = e.clientY - r.top - this.el.offsetHeight - 14;
    this.el.style.transform = `translate(${Math.max(4, x)}px,${Math.max(4, y)}px)`;
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};

// ── 눈금 ──
function scale(values, log, [a, b]) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (log) {
    const pos = values.filter((v) => v > 0);
    lo = Math.min(...pos); hi = Math.max(...pos);
    const L0 = Math.floor(Math.log10(lo)), L1 = Math.ceil(Math.log10(hi));
    const f = (v) => a + ((Math.log10(Math.max(v, 10 ** L0)) - L0) / (L1 - L0 || 1)) * (b - a);
    const ticks = [];
    for (let p = L0; p <= L1; p++) ticks.push(10 ** p);
    return { f, ticks, log: true };
  }
  if (lo > 0 && lo / hi < 0.5) lo = 0;
  const span = hi - lo || 1;
  const p = 10 ** Math.floor(Math.log10(span / 5));
  const n = span / 5 / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { f: (v) => a + ((v - lo) / (hi - lo || 1)) * (b - a), ticks, log: false };
}
const tickTxt = (v, ind) => {
  const a = Math.abs(v);
  if (a >= 1e9) return v / 1e9 + 'B';
  if (a >= 1e6) return v / 1e6 + 'M';
  if (a >= 1e4) return v / 1e3 + 'K';
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
};

// ── 보기 1: 지역별 분포 — 지역마다 한 줄, 나라마다 점 하나 ──
function distView(ind) {
  const L = D.latest[ind.code];
  const rows = D.regions.map((r) => ({ r, items: D.countries.filter((c) => c.r === r && L[c.id]) }));
  const vals = D.countries.filter((c) => L[c.id]).map((c) => L[c.id][0]);
  const W = 900, lane = 46, top = 28, left = 150, right = 24;
  const H = top + rows.length * lane + 34;
  const sc = scale(vals, ind.log, [left, W - right]);
  const sl = slots();
  let g = '';
  for (const t of sc.ticks) g += `<line class="cg-grid" x1="${sc.f(t)}" x2="${sc.f(t)}" y1="${top - 6}" y2="${H - 30}"/><text class="cg-tick" x="${sc.f(t)}" y="${H - 12}" text-anchor="middle">${tickTxt(t, ind)}</text>`;
  if (L.WLD) {
    const x = sc.f(L.WLD[0]);
    g += `<line class="wd-ref" x1="${x}" x2="${x}" y1="${top - 14}" y2="${H - 30}"/><text class="wd-reflab" x="${x}" y="${top - 18}" text-anchor="middle">세계 ${num(L.WLD[0], ind)}</text>`;
  }
  rows.forEach(({ r, items }, k) => {
    const y = top + k * lane + lane / 2;
    const dim = state.region && state.region !== r;
    g += `<g class="wd-lane${dim ? ' is-dim' : ''}"><text class="wd-lanelab" x="${left - 14}" y="${y + 4}" text-anchor="end" data-r="${r}">${REG_SHORT[r]}</text>`;
    if (L[r]) g += `<line class="wd-regavg" x1="${sc.f(L[r][0])}" x2="${sc.f(L[r][0])}" y1="${y - 13}" y2="${y + 13}"/>`;
    // 같은 자리 점이 겹치지 않게 위아래로 조금씩 흩는다(나라 id로 정해 늘 같은 자리)
    for (const c of items) {
      const v = L[c.id][0];
      const jitter = ((parseInt(c.id, 36) % 9) - 4) * 2.4;
      const hl = sl.has(c.id);
      g += `<circle class="wd-dot${hl ? ` is-hl s${sl.get(c.id) + 1}` : ''}" cx="${sc.f(v)}" cy="${y + (hl ? 0 : jitter)}" r="${hl ? 6 : 4}" data-id="${c.id}"
        data-tip="${esc(`${c.ko}|${num(v, ind)} (${L[c.id][1]})|${REG_SHORT[c.r]} · ${D.income[c.inc] || ''}`)}"/>`;
    }
    g += '</g>';
  });
  // 강조한 나라 이름 — 점 위 · 아래로 번갈아 놓아 겹치지 않게(같은 줄에서 가까운 나라끼리)
  const placed = [];
  const spots = [-11, 22, -25, 36];
  for (const id of focusIds().filter((x) => C.get(x) && L[x]).sort((p, q) => L[p][0] - L[q][0])) {
    const c = C.get(id), k = D.regions.indexOf(c.r), x = sc.f(L[id][0]), y = top + k * lane + lane / 2;
    const w = c.ko.length * 12.5 + 8;
    const dy = spots.find((d) => !placed.some((p) => p.k === k && p.dy === d && Math.abs(p.x - x) < (p.w + w) / 2)) ?? spots[0];
    placed.push({ k, x, w, dy });
    g += `<text class="wd-hllab" x="${x}" y="${y + dy}" text-anchor="middle">${esc(c.ko)}</text>`;
  }
  return `<figure class="cg-wrap wd-fig"><svg class="cg wd-dist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ind.name)}의 지역별 분포">${g}</svg>
    <figcaption class="wd-cap">점 하나가 나라 하나 · 짧은 세로선은 그 지역 평균${ind.log ? ' · 로그 눈금(한 칸마다 10배)' : ''} · 점을 누르면 강조합니다</figcaption></figure>`;
}

// ── 보기 2: 추이 ──
async function loadSeries(code) {
  if (!seriesCache.has(code)) seriesCache.set(code, fetch(`data/stats/series/${code}.json`).then((r) => r.json()));
  return seriesCache.get(code);
}
async function trendView(ind) {
  const S = await loadSeries(ind.code);
  const ids = [...focusIds(), 'WLD', 'OED'].filter((id) => S.v[id]);
  const years = Array.from({ length: S.to - S.from + 1 }, (_, i) => S.from + i);
  // 값이 처음 나오는 해부터
  const firstIdx = Math.min(...ids.map((id) => S.v[id].findIndex((v) => v != null)).filter((i) => i >= 0));
  const ys = years.slice(firstIdx);
  const W = 900, H = 380, l = 64, r = 120, t = 20, b = 34;
  const vals = ids.flatMap((id) => S.v[id].slice(firstIdx)).filter((v) => v != null);
  const sy = scale(vals, ind.log, [H - b, t]);
  const sx = (i) => l + (i / Math.max(1, ys.length - 1)) * (W - l - r);
  const sl = slots();
  let g = '';
  for (const tk of sy.ticks) g += `<line class="cg-grid" x1="${l}" x2="${W - r}" y1="${sy.f(tk)}" y2="${sy.f(tk)}"/><text class="cg-tick" x="${l - 8}" y="${sy.f(tk) + 4}" text-anchor="end">${tickTxt(tk, ind)}</text>`;
  for (let i = 0; i < ys.length; i++) if (ys[i] % 10 === 0) g += `<text class="cg-month" x="${sx(i)}" y="${H - 10}" text-anchor="middle">${ys[i]}</text>`;
  const labels = [];
  for (const id of ids) {
    const arr = S.v[id].slice(firstIdx);
    let d = '', pen = false;
    arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy.f(v).toFixed(1)}`; pen = true; });
    const ref = id === 'WLD' || id === 'OED';
    const cls = ref ? `wd-refline${id === 'OED' ? ' is-oecd' : ''}` : `cmp-line`;
    g += `<g class="${ref ? '' : `cmp s${sl.get(id) + 1}`}"><path class="${cls}" d="${d}"/></g>`;
    const li = arr.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
    if (li != null && li >= 0) labels.push({ y: sy.f(arr[li]), x: sx(li), id, ref, v: arr[li], year: ys[li] });
  }
  // 끝 이름표가 겹치면 위아래로 벌린다(점과 이름 사이에는 가는 이음선)
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].ly = (labels[i - 1].ly ?? labels[i - 1].y) + 14;
  for (const lb of labels) {
    const ly = lb.ly ?? lb.y;
    g += `<circle class="${lb.ref ? 'wd-refdot' : `cmp s${sl.get(lb.id) + 1}`}" cx="${lb.x}" cy="${lb.y}" r="4"/>`;
    if (ly !== lb.y) g += `<path class="wd-leader" d="M${lb.x + 5},${lb.y}L${W - r + 4},${ly}"/>`;
    g += `<text class="wd-endlab${lb.ref ? ' is-ref' : ''}" x="${W - r + 8}" y="${ly + 4}">${esc(nameOf(lb.id))}</text>`;
  }
  // 해마다 세로 띠 — 마우스를 올리면 그해 값
  const bw = (W - l - r) / Math.max(1, ys.length - 1);
  ys.forEach((y, i) => {
    const rowsTxt = ids.map((id) => `${nameOf(id)} ${num(S.v[id][firstIdx + i], ind)}`).join('|');
    g += `<rect class="cg-hit" x="${sx(i) - bw / 2}" y="${t}" width="${bw}" height="${H - t - b}" data-tip="${esc(`${y}년|${rowsTxt}`)}"/>`;
  });
  return `<figure class="cg-wrap wd-fig"><svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ind.name)}의 추이">${g}</svg>
    <figcaption class="wd-cap">${ys[0]}–${S.to}년 · 회색 실선은 세계, 회색 점선은 OECD 회원국 평균${ind.log ? ' · 로그 눈금' : ''}</figcaption></figure>`;
}

// ── 보기 3: 관계 — 가로 x 지표, 세로 지금 지표 ──
function xyView(ind) {
  const X = BY_CODE[state.x];
  const LY = D.latest[ind.code], LX = D.latest[X.code];
  const pts = D.countries.filter((c) => LY[c.id] && LX[c.id] && (!X.log || LX[c.id][0] > 0) && (!ind.log || LY[c.id][0] > 0));
  const W = 900, H = 480, l = 70, r = 24, t = 20, b = 50;
  const sx = scale(pts.map((c) => LX[c.id][0]), X.log, [l, W - r]);
  const sy = scale(pts.map((c) => LY[c.id][0]), ind.log, [H - b, t]);
  const sl = slots();
  let g = '';
  for (const tk of sy.ticks) g += `<line class="cg-grid" x1="${l}" x2="${W - r}" y1="${sy.f(tk)}" y2="${sy.f(tk)}"/><text class="cg-tick" x="${l - 8}" y="${sy.f(tk) + 4}" text-anchor="end">${tickTxt(tk, ind)}</text>`;
  for (const tk of sx.ticks) g += `<line class="cg-grid" x1="${sx.f(tk)}" x2="${sx.f(tk)}" y1="${t}" y2="${H - b}"/><text class="cg-tick" x="${sx.f(tk)}" y="${H - b + 18}" text-anchor="middle">${tickTxt(tk, X)}</text>`;
  g += `<text class="cg-unit" x="${W - r}" y="${H - 8}" text-anchor="end">${esc(X.name)}${X.unit ? ` (${esc(X.unit)})` : ''} →</text>`;
  g += `<text class="cg-unit" x="${l}" y="${t - 6}">↑ ${esc(ind.name)}${ind.unit ? ` (${esc(ind.unit)})` : ''}</text>`;
  const order = pts.slice().sort((a, b) => (sl.has(a.id) ? 1 : 0) - (sl.has(b.id) ? 1 : 0));
  for (const c of order) {
    const hl = sl.has(c.id), dim = state.region && c.r !== state.region;
    g += `<circle class="wd-dot${hl ? ` is-hl s${sl.get(c.id) + 1}` : ''}${dim && !hl ? ' is-dim' : ''}" cx="${sx.f(LX[c.id][0])}" cy="${sy.f(LY[c.id][0])}" r="${hl ? 6.5 : 4.2}" data-id="${c.id}"
      data-tip="${esc(`${c.ko}|${X.name} ${num(LX[c.id][0], X)} (${LX[c.id][1]})|${ind.name} ${num(LY[c.id][0], ind)} (${LY[c.id][1]})`)}"/>`;
    if (hl) g += `<text class="wd-hllab" x="${sx.f(LX[c.id][0]) + 9}" y="${sy.f(LY[c.id][0]) - 8}">${esc(c.ko)}</text>`;
  }
  const opts = INDICATORS.filter((i) => i.code !== ind.code).map((i) => `<option value="${i.code}"${i.code === state.x ? ' selected' : ''}>${esc(i.name)}</option>`).join('');
  return `<div class="wd-xyctl"><label for="xSel">가로축</label><select class="form-input" id="xSel">${opts}</select>
      ${ind.pair && ind.pair !== state.x ? `<button type="button" class="opt" data-x="${ind.pair}">추천: ${esc(BY_CODE[ind.pair].name)}</button>` : ''}</div>
    <figure class="cg-wrap wd-fig"><svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(X.name)}와 ${esc(ind.name)}의 관계">${g}</svg>
    <figcaption class="wd-cap">점 하나가 나라 하나 · ${pts.length}개국${X.log || ind.log ? ' · 로그 눈금이 있는 축은 한 칸마다 10배' : ''} · 나라마다 최근 값의 해가 다를 수 있습니다</figcaption></figure>`;
}

// ── 보기 4: 표 ──
function tableView(ind) {
  const L = D.latest[ind.code];
  let list = D.countries.filter((c) => L[c.id]).map((c) => ({ c, v: L[c.id][0], y: L[c.id][1] }));
  list.sort((a, b) => (state.sort === 'desc' ? b.v - a.v : a.v - b.v));
  const rank = new Map(list.map((x, i) => [x.c.id, i + 1]));
  if (state.region) list = list.filter((x) => x.c.r === state.region);
  const sl = slots();
  const aggRows = ['WLD', 'HIC', 'UMC', 'LMC', 'LIC'].filter((id) => L[id]).map((id) => `<tr class="wd-agg"><td></td><td>${esc(D.agg[id])}</td><td></td><td>${num(L[id][0], ind, { unit: false })}</td><td>${L[id][1]}</td></tr>`).join('');
  return `<div class="wd-tablewrap"><table class="dtable wd-table">
    <caption class="st-sr-only">${esc(ind.name)} 나라별 최근 값</caption>
    <thead><tr><th scope="col">순위</th><th scope="col">나라</th><th scope="col">지역</th><th scope="col"><button type="button" class="wd-sort" data-sort="1">${esc(ind.name)}${ind.unit ? ` (${esc(ind.unit)})` : ''} ${state.sort === 'desc' ? '↓' : '↑'}</button></th><th scope="col">연도</th></tr></thead>
    <tbody>${aggRows}${list.map((x) => `<tr class="${sl.has(x.c.id) ? `is-hl s${sl.get(x.c.id) + 1}` : ''}"><td>${rank.get(x.c.id)}</td><td><button type="button" class="wd-pinbtn" data-id="${x.c.id}">${esc(x.c.ko)}</button></td><td>${REG_SHORT[x.c.r]}</td><td>${num(x.v, ind, { unit: false })}</td><td>${x.y}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

// ── 지표 머리 ──
function head(ind) {
  const L = D.latest[ind.code];
  const vals = D.countries.filter((c) => L[c.id]).map((c) => L[c.id][0]).sort((a, b) => b - a);
  const kor = L.KOR;
  const rank = kor ? vals.indexOf(kor[0]) + 1 : null;
  const old = (id) => (L[id] && L[id][1] < Math.max(...Object.values(L).map((x) => x[1])) - 3 ? ' · 오래된 값' : '');
  return `<div class="wd-head">
      <div class="wd-title"><p class="wd-topic">${esc(TOPICS.find((t) => t.id === ind.topic).name)}</p><h2>${esc(ind.name)}</h2></div>
      <dl class="wd-figs">
        <div class="wd-kor"><dt>대한민국 · ${kor ? kor[1] : ''}</dt><dd>${kor ? num(kor[0], ind) : '자료 없음'}</dd>${rank ? `<p>${vals.length}개국 가운데 높은 순 ${rank}위${old('KOR')}</p>` : ''}</div>
        <div><dt>세계 · ${L.WLD ? L.WLD[1] : ''}</dt><dd>${L.WLD ? num(L.WLD[0], ind) : '—'}</dd></div>
        <div><dt>OECD 회원국 · ${L.OED ? L.OED[1] : ''}</dt><dd>${L.OED ? num(L.OED[0], ind) : '—'}</dd></div>
      </dl>
    </div>
    <div class="wd-text"><p class="wd-def">${esc(ind.def)}</p><p class="wd-read"><span>생각할 것</span>${esc(ind.read)}</p></div>`;
}

// ── 그리기 ──
function drawTopics() {
  const ind = BY_CODE[state.i];
  $('#topics').innerHTML = TOPICS.map((t) => `<button type="button" class="wd-topicbtn${t.id === ind.topic ? ' is-on' : ''}" data-topic="${t.id}" aria-pressed="${t.id === ind.topic}">${esc(t.name)}</button>`).join('');
  const L = (code) => D.latest[code];
  $('#indList').innerHTML = INDICATORS.filter((i) => i.topic === ind.topic).map((i) => `
    <li><button type="button" class="wd-ind${i.code === state.i ? ' is-on' : ''}" data-i="${i.code}" aria-current="${i.code === state.i}">
      <span class="wd-ind__n">${esc(i.name)}</span>
      <span class="wd-ind__v"><b>${L(i.code).KOR ? num(L(i.code).KOR[0], i) : '—'}</b><small>세계 ${L(i.code).WLD ? num(L(i.code).WLD[0], i) : '—'}</small></span>
    </button></li>`).join('');
}
function drawPins() {
  const sl = slots();
  $('#pins').innerHTML = focusIds().map((id) => `<span class="wd-pin s${sl.get(id) + 1}"><i></i>${esc(nameOf(id))}${id === 'KOR' ? '' : `<button type="button" data-unpin="${id}" aria-label="${esc(nameOf(id))} 빼기">×</button>`}</span>`).join('')
    + (state.pins.length < MAXPIN ? '' : '<span class="wd-pinmax">더 고르려면 하나를 빼세요</span>');
  $('#regions').innerHTML = `<button type="button" class="lg-chip" data-region="" aria-pressed="${!state.region}">모든 지역</button>` + D.regions.map((r) => `<button type="button" class="lg-chip" data-region="${r}" aria-pressed="${state.region === r}">${REG_SHORT[r]}</button>`).join('');
}
let drawSeq = 0;
async function drawMain() {
  const ind = BY_CODE[state.i];
  $('#indHead').innerHTML = head(ind);
  $$('#viewSeg .st-segmented__item').forEach((b) => { const on = b.dataset.value === state.v; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  segThumb($('#viewSeg'));
  const host = $('#view');
  const seq = ++drawSeq;
  if (state.v === 'trend') {
    host.innerHTML = '<p class="wd-wait">해마다 값을 불러오는 중…</p>';
    try {
      const html = await trendView(ind);
      if (seq === drawSeq) host.innerHTML = html;
    } catch { if (seq === drawSeq) host.innerHTML = '<p class="wd-wait">추이 자료를 불러오지 못했습니다.</p>'; }
  } else host.innerHTML = state.v === 'dist' ? distView(ind) : state.v === 'xy' ? xyView(ind) : tableView(ind);
}
function render() {
  drawTopics();
  drawPins();
  drawMain();
  toUrl();
}
function segThumb(el) {
  let th = el.querySelector('.st-segmented__thumb');
  if (!th) { th = document.createElement('span'); th.className = 'st-segmented__thumb'; el.prepend(th); }
  const on = el.querySelector('.is-on');
  if (!on || !on.offsetWidth) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}

// ── 나라 찾기 ──
function searchEvents() {
  const input = $('#cq'), list = $('#cqList');
  let items = [], active = -1;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
  const paint = () => {
    list.innerHTML = items.map((c, i) => `<li role="option" id="co${i}" data-id="${c.id}" aria-selected="${i === active}"><b>${esc(c.ko)}</b><span>${REG_SHORT[c.r]}</span></li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    input.setAttribute('aria-activedescendant', active >= 0 ? 'co' + active : '');
  };
  const pick = (id) => { pin(id); input.value = ''; items = []; paint(); };
  input.addEventListener('input', () => {
    const n = norm(input.value);
    items = n ? D.countries.filter((c) => norm(c.ko).includes(n) || norm(c.en).includes(n)).sort((a, b) => norm(a.ko).indexOf(n) - norm(b.ko).indexOf(n)).slice(0, 8) : [];
    active = items.length ? 0 : -1;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active].id); }
    else if (e.key === 'Escape') { items = []; paint(); }
  });
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(li.dataset.id); } });
  input.addEventListener('blur', () => setTimeout(() => { items = []; paint(); }, 120));
}
function pin(id) {
  if (id === 'KOR' || !C.has(id)) return;
  if (state.pins.includes(id)) state.pins = state.pins.filter((x) => x !== id);
  else if (state.pins.length >= MAXPIN) { say(`우리나라 말고 ${MAXPIN}개국까지 강조할 수 있습니다.`); return; }
  else state.pins.push(id);
  drawPins(); drawMain(); toUrl();
}
function say(msg) { const el = $('#stStatus'); el.textContent = msg; clearTimeout(say.t); say.t = setTimeout(() => (el.textContent = ''), 4000); }

// ── 내려받기 ──
function rows() {
  const ind = BY_CODE[state.i];
  const L = D.latest[ind.code];
  const out = [['나라', '영문', '지역', `${ind.name}${ind.unit ? ` (${ind.unit})` : ''}`, '연도']];
  for (const id of ['WLD', 'OED', 'HIC', 'UMC', 'LMC', 'LIC']) if (L[id]) out.push([D.agg[id], '', '', L[id][0], L[id][1]]);
  for (const c of D.countries) if (L[c.id] && (!state.region || c.r === state.region)) out.push([c.ko, c.en, REG_SHORT[c.r], L[c.id][0], L[c.id][1]]);
  out.push([]);
  out.push([`출처: 세계은행 세계 개발 지표(${ind.code}), CC BY 4.0 · ${D.meta.built} 받음 · 정리 Leet's Geographia`]);
  return out;
}

function events() {
  $('#topics').addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (!b) return;
    const first = INDICATORS.find((i) => i.topic === b.dataset.topic);
    state.i = first.code;
    state.x = first.pair && first.pair !== first.code ? first.pair : state.x === first.code ? 'NY.GNP.PCAP.PP.CD' : state.x;
    render();
  });
  $('#indList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    state.i = b.dataset.i;
    const ind = BY_CODE[state.i];
    if (state.x === state.i || ind.pair) state.x = ind.pair && ind.pair !== state.i ? ind.pair : state.x === state.i ? 'NY.GNP.PCAP.PP.CD' : state.x;
    render();
    if (matchMedia('(max-width: 900px)').matches) $('#indHead').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (!b) return; state.v = b.dataset.value; drawMain(); toUrl(); });
  $('#regions').addEventListener('click', (e) => { const b = e.target.closest('[data-region]'); if (!b) return; state.region = b.dataset.region || null; drawPins(); drawMain(); toUrl(); });
  $('#pins').addEventListener('click', (e) => { const b = e.target.closest('[data-unpin]'); if (b) pin(b.dataset.unpin); });
  const view = $('#view');
  view.addEventListener('click', (e) => {
    const d = e.target.closest('[data-id]');
    if (d && d.dataset.id !== 'KOR') return pin(d.dataset.id);
    const s = e.target.closest('[data-sort]');
    if (s) { state.sort = state.sort === 'desc' ? 'asc' : 'desc'; drawMain(); return; }
    const x = e.target.closest('[data-x]');
    if (x) { state.x = x.dataset.x; drawMain(); toUrl(); }
  });
  view.addEventListener('change', (e) => { if (e.target.id === 'xSel') { state.x = e.target.value; drawMain(); toUrl(); } });
  view.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    $$('.cg-on', view).forEach((n) => n.classList.remove('cg-on'));
    if (!t) return tip.hide();
    t.classList.add('cg-on');
    tip.show(e, t.dataset.tip.split('|'), t.closest('.cg-wrap'));
  });
  view.addEventListener('pointerleave', () => tip.hide());
  $('#share').innerHTML = SHARE_ICON + '공유';
  $('#share').addEventListener('click', () => openShare(toUrl(), `${BY_CODE[state.i].name} · ${VIEWS[state.v]}${state.pins.length ? ` · 강조: 대한민국, ${state.pins.map(nameOf).join(', ')}` : ''}`));
  $('#csv').addEventListener('click', () => {
    const csv = rows().map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${BY_CODE[state.i].name}_세계은행.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('CSV 파일을 내려받았습니다.');
  });
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(rows().map((r) => r.join('\t')).join('\n')); say('표를 복사했습니다. 엑셀이나 한글 표에 붙여 넣으세요.'); }
    catch { say('복사하지 못했습니다. CSV로 받아 주세요.'); }
  });
  addEventListener('resize', () => segThumb($('#viewSeg')));
}

// ── 세계 ↔ 우리나라 시·도 ──
async function setScope(scope) {
  state.scope = scope;
  $$('#scopeSeg .st-segmented__item').forEach((b) => { const on = b.dataset.value === scope; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  segThumb($('#scopeSeg'));
  $('#worldView').hidden = scope !== 'world';
  $('#krView').hidden = scope !== 'kr';
  if (scope === 'kr') {
    try { await initKorea(say); } catch { $('#krBody').innerHTML = '<p class="wd-wait">시·도 자료를 불러오지 못했습니다.</p>'; }
  } else { render(); }
}

(async function init() {
  try {
    D = await fetch('data/stats/latest.json').then((r) => r.json());
  } catch {
    $('#view').innerHTML = '<p class="wd-wait">통계 자료를 불러오지 못했습니다. 새로고침해 주세요.</p>';
    return;
  }
  C = new Map(D.countries.map((c) => [c.id, c]));
  fromUrl();
  events();
  searchEvents();
  $('#scopeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b && b.dataset.value !== state.scope) setScope(b.dataset.value); });
  addEventListener('resize', () => segThumb($('#scopeSeg')));
  await setScope(new URLSearchParams(location.search).get('scope') === 'kr' ? 'kr' : 'world');
  $('#builtAt').textContent = D.meta.built;
  document.body.dataset.ready = 'true';
})();
