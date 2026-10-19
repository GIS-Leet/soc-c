// 기후 그래프 페이지의 바탕 지도를 SVG 경로로 미리 만든다 → data/climate/basemap.json
// 실행: node scripts/build-climate-map.mjs   (인터넷 필요, 의존성 없음)
// 원자료: Natural Earth(공공 저작물)를 TopoJSON으로 옮긴 world-atlas 2.0.2
//  - 세계: countries-110m → Equal Earth 도법(면적이 맞아 기후대 넓이 비교가 공정하다)
//  - 한반도: countries-10m → 위도 37.5°에서 거리가 맞는 정거 원통 도법
// 화면에서도 같은 식으로 관측소를 찍으므로 project()와 assets/climate-map.mjs 의 식은 같아야 한다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/';
const topo = async (name) => (await fetch(CDN + name)).json();

// ── TopoJSON 풀기 ──
function arcsOf(t) {
  const { scale: [sx, sy], translate: [tx, ty] } = t.transform;
  return t.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
}
function ringsOf(geom, arcs) {
  const line = (ids) => ids.flatMap((i, k) => {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    return k ? a.slice(1) : a;
  });
  if (geom.type === 'Polygon') return geom.arcs.map(line);
  if (geom.type === 'MultiPolygon') return geom.arcs.flatMap((p) => p.map(line));
  return [];
}
// 두 나라가 함께 쓰는 호(국경선)만 — 해안선과 겹치지 않게
function bordersOf(t, arcs, obj, only = null) {
  const count = new Map();
  for (const g of t.objects[obj].geometries) {
    if (only && !only.has(g.id)) continue;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    for (const p of polys) for (const ring of p) for (const i of ring) {
      const k = i < 0 ? ~i : i;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  return [...count].filter(([, n]) => n > 1).map(([k]) => arcs[k]);
}

// ── 도법 ──
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
// 경도 ±180°의 적도 끝이 틀 양 끝에 닿게 축척을 정한다(가로세로 비 약 2.05 : 1)
export const WORLD = { w: 1000 };
WORLD.s = WORLD.w / 2 / (Math.PI / (M * A1));
WORLD.h = Math.ceil(2 * WORLD.s * 1.3173627) + 2;
function equalEarth(lon, lat) {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  const th = Math.asin(M * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [WORLD.w / 2 + x * WORLD.s, WORLD.h / 2 - y * WORLD.s];
}
// 북쪽 끝은 중강진·혜산이 들어오게, 동쪽 끝은 독도(131.87°E)까지
export const KOREA = { w: 600, lon0: 124.0, lat0: 42.4, lon1: 132.2, lat1: 32.9 };
const kx = Math.cos((37.5 * Math.PI) / 180);
const KS = KOREA.w / ((KOREA.lon1 - KOREA.lon0) * kx);
function korea(lon, lat) {
  return [(lon - KOREA.lon0) * kx * KS, (KOREA.lat0 - lat) * KS];
}
KOREA.h = Math.round((KOREA.lat0 - KOREA.lat1) * KS);

// ── 경로 문자열 ──
const r1 = (v) => Math.round(v * 10) / 10;
function pathOf(lines, proj, { close = true, clip = null, minLen = 0 } = {}) {
  let d = '';
  for (const line of lines) {
    let pts = line.map(([lon, lat]) => proj(lon, lat));
    if (clip) {
      // 보이는 틀 바깥의 점은 틀 가장자리(여백 포함)로 당긴다 — 모양은 틀 밖에서만 찌그러진다
      const [x0, y0, x1, y1] = clip;
      if (pts.every(([x, y]) => x < x0 || x > x1 || y < y0 || y > y1)) {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        if (Math.max(...xs) < x0 || Math.min(...xs) > x1 || Math.max(...ys) < y0 || Math.min(...ys) > y1) continue;
      }
      pts = pts.map(([x, y]) => [Math.min(x1, Math.max(x0, x)), Math.min(y1, Math.max(y0, y))]);
    }
    const out = [];
    for (const [x, y] of pts) {
      const p = [r1(x), r1(y)];
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) >= 0.4) out.push(p);
    }
    if (out.length < (close ? 3 : 2)) continue;
    if (minLen) {
      const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < minLen) continue;
    }
    d += 'M' + out.map((p) => p.join(',')).join('L') + (close ? 'Z' : '');
  }
  return d;
}

// 날짜 변경선을 가로지르는 고리(러시아 동쪽 끝, 피지)는 Equal Earth에서 화면을 가로지른다 → ±180°에서 자른다
function splitDateline(ring) {
  const parts = [[]];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[i - 1];
    if (q && Math.abs(p[0] - q[0]) > 180) parts.push([]);
    parts[parts.length - 1].push(p);
  }
  return parts;
}

const w110 = await topo('countries-110m.json');
const a110 = arcsOf(w110);
const landRings = w110.objects.countries.geometries
  .filter((g) => g.id !== '010') // 남극은 따로(아래) — 극 쪽 가장자리를 닫기 위해
  .flatMap((g) => ringsOf(g, a110))
  .flatMap(splitDateline);
const antarctica = w110.objects.countries.geometries.filter((g) => g.id === '010').flatMap((g) => ringsOf(g, a110));
const world = pathOf(landRings, equalEarth) + pathOf(antarctica.flatMap(splitDateline), equalEarth);
const worldBorders = pathOf(bordersOf(w110, a110, 'countries').flatMap(splitDateline), equalEarth, { close: false });
// 경위선: 적도·회귀선·극권과 30°마다의 경선
const graticule = [];
for (let lon = -180; lon <= 180; lon += 30) graticule.push(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]));
const parallels = { eq: [0], tropic: [23.44, -23.44], polar: [66.56, -66.56], grid: [-60, -30, 30, 60] };
// Equal Earth의 위선은 곧은 수평선이라 양 끝 두 점이면 된다
const lat = (v) => [[-180, v], [180, v]];
const outline = [...Array.from({ length: 37 }, (_, i) => [-180, -90 + i * 5]), ...Array.from({ length: 37 }, (_, i) => [180, 90 - i * 5])];

const w10 = await topo('countries-10m.json');
const a10 = arcsOf(w10);
const near = new Set(['410', '408', '156', '392', '643']); // 남한·북한·중국·일본·러시아
const clip = [-40, -40, KOREA.w + 40, KOREA.h + 40];
// 아주 작은 섬은 지우되 우리 땅(독도 등)은 크기와 상관없이 모두 그린다
const ringsBy = (pred) => w10.objects.countries.geometries.filter(pred).flatMap((g) => ringsOf(g, a10));
const koreaLand = pathOf(ringsBy((g) => near.has(g.id) && g.id !== '410'), korea, { clip, minLen: 1.2 })
  + pathOf(ringsBy((g) => g.id === '410'), korea, { clip });
const koreaBorders = pathOf(bordersOf(w10, a10, 'countries', near), korea, { close: false, clip });

const out = {
  source: 'Natural Earth (public domain) via world-atlas 2.0.2',
  world: {
    ...WORLD,
    land: world,
    borders: worldBorders,
    sphere: pathOf([outline], equalEarth),
    meridians: pathOf(graticule, equalEarth, { close: false }),
    parallels: Object.fromEntries(Object.entries(parallels).map(([k, vs]) => [k, pathOf(vs.map(lat), equalEarth, { close: false })])),
  },
  korea: { ...KOREA, land: koreaLand, borders: koreaBorders },
};
mkdirSync(join(ROOT, 'data/climate'), { recursive: true });
writeFileSync(join(ROOT, 'data/climate/basemap.json'), JSON.stringify(out));
console.log('→ data/climate/basemap.json', Math.round(JSON.stringify(out).length / 1024) + 'KB',
  '세계', Math.round(world.length / 1024) + 'KB', '한반도', Math.round(koreaLand.length / 1024) + 'KB', 'h', KOREA.h);
