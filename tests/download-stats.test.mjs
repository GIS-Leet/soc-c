import test from 'node:test';
import assert from 'node:assert/strict';
import { statKey, dayKey, recordDownload } from '../assets/download-stats.mjs';

test('자료 경로를 Firebase 키로 — 금지 문자를 읽을 수 있는 문자로 바꾼다', () => {
  assert.equal(statKey('학습지/통사 C 학습지 3.pdf'), '학습지｜통사 C 학습지 3·pdf');
  assert.equal(statKey('PPT/a#b$c[d].pptx'), 'PPT｜a_b_c_d_·pptx');
  assert.ok(!/[.#$\[\]\/]/.test(statKey('x/y.z/#$[]')));
});
test('기록은 날짜별·파일별로 서버 증가값을 PATCH 하고, 실패해도 던지지 않는다', async () => {
  const calls = [];
  await recordDownload('학습지/기후.pdf', 'download', {fetcher: async (url, init) => { calls.push({url, init}); return {ok:true}; }, now: new Date(2026, 8, 18, 9, 0)});
  assert.equal(calls[0].url, 'https://soc-c-qna-default-rtdb.firebaseio.com/stats/downloads/2026-09-18.json');
  assert.equal(calls[0].init.method, 'PATCH'); assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), {'학습지｜기후·pdf': {download: {'.sv': {increment: 1}}}});
  await recordDownload('a/b.pdf', 'view', {fetcher: async () => { throw new Error('offline'); }});   // 조용히
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
