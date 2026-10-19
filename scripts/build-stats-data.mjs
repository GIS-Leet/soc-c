// 통계 페이지(stats.html)의 자료를 세계은행 세계 개발 지표(WDI) API에서 받아 만든다.
// 실행: node scripts/build-stats-data.mjs   (인터넷 필요)
// 결과: data/stats/latest.json   — 나라 · 지역 · 지표 설명 · 지표마다 나라별 가장 최근 값(연도 포함)
//       data/stats/series/<지표>.json — 1960년부터의 해마다 값(추이 그래프를 열 때만 불러온다)
// 지표의 한국어 이름 · 설명은 stats-indicators 와 같이 이 파일 아래 INDICATORS 에 둔다.
// 값은 고치지 않는다. 자릿수만 줄인다(유효 숫자 4자리, 인구처럼 큰 수는 정수).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDICATORS, TOPICS } from '../assets/stats-indicators.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(tmpdir(), 'geo-stats-cache');
mkdirSync(CACHE, { recursive: true });
const API = 'https://api.worldbank.org/v2/';
const FIRST = 1960, LAST = new Date().getFullYear();

async function get(path) {
  const file = join(CACHE, path.replace(/[^\w.-]+/g, '_'));
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(API + path);
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text);
        writeFileSync(file, text);
        return json;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error('받기 실패 ' + path);
}

// 우리 교과서 표기와 다르거나 이름이 없는 곳만 손으로
const NAME_FIX = {
  ESP: '에스파냐', COD: '콩고 민주 공화국', COG: '콩고 공화국', CAF: '중앙아프리카 공화국', CHI: '채널 제도',
  PSE: '팔레스타인', MKD: '북마케도니아', HKG: '홍콩', MAC: '마카오', PRK: '북한', KOR: '대한민국',
  TUR: '튀르키예', CZE: '체코', ZAF: '남아프리카 공화국', THA: '타이', USA: '미국', GBR: '영국', VCT: '세인트빈센트 그레나딘', KNA: '세인트키츠 네비스',
  LCA: '세인트루시아', STP: '상투메 프린시페', TLS: '동티모르', FSM: '미크로네시아 연방', SWZ: '에스와티니',
};
const AGG = {
  WLD: '세계', HIC: '고소득 국가', UMC: '중상위 소득 국가', LMC: '중하위 소득 국가', LIC: '저소득 국가', OED: 'OECD 회원국', EUU: '유럽 연합',
  EAS: '동아시아 · 태평양', ECS: '유럽 · 중앙아시아', LCN: '라틴 아메리카 · 카리브', MEA: '중동 · 북아프리카 · 아프가니스탄 · 파키스탄',
  NAC: '북아메리카', SAS: '남아시아', SSF: '사하라 이남 아프리카',
};
const REGIONS = ['EAS', 'ECS', 'LCN', 'MEA', 'NAC', 'SAS', 'SSF'];
const INCOME = { HIC: '고소득', UMC: '중상위 소득', LMC: '중하위 소득', LIC: '저소득' };

const round = (v) => {
  if (v == null || !Number.isFinite(v)) return null;
  const a = Math.abs(v);
  if (a >= 10000) return Math.round(v);
  return Number(v.toPrecision(4));
};

const dn = new Intl.DisplayNames(['ko'], { type: 'region' });
const all = (await get('country?format=json&per_page=400'))[1];
const countries = all
  .filter((c) => c.region.id !== 'NA')
  .map((c) => {
    let ko = NAME_FIX[c.id];
    if (!ko) { try { ko = dn.of(c.iso2Code); } catch {} }
    if (!ko || ko === c.iso2Code) ko = c.name;
    return { id: c.id, iso2: c.iso2Code, ko, en: c.name, r: c.region.id, inc: c.incomeLevel.id };
  })
  .sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
const keep = new Set([...countries.map((c) => c.id), ...Object.keys(AGG)]);

const latest = {};
mkdirSync(join(ROOT, 'data/stats/series'), { recursive: true });
for (const ind of INDICATORS) {
  const pages = [];
  let page = 1, total = 1;
  while (page <= total) {
    const res = await get(`country/all/indicator/${ind.code}?format=json&per_page=20000&date=${FIRST}:${LAST}&page=${page}`);
    if (!res[1]) throw new Error('자료 없음 ' + ind.code + ' ' + JSON.stringify(res[0]).slice(0, 200));
    total = res[0].pages;
    pages.push(...res[1]);
    page++;
  }
  const series = {};
  let maxYear = FIRST;
  for (const row of pages) {
    const id = row.countryiso3code;
    if (!keep.has(id) || row.value == null) continue;
    const y = Number(row.date);
    (series[id] ||= {})[y] = round(row.value);
    if (y > maxYear) maxYear = y;
  }
  // 나라별 가장 최근 값 — 너무 오래된 값(10년 넘게 지난)은 싣지 않는다
  const L = {};
  for (const [id, byYear] of Object.entries(series)) {
    const ys = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    if (ys.length && ys[0] >= maxYear - 10) L[id] = [byYear[ys[0]], ys[0]];
  }
  latest[ind.code] = L;
  // 추이용 — 첫 해부터 배열로(빈 해는 null)
  const first = Math.min(...Object.values(series).flatMap((o) => Object.keys(o).map(Number)));
  const out = { from: first, to: maxYear, v: {} };
  for (const [id, byYear] of Object.entries(series)) out.v[id] = Array.from({ length: maxYear - first + 1 }, (_, i) => byYear[first + i] ?? null);
  writeFileSync(join(ROOT, `data/stats/series/${ind.code}.json`), JSON.stringify(out));
  const nC = Object.keys(L).filter((id) => !AGG[id]).length;
  console.log(`${ind.code.padEnd(24)} 나라 ${String(nC).padStart(3)} · 최근 ${maxYear} · 한국 ${L.KOR ? L.KOR.join('/') : '없음'} · 세계 ${L.WLD ? L.WLD.join('/') : '없음'}`);
}

const meta = {
  source: '세계은행 세계 개발 지표(World Development Indicators), CC BY 4.0',
  url: 'https://data.worldbank.org',
  built: new Date().toISOString().slice(0, 10),
};
writeFileSync(join(ROOT, 'data/stats/latest.json'), JSON.stringify({ meta, countries, agg: AGG, regions: REGIONS, income: INCOME, latest }));
console.log('→ data/stats/latest.json', Math.round(JSON.stringify(latest).length / 1024) + 'KB', '나라', countries.length, '주제', TOPICS.length);
