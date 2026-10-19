// 「스마트폰 부품과 완성품의 무역 흐름」(map-supply.html) 자료를 만든다 → data/maps/supply/trade.json
// 실행: node scripts/build-map-supply.mjs   (인터넷 필요, 의존성 없음. 호출 사이에 쉬어 4~6분 걸린다.
//        받은 원자료는 운영체제 임시 폴더 map-src/comtrade-*.json 에 둔다)
//
// 원자료: UN Comtrade Database(국제연합 통계처) 공개 API — 인증키 없는 public preview(한 번에 500줄까지)
//   https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=<해>&cmdCode=<품목>&flowCode=<X|M>&partnerCode=<상대>[&reporterCode=<신고국>]
//   나라 코드 표 https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json
//   이용: UN Comtrade 이용 · 재배포 FAQ(https://uncomtrade.org/docs/faqs-on-use-and-re-dissemination/) — 무료 시각화와
//   가공한 자료(새 지표 · 다른 자료와 결합)는 허락 없이 쓸 수 있다. 출처는 "UN Comtrade Database"로 적는다.
//
// 품목(HS 2022 기준 코드): 8542 집적 회로(반도체 칩) · 8524 평판 디스플레이 모듈 · 850760 리튬 이온 축전지 · 851713 스마트폰
// 처리
//  1) 해: 중국 · 베트남 · 한국 · 대만 · 인도가 모두 수입을 신고한 가장 최근 해(2024년 자료에는 아직 베트남 신고가 없다).
//  2) 흐름(A → B) = B 나라가 신고한 「A에서 들여온 액수」(수입국 신고, 대개 원산지 기준, CIF 달러).
//     수출국 신고(수출국이 마지막으로 보낸 나라 기준, FOB)는 중계 무역 때문에 원산지가 흐려져 흐름에는 쓰지 않고, 나라별 합계 비교에만 둔다.
//     → 수출 상위국 후보(수출국 신고 상위 15곳 + 주요 생산국)마다 「그 나라에서 들여온」 수입 신고를 모두 받는다.
//  3) 나라별 합계: 수출 = 그 나라가 신고한 수출 총액, 수입 = 그 나라가 신고한 수입 총액(둘 다 상대 = 세계).
//  4) 조립국의 부품 출처: 스마트폰 수출(수입국 신고 합)이 세계 수입액의 5%를 넘는 나라들이 신고한 부품 수입을 원산지별로 나눈다(자기 나라에서 되들여온 것은 뺀다).
//  5) 「Other Asia, nes」(코드 490)는 대만의 무역 통계가 실리는 이름이다 — 지도에는 대만 자리에 둔다.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE, cached, worldCountries, WORLD } from './map-world-countries.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ct(q) {
  const f = join(CACHE, 'comtrade-' + q.replace(/[^\w=&]/g, '').replace(/[=&]/g, '_') + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  for (let i = 0; i < 10; i++) {
    await sleep(1300);
    const r = await fetch(`${API}?${q}`);
    const j = await r.json().catch(() => ({}));
    // 공개 API는 일정 시간에 부를 수 있는 횟수가 정해져 있다 — 다 쓰면 멈추고, 다시 실행하면 받은 것은 임시 폴더에서 이어 쓴다
    if (j.statusCode === 403) throw new Error(`${j.message} — 그 뒤에 다시 실행하세요(받은 것은 ${CACHE} 에 남아 있음)`);
    if (j.statusCode === 429 || !r.ok) { await sleep(2500); continue; }
    if (j.count > 500) throw new Error(`${q}: ${j.count}줄 — 500줄 한도를 넘어 나눠 받아야 함`);
    writeFileSync(f, JSON.stringify(j));
    return j;
  }
  throw new Error('받지 못함: ' + q);
}
// 총계 줄만(운송 수단 · 세관 · 2차 상대 구분 없는 줄)
const rows = (j) => (j.data || []).filter((r) => r.motCode === 0 && r.customsCode === 'C00' && r.partner2Code === 0 && r.mosCode === '0');

const PRODUCTS = [
  { code: '8542', stage: 'parts', ko: '반도체 칩', full: '집적 회로(HS 8542)' },
  { code: '8524', stage: 'parts', ko: '디스플레이', full: '평판 디스플레이 모듈(HS 8524)' },
  { code: '850760', stage: 'parts', ko: '배터리', full: '리튬 이온 축전지(HS 8507.60)' },
  { code: '851713', stage: 'phone', ko: '스마트폰', full: '스마트폰(HS 8517.13)' },
];
const KEY = [156, 704, 410, 490, 699]; // 중국 · 베트남 · 한국 · 대만 · 인도
const EXTRA = [392, 842, 458, 702, 344, 764, 276, 616, 348, 484, 608];

// 1) 해 고르기
let YEAR = null;
for (let y = new Date().getFullYear() - 1; y >= 2022; y--) {
  const j = await ct(`period=${y}&cmdCode=8542&flowCode=M&partnerCode=0`);
  const has = new Set(rows(j).map((r) => r.reporterCode));
  console.log(y, '수입 신고국', has.size, KEY.map((k) => k + (has.has(k) ? '○' : '×')).join(' '));
  if (KEY.every((k) => has.has(k))) { YEAR = y; break; }
}
if (!YEAR) throw new Error('주요국이 모두 신고한 해가 없음');

// 나라 코드
const ref = await cached('comtrade-partnerAreas.json', 'https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json');
const ISO = Object.fromEntries(ref.results.map((r) => [r.id, /^[A-Z]{3}$/.test(r.PartnerCodeIsoAlpha3 || '') ? r.PartnerCodeIsoAlpha3 : null]));
ISO[490] = 'TWN';
const L = JSON.parse(readFileSync(join(ROOT, 'data/stats/latest.json'), 'utf8'));
const KO = Object.fromEntries(L.countries.map((c) => [c.id, c.ko]));
KO.TWN = '대만'; KO.HKG ||= '홍콩'; KO.MAC ||= '마카오'; KO.MSR ||= '몬트세랫';
const W = await worldCountries();

const out = { year: YEAR, products: {}, countries: {} };
const used = new Set();
for (const P of PRODUCTS) {
  const X = rows(await ct(`period=${YEAR}&cmdCode=${P.code}&flowCode=X&partnerCode=0`)).filter((r) => r.reporterCode);
  const Mt = rows(await ct(`period=${YEAR}&cmdCode=${P.code}&flowCode=M&partnerCode=0`)).filter((r) => r.reporterCode);
  const exp = {}, imp = {};
  for (const r of X) if (ISO[r.reporterCode]) exp[ISO[r.reporterCode]] = Math.round(r.primaryValue);
  for (const r of Mt) if (ISO[r.reporterCode]) imp[ISO[r.reporterCode]] = Math.round(r.primaryValue);
  const worldImp = Mt.reduce((a, r) => a + r.primaryValue, 0);
  const cand = [...new Set([...X.sort((a, b) => b.primaryValue - a.primaryValue).slice(0, 15).map((r) => r.reporterCode), ...KEY, ...EXTRA])];
  const pair = {};
  for (const c of cand) {
    const o = ISO[c];
    if (!o) continue;
    for (const r of rows(await ct(`period=${YEAR}&cmdCode=${P.code}&flowCode=M&partnerCode=${c}`))) {
      const d = ISO[r.reporterCode];
      if (!d || d === o || r.primaryValue < 1e6) continue; // 백만 달러 밑은 버린다
      pair[o + d] = [o, d, (pair[o + d]?.[2] || 0) + Math.round(r.primaryValue)];
    }
  }
  const flows = Object.values(pair).sort((a, b) => b[2] - a[2]); // 같은 ISO로 이어지는 두 코드(예: 미국 840 · 842)는 합친다
  const mirror = {};
  for (const [o, , v] of flows) mirror[o] = (mirror[o] || 0) + v;
  for (const k of [...Object.keys(exp), ...Object.keys(imp), ...flows.flatMap((f) => [f[0], f[1]])]) used.add(k);
  out.products[P.code] = { ...P, worldImp: Math.round(worldImp), reporters: Mt.length, exp, imp, mirror, flows };
  console.log(P.code, '흐름', flows.length, '세계 수입', (worldImp / 1e9).toFixed(1), 'B$',
    '상위', Object.entries(mirror).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(v / 1e9).toFixed(1)}`).join(' · '));
}

// 4) 조립국의 부품 출처
const phone = out.products['851713'];
// 조립국 = 스마트폰 수입 신고에서 원산지로 세계 수입액의 5% 넘게 차지한 나라(네덜란드처럼 유통 거점으로 몇 %를 차지하는 곳은 빠진다)
const assemblers = Object.entries(phone.mirror).filter(([, v]) => v / phone.worldImp > 0.05).sort((a, b) => b[1] - a[1]).map(([k]) => k);
out.chain_rule = 0.05;
// ISO3 → 신고국 코드: 그해에 실제로 수입을 신고한 코드(옛 코드 · 같은 ISO의 다른 코드를 피한다. 예: 베트남 704 ↔ 옛 남베트남 868)
const code = {};
for (const r of rows(await ct(`period=${YEAR}&cmdCode=8542&flowCode=M&partnerCode=0`))) if (ISO[r.reporterCode]) code[ISO[r.reporterCode]] = r.reporterCode;
out.chain = { assemblers, parts: {} };
for (const P of PRODUCTS.filter((p) => p.stage === 'parts')) {
  out.chain.parts[P.code] = {};
  for (const a of assemblers) {
    const rs = rows(await ct(`period=${YEAR}&cmdCode=${P.code}&flowCode=M&reporterCode=${code[a]}`)).filter((r) => r.partnerCode);
    const by = {};
    let other = 0, self = 0;
    for (const r of rs) {
      const o = ISO[r.partnerCode];
      if (o === a) { self += r.primaryValue; continue; }
      if (!o) { other += r.primaryValue; continue; }
      by[o] = (by[o] || 0) + r.primaryValue;
    }
    const total = Object.values(by).reduce((x, y) => x + y, 0) + other;
    out.chain.parts[P.code][a] = { total: Math.round(total), self: Math.round(self), top: Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => [k, Math.round(v)]) };
    for (const [k] of out.chain.parts[P.code][a].top) used.add(k);
  }
}
console.log('조립국', assemblers.join(' · '));

// 나라(쓰인 곳만) — 이름 · 대표점, 그리고 그릴 도형
const miss = [];
for (const k of used) {
  if (!KO[k]) miss.push(k);
  out.countries[k] = { ko: KO[k] || k, p: W[k]?.p };
}
if (miss.length) console.log('한국어 이름 없음:', miss.join(' '));
out.shapes = Object.fromEntries(Object.entries(W).filter(([, w]) => w.d).map(([k, w]) => [k, w.d]));
out.w = { w: WORLD.w, h: WORLD.h, s: WORLD.s };
out.source = 'UN Comtrade Database (United Nations Statistics Division), public API';
out.url = 'https://comtradeplus.un.org/';
out.fetched = new Date().toISOString().slice(0, 10);
mkdirSync(join(ROOT, 'data/maps/supply'), { recursive: true });
const txt = JSON.stringify(out);
writeFileSync(join(ROOT, 'data/maps/supply/trade.json'), txt);
console.log('→ data/maps/supply/trade.json', Math.round(txt.length / 1024) + 'KB');
