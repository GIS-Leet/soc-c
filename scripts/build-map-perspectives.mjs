// 「새만금 간척과 통합적 관점」(map-perspectives) 자료를 만든다 → data/maps/perspectives/places.json
// 실행: node scripts/build-map-perspectives.mjs   (인터넷 필요, 의존성 없음)
//
// 원자료: OpenStreetMap(© OpenStreetMap 기여자, ODbL 1.0) — Overpass API(https://overpass-api.de, 로그인 없음)로 한 번 받는다.
//  - 하천: waterway=river 이고 이름이 금강 · 만경강 · 동진강인 길(way) → 지도 범위로 자르고 단순화(더글러스-포커, 약 40m)
//  - 방조제 위 도로: 이름이 「새만금로」인 도로(방조제 위를 지나는 도로) → 단순화
//  - 지점: 군산시 · 김제시 · 부안군(place 노드), 배수갑문, 잼버리공원, 새만금 환경생태지구, 국립새만금간척박물관,
//          새만금 공유수면매립지 태양광, 새만금 주행시험장 — 이름으로 찾아 중심점만 쓴다.
// 위성 영상(EOX Sentinel-2 cloudless)은 화면에서 타일로 바로 불러오므로 여기서 받지 않는다.
// 받은 원본 응답은 운영체제 임시 폴더에 저장하고, 저장소에는 줄인 결과만 넣는다.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/maps/perspectives');
const RAW = join(tmpdir(), 'map-perspectives-overpass.json');
mkdirSync(OUT, { recursive: true });

const BB = [35.55, 126.3, 36.12, 127.05]; // 남, 서, 북, 동
const bb = BB.join(',');
const Q = `[out:json][timeout:120];
(
  way["waterway"="river"]["name"~"^(금강|만경강|동진강)$"](${bb});
  way["name"="새만금로"]["highway"](${bb});
  node["place"~"city|county"]["name"~"^(군산시|김제시|부안군)$"](${bb});
  nwr["name"~"배수갑문$"](${bb});
  nwr["name"="잼버리공원"](${bb});
  nwr["name"="새만금 환경생태지구"](${bb});
  nwr["name"="국립새만금간척박물관"](${bb});
  nwr["name"~"^새만금 공유수면매립지 태양광"](${bb});
  nwr["name"="새만금 주행시험장"](${bb});
);
out geom tags;`;

let J;
if (existsSync(RAW)) J = JSON.parse(readFileSync(RAW, 'utf8'));
else {
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'nyuheatgis.com classroom map builder', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(Q),
  });
  if (!r.ok) throw new Error('Overpass ' + r.status);
  J = await r.json();
  writeFileSync(RAW, JSON.stringify(J));
}

// ── 선 단순화(더글러스-포커, 위경도를 위도 36°에서 m로 바꿔 잰다) ──
const KX = 111320 * Math.cos((36 * Math.PI) / 180), KY = 110570;
function dp(pts, tol = 40) {
  if (pts.length < 3) return pts;
  const d2 = (p, a, b) => {
    const [px, py] = [p[0] * KX, p[1] * KY], [ax, ay] = [a[0] * KX, a[1] * KY], [bx, by] = [b[0] * KX, b[1] * KY];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
  };
  let mi = 0, md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = d2(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; mi = i; } }
  if (md <= tol * tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, mi + 1), tol).slice(0, -1), ...dp(pts.slice(mi), tol)];
}
const inBox = ([lon, lat]) => lat >= BB[0] && lat <= BB[2] && lon >= BB[1] && lon <= BB[3];
const r5 = (v) => Math.round(v * 1e5) / 1e5;
/** 범위 안에 있는 연속 구간들만 남긴다 */
function clip(g) {
  const parts = [];
  let cur = [];
  for (const p of g) {
    if (inBox(p)) cur.push(p);
    else if (cur.length) { parts.push(cur); cur = []; }
  }
  if (cur.length) parts.push(cur);
  return parts.filter((p) => p.length > 1);
}

const lines = { 금강: [], 만경강: [], 동진강: [], 새만금로: [] };
const points = [];
for (const e of J.elements) {
  const name = e.tags?.name;
  if (e.type === 'way' && lines[name] && e.geometry) {
    const g = e.geometry.map((p) => [p.lon, p.lat]);
    for (const part of clip(g)) lines[name].push(dp(part, name === '새만금로' ? 25 : 60).map(([x, y]) => [r5(x), r5(y)]));
    continue;
  }
  let lat = e.lat, lon = e.lon;
  if (lat == null && e.geometry) { // way 중심 = 꼭짓점 평균
    lat = e.geometry.reduce((a, p) => a + p.lat, 0) / e.geometry.length;
    lon = e.geometry.reduce((a, p) => a + p.lon, 0) / e.geometry.length;
  }
  if (lat == null && e.bounds) { lat = (e.bounds.minlat + e.bounds.maxlat) / 2; lon = (e.bounds.minlon + e.bounds.maxlon) / 2; }
  if (lat == null) continue;
  points.push({ name, osm: `${e.type}/${e.id}`, lat: r5(lat), lon: r5(lon), kind: e.tags.place || e.tags.waterway || e.tags.man_made || e.tags.leisure || e.tags.tourism || e.tags.landuse || e.tags.natural || '' });
}
// 같은 이름이 여러 개(배수갑문 두 줄 등)면 하나로
const seen = new Map();
for (const p of points) {
  const k = p.name;
  if (!seen.has(k)) seen.set(k, { ...p, n: 1 });
  else { const s = seen.get(k); s.lat = r5((s.lat * s.n + p.lat) / (s.n + 1)); s.lon = r5((s.lon * s.n + p.lon) / (s.n + 1)); s.n++; }
}
const out = {
  meta: { fetched: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap via Overpass API', license: '© OpenStreetMap contributors, ODbL 1.0', bbox: BB },
  lines,
  points: [...seen.values()].map(({ n, ...p }) => p),
};
writeFileSync(join(OUT, 'places.json'), JSON.stringify(out));
console.log('→ data/maps/perspectives/places.json', JSON.stringify(out).length, 'bytes');
for (const [k, v] of Object.entries(lines)) console.log(k, v.length, '구간', v.reduce((a, l) => a + l.length, 0), '점');
for (const p of out.points) console.log(p.name, p.lat, p.lon, p.kind, p.osm);
