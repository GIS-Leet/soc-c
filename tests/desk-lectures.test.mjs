import test from 'node:test';
import assert from 'node:assert/strict';
import { youTubeId, parseVideos, groupByUnit, recPct, bestRec, watchers } from '../assets/desk-lectures.mjs';

test('youTubeId: 공유 링크·ID·공유 문구에서 11자 ID를 꺼낸다', () => {
  assert.equal(youTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('강의 보세요 https://m.youtube.com/live/dQw4w9WgXcQ 끝'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://vimeo.com/dQw4w9WgXcQ'), null);
  assert.equal(youTubeId('https://youtu.be/short'), null);
  assert.equal(youTubeId(''), null);
});

test('parseVideos: yt 없는 항목은 버리고 order 오름차순, 같으면 최근 날짜 먼저', () => {
  const v = parseVideos({ a: { yt: 'aaaaaaaaaaa', order: 0, date: '2026-09-01' }, b: { yt: 'bbbbbbbbbbb', order: -1 }, c: { title: 'x' }, d: { yt: 'ddddddddddd', order: 0, date: '2026-09-05' } });
  assert.deepEqual(v.map(x => x.id), ['b', 'd', 'a']);
});

test('groupByUnit: 처음 나온 단원 순서, 빈 단원은 「단원 없음」', () => {
  const g = groupByUnit([{ unit: '세계화' }, { unit: '' }, { unit: '세계화' }]);
  assert.deepEqual(g.map(x => [x.unit, x.videos.length]), [['세계화', 2], ['단원 없음', 1]]);
});

test('recPct·bestRec: 실측 기록은 watchedSec, 완료 기록이 우선', () => {
  assert.equal(recPct({ dur: 100, sec: 80, watchedSec: 30, progressVersion: 2 }), 0.3);
  assert.equal(recPct({ dur: 100, sec: 80 }), 0.8);
  assert.equal(recPct({ dur: 0, sec: 80 }), 0);
  const done = { dur: 100, watchedSec: 92, progressVersion: 2, done: true, at: 1 };
  assert.equal(bestRec([{ dur: 100, sec: 100, at: 2 }, done]), done);
  assert.equal(bestRec([]), null);
});

test('watchers: 명단 학번 순, 여러 uid 중 가장 많이 본 기록', () => {
  const w = watchers('v1', {
    roster: { h2: { sid: '10302', name: '나' }, h1: { sid: '10301', name: '가' } },
    members: { u1: { h: 'h1' }, u2: { h: 'h1' } },
    views: { v1: { u1: { dur: 100, watchedSec: 20, progressVersion: 2 }, u2: { dur: 100, watchedSec: 60, progressVersion: 2 } } }
  });
  assert.deepEqual(w.map(x => x.sid), ['10301', '10302']);
  assert.equal(recPct(w[0].rec), 0.6);
  assert.equal(w[1].rec, null);
});
