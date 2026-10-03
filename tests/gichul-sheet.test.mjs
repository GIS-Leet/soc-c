import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetHtml, ansMark, paginate, summary } from '../assets/gichul-sheet.mjs';

const items = [
  { src: 'data:a', source: '2026학년도 수능 한국지리 3번', ans: 3, memo: '<요점> A&B', w: 250, subject: '한국지리', year: 2026, exam: '수능' },
  { src: 'data:b', source: '2027학년도 6월 모평 한국지리 12번', ans: null, memo: '', w: 200, subject: '한국지리', year: 2027, exam: '6월 모평' }
];

test('ansMark: 1~5는 원문자, 없으면 –', () => { assert.equal(ansMark(1), '①'); assert.equal(ansMark(5), '⑤'); assert.equal(ansMark(null), '–'); assert.equal(ansMark(9), '–'); });

test('paginate: 단이 차면 다음 단, 쪽이 차면 다음 쪽 — 첫 쪽은 머리만큼 짧다', () => {
  // 첫 쪽 단 높이 100, 나머지 150, 간격 10, 2단
  assert.deepEqual(paginate([40, 40, 40, 40, 100, 100], [100, 150], 10, 2), [[[0, 1], [2, 3]], [[4], [5]]]);
  assert.deepEqual(paginate([60, 60, 60], [100, 150], 10, 1), [[[0]], [[1, 2]]]);
  // 빈 쪽에도 안 들어가는 문항은 그 쪽에 그대로(그리는 쪽에서 줄임) — 제목만 있는 빈 첫 쪽을 만들지 않는다
  assert.deepEqual(paginate([120], [100, 150], 10, 2), [[[0]]]);
  assert.deepEqual(paginate([400, 30], [100, 150], 10, 2), [[[0], [1]]]);
  // 첫 쪽 첫 단이 찬 뒤의 긴 문항은 다음 단이 아니라 들어갈 수 있는 다음 쪽으로
  assert.deepEqual(paginate([50, 120], [100, 150], 10, 2), [[[0], []], [[1]]]);
  assert.deepEqual(paginate([], [100, 150], 10, 2), [[[]]]);
});

test('summary: 과목이 하나면 그 과목, 학년도 범위와 시행 종류, 저작권자', () => {
  assert.deepEqual(summary(items), { subject: '한국지리', range: '2026~2027학년도 수능 · 모평', owners: '한국교육과정평가원' });
  const mixed = summary([{ subject: '통합사회', year: 2026, exam: '3월 학평' }, { subject: '한국지리', year: 2026, exam: '수능' }]);
  assert.equal(mixed.subject, ''); assert.equal(mixed.range, '2026학년도 수능 · 학평'); assert.equal(mixed.owners, '한국교육과정평가원 · 시도교육청');
});

test('sheetHtml: 학습지 틀 — 러닝 헤더·이름 줄·시험 머리·바닥, 새 번호와 출처', () => {
  const h = sheetHtml(items, { title: '세계화 <1>' });
  assert.match(h, /<span class="unit">한국지리<\/span><span class="lesson">세계화 &lt;1&gt;<\/span><span class="type">PRACTICE<\/span>/);
  assert.match(h, /class="nameline"/); assert.match(h, /<h1>세계화 &lt;1&gt; — 기출 문항<\/h1>/);
  assert.match(h, /<b>구성<\/b>5지선다 2문항/); assert.match(h, /<b>출처<\/b>2026~2027학년도 수능 · 모평/);
  assert.match(h, /문항 저작권 한국교육과정평가원 · 수업용 배포/);
  assert.match(h, /<span class="no">1<\/span><span class="ref">2026학년도 수능 한국지리 3번<\/span>/);
  assert.match(h, /style="width:100%"/); assert.match(h, /style="width:80%"/);   // 자른 폭 250pt → 한 단 가득, 200pt → 80%
  assert.ok(!h.includes('id="sk-key"') && !h.includes('요점') && !h.includes('"autoPrint":true'));
});

test('sheetHtml: 옵션 — 1단·이름 줄 없음·출처 없음·정답표·풀이 요점(이스케이프)·자동 인쇄', () => {
  const h = sheetHtml(items, { cols: 1, nameLine: false, sources: false, answers: true });
  assert.match(h, /class="qgrid c1"/); assert.ok(!h.includes('class="nameline"') && !h.includes('class="ref"'));
  assert.match(h, /<table class="key"><tr class="n"><th>1<\/th><th>2<\/th>/); assert.match(h, /<tr class="a"><td>③<\/td><td>–<\/td>/);
  const m = sheetHtml(items, { answers: true, memos: true, autoPrint: true });
  assert.match(m, /정답과 풀이 요점/); assert.match(m, /<span class="ans">③<\/span>/); assert.match(m, /&lt;요점&gt; A&amp;B/); assert.match(m, /"autoPrint":true/);
});
