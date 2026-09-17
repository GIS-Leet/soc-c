// 폰 잠금 공부: 카드를 조각으로 끝까지 읽어야 시험 — 조각 계획과 최소 읽기 시간
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSteps, readSeconds, createReader } from '../assets/study-reader.mjs';

test('readSeconds: 분당 300자 기준, 8~40초로 묶고 빠른 모드는 절반(4~20초)', () => {
  assert.equal(readSeconds(0), 8);
  assert.equal(readSeconds(100), 20);
  assert.equal(readSeconds(5000), 40);
  assert.equal(readSeconds(0, { fast: true }), 4);
  assert.equal(readSeconds(100, { fast: true }), 10);
  assert.equal(readSeconds(5000, { fast: true }), 20);
});

test('planSteps: 글자가 없는 조각은 건너뛰고, 각 조각의 글자 수를 센다', () => {
  const text = { a: '가나다', b: '', c: '   ', d: '라마바사' };
  const steps = planSteps([['a'], ['b', 'c'], ['d']], id => text[id]);
  assert.deepEqual(steps, [{ ids: ['a'], chars: 3 }, { ids: ['d'], chars: 4 }]);
});

test('createReader: 시간이 차야 다음으로, 마지막 조각이 끝나면 done', () => {
  let now = 1000;
  const r = createReader([{ ids: ['a'], chars: 0 }, { ids: ['b'], chars: 0 }], { now: () => now });
  assert.deepEqual(r.state(), { index: 0, total: 2, remaining: 8, last: false, done: false });
  assert.equal(r.next(), false);                    // 아직 8초 안 지남 → 안 넘어감
  now += 8000;
  assert.equal(r.state().remaining, 0);
  assert.equal(r.next(), true);
  assert.equal(r.state().index, 1);
  assert.equal(r.state().last, true);
  now += 7000;
  assert.equal(r.next(), false);
  now += 1000;
  assert.equal(r.next(), true);
  assert.equal(r.state().done, true);
  assert.equal(r.next(), false);                    // 끝난 뒤엔 더 없음
});

test('createReader: 빠른 모드는 조각당 시간이 절반', () => {
  let now = 0;
  const r = createReader([{ ids: ['a'], chars: 100 }], { now: () => now, fast: true });
  assert.equal(r.state().remaining, 10);
});

import { reviewOf } from '../assets/study-reader.mjs';
test('reviewOf: 틀린 문제의 카드에서 읽을 개념을 뽑는다', () => {
  const D = { geo: { days: [{ t: '공간 자기상관', en: "Moran's I", m: '가까운 것이 닮는다.', a: '핵심 정리.', k: [['모란 지수', '전역 자기상관 지표']] }] },
              jp: { days: [{ type: 'kana', rows: ['あいうえお'], m: '모음' }, { t: '명사문', s: 'わたしは せんせいです。', m: '저는 선생님입니다.', v: [['がくせいです', '', '학생입니다']], w: [['ほん', '책']], g: '설명입니다.' }] } };
  assert.deepEqual(reviewOf({ id: 'geo:0:mterm0', day: 1, prompt: 'p', answer: '모란 지수' }, D).lines,
    ['모란 지수 — 전역 자기상관 지표', "공간 자기상관 (Moran's I)", '가까운 것이 닮는다.', '핵심 정리.']);
  assert.deepEqual(reviewOf({ id: 'geo:0:def2name', day: 1, prompt: 'p', answer: 'x' }, D).lines.length, 3);
  assert.deepEqual(reviewOf({ id: 'jp:1:k2w1', day: 2, prompt: '책', answer: 'ほん' }, D).lines,
    ['ほん — 책', 'わたしは せんせいです。 — 저는 선생님입니다.', '설명입니다.']);
  assert.deepEqual(reviewOf({ id: 'jp:1:s', day: 2, prompt: 's', answer: 's' }, D).lines.length, 2);
  assert.deepEqual(reviewOf({ id: 'kana:う:t', prompt: 'う', answer: '우' }, D).lines, ['あ い う え お', '모음']);
  assert.deepEqual(reviewOf({ id: 'geo:9:mdef', day: 10 }, D).lines, []);   // 카드가 없어도 죽지 않음
});
