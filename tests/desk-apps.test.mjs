import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, filePath, parseManifest, createBridge, MAX_STATE } from '../assets/desk-apps.mjs';

test('cleanPath: 저장소 안 상대 경로만', () => {
  assert.equal(cleanPath('폴더/desk/앱.html'), '폴더/desk/앱.html');
  for (const bad of ['', '/a', 'a/../b', '../a', 'a//b', 'a/./b', 'a\\b', 'a/', null, 3]) assert.equal(cleanPath(bad), null, String(bad));
});

test('filePath: base 아래의 그림 파일만 내준다', () => {
  assert.equal(filePath('폴더', 'q/2026A01.webp'), '폴더/q/2026A01.webp');
  assert.equal(filePath('폴더', 'q/a.PNG'), '폴더/q/a.PNG');
  assert.equal(filePath('폴더', '../수업/a.webp'), null);
  assert.equal(filePath('폴더', 'data/2026.js'), null);
  assert.equal(filePath('폴더', 'desk/앱.html'), null);
  assert.equal(filePath('', 'q/a.webp'), null);
});

test('parseManifest: 모양이 맞는 항목만, 같은 id 는 한 번', () => {
  const ok = { id: 'memo-geo', title: ' 지리 ', path: '폴더/desk/지리.html', base: '폴더', note: '메모' };
  const list = parseManifest(JSON.stringify([ok, { ...ok, title: '중복' }, { ...ok, id: 'Bad Id' }, { ...ok, id: 'x', path: '폴더/a.js' }, { ...ok, id: 'y', base: '../a' }, { ...ok, id: 'z', title: '' }, null, 3]));
  assert.deepEqual(list, [{ id: 'memo-geo', title: '지리', note: '메모', path: '폴더/desk/지리.html', base: '폴더' }]);
  assert.deepEqual(parseManifest('{'), []);
  assert.deepEqual(parseManifest('{"id":"a"}'), []);
});

const app = { id: 'memo-geo', base: '폴더' };
function harness(over = {}) {
  const sent = [], saved = [], status = [];
  const b = createBridge(app, {
    post: m => sent.push(m), loadState: async () => '{"c":{}}', saveState: async j => { saved.push(j); },
    loadFile: async p => ({ path: p }), onStatus: t => status.push(t), delay: 5, ...over
  });
  return { b, sent, saved, status };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('bridge: ready 에 기록을 건네고, 그 뒤의 저장만 모아서 한 번 쓴다', async () => {
  const { b, sent, saved } = harness();
  await b.handle({ t: 'app:save', id: 'memo-geo', json: '{}' });   // 기록을 받기 전 — 버린다
  await b.handle({ t: 'app:ready', id: 'memo-geo' });
  assert.deepEqual(sent, [{ t: 'app:state', json: '{"c":{}}' }]);
  await b.handle({ t: 'app:save', id: 'memo-geo', json: '{"a":1}' });
  await b.handle({ t: 'app:save', id: 'memo-geo', json: '{"a":2}' });
  await wait(30);
  assert.deepEqual(saved, ['{"a":2}']);
});

test('bridge: 기록을 못 불러오면 fail 을 알리고 저장을 받지 않는다', async () => {
  const { b, sent, saved } = harness({ loadState: async () => { throw new Error('x'); } });
  await b.handle({ t: 'app:ready', id: 'memo-geo' });
  assert.deepEqual(sent, [{ t: 'app:state', fail: true }]);
  await b.handle({ t: 'app:save', id: 'memo-geo', json: '{}' });
  await b.close();
  assert.deepEqual(saved, []);
});

test('bridge: 다른 id · 너무 큰 기록 · 그림 아닌 파일은 받지 않는다', async () => {
  const { b, sent, saved } = harness();
  await b.handle({ t: 'app:ready', id: 'other' });
  assert.equal(sent.length, 0);
  await b.handle({ t: 'app:ready', id: 'memo-geo' });
  await b.handle({ t: 'app:save', id: 'memo-geo', json: 'x'.repeat(MAX_STATE + 1) });
  await b.handle({ t: 'app:file', id: 'memo-geo', n: 1, path: 'q/2026A01.webp' });
  await b.handle({ t: 'app:file', id: 'memo-geo', n: 2, path: '../수업/비밀.webp' });
  await b.handle({ t: 'app:file', id: 'memo-geo', n: 3, path: 'data/2026.js' });
  await b.close();
  assert.deepEqual(saved, []);
  assert.deepEqual(sent.slice(1), [{ t: 'app:file', n: 1, blob: { path: '폴더/q/2026A01.webp' } }, { t: 'app:file', n: 2, blob: null }, { t: 'app:file', n: 3, blob: null }]);
});

test('bridge: 닫을 때 밀린 저장을 바로 쓰고, 실패한 저장은 다음에 다시 보낸다', async () => {
  let fail = true; const saved = [];
  const { b } = harness({ delay: 1000, saveState: async j => { if (fail) { fail = false; throw new Error('net'); } saved.push(j); } });
  await b.handle({ t: 'app:ready', id: 'memo-geo' });
  await b.handle({ t: 'app:save', id: 'memo-geo', json: '{"a":1}' });
  await b.close();   // 첫 쓰기는 실패 — pending 에 남는다
  assert.deepEqual(saved, []);
  const h2 = harness({ delay: 1000 });
  await h2.b.handle({ t: 'app:ready', id: 'memo-geo' });
  await h2.b.handle({ t: 'app:save', id: 'memo-geo', json: '{"a":3}' });
  await h2.b.close();
  assert.deepEqual(h2.saved, ['{"a":3}']);
});
