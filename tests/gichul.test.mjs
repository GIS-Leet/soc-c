// 기출 분류 공용 로직 테스트 — 표지 인식(띄어 쓴 표지 포함)·id, 합성 2단 쪽 분할(구분선·쪽 넘김·가짜 번호·확인 사항), 데이터 파싱·진도·검색·통계·다시 넣기
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../assets/gichul.mjs';

test('표지 인식 — 수능·학평·모평·파일 이름·가운뎃점', () => {
  const s = G.detectMeta('2026학년도 대학수학능력시험 문제지\n사회탐구영역(한국지리)\n1. 다음', '03 한국지리_문제.pdf');
  assert.deepEqual(s, { year: 2026, exam: '수능', grade: '고3', subject: '한국지리' });
  assert.equal(G.metaTitle(s), '2026학년도 수능 한국지리');
  assert.equal(G.metaId(s), '2026학년도_수능_고3_한국지리');
  const h = G.detectMeta('1 2026학년도 6월 고1 전국연합학력평가 문제지 사회탐구 영역 (통합사회) 제 4 교시', 'x.pdf');
  assert.equal(G.metaTitle(h), '2026학년도 6월 고1 학평 통합사회');
  assert.equal(G.expectedCount(h.subject), 25);
  assert.equal(G.metaTitle(G.detectMeta('2027학년도 대학수학능력시험 9월 모의평가 문제지 사회탐구 영역(세계지리)', 'a.pdf')), '2027학년도 9월 모평 세계지리');
  assert.equal(G.metaTitle(G.detectMeta('', '2025_수능_생활과윤리.pdf')), '2025학년도 수능 생활과 윤리');
  assert.equal(G.detectMeta('2026학년도 대학수학능력시험 사회탐구영역(사회ㆍ문화)', 'b.pdf').subject, '사회·문화');
  assert.equal(G.metaId({ year: 2026, exam: '수능', grade: '고3', subject: '사회·문화' }), '2026학년도_수능_고3_사회_문화');
});

test('pdf.js 처럼 글자마다 띄어 쓴 표지도 읽음', () => {
  const m = G.detectMeta('2 0 2 6 학 년 도  대 학 수 학 능 력 시 험  문 제 지\n사 회 탐 구 영 역 ( 세 계 지 리 )', 'c.pdf');
  assert.equal(G.metaTitle(m), '2026학년도 수능 세계지리');
});

// ── 합성 2단 쪽: 흰 바탕 비트맵(배율 1) + 글자 조각. 글자 조각 자리는 잉크로 칠함 ──
function page(texts, { sep = true } = {}) {
  const w = 595, h = 842, px = new Uint8Array(w * h).fill(255);
  const ink = (x0, y0, x1, y1) => { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) px[y * w + x] = 0; };
  if (sep) ink(297, 80, 298, 800);
  const items = texts.map(([str, x, y]) => { const it = { str, x, y, w: str.length * 7, size: 9 }; ink(x, y, x + it.w, y + 10); return it; });
  return { w, h, items, raster: { w, h, scale: 1, px } };
}
const Q = (n, x, y, body = 3) => [[`${n}. 다음 자료에 대한 설명으로 옳은 것은? [${n % 2 ? 2 : 3}점]`, x, y], ...Array.from({ length: body }, (_, i) => [`본문 ${i + 1}줄`, x + 10, y + 18 + i * 16])];

test('합성 문제지 분할 — 번호·조각·배점·쪽 넘김·가짜 번호·확인 사항', () => {
  const p1 = page([['2099학년도 테스트 문제지 (사회탐구)', 200, 40], ...Q(1, 40, 100), ...Q(2, 40, 420), ...Q(3, 305, 100),
    ...Q(4, 305, 450, 4), ...Array.from({ length: 8 }, (_, i) => [`<보기> 내용 ${i + 1}`, 315, 540 + i * 16])]);
  const p2 = page([...'①②③④⑤'.split('').map((c, i) => [`${c} ㄱ, ㄴ`, 50, 100 + i * 16]), ...Q(5, 40, 250), ...Q(6, 305, 100),
    ['1. 자료 속 번호처럼 보이는 줄', 305, 200], ...Q(7, 305, 400), ['※ 확인 사항', 305, 760]]);
  const q = G.split([p1, p2]);
  assert.deepEqual(q.map(x => x.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(q[3].parts.map(p => p.p), [0, 1], '4번은 다음 쪽 왼쪽 단으로 이어짐');
  assert.ok(q.filter(x => x.number !== 4).every(x => x.parts.length === 1));
  assert.equal(q[0].points, 2); assert.equal(q[1].points, 3);
  assert.ok(q[6].parts[0].y + q[6].parts[0].h < 760, '확인 사항 줄 위에서 끝남');
  assert.ok(q[0].parts[0].x < 60 && q[2].parts[0].x > 290, '왼쪽·오른쪽 단');
});

test('구분선이 없으면 반으로 나눔', () => {
  const q = G.split([page([...Q(1, 40, 120), ...Q(2, 305, 120)], { sep: false })]);
  assert.deepEqual(q.map(x => x.number), [1, 2]);
});

// ── 데이터 ──
const root = {
  exams: {
    A: { title: 'A 시험', year: 2099, exam: '수능', grade: '고3', subject: '한국지리', pdf: '기출/A.pdf', pages: 2, count: 3, createdAt: 1 },
    B: { title: 'B 시험', year: 2099, exam: '6월 학평', grade: '고1', subject: '통합사회', pdf: '기출/B.pdf', pages: 2, count: 2, createdAt: 2 },
    C: { title: 'PDF 없음', year: 2099 }
  },
  items: {
    A: { '01': { parts: [{ p: 0, x: 1, y: 2, w: 3, h: 4 }], pts: 2, c: ['한지 Ⅱ 지형 > 하천 지형'], d: ['지도(위치)'], ans: 3, at: 5 },
         '02': { parts: [{ p: 0, x: 1, y: 2, w: 3, h: 4 }], pts: 3 },
         '03': { parts: [{ p: 1, x: 1, y: 2, w: 3, h: 4 }], c: ['한지 Ⅱ 지형 > 해안 지형'], d: ['지도(위치)', '통계표'], o: ['개념 혼동'], memo: 'm', at: 6 } },
    B: { '01': { parts: [{ p: 0, x: 1, y: 2, w: 3, h: 4 }] }, '02': { parts: [{ p: 0, x: 1, y: 2, w: 3, h: 4 }], d: ['통계표'], at: 7 } },
    C: { '01': { parts: [] } }
  }
};

test('파싱·순서·진도', () => {
  const d = G.parseData(root);
  assert.deepEqual(d.exams.map(e => e.id), ['A', 'B'], 'PDF 없는 시험은 버림');
  assert.deepEqual(d.items.map(i => i.id), ['A/01', 'A/02', 'A/03', 'B/01', 'B/02']);
  assert.equal(G.taggedCount(d), 3);
  assert.equal(G.nextUntagged(d)?.id, 'A/02');
  assert.equal(G.nextUntagged(d, 'A/02')?.id, 'B/01');
  const now = new Date(); const d2 = { ...d, items: d.items.map(i => i.id === 'B/01' ? { ...i, tags: { o: ['계산 실수'] }, at: now.getTime() } : i) };
  assert.equal(G.todayCount(d2, now), 1);
});

test('검색·통계', () => {
  const d = G.parseData(root);
  assert.deepEqual(G.search(d, { tags: ['지도(위치)'] }).map(i => i.id), ['A/01', 'A/03']);
  assert.deepEqual(G.search(d, { tags: ['한지 Ⅱ 지형'] }).map(i => i.id), ['A/01', 'A/03'], '단원 태그는 세부도 찾음');
  assert.deepEqual(G.search(d, { subject: '통합사회', tags: ['통계표'] }).map(i => i.id), ['B/02']);
  assert.deepEqual(G.frequency(d, 'c'), [{ tag: '한지 Ⅱ 지형', n: 2 }]);
  assert.equal(G.frequency(d, 'd')[0].tag, '지도(위치)');
  assert.equal(G.cross(d)['한지 Ⅱ 지형']['지도(위치)'], 2);
});

test('기록 왕복·처음 태그 시각·다시 넣어도 태그 유지', () => {
  const d = G.parseData(root), it = d.items[2];
  assert.deepEqual(G.itemRecord(it), root.items.A['03']);
  const fresh = G.stamp({ ...d.items[1], tags: { d: ['통계표'] } }, 999);
  assert.equal(fresh.at, 999);
  assert.equal(G.stamp({ ...d.items[0], tags: {} }).at, null, '태그를 다 떼면 시각도 지움');
  const found = [{ number: 1, parts: [{ p: 0, x: 9, y: 9, w: 9, h: 9 }], points: null }, { number: 2, parts: [{ p: 0, x: 8, y: 8, w: 8, h: 8 }], points: 3 }];
  const out = G.mergeFound('A', { year: 2099, exam: '수능', grade: '고3', subject: '한국지리' }, found, G.itemsOf(d, 'A'));
  assert.deepEqual(out['01'].c, ['한지 Ⅱ 지형 > 하천 지형']);
  assert.equal(out['01'].ans, 3); assert.equal(out['01'].pts, 2, '수능은 표시 없는 문항 = 2점');
  assert.deepEqual(out['01'].parts, found[0].parts);
});

test('분류표 — 앱과 같은 JSON', async () => {
  const { readFileSync } = await import('node:fs');
  const tax = G.parseTaxonomy(JSON.parse(readFileSync(new URL('../data/gichul-taxonomy.json', import.meta.url))));
  assert.deepEqual(tax.concepts.map(c => c.short), ['통사1', '통사2', '한지', '세지']);
  assert.equal(tax.data.length, 10); assert.equal(tax.errors.length, 6);
  assert.equal(G.conceptOrder(tax, '한국지리')[0].short, '한지');
  assert.ok(tax.concepts[0].units[0].subs[0].startsWith('통사1 Ⅰ 통합적 관점 > '));
});
