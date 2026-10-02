import test from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, weekSummary, summaryLine, labelOf } from '../assets/desk-weekly.mjs';

const now = new Date(2026, 9, 3, 21, 0);   // 토요일
test('weekStart: 월요일 시작', () => assert.equal(weekStart(now).getDate(), 28));

test('weekSummary: 이번 주 세션만, 스트릭 프리즈 제외, 이번 주 시험 기록만', () => {
  const ws = weekStart(now).getTime();
  const s = weekSummary({ now,
    sessions: { a: { date: '2026-09-28', min: 30 }, b: { date: '2026-09-28', min: 20 }, c: { date: '2026-10-02', min: 40 }, d: { date: '2026-09-27', min: 99 }, e: { date: '2026-10-01', min: 0, subject: '스트릭 프리즈' } },
    quizlog: { 'geo:3:term1:ts': { last: ws + 1, right: 2, wrong: 3, streak: 0 }, 'jp:5:k2w2': { last: ws + 9, right: 5, wrong: 0, streak: 3 }, 'jp:1:w2k0': { last: ws + 5, right: 1, wrong: 1, streak: 2 }, old: { last: ws - 1, right: 0, wrong: 9 } } });
  assert.equal(s.minutes, 90); assert.equal(s.days, 2);
  assert.equal(s.right, 8); assert.equal(s.wrong, 4); assert.equal(s.accuracy, 66);
  assert.deepEqual(s.weak, ['geo:3:term1:ts']);
  assert.equal(summaryLine(s), '2일 · 90분 · 정답률 66% · 약한 문제 1개 — 다음 주에 먼저 나옵니다');
  assert.equal(weekSummary({ now }).accuracy, null);
});

test('labelOf: 카드 묶음에서 이름을 찾고, 없으면 Day 표기', () => {
  const decks = { geo: { days: [{ t: '세계화', k: [['다국적 기업', '…'], ['공간적 분업', '…']] }] }, jp: { days: [{ s: 'おはよう', m: '안녕', v: [['がっこう', 'gakkou', '학교']], w: [['せんせい', '선생님']] }] } };
  assert.equal(labelOf('geo:0:term1:ts', decks), '공간적 분업 — 세계화');
  assert.equal(labelOf('geo:0:def', decks), '세계화');
  assert.equal(labelOf('jp:0:k2w1', decks), 'せんせい — 선생님');
  assert.equal(labelOf('jp:0:sent', decks), 'おはよう — 안녕');
  assert.equal(labelOf('geo:9:x', decks), '통합사회 Day 10');
  assert.equal(labelOf('kana:あ'), '가나 あ');
});
