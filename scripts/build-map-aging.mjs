// 「시·군·구별 고령화와 인구 감소」 자료 → data/maps/aging/aging.json
// 실행: node scripts/build-map-aging.mjs   (지도 경계를 받으려고 인터넷 필요)
// 값: data/maps/aging/kosis-aged-2026-06.txt  — 국가데이터처 KOSIS DT_1YL20631 고령인구비율, 2026년 6월
//     data/maps/aging/kosis-growth-2025.txt   — 국가데이터처 KOSIS DT_1YL20621 인구증가율, 2025년(외국인 포함 총인구)
//   두 표 모두 KOSIS 통계표 화면의 시·군·구 줄을 옮긴 것(KOSIS 오픈 API는 인증키가 필요하다).
//   고령 비율을 2026년 6월로 고른 까닭: 2026년 7월 1일 광주 · 전남 통합과 인천 행정 체제 개편 바로 전 달이라
//   시·군·구 경계가 아래 지도(2018)와 가장 잘 맞는다.
// 지도: 통계청(현 국가데이터처) 센서스용 행정구역경계 2018, southkorea-maps 정리본(시·군·구 250곳).
//   일반구(수원시 장안구 등)는 시 하나로 합치고, 2023년 대구로 옮긴 군위군은 지도의 경북 군위군 모양을 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIDO = { 11: '서울', 21: '부산', 22: '대구', 23: '인천', 24: '광주', 25: '대전', 26: '울산', 29: '세종', 31: '경기도', 32: '강원', 33: '충청북도', 34: '충청남도', 35: '전북', 36: '전라남도', 37: '경상북도', 38: '경상남도', 39: '제주' };
const SHORT = { 서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 경기도: '경기', 강원: '강원', 충청북도: '충북', 충청남도: '충남', 전북: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주: '제주' };

function read(file) {
  const out = {};
  for (const line of readFileSync(join(ROOT, 'data/maps/aging', file), 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    for (const part of line.split(';')) {
      const i = part.lastIndexOf(':');
      if (i < 0) continue;
      const [a, b] = part.slice(i + 1).split('/').map((s) => (s === '' || s === '-' || s === 'undefined' ? null : Number(s)));
      out[part.slice(0, i).trim()] = { a, b };
    }
  }
  return out;
}
const aged = read('kosis-aged-2026-06.txt');
const growth = read('kosis-growth-2025.txt');

const topo = await (await fetch('https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json')).json();
const obj = Object.values(topo.objects)[0];
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
const ring = (ids) => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
// 시·도 통계 지도(build-korea-stats.mjs)와 같은 투영 — 같은 화면 크기에서 겹쳐 쓸 수 있게
const BOX = { lon0: 124.55, lat0: 38.65, lon1: 132.0, lat1: 33.05, w: 560 };
const kx = Math.cos((36 * Math.PI) / 180), S = BOX.w / ((BOX.lon1 - BOX.lon0) * kx);
BOX.h = Math.round((BOX.lat0 - BOX.lat1) * S);
const P = (lon, lat) => [(lon - BOX.lon0) * kx * S, (BOX.lat0 - lat) * S];

// 한 곳(key)에 여러 모양(일반구)을 모은다
const units = new Map();
for (const g of obj.geometries) {
  const code = String(g.properties.code);
  let sido = SIDO[code.slice(0, 2)];
  let name = g.properties.name.replace(/^(\S+?시)(\S+구)$/, '$1'); // 수원시장안구 → 수원시
  if (name === '군위군') sido = '대구'; // 2023-07-01 경북 → 대구
  if (sido === '인천' && name === '남구') name = '미추홀구'; // 2018-07-01 이름 바뀜
  const key = sido === '세종' ? '세종' : `${sido}>${name}`;
  if (!units.has(key)) units.set(key, { key, sido, name: sido === '세종' ? '세종특별자치시' : name, rings: [] });
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const poly of polys) for (const r of poly) units.get(key).rings.push(ring(r));
}
const features = [];
const unmatched = [];
for (const u of units.values()) {
  let d = '', best = 0, cx = 0, cy = 0;
  for (const r of u.rings) {
    const pts = r.map(([lo, la]) => P(lo, la));
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 0.8) out.push(p); }
    if (out.length < 3) continue;
    d += 'M' + out.map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).join('L') + 'Z';
    let a = 0, x = 0, y = 0;
    for (let i = 0; i < out.length; i++) { const [x0, y0] = out[i], [x1, y1] = out[(i + 1) % out.length]; const c = x0 * y1 - x1 * y0; a += c; x += (x0 + x1) * c; y += (y0 + y1) * c; }
    if (Math.abs(a) > best) { best = Math.abs(a); cx = x / (3 * a); cy = y / (3 * a); }
  }
  const A = aged[u.key], G = growth[u.key];
  if (!A || A.a == null) unmatched.push(u.key);
  features.push({ key: u.key, sido: SHORT[u.sido] || u.sido, name: u.name, d, cx: Math.round(cx), cy: Math.round(cy),
    aged: A?.a ?? null, pop: A?.b ?? null, growth: G?.a ?? null });
}
// 자료에는 있는데 지도에 없는 곳
const mapped = new Set(features.map((f) => f.key));
const dataOnly = Object.keys(aged).filter((k) => k.includes('>') && !mapped.has(k) && aged[k].a != null);
console.log('지도 곳', features.length, '값 없는 곳', unmatched, '지도에 없는 자료', dataOnly);

const out = {
  meta: {
    aged: { name: '고령 인구 비율', unit: '%', when: '2026년 6월', src: 'KOSIS DT_1YL20631(주민등록인구 기준)' },
    growth: { name: '인구 증가율', unit: '%', when: '2025년', src: 'KOSIS DT_1YL20621(외국인 포함 총인구, 전년 대비)' },
    nation: { aged: aged['전국']?.a, growth: growth['전국']?.a },
    map: '통계청(현 국가데이터처) 센서스용 행정구역경계 2018(southkorea-maps 정리본). 일반구는 시로 합침, 군위군은 대구 소속으로 표시.',
    built: new Date().toLocaleDateString('sv-SE'),
  },
  w: BOX.w, h: BOX.h,
  features,
};
writeFileSync(join(ROOT, 'data/maps/aging/aging.json'), JSON.stringify(out));
console.log('→ data/maps/aging/aging.json', Math.round(JSON.stringify(out).length / 1024) + 'KB');
