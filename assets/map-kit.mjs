// 통합사회 GIS 지도(maps.html · map-*.html) 공용 도구.
// 지도 페이지마다 같은 일을 다시 짜지 않도록: 수 쓰기, 말풍선, 색 단계, 범례, 주소 상태, 공유, Leaflet 불러오기,
// 세계(Equal Earth) · 한반도 투영. 스타일은 design-system/geo.css 「지도 실험실 공용」.
import { openShare, SHARE_ICON } from './share-link.mjs?v=53919a56';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 수 — dp 자리까지, 1만 이상 사람 수는 「만」 */
export function fmt(v, dp = 0, { man = false } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (man && Math.abs(v) >= 1e4) return (v / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 1e6 ? 0 : 1 }) + '만';
  return v.toLocaleString('ko-KR', { minimumFractionDigits: Math.min(dp, 1), maximumFractionDigits: dp });
}

// ── 말풍선 — host 안에서 마우스를 따라간다. data-tip="첫 줄|둘째 줄" 을 가진 요소에 붙인다 ──
export function tips(root, { host = (t) => t.closest('.mk-tiphost') || root } = {}) {
  let el = null;
  const show = (e, lines, h) => {
    if (!el || el.parentNode !== h) { el?.remove(); el = document.createElement('div'); el.className = 'clim-tip'; h.append(el); }
    el.innerHTML = lines.map((l, i) => (i ? `<span>${esc(l)}</span>` : `<b>${esc(l)}</b>`)).join('');
    const r = h.getBoundingClientRect();
    el.style.display = 'grid';
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + el.offsetWidth > r.width - 4) x = e.clientX - r.left - el.offsetWidth - 14;
    if (y + el.offsetHeight > r.height - 4) y = e.clientY - r.top - el.offsetHeight - 14;
    el.style.transform = `translate(${Math.max(4, x)}px,${Math.max(4, y)}px)`;
  };
  const hide = () => { if (el) el.style.display = 'none'; };
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) return hide();
    show(e, t.dataset.tip.split('|'), host(t));
  });
  root.addEventListener('pointerleave', hide);
  return { show, hide };
}

// ── 색 단계 — dataviz 검사기로 고른 값(geo.css 의 --kr-* 토큰을 그대로 쓴다) ──
export const SEQ = ['--kr-s1', '--kr-s2', '--kr-s3', '--kr-s4', '--kr-s5'];
export const DIV = ['--kr-n2', '--kr-n1', '--kr-mid', '--kr-p1', '--kr-p2'];
/** 순위로 다섯 칸(사분위 비슷하게) */
export function quantileClasses(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const br = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return { of: (x) => (x == null ? null : SEQ[br.filter((b) => x >= b).length]), breaks: br, min: v[0], max: v[v.length - 1] };
}
/** 기준(mid) 위아래 */
export function divergingClasses(values, mid = 0) {
  const span = Math.max(...values.filter((x) => x != null).map((x) => Math.abs(x - mid))) || 1;
  return {
    of: (x) => {
      if (x == null) return null;
      const t = (x - mid) / span;
      if (Math.abs(t) < 0.12) return DIV[2];
      return t < 0 ? DIV[t < -0.55 ? 0 : 1] : DIV[t > 0.55 ? 4 : 3];
    },
    span, mid,
  };
}
/** 범례 막대 — 색 칸과 양 끝 글자 */
export function legendBar(colors, lo, hi, mid) {
  return `<div class="mk-legend">${colors.map((c, i) => `<span><i style="background:var(${c})"></i>${i === 0 ? esc(lo) : i === colors.length - 1 ? esc(hi) : i === 2 && mid ? esc(mid) : ''}</span>`).join('')}</div>`;
}

// ── 주소 상태 ──
export function params() { return new URLSearchParams(location.search); }
export function setParams(obj) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  const url = location.pathname.split('/').pop() + (q.toString() ? '?' + q.toString().replace(/%2C/g, ',') : '');
  try { history.replaceState(null, '', url); } catch {}
  return new URL(url, location.href).href;
}
/** 공유 단추 */
export function shareButton(btn, getUrl, getNote) {
  btn.innerHTML = SHARE_ICON + '공유';
  btn.addEventListener('click', () => openShare(getUrl(), getNote?.() || ''));
}

// ── Leaflet — 저장소에 있는 사본을 한 번만 불러온다 ──
let leaflet = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leaflet) {
    leaflet = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'assets/sim-vendor/leaflet.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'assets/sim-vendor/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.append(s);
    });
  }
  return leaflet;
}
/** 어두운 바탕 지도 — OpenStreetMap 표준 타일을 CSS 필터로 어둡게(geo.css .mk-osm-dark).
 *  CARTO 어두운 타일은 2026-10부터 인증키를 요구해서 바꿨다. OSM 타일 사용 정책(적은 양 · 출처 표기)을 지킨다.
 *  labels 인자는 예전 호출과 맞추려고 남겨 둔다(OSM 타일에는 지명이 함께 들어 있다). */
export function darkBase(L, map) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    maxZoom: 19, className: 'mk-osm-dark',
  }).addTo(map);
}
/** 위성 영상(EOX Sentinel-2 cloudless, 연도별) — year: 2016~2023 */
export function satellite(L, year) {
  const layer = year === 2016 ? 's2cloudless_3857' : `s2cloudless-${year}_3857`;
  return L.tileLayer(`https://tiles.maps.eox.at/wmts/1.0.0/${layer}/default/g/{z}/{y}/{x}.jpg`, {
    attribution: `Sentinel-2 cloudless ${year} by <a href="https://s2maps.eu">EOX IT Services GmbH</a> (Copernicus Sentinel data ${year})`, maxZoom: 15,
  });
}

// ── 투영 ──
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
/** 세계 — Equal Earth. data/climate/basemap.json 의 world(w,h,s)와 같은 식 */
export function equalEarth(W) {
  return (lon, lat) => {
    const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
    const th = Math.asin(M * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
    const x = (l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [W.w / 2 + x * W.s, W.h / 2 - y * W.s];
  };
}
let basemap = null;
export const loadBasemap = () => (basemap ||= fetch('data/climate/basemap.json').then((r) => r.json()));

// ── 판 머리: 단원 · 질문 · GIS 개념 ──
export function sheetHead({ unit, title, q, concept }) {
  return `<p class="mk-unit">${esc(unit)}</p><h1 class="mk-title">${esc(title)}</h1><p class="mk-q">${esc(q)}</p>${concept ? `<p class="mk-concept"><span>GIS</span>${esc(concept)}</p>` : ''}`;
}

/** 판 머리와 앞뒤 이동을 채운다. 각 map-*.mjs 가 맨 처음 부른다 */
export async function initPage(id) {
  const { byId, neighbors, COURSES } = await import('./maps-list.mjs');
  const m = byId(id);
  const head = $('#mkHead');
  if (head && m) head.innerHTML = sheetHead({ unit: `${COURSES[m.course]} · ${m.unit}`, title: m.title, q: m.q, concept: m.concept });
  const { prev, next } = neighbors(id);
  const nav = $('#mkNav');
  if (nav) nav.innerHTML = `${prev ? `<a href="map-${prev.id}.html">← ${esc(prev.title)}</a>` : '<span></span>'}<a href="maps.html">지도 목록</a>${next ? `<a href="map-${next.id}.html">${esc(next.title)} →</a>` : '<span></span>'}`;
  return m;
}
