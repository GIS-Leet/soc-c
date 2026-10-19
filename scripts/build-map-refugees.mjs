// 「난민은 어디서 어디로」(map-refugees.html) 자료를 만든다 → data/maps/refugees/flows.json
// 실행: node scripts/build-map-refugees.mjs   (인터넷 필요, 의존성 없음. 받은 원자료는 운영체제 임시 폴더 map-src/ 에 둔다)
//
// 원자료: UNHCR Refugee Population Statistics Database — Refugee Data Finder API(로그인 · 인증키 없음)
//   https://api.unhcr.org/population/v1/population/?year=<해>&coo_all=true&coa_all=true&limit=10000
//   문서 https://api.unhcr.org/docs/refugee-statistics.html
//   라이선스: CC BY 4.0(UNHCR Terms of Use for Datasets, https://www.unhcr.org/terms-use-datasets)
//   표기: "UNHCR Refugee Population Statistics Database" — 공유할 때 이용 약관 주소를 함께 적는다.
//   값은 해마다 말(12월 31일) 기준의 사람 수(stock)다. 그해에 새로 떠난 사람 수(flow)가 아니다.
// 바탕(나라 도형 · 대표점 · 이웃): scripts/map-world-countries.mjs(Natural Earth · world-atlas)
// 나라 한국어 이름: data/stats/latest.json 의 countries(없는 몇 곳은 아래 KO_EXTRA).
//
// 처리
//  1) /years/ 에서 가장 최근 해부터 거꾸로, 출신국 × 비호국 쌍 자료가 있는 해를 고른다.
//  2) 국경을 넘은 사람 = 난민(refugees) + 비호 신청자(asylum_seekers) + 그 밖의 국제 보호가 필요한 사람(oip).
//     출신국 = 비호국인 줄의 idps(UNHCR가 보호 · 지원하는 국내 실향민)는 흐름에서 빼고 나라별 숫자로만 둔다.
//  3) 나라 코드는 UNHCR의 *_iso(ISO3)를 쓴다(UNHCR 자체 코드 coo/coa 는 ISO와 다른 곳이 있다).
//  4) 출신 불명(UNK) · 무국적(XXA) 등 지도에 점이 없는 출신은 합계에는 넣고 지도 흐름에서는 뺀다.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cached, worldCountries, WORLD } from './map-world-countries.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.unhcr.org/population/v1/';
const n = (v) => (typeof v === 'number' ? v : 0);

// 1) 해 고르기
const years = (await (await fetch(API + 'years/')).json()).items.map((x) => x.year).sort((a, b) => b - a);
let YEAR = null, rows = null;
for (const y of years) {
  const j = await cached(`unhcr-pop-${y}.json`, `${API}population/?year=${y}&coo_all=true&coa_all=true&limit=10000`);
  if (j.items?.length > 1000) { YEAR = y; rows = j.items; if (j.maxPages > 1) throw new Error('쪽이 둘 이상 — limit을 늘릴 것'); break; }
}
const tot = (await (await fetch(`${API}population/?year=${YEAR}`)).json()).items[0];
console.log('해', YEAR, '줄', rows.length);

// 2) 나라 이름 · 바탕
const L = JSON.parse(readFileSync(join(ROOT, 'data/stats/latest.json'), 'utf8'));
const KO = Object.fromEntries(L.countries.map((c) => [c.id, c.ko]));
const INC = Object.fromEntries(L.countries.map((c) => [c.id, c.inc]));
const KO_EXTRA = { UNK: '출신 불명', XXA: '무국적', TIB: '티베트인', ESH: '서사하라', XKX: '코소보', TWN: '대만', GUF: '프랑스령 기아나', GLP: '과들루프', MTQ: '마르티니크', NIU: '니우에', AIA: '앵귈라', COK: '쿡 제도', REU: '레위니옹', MYT: '마요트', VAT: '바티칸' };
const W = await worldCountries();

// 3) 흐름 · 나라별 합
const C = {};
const at = (iso, name) => (C[iso] ||= { en: name, out: 0, in: 0, idp: 0 });
const F = [];
for (const r of rows) {
  const o = r.coo_iso, a = r.coa_iso;
  if (!o || !a || o === '-' || a === '-') continue;
  if (o === a) { if (n(r.idps)) at(o, r.coo_name).idp += n(r.idps); continue; }
  const v = [n(r.refugees), n(r.asylum_seekers), n(r.oip)];
  const s = v[0] + v[1] + v[2];
  if (!s) continue;
  at(o, r.coo_name).out += s;
  at(a, r.coa_name).in += s;
  F.push([o, a, ...v]);
}
F.sort((x, y) => y[2] + y[3] + y[4] - (x[2] + x[3] + x[4]));

const countries = {};
const missing = new Set();
for (const [iso, c] of Object.entries(C)) {
  const w = W[iso];
  const ko = KO[iso] || KO_EXTRA[iso];
  if (!ko) missing.add(`${iso} ${c.en}`);
  countries[iso] = { ko: ko || c.en, out: c.out, in: c.in, idp: c.idp || undefined, inc: INC[iso] || undefined, p: w?.p || undefined, ll: w?.ll || undefined, nb: w?.nb?.length ? w.nb : undefined };
}
// 흐름이 없어도 그릴 나라 도형
const shapes = {};
for (const [iso, w] of Object.entries(W)) if (w.d) shapes[iso] = w.d;
for (const iso of Object.keys(W)) if (!countries[iso]) countries[iso] = { ko: KO[iso] || KO_EXTRA[iso] || iso, out: 0, in: 0, p: W[iso].p, ll: W[iso].ll, nb: W[iso].nb.length ? W[iso].nb : undefined, inc: INC[iso] || undefined };
if (missing.size) console.log('한국어 이름 없음:', [...missing].join(' · '));
const noPoint = Object.entries(C).filter(([iso]) => !W[iso]).map(([iso, c]) => `${iso}(${c.out + c.in})`);
console.log('지도에 점이 없는 곳:', noPoint.join(' '));

const out = {
  source: 'UNHCR Refugee Population Statistics Database (Refugee Data Finder API), CC BY 4.0',
  url: 'https://www.unhcr.org/refugee-statistics/',
  terms: 'https://www.unhcr.org/terms-use-datasets',
  fetched: new Date().toISOString().slice(0, 10),
  year: YEAR,
  total: { refugees: n(tot.refugees), asylum: n(tot.asylum_seekers), oip: n(tot.oip), idps: n(tot.idps) },
  w: { w: WORLD.w, h: WORLD.h, s: WORLD.s },
  countries,
  shapes,
  flows: F,
};
mkdirSync(join(ROOT, 'data/maps/refugees'), { recursive: true });
const txt = JSON.stringify(out);
writeFileSync(join(ROOT, 'data/maps/refugees/flows.json'), txt);
console.log('→ data/maps/refugees/flows.json', Math.round(txt.length / 1024) + 'KB', '흐름', F.length, '나라', Object.keys(countries).length);
