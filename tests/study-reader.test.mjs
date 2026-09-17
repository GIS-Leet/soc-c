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
