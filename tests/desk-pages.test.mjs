import test from 'node:test';
import assert from 'node:assert/strict';
import { SANDBOX } from '../assets/desk-pages.mjs';
import { rawUrl } from '../assets/desk-apps.mjs';

test('틀은 Desk 와 같은 출처가 되지 못한다', () => {
  assert.ok(SANDBOX.includes('allow-scripts'));
  assert.ok(!SANDBOX.includes('allow-same-origin'));
  assert.ok(!SANDBOX.includes('allow-top-navigation'));
});

test('rawUrl: 경로의 칸마다 인코딩', () => {
  assert.equal(rawUrl('a/b', '폴더/x y.html'), 'https://api.github.com/repos/a/b/contents/' + encodeURIComponent('폴더') + '/x%20y.html');
});
