// 통계 페이지의 「우리나라 시·도」 자료를 만든다 → data/stats/korea.json
// 실행: node scripts/build-korea-stats.mjs   (지도 경계를 받으려고 인터넷 필요)
// 값: data/stats/korea-kosis.txt — 국가데이터처 국가통계포털(KOSIS) 통계표 화면에서 시·도 줄만 옮긴 것.
//     (KOSIS 오픈 API는 인증키가 있어야 해서, 공개 통계표 화면에 보이는 값을 그대로 옮겼다)
// 지도: 통계청(현 국가데이터처) 센서스용 행정구역경계 2018(southkorea-maps 정리본) — 위도 37.5°에서 거리가 맞는 정거 원통 도법
// 몇 지표는 표의 두 값으로 계산한다(제조업 종사자 비율 = 제조업 종사자 ÷ 전체 종사자 등). 계산식은 지표의 calc 에 적었다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 시·도 ── 2026년 7월 1일 광주광역시와 전라남도가 전남광주통합특별시가 됐다.
// 그 뒤의 월별 통계는 통합특별시 하나, 2025년까지의 연간 통계는 광주 · 전남 따로다. 지도에는 두 곳을 모두 그린다.
export const UNITS = [
  ['11', '서울특별시', '서울'], ['21', '부산광역시', '부산'], ['22', '대구광역시', '대구'], ['23', '인천광역시', '인천'],
  ['24', '광주광역시', '광주'], ['25', '대전광역시', '대전'], ['26', '울산광역시', '울산'], ['29', '세종특별자치시', '세종'],
  ['31', '경기도', '경기'], ['32', '강원특별자치도', '강원'], ['33', '충청북도', '충북'], ['34', '충청남도', '충남'],
  ['35', '전북특별자치도', '전북'], ['36', '전라남도', '전남'], ['37', '경상북도', '경북'], ['38', '경상남도', '경남'],
  ['39', '제주특별자치도', '제주'],
];
const MERGED = '전남광주통합특별시';
const ALIAS = { 강원도: '강원특별자치도', 전라북도: '전북특별자치도' };

// ── 원자료 읽기 ──
const raw = readFileSync(join(ROOT, 'data/stats/korea-kosis.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const T = {};
for (let i = 0; i < raw.length; i++) {
  if (!raw[i].startsWith('@')) continue;
  const [id, p, items] = raw[i].slice(1).split('|');
  const rows = {};
  for (const part of (raw[i + 1] || '').split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    let name = part.slice(0, at).trim();
    name = ALIAS[name] || name;
    rows[name] = part.slice(at + 1).split('/').map((v) => {
      const s = v.trim().replace(/,/g, '');
      return s === '' || s === '-' || Number.isNaN(Number(s)) ? null : Number(s);
    });
  }
  T[id] = { period: p.replace(/^P\s*/, '').trim(), items: items.replace(/^I\s*/, ''), rows };
}
const col = (id, k = 0) => (name) => T[id].rows[name]?.[k] ?? null;
const ratio = (a, b, f = 1) => (name) => {
  const x = a(name), y = b(name);
  return x == null || y == null || !y ? null : (x / y) * f;
};
const yearOf = (id) => T[id].period;

// ── 지표 ──
// topic: pop 인구 · econ 경제와 산업 · life 생활 · env 자원과 환경
const IND = [
  { id: 'pop', topic: 'pop', name: '인구', unit: '명', dp: 0, src: ['DT_1B040A3'], v: col('DT_1B040A3', 0),
    def: '주민등록 인구입니다(외국인 제외).', read: '수도권(서울 · 인천 · 경기)에 전체 인구의 절반 넘게 삽니다. 지도에서 색이 짙은 곳이 어디에 몰려 있는지 보세요.' },
  { id: 'density', topic: 'pop', name: '인구 밀도', unit: '명/㎢', dp: 1, src: ['DT_1B08024'], v: col('DT_1B08024', 0), log: true,
    def: '1㎢에 사는 사람 수입니다(인구주택총조사 기준).', read: '같은 나라 안에서도 서울과 강원은 170배 가까이 차이 납니다. 산지가 많은 곳은 사람이 살 땅이 좁습니다.' },
  { id: 'growth', topic: 'pop', name: '인구 증가율', unit: '%', dp: 2, src: ['DT_1YL20621'], v: col('DT_1YL20621', 0), diverging: true,
    def: '한 해 동안 늘어난 인구를 전년 인구로 나눈 비율입니다. 외국인을 포함한 총인구 기준입니다.', read: '태어나는 사람이 줄어도 일자리를 따라 사람이 들어오면 인구가 늘 수 있습니다. 늘어난 곳이 수도권과 충청권에 몰려 있는지 보세요.' },
  { id: 'tfr', topic: 'pop', name: '합계 출산율', unit: '명', dp: 3, src: ['DT_1B81A21'], v: col('DT_1B81A21', 0),
    def: '여성 한 명이 평생 낳을 것으로 예상되는 아이 수입니다.', read: '서울이 가장 낮고, 젊은 공무원 가족이 많은 세종과 일부 도 지역이 높습니다. 집값 · 일자리 · 통근 시간 같은 까닭을 떠올려 보세요.' },
  { id: 'aged', topic: 'pop', name: '고령 인구 비율', unit: '%', dp: 1, src: ['DT_1YL20631'], v: col('DT_1YL20631', 0),
    def: '65세 이상 인구가 전체 인구에서 차지하는 비율입니다.', read: '20% 이상이면 초고령 사회입니다. 젊은 사람이 일자리를 찾아 떠난 곳일수록 높습니다.' },
  { id: 'sexratio', topic: 'pop', name: '성비', unit: '여자 100명당 남자', dp: 1, src: ['DT_1YL20701'], v: col('DT_1YL20701', 0), diverging: true, mid: 100,
    def: '여자 100명당 남자 수입니다.', read: '중화학 공업 도시(울산 · 충남)는 남자가 많고, 서비스업이 발달한 대도시는 여자가 많습니다. 산업 구조가 인구 구조를 바꿉니다.' },
  { id: 'single', topic: 'pop', name: '1인 가구 비율', unit: '%', dp: 1, src: ['DT_1YL21161'], v: col('DT_1YL21161', 0),
    def: '일반 가구 가운데 혼자 사는 가구의 비율입니다.', read: '대학과 일자리가 몰린 대도시에는 젊은 1인 가구가, 농촌에는 혼자 사는 노인 가구가 많습니다. 같은 숫자라도 사는 사람이 다를 수 있습니다.' },
  { id: 'foreign', topic: 'pop', name: '인구 천 명당 외국인', unit: '명', dp: 1, src: ['DT_1YL21271'], v: col('DT_1YL21271', 0),
    def: '주민 1,000명당 등록 외국인 수입니다.', read: '공장이 많은 충남 · 충북 · 경기와 농어업 일손이 필요한 곳에서 높습니다.' },

  { id: 'grdp', topic: 'econ', name: '1인당 지역 내 총생산', unit: '만 원', dp: 0, src: ['DT_1C86'], v: (n) => (col('DT_1C86', 0)(n) ?? null) / 10 || null,
    def: '한 해 동안 그 지역 안에서 만든 생산액을 주민 수로 나눈 값입니다.', read: '울산 · 충남 · 전남처럼 큰 공장이 있는 곳이 높습니다. 그 돈이 모두 주민의 소득은 아니어서 1인당 개인 소득과 견주어 보면 차이가 큽니다.' },
  { id: 'income', topic: 'econ', name: '1인당 개인 소득', unit: '만 원', dp: 0, src: ['DT_1C86'], v: (n) => (col('DT_1C86', 2)(n) ?? null) / 10 || null,
    def: '주민 한 사람이 실제로 쓸 수 있게 받은 소득입니다(임금 · 재산 소득 등).', read: '생산이 많은 곳과 소득이 많은 곳이 다릅니다. 공장은 지방에 있어도 본사와 주주는 수도권에 있는 경우가 많기 때문입니다.' },
  { id: 'gdpgrowth', topic: 'econ', name: '경제 성장률', unit: '%', dp: 1, src: ['DT_1YL20571'], v: col('DT_1YL20571', 0), diverging: true,
    def: '지역 내 총생산(물가 변동 제외)이 한 해 동안 늘어난 비율입니다.', read: '한 해 값이라 그해 공장 증설 · 업황에 따라 크게 출렁입니다.' },
  { id: 'mfg', topic: 'econ', name: '제조업 종사자 비율', unit: '%', dp: 1, src: ['DT_1YL5802', 'DT_1YL15014'], calc: '제조업 종사자 ÷ 전체 종사자 × 100', v: ratio(col('DT_1YL5802', 0), col('DT_1YL15014', 0), 100),
    def: '사업체에서 일하는 사람 가운데 제조업에서 일하는 사람의 비율입니다.', read: '공업 지역(경기 남부 · 충청 · 동남 해안)에서 높고, 관광 · 서비스 중심인 제주와 서울에서 낮습니다.' },
  { id: 'svc', topic: 'econ', name: '서비스업 종사자 비율', unit: '%', dp: 1, src: ['DT_1YL6402', 'DT_1YL15014'], calc: '서비스업 종사자 ÷ 전체 종사자 × 100', v: ratio(col('DT_1YL6402', 0), col('DT_1YL15014', 0), 100),
    def: '사업체에서 일하는 사람 가운데 서비스업에서 일하는 사람의 비율입니다.', read: '본사 · 금융 · 관광이 모인 서울과 제주에서 높습니다.' },
  { id: 'fiscal', topic: 'econ', name: '재정 자립도', unit: '%', dp: 1, src: ['DT_1YL20921'], v: col('DT_1YL20921', 1),
    def: '지방 자치 단체 예산 가운데 스스로 거둔 세금 · 수입의 비율입니다(세입 과목 개편 후 기준).', read: '낮을수록 중앙 정부가 나눠 주는 돈에 기댑니다. 지역 격차를 줄이려는 정책을 떠올려 보세요.' },

  { id: 'doctor', topic: 'life', name: '인구 천 명당 의사', unit: '명', dp: 2, src: ['DT_1YL20981'], calc: '의료기관 종사 의사 ÷ 주민등록 인구 × 1,000', v: ratio(col('DT_1YL20981', 1), col('DT_1YL20981', 2), 1000),
    def: '주민 1,000명당 의료 기관에서 일하는 의사 수입니다.', read: '큰 병원이 모인 서울과 광역시에 몰려 있습니다. 의료 서비스의 지역 격차를 보여 줍니다.' },
  { id: 'culture', topic: 'life', name: '인구 10만 명당 문화 기반 시설', unit: '개', dp: 1, src: ['DT_1YL20931'], v: col('DT_1YL20931', 0),
    def: '주민 10만 명당 도서관 · 박물관 · 미술관 · 공연장 같은 문화 기반 시설 수입니다.', read: '시설 수보다 사람 수로 나눈 값이라, 인구가 적은 도 지역이 높게 나옵니다. 가까이 있느냐는 또 다른 문제입니다.' },
  { id: 'car', topic: 'life', name: '인구 천 명당 자동차', unit: '대', dp: 0, src: ['DT_1YL20731'], calc: '자동차 등록 대수 ÷ 주민등록 인구 × 1,000', v: ratio(col('DT_1YL20731', 1), col('DT_1YL20731', 2), 1000),
    def: '주민 1,000명당 등록된 자동차 수입니다.', read: '대중교통이 촘촘한 서울은 낮고, 제주는 렌터카 회사가 많아 특히 높습니다.' },
  { id: 'vacant', topic: 'life', name: '빈집 비율', unit: '%', dp: 1, src: ['DT_1YL202005'], v: col('DT_1YL202005', 0),
    def: '전체 주택 가운데 사람이 살지 않는 주택의 비율입니다.', read: '인구가 빠져나가는 농촌 지역에서 높습니다. 고령 인구 비율과 견주어 보세요.' },

  { id: 'energy', topic: 'env', name: '최종 에너지 소비량', unit: '천 toe', dp: 0, src: ['DT_1YL20391'], v: col('DT_1YL20391', 0), log: true,
    def: '산업 · 수송 · 가정 · 상업에서 쓴 에너지를 석유 1톤의 열량(toe)으로 바꾼 양입니다.', read: '사람이 많은 곳보다 석유 화학 · 철강 공장이 있는 곳(전남 · 충남 · 울산)이 훨씬 많이 씁니다.' },
  { id: 'energypc', topic: 'env', name: '1인당 최종 에너지 소비', unit: 'toe', dp: 1, src: ['DT_1YL20391', 'DT_1YL21321'], calc: '최종 에너지 소비량 ÷ 주민등록 인구(2024)', v: ratio((n) => (col('DT_1YL20391', 0)(n) ?? null) * 1000 || null, col('DT_1YL21321', 2)),
    def: '최종 에너지 소비량을 주민 수로 나눈 값입니다.', read: '공장이 쓰는 에너지까지 주민 수로 나눈 값이라, 공업 도시가 크게 높습니다.' },
  { id: 'waste', topic: 'env', name: '1인당 생활 폐기물', unit: 'kg/일', dp: 2, src: ['DT_1YL21321'], calc: '생활계 폐기물 발생량 ÷ 주민등록 인구', v: ratio((n) => (col('DT_1YL21321', 1)(n) ?? null) * 1000 || null, col('DT_1YL21321', 2)),
    def: '주민 한 사람이 하루에 내놓는 생활 쓰레기의 양입니다.', read: '관광객이 많이 오는 제주는 주민 수보다 쓰레기가 많아 높게 나옵니다.' },
  { id: 'temp', topic: 'env', name: '연평균 기온', unit: '℃', dp: 1, src: ['DT_1YL9801'], v: col('DT_1YL9801', 0), noNation: true,
    def: '그해 한 해의 평균 기온입니다(평년값이 아니라 한 해 값).', read: '위도가 낮고 바다에 가까운 제주 · 남해안이 따뜻합니다. 평년값은 기후 그래프 페이지에서 보세요.' },
  { id: 'rain', topic: 'env', name: '연강수량', unit: 'mm', dp: 0, src: ['DT_1YL9901'], v: col('DT_1YL9901', 0), noNation: true,
    def: '그해 한 해 동안 내린 비와 눈의 양입니다(평년값이 아니라 한 해 값).', read: '한 해 값은 해마다 크게 다릅니다. 지형과 바람에 따른 차이는 기후 그래프 페이지의 평년값으로 보세요.' },
];
const TOPICS = [{ id: 'pop', name: '인구' }, { id: 'econ', name: '경제와 산업' }, { id: 'life', name: '생활' }, { id: 'env', name: '자원과 환경' }];

const round = (v, dp) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** (dp + 1)) / 10 ** (dp + 1));
const indicators = IND.map((d) => {
  const values = {};
  for (const [code, name] of UNITS) values[code] = round(d.v(name), d.dp);
  const merged = round(d.v(MERGED), d.dp);
  const nation = d.noNation ? null : round(d.v('전국'), d.dp);
  const { v, ...meta } = d;
  return { ...meta, year: yearOf(d.src[0]).replace(' p)', ' (잠정)'), values, merged: merged ?? undefined, nation };
});
for (const d of indicators) {
  const n = Object.values(d.values).filter((x) => x != null).length;
  console.log(`${d.id.padEnd(10)} ${d.year.padEnd(10)} 시·도 ${n}${d.merged != null ? ' + 통합' : ''} 전국 ${d.nation}`);
}

// ── 지도 ──
const topo = await (await fetch('https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-provinces-2018-topo-simple.json')).json();
const obj = Object.values(topo.objects)[0];
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
const ring = (ids) => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
const BOX = { lon0: 124.55, lat0: 38.65, lon1: 132.0, lat1: 33.05, w: 560 };
const kx = Math.cos((36 * Math.PI) / 180), S = BOX.w / ((BOX.lon1 - BOX.lon0) * kx);
BOX.h = Math.round((BOX.lat0 - BOX.lat1) * S);
const P = (lon, lat) => [(lon - BOX.lon0) * kx * S, (BOX.lat0 - lat) * S];
const shapes = {};
const codeOf = { 강원도: '32', 전라북도: '35' };
for (const g of obj.geometries) {
  const code = UNITS.find((u) => u[1] === g.properties.name)?.[0] || codeOf[g.properties.name];
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  let d = '', cx = 0, cy = 0, area = 0;
  for (const poly of polys) for (const [k, r] of poly.entries()) {
    const pts = ring(r).map(([lo, la]) => P(lo, la));
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 0.35) out.push(p); }
    if (out.length < 3) continue;
    d += 'M' + out.map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).join('L') + 'Z';
    if (k === 0) { // 이름표 자리: 가장 큰 고리의 넓이 가중 중심
      let a = 0, x = 0, y = 0;
      for (let i = 0; i < out.length; i++) { const [x0, y0] = out[i], [x1, y1] = out[(i + 1) % out.length]; const c = x0 * y1 - x1 * y0; a += c; x += (x0 + x1) * c; y += (y0 + y1) * c; }
      if (Math.abs(a) > Math.abs(area)) { area = a; cx = x / (3 * a); cy = y / (3 * a); }
    }
  }
  shapes[code] = { d, cx: Math.round(cx), cy: Math.round(cy) };
}
const [dkx, dky] = P(131.8667, 37.2417);
const out = {
  meta: {
    source: '국가데이터처 국가통계포털(KOSIS) e-지방지표 · 주민등록인구현황 · 인구동향조사 · 지역소득',
    map: '통계청(현 국가데이터처) 센서스용 행정구역경계 2018(southkorea-maps 정리본)',
    built: new Date().toLocaleDateString('sv-SE'), // 이 컴퓨터(한국 시간) 날짜
    note: '2026년 7월 1일 광주광역시와 전라남도가 전남광주통합특별시로 합쳐졌습니다. 2026년 월별 통계는 통합특별시 하나로, 2025년까지의 연간 통계는 광주와 전남을 따로 보여 줍니다.',
  },
  units: UNITS.map(([code, name, short]) => ({ code, name, short })),
  merged: { name: MERGED, codes: ['24', '36'] },
  topics: TOPICS,
  indicators,
  map: { w: BOX.w, h: BOX.h, shapes, dokdo: [Math.round(dkx), Math.round(dky)] },
};
writeFileSync(join(ROOT, 'data/stats/korea.json'), JSON.stringify(out));
console.log('→ data/stats/korea.json', Math.round(JSON.stringify(out).length / 1024) + 'KB', '지도', BOX.w + '×' + BOX.h);
