import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, heroState, safeSrc, DEFAULT_SRC, dayKey } from '../assets/site-hero.mjs';

test('normalize: 빈 값은 기본값, 이상한 값은 버림', () => {
  assert.deepEqual(normalize(null), { on: false, start: '', end: '', src: DEFAULT_SRC, dim: 0.35, watch: false, tone: 'dark' });
  assert.deepEqual(normalize({ on: 'yes', start: '10/6', end: '2026-10-20', src: '  media/a.mp4 ', dim: 3, watch: true }),
    { on: false, start: '', end: '2026-10-20', src: 'media/a.mp4', dim: 0.85, watch: true, tone: 'dark' });
  assert.equal(normalize({ tone: 'light' }).tone, 'light'); assert.equal(normalize({ tone: 'neon' }).tone, 'dark');
  assert.equal(normalize({ dim: 0 }).dim, 0);
});

test('heroState: 켠 기간에만 active — 시작·끝 날짜 모두 그날 포함, 비우면 제한 없음', () => {
  const c = { on: true, start: '2026-10-06', end: '2026-10-20' };
  assert.equal(heroState(c, '2026-10-05'), 'before');
  assert.equal(heroState(c, '2026-10-06'), 'active');
  assert.equal(heroState(c, '2026-10-20'), 'active');
  assert.equal(heroState(c, '2026-10-21'), 'after');
  assert.equal(heroState({ ...c, on: false }, '2026-10-10'), 'off');
  assert.equal(heroState({ on: true }, '2026-10-10'), 'active');
  assert.equal(heroState({ on: true, end: '2026-10-09' }, '2026-10-10'), 'after');
  assert.equal(heroState(undefined), 'off');
});

test('safeSrc: 사이트 안 경로와 https 만', () => {
  assert.equal(safeSrc('media/hero.mp4', 'https://nyuheatgis.com/index.html'), 'https://nyuheatgis.com/media/hero.mp4');
  assert.equal(safeSrc('https://cdn.example.com/a.mp4', 'https://nyuheatgis.com/'), 'https://cdn.example.com/a.mp4');
  assert.equal(safeSrc('javascript:alert(1)', 'https://nyuheatgis.com/'), null);
  assert.equal(safeSrc('data:video/mp4;base64,AAAA', 'https://nyuheatgis.com/'), null);
});

test('dayKey: 로컬 날짜 YYYY-MM-DD', () => assert.equal(dayKey(new Date(2026, 9, 4, 23, 59)), '2026-10-04'));
