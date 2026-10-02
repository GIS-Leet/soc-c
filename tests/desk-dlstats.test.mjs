import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStats, totalSince, fileLabel, startKey, dayKey } from '../assets/desk-dlstats.mjs';
import { statKey } from '../assets/download-stats.mjs';

test('fileLabel: 기록 키를 화면 이름으로 — 확장자 점만 되돌리고 진짜 가운뎃점은 둔다', () => {
  assert.deepEqual(fileLabel(statKey('2026-1학기 통사C/PPT/자연재해·환경.pdf')), { name: '자연재해·환경.pdf', folder: '2026-1학기 통사C › PPT' });
  assert.deepEqual(fileLabel('학습지·hwpx'), { name: '학습지.hwpx', folder: '' });
});

test('parseStats: 날짜 합계와 기간 안 파일 순위', () => {
  const raw = { '2026-09-01': { a: { view: 2, download: 1 }, b: { view: 5 } }, '2026-09-30': { a: { view: 4 } } };
  const all = parseStats(raw);
  assert.deepEqual(all.days, { '2026-09-01': 8, '2026-09-30': 4 });
  assert.deepEqual(all.files.map(f => [f.key, f.total]), [['a', 7], ['b', 5]]);
  assert.deepEqual(parseStats(raw, '2026-09-15').files.map(f => [f.key, f.total]), [['a', 4]]);
  assert.equal(totalSince(all.days, '2026-09-15'), 4);
  assert.equal(totalSince(all.days), 12);
});

test('startKey: 오늘 포함 k일', () => {
  const now = new Date(2026, 9, 3);
  assert.equal(startKey(1, now), dayKey(now));
  assert.equal(startKey(7, now), '2026-09-27');
});
