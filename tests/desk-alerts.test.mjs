import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTime, alertPlan, dueAlerts, WINDOW } from '../assets/desk-alerts.mjs';
import { classNow, learnedWords, wordAt } from '../assets/desk-mini.mjs';

const START = { 1: 500, 2: 560, 3: 620 };
test('splitTime: 24시간·오전/오후 표기, 시각 없으면 null', () => {
  assert.deepEqual(splitTime('14:00 학년 협의회'), { minutes: 840, title: '학년 협의회' });
  assert.deepEqual(splitTime('오후 2시 30분 상담'), { minutes: 870, title: '상담' });
  assert.deepEqual(splitTime('오전 12시 점검'), { minutes: 0, title: '점검' });
  assert.deepEqual(splitTime('교과협의회'), { minutes: null, title: '교과협의회' });
  assert.equal(splitTime('25:00 x').minutes, null);
});

test('alertPlan: 수업 2분 전(무음)·일정 10분 전·아침 7시·일요일 20시 — 켠 것만', () => {
  const thu = new Date(2026, 9, 1, 6, 0);
  const items = alertPlan({ now: thu, table: { thu: { 2: '103 통사2C' } }, start: START, calendar: { '2026-10-01': { e1: { text: '15:30 학부모 상담' }, e2: { text: '수행평가 마감' } } }, prefs: { cls: true, event: true, weekly: true }, weeklyLine: 'x' });
  assert.deepEqual(items.map(i => [i.id, new Date(i.fire).getHours() * 60 + new Date(i.fire).getMinutes()]),
    [['event-day-2026-10-01', 420], ['class-2026-10-01-2', 558], ['event-2026-10-01-e1', 920]]);
  assert.equal(items[1].silent, true); assert.equal(items[1].body, '2교시 9:20 · 103 통사2C');
  assert.match(items[0].body, /15:30 학부모 상담\n수행평가 마감/);
  assert.equal(alertPlan({ now: thu, table: { thu: { 2: 'x' } }, start: START, prefs: {} }).length, 0);
  const sun = alertPlan({ now: new Date(2026, 9, 4, 9), prefs: { weekly: true }, weeklyLine: '2일 · 90분' });
  assert.deepEqual(sun.map(i => i.id), ['weekly-2026-10-04']);
});

test('dueAlerts: 시각이 지났고 3분 안, 아직 안 울린 것만', () => {
  const now = 1_000_000_000;
  const items = [{ id: 'a', fire: now - 1000 }, { id: 'b', fire: now - WINDOW - 1 }, { id: 'c', fire: now + 1000 }, { id: 'd', fire: now - 5 }];
  assert.deepEqual(dueAlerts(items, { d: 1 }, now).map(i => i.id), ['a']);
});

test('classNow: 수업 중·다음 수업·끝·주말', () => {
  const table = { thu: { 1: '101', 3: '103' } };
  assert.deepEqual(classNow({ table, start: START, now: new Date(2026, 9, 1, 8, 30) }), { kind: 'now', p: 1, s: 500, subj: '101', left: 40 });
  assert.equal(classNow({ table, start: START, now: new Date(2026, 9, 1, 9, 30) }).left, 50);
  assert.equal(classNow({ table, start: START, now: new Date(2026, 9, 1, 15, 0) }).kind, 'done');
  assert.equal(classNow({ table, start: START, now: new Date(2026, 9, 3, 9, 0) }).kind, 'none');
});

test('learnedWords·wordAt: 오늘까지의 날만, 가나 기간 제외, 15분마다 같은 단어', () => {
  const deck = { start: '2026-10-01', days: [{ type: 'kana', rows: ['あいう'] }, { v: [['がっこう', 'gakkou', '학교']], w: [['せんせい', '선생님']] }, { w: [['あした', '내일']] }] };
  assert.deepEqual(learnedWords(deck, new Date(2026, 9, 2, 10)), [['がっこう', '학교'], ['せんせい', '선생님']]);
  assert.equal(learnedWords(deck, new Date(2026, 9, 9)).length, 3);
  const w = [['a', '1'], ['b', '2']];
  assert.equal(wordAt(w, 0), wordAt(w, 899_999)); assert.notEqual(wordAt(w, 0), wordAt(w, 900_000));
  assert.equal(wordAt([], 0), null);
});
