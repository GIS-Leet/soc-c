import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetHtml, ansMark } from '../assets/gichul-sheet.mjs';

const items = [{ src: 'data:a', source: '2026학년도 수능 한국지리 3번', ans: 3, memo: '<요점> A&B' }, { src: 'data:b', source: '2027학년도 6월 모평 통합사회 12번', ans: null, memo: '' }];

test('ansMark: 1~5는 원문자, 없으면 –', () => { assert.equal(ansMark(1), '①'); assert.equal(ansMark(5), '⑤'); assert.equal(ansMark(null), '–'); assert.equal(ansMark(9), '–'); });

test('sheetHtml: 새 번호·출처·이름 칸, 기본은 정답 없음', () => {
  const h = sheetHtml(items, { title: '세계화 <1>' });
  assert.match(h, /<h1>세계화 &lt;1&gt;<\/h1>/); assert.match(h, /2문항/);
  assert.match(h, /<b>1<\/b><span>2026학년도 수능 한국지리 3번<\/span>/); assert.match(h, /<b>2<\/b>/);
  assert.match(h, /column-count: 2/); assert.match(h, /class="who"/);
  assert.ok(!h.includes('class="key"') && !h.includes('요점') && !h.includes('<script'));
});

test('sheetHtml: 옵션 — 1단·이름 칸 없음·출처 없음·정답표·풀이 요점(이스케이프)', () => {
  const h = sheetHtml(items, { cols: 1, nameLine: false, sources: false, answers: true });
  assert.match(h, /column-count: 1/); assert.ok(!h.includes('class="who"') && !h.includes('한국지리 3번'));
  assert.match(h, /<h2>정답<\/h2>/); assert.match(h, /<i>1<\/i><b>③<\/b>/); assert.match(h, /<i>2<\/i><b>–<\/b>/);
  const m = sheetHtml(items, { answers: true, memos: true, autoPrint: true });
  assert.match(m, /정답과 풀이 요점/); assert.match(m, /&lt;요점&gt; A&amp;B/); assert.match(m, /print\(\)/);
});
