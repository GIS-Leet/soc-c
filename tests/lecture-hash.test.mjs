// lecture.html 의 학번·이름 해시가 Desk 앱(Shared/Lecture.swift RosterHash)과 같은 값을 내는지 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../lecture.html', import.meta.url), 'utf8');
const m = html.match(/<script id="lecture-hash">([\s\S]*?)<\/script>/);
assert.ok(m, 'lecture.html 에 <script id="lecture-hash"> 블록이 있어야 함');
const window = {}; globalThis.crypto ??= webcrypto;
new Function('window', m[1])(window);
const H = window.LectureHash;

test('정규화', () => {
  assert.equal(H.normSid(' 2 0 3-1 5'), '20315');
  assert.equal(H.normName('홍 길 동'), '홍길동');
  assert.equal(H.normName('홍길동'.normalize('NFD')), '홍길동');
});
test('해시 벡터(Desk 앱과 동일)', async () => {
  const v = '9505a804043275e25ca8d4b6af8824b211854d9869d1ed25b057f60ac96abf3d';
  assert.equal(await H.hashId('20315', '홍길동'), v);
  assert.equal(await H.hashId(' 2 0 3 1 5', '홍 길 동'), v);
});
