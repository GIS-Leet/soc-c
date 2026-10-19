// 「줄어드는 거리」(map-distance) 자료를 만든다 → data/maps/distance/cities.json
// 실행: node scripts/build-map-distance.mjs   (인터넷 필요, 의존성 없음)
//
// 1) 도시 위치 — OpenStreetMap Nominatim(https://nominatim.openstreetmap.org, 자료 © OpenStreetMap 기여자, ODbL).
//    시·도청과 시청 · 군청 이름으로 찾는다. 사용 정책(https://operations.osmfoundation.org/policies/nominatim/)에 따라
//    1.2초에 한 번만 묻고, 받은 값은 운영체제 임시 폴더에 저장해 두고 다시 묻지 않는다.
// 2) 자동차 이동 시간 · 도로 거리 — OSRM 시연 서버(https://router.project-osrm.org, 경로 자료 © OpenStreetMap 기여자, ODbL).
//    table 서비스 한 번으로 모든 도시 쌍(출발 × 도착)을 한꺼번에 받는다. 시연 서버이므로 화면에서는 부르지 않는다.
//    값은 도로의 제한 속도 · 도로 등급으로 어림한 「막히지 않을 때」의 시간이다(신호 대기 · 정체 · 휴식 없음).
//    배가 필요한 곳(제주 등)은 OSM에 적힌 뱃길이 들어가면 그 시간이 더해지고, 길이 없으면 null.
// 3) 직선 거리는 화면에서 하버사인 식(지구 반지름 6,371km)으로 계산한다.
// 받은 날짜는 meta.fetched 에 적는다.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/maps/distance');
const CACHE = join(tmpdir(), 'map-distance-cache');
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });
const UA = 'nyuheatgis.com classroom map builder (static school site; one-off build)';

// [id, 찾을 이름, 화면 이름, 구분] — 구분: capital 시·도청 소재지, city 그 밖의 도시
const CITIES = [
  ['seoul', '서울특별시청', '서울', 'capital'], ['busan', '부산광역시청', '부산', 'capital'], ['daegu', '대구광역시청', '대구', 'capital'],
  ['incheon', '인천광역시청', '인천', 'capital'], ['gwangju', '광주광역시청', '광주', 'capital'], ['daejeon', '대전광역시청', '대전', 'capital'],
  ['ulsan', '울산광역시청', '울산', 'capital'], ['sejong', '세종특별자치시청', '세종', 'capital'], ['suwon', '경기도청', '수원', 'capital'],
  ['chuncheon', '강원특별자치도청', '춘천', 'capital'], ['cheongju', '충청북도청', '청주', 'capital'], ['hongseong', '충청남도청', '홍성', 'capital'],
  ['jeonju', '전북특별자치도청', '전주', 'capital'], ['muan', '전라남도청', '무안', 'capital'], ['andong', '경상북도청', '안동', 'capital'],
  ['changwon', '경상남도청', '창원', 'capital'], ['jeju', '제주특별자치도청', '제주', 'capital'],
  ['gangneung', '강릉시청', '강릉', 'city'], ['sokcho', '속초시청', '속초', 'city'], ['wonju', '원주시청', '원주', 'city'],
  ['taebaek', '태백시청', '태백', 'city'], ['uljin', '울진군청', '울진', 'city'], ['pohang', '포항시청', '포항', 'city'],
  ['mokpo', '목포시청', '목포', 'city'], ['yeosu', '여수시청', '여수', 'city'], ['jinju', '진주시청', '진주', 'city'],
  ['tongyeong', '통영시청', '통영', 'city'], ['gunsan', '군산시청', '군산', 'city'], ['seosan', '서산시청', '서산', 'city'],
  ['namwon', '남원시청', '남원', 'city'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function geocode(q) {
  const f = join(CACHE, 'geo-' + encodeURIComponent(q) + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  await sleep(1200);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://nyuheatgis.com/map-distance.html' } });
  if (!r.ok) throw new Error(`Nominatim ${r.status} ${q}`);
  const j = await r.json();
  if (!j[0]) throw new Error('찾지 못함: ' + q);
  const v = { lat: Number(j[0].lat), lon: Number(j[0].lon), osm: `${j[0].osm_type}/${j[0].osm_id}`, label: j[0].display_name };
  writeFileSync(f, JSON.stringify(v));
  return v;
}

const pts = [];
for (const [id, q, name, kind] of CITIES) {
  const g = await geocode(q);
  pts.push({ id, name, kind, q, lat: Math.round(g.lat * 1e5) / 1e5, lon: Math.round(g.lon * 1e5) / 1e5, osm: g.osm });
  console.log(name.padEnd(4), g.lat.toFixed(4), g.lon.toFixed(4), g.label.slice(0, 60));
}

// OSRM table — 한 번에
const tf = join(CACHE, 'osrm-table.json');
let T;
if (existsSync(tf)) T = JSON.parse(readFileSync(tf, 'utf8'));
else {
  const coords = pts.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://nyuheatgis.com/map-distance.html' } });
  T = await r.json();
  if (T.code !== 'Ok') throw new Error('OSRM ' + T.code + ' ' + (T.message || ''));
  writeFileSync(tf, JSON.stringify(T));
}
// OSRM이 도로에 맞춘 지점(snapped)이 원래 지점에서 얼마나 떨어졌는지 — 너무 멀면 길이 없다는 뜻
const snap = T.sources.map((s) => Math.round(s.distance));
console.log('snap(m):', snap.join(' '));

const out = {
  meta: {
    fetched: new Date().toISOString().slice(0, 10),
    geocoder: 'OpenStreetMap Nominatim',
    router: 'OSRM (router.project-osrm.org, car profile)',
    license: '© OpenStreetMap contributors, ODbL 1.0',
    note: 'dur: 초, road: 미터. dur[i][j] = i에서 j까지. 막히지 않을 때의 자동차 시간.',
  },
  cities: pts.map(({ q, ...p }, i) => ({ ...p, snap: snap[i] })),
  dur: T.durations.map((row) => row.map((v) => (v == null ? null : Math.round(v)))),
  road: T.distances.map((row) => row.map((v) => (v == null ? null : Math.round(v)))),
};
writeFileSync(join(OUT, 'cities.json'), JSON.stringify(out));
console.log('→ data/maps/distance/cities.json', JSON.stringify(out).length, 'bytes');
const s = pts.findIndex((p) => p.id === 'seoul');
for (let j = 0; j < pts.length; j++) console.log(pts[j].name, out.dur[s][j] == null ? '—' : (out.dur[s][j] / 3600).toFixed(2) + 'h', out.road[s][j] == null ? '' : (out.road[s][j] / 1000).toFixed(0) + 'km');
