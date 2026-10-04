import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, heroState, safeSrc, posterOf, popupWanted, DEFAULT_SRC, dayKey } from '../assets/site-hero.mjs';

test('normalize: 빈 값은 기본값, 이상한 값은 버림', () => {
  assert.deepEqual(normalize(null), { on: false, start: '', end: '', mode: 'popup', title: '', src: DEFAULT_SRC, dim: 0.35, watch: false, tone: 'dark' });
  assert.deepEqual(normalize({ on: 'yes', start: '10/6', end: '2026-10-20', src: '  media/a.mp4 ', dim: 3, watch: true }),
    { on: false, start: '', end: '2026-10-20', mode: 'popup', title: '', src: 'media/a.mp4', dim: 0.85, watch: true, tone: 'dark' });
  assert.equal(normalize({ mode: 'bg' }).mode, 'bg'); assert.equal(normalize({ mode: 'x' }).mode, 'popup');
  assert.equal(normalize({ title: '  2027 세계시민과 지리  ' }).title, '2027 세계시민과 지리'); assert.equal(normalize({ title: 'a'.repeat(99) }).title.length, 60);
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

test('posterOf: 영상과 같은 이름의 jpg', () => {
  assert.equal(posterOf('https://nyuheatgis.com/media/hero.mp4'), 'https://nyuheatgis.com/media/hero.jpg');
  assert.equal(posterOf('https://x.com/a.b/promo.webm?v=2'), 'https://x.com/a.b/promo.jpg?v=2');
});

test('popupWanted: 오늘 하루 보지 않기(그날·그 영상)와 이번 방문에서 닫은 경우만 건너뜀', () => {
  const src = 'https://nyuheatgis.com/media/hero.mp4', today = '2026-10-10';
  assert.equal(popupWanted(src, { today }), true);
  assert.equal(popupWanted(src, { today, hideDay: `2026-10-10|${src}` }), false);
  assert.equal(popupWanted(src, { today, hideDay: `2026-10-09|${src}` }), true);        // 어제 숨긴 건 오늘 다시
  assert.equal(popupWanted(src, { today, hideDay: '2026-10-10|https://nyuheatgis.com/media/old.mp4' }), true);   // 영상이 바뀌면 다시
  assert.equal(popupWanted(src, { today, closed: src }), false);
});

test('dayKey: 로컬 날짜 YYYY-MM-DD', () => assert.equal(dayKey(new Date(2026, 9, 4, 23, 59)), '2026-10-04'));
