// 세계 흐름 지도(map-refugees · map-supply)가 함께 쓰는 나라 도형 · 대표점 · 이웃 관계를 만든다.
// build-map-refugees.mjs · build-map-supply.mjs 가 불러 쓴다(혼자 실행하지 않는다).
// 원자료(모두 공공 저작물이거나 자유 이용)
//  - 나라 경계: Natural Earth(공공 저작물)를 TopoJSON으로 옮긴 world-atlas 2.0.2 — countries-110m(그리기) · countries-50m(이웃 · 작은 나라)
//    https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/
//  - 대표점: Natural Earth 50m 인구 밀집지(ne_50m_populated_places_simple, 공공 저작물)의 수도(Admin-0 capital)
//    https://github.com/nvkelso/natural-earth-vector
//  - 숫자 국가 코드(ISO 3166-1 numeric) → 세 글자 코드: i18n-iso-countries 7.14.0 codes.json(MIT)
// 도법은 data/climate/basemap.json(scripts/build-climate-map.mjs)과 같은 Equal Earth, 가로 1000.
// 이웃 = 50m 경계에서 두 나라가 같은 호(arc)를 함께 쓰는 경우 — 땅으로 국경을 맞댄 나라(해외 영토의 국경도 포함).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const CACHE = join(tmpdir(), 'map-src');
mkdirSync(CACHE, { recursive: true });
/** 한 번 받은 파일은 임시 폴더에 두고 다시 쓴다 */
export async function cached(name, url, { json = true } = {}) {
  const f = join(CACHE, name);
  if (!existsSync(f)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  const t = readFileSync(f, 'utf8');
  return json ? JSON.parse(t) : t;
}

// ── TopoJSON 풀기(build-climate-map.mjs 와 같은 식) ──
function arcsOf(t) {
  const { scale: [sx, sy], translate: [tx, ty] } = t.transform;
  return t.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
}
const polysOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);
function ringsOf(geom, arcs) {
  const line = (ids) => ids.flatMap((i, k) => {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    return k ? a.slice(1) : a;
  });
  return polysOf(geom).flatMap((p) => p.map(line));
}
function splitDateline(ring) {
  const parts = [[]];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[i - 1];
    if (q && Math.abs(p[0] - q[0]) > 180) parts.push([]);
    parts[parts.length - 1].push(p);
  }
  return parts;
}

// ── 도법(Equal Earth, basemap.json 의 world 와 같은 값) ──
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
export const WORLD = { w: 1000 };
WORLD.s = WORLD.w / 2 / (Math.PI / (M * A1));
WORLD.h = Math.ceil(2 * WORLD.s * 1.3173627) + 2;
export function project(lon, lat) {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  const th = Math.asin(M * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [WORLD.w / 2 + x * WORLD.s, WORLD.h / 2 - y * WORLD.s];
}
const r1 = (v) => Math.round(v * 10) / 10;
function pathOf(rings) {
  let d = '';
  for (const ring of rings) {
    const out = [];
    for (const [lon, lat] of ring) {
      const [x, y] = project(lon, lat);
      const p = [r1(x), r1(y)], q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) >= 0.5) out.push(p);
    }
    if (out.length >= 3) d += 'M' + out.map((p) => p.join(',')).join('L') + 'Z';
  }
  return d;
}
// 고리의 넓이(경위도 평면) — 가장 큰 덩어리를 고를 때만 쓴다
const areaOf = (ring) => Math.abs(ring.reduce((a, [x, y], i) => { const [u, v] = ring[(i + 1) % ring.length]; return a + x * v - u * y; }, 0) / 2);

// 이름만 있고 숫자 코드가 없는 world-atlas 도형
const NAME_ISO = { Kosovo: 'XKX', 'N. Cyprus': null, Somaliland: null, 'Indian Ocean Ter.': null, 'Siachen Glacier': null };

/**
 * 나라 표 — { ISO3: { d(110m 경로, 없으면 ''), p:[x,y] 대표점, nb:[이웃 ISO3…] } }
 * 같은 ISO3 로 이어지는 도형(예: 북키프로스 · 소말릴란드)은 이웃 계산에서 빠진다.
 */
export async function worldCountries() {
  const AT = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/';
  const [t110, t50, codes, pp] = await Promise.all([
    cached('countries-110m.json', AT + 'countries-110m.json'),
    cached('countries-50m.json', AT + 'countries-50m.json'),
    cached('iso-codes.json', 'https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/codes.json'),
    cached('ne_50m_populated_places_simple.geojson', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson'),
  ]);
  const num3 = Object.fromEntries(codes.map(([, a3, n]) => [n, a3]));
  const a2to3 = Object.fromEntries(codes.map(([a2, a3]) => [a2, a3]));
  const isoOf = (g) => (g.id ? num3[g.id] || null : NAME_ISO[g.properties.name] ?? null);

  const out = {};
  // 50m — 대표점 후보(가장 큰 덩어리의 가운데) · 이웃
  const a50 = arcsOf(t50);
  const owner = new Map(); // arc → Set(ISO3)
  for (const g of t50.objects.countries.geometries) {
    const iso = isoOf(g);
    if (!iso) continue;
    for (const p of polysOf(g)) for (const ring of p) for (const i of ring) {
      const k = i < 0 ? ~i : i;
      if (!owner.has(k)) owner.set(k, new Set());
      owner.get(k).add(iso);
    }
    const rings = ringsOf(g, a50);
    const big = rings.reduce((a, r) => (areaOf(r) > areaOf(a) ? r : a), rings[0]);
    const c = out[iso] || (out[iso] = { d: '', nb: new Set() });
    if (big && (!c.big || areaOf(big) > areaOf(c.big))) c.big = big;
  }
  for (const set of owner.values()) {
    if (set.size < 2) continue;
    for (const a of set) for (const b of set) if (a !== b) out[a].nb.add(b);
  }
  // 대표점 — 수도(인구가 가장 많은 Admin-0 capital), 없으면 가장 큰 덩어리의 꼭짓점 평균
  const caps = {};
  for (const f of pp.features) {
    const q = f.properties;
    if (q.featurecla !== 'Admin-0 capital' && q.featurecla !== 'Admin-0 region capital') continue;
    const iso = a2to3[q.iso_a2] || null;
    if (!iso) continue;
    const rank = (q.featurecla === 'Admin-0 capital' ? 1e9 : 0) + (q.pop_max || 0);
    if (!caps[iso] || caps[iso].rank < rank) caps[iso] = { rank, lon: q.longitude, lat: q.latitude };
  }
  for (const [iso, c] of Object.entries(out)) {
    let lon, lat;
    if (caps[iso]) ({ lon, lat } = caps[iso]);
    else if (c.big) { lon = c.big.reduce((a, p) => a + p[0], 0) / c.big.length; lat = c.big.reduce((a, p) => a + p[1], 0) / c.big.length; }
    c.p = project(lon, lat).map(r1);
    c.ll = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
    delete c.big;
  }
  // 110m — 그릴 경로
  const a110 = arcsOf(t110);
  for (const g of t110.objects.countries.geometries) {
    const iso = isoOf(g);
    if (!iso || iso === 'ATA') continue;
    const d = pathOf(ringsOf(g, a110).flatMap(splitDateline));
    if (!out[iso]) out[iso] = { d: '', nb: new Set(), p: null };
    out[iso].d += d;
  }
  for (const c of Object.values(out)) c.nb = [...c.nb].sort();
  return out;
}

/** 두 점(경위도) 사이 대권 거리(km) */
export function km([lon1, lat1], [lon2, lat2]) {
  const R = 6371, t = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * t) / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(((lon2 - lon1) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
