import test from 'node:test';
import assert from 'node:assert/strict';
import { roomOf, classNumber, progressClass, matchFiles, plan } from '../assets/desk-prep.mjs';

const START = { 1: 500, 2: 560, 3: 620, 4: 680, 5: 790, 6: 850, 7: 910 };
const table = { thu: { 2: '103 통사2C', 5: '105 통사2C' }, fri: { 1: '101 통사2C' } };
const classes = { c1: { name: '1반', done: 0 }, c3: { name: '3반', done: 4 }, c5: { name: '5반', done: 9 } };
const lessons = Array.from({ length: 10 }, (_, i) => ({ title: i === 4 ? '세계화의 문제점' : `차시${i + 1}`, unit: '세계화와 평화' }));
const files = [{ name: '세계화의 문제점_수업자료.pdf', path: '수업/세계화의 문제점_수업자료.pdf' }, { name: '세계화_학습지.hwpx', path: '학습지/세계화_학습지.hwpx' }, { name: '시장경제.pdf', path: '수업/시장경제.pdf' }, { name: '세계화의 문제점-필기.pdf', path: '수업/세계화의 문제점-필기.pdf' }];

test('교실 → 반', () => {
  assert.equal(roomOf('103 통사2C'), '103');
  assert.equal(classNumber('103'), 3); assert.equal(classNumber('3반'), null);
  assert.equal(progressClass('103', classes)[0], 'c3');
  assert.equal(progressClass('109', classes), null);
});

test('matchFiles: 낱말이 많이 맞는 자료 먼저, 필기본은 감점, 안 맞는 건 제외', () => {
  const m = matchFiles({ title: '세계화의 문제점', unit: '세계화와 평화' }, files);
  assert.equal(m[0].name, '세계화의 문제점_수업자료.pdf');
  assert.ok(!m.some(f => f.name === '시장경제.pdf'));
  assert.equal(matchFiles(null, files).length, 0);
});

test('plan: 수업 중이면 지금 수업, 그 반의 다음 차시와 자료', () => {
  const p = plan({ table, start: START, lessons, classes, files, now: new Date(2026, 9, 1, 9, 40) });   // 목 9:40 → 2교시(9:20~10:10)
  assert.equal(p.isNow, true); assert.equal(p.slot.period, 2); assert.equal(p.classId, 'c3');
  assert.equal(p.lesson.no, 5); assert.equal(p.lesson.title, '세계화의 문제점');
  assert.equal(p.files[0].name, '세계화의 문제점_수업자료.pdf');
});

test('plan: 쉬는 시간엔 다음 수업, 끝나면 다음 평일 첫 수업, 주말은 월요일', () => {
  assert.equal(plan({ table, start: START, lessons, classes, now: new Date(2026, 9, 1, 11, 0) }).slot.period, 5);
  const after = plan({ table, start: START, lessons, classes, now: new Date(2026, 9, 1, 14, 5) });
  assert.equal(after.shifted, true); assert.equal(after.date.getDay(), 5); assert.equal(after.slot.subject, '101 통사2C');
  assert.equal(plan({ table: { mon: { 3: '102 통사' } }, start: START, now: new Date(2026, 9, 3, 10, 0) }).date.getDay(), 1);
  assert.equal(plan({ table: {}, start: START, now: new Date(2026, 9, 1, 9, 0) }), null);
});

test('plan: 진도를 다 마친 반은 차시 없음', () => {
  const p = plan({ table, start: START, lessons, classes: { c5: { name: '5반', done: 10 } }, now: new Date(2026, 9, 1, 12, 0) });
  assert.equal(p.classId, 'c5'); assert.equal(p.lesson, null);
});
