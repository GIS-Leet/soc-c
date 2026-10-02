// 일본어 문법 설명 그리기: 문장 나누기 · 꼬리표 · 변화 칩
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sentences, classify, formatGrammar } from '../assets/grammar-format.mjs';

const G = 'ない형은 반말 부정으로, 정중형 「ません」과 같은 뜻입니다. 1그룹은 끝 う단을 あ단으로 바꾸고 「ない」를 붙여 「かく→かかない」「のむ→のまない」가 됩니다. 단 「う」로 끝나는 동사는 「わ」가 됩니다. 2그룹은 「る」를 떼고 「たべる→たべない」, 3그룹은 「する→しない」「くる→こない」로 외웁니다. 한국인이 자주 틀리는 것은 「かあない」 같은 활용입니다.';

test('sentences: 「」와 괄호 안의 마침표에서는 자르지 않는다', () => {
  assert.equal(sentences(G).length, 5);
  assert.deepEqual(sentences('「で ください。」처럼 씁니다. 끝(예: 가. 나)입니다.'), ['「で ください。」처럼 씁니다.', '끝(예: 가. 나)입니다.']);
});

test('classify: 첫 문장은 핵심, 머리말로 꼬리표를 정한다', () => {
  const s = sentences(G);
  assert.deepEqual(s.map(classify), ['lead', 'rule', 'except', 'rule', 'warn']);
});

test('formatGrammar: 그룹마다 한 줄, 변화는 칩으로, 결과에 형광펜', () => {
  const html = formatGrammar(G, { reading: k => '[' + k + ']' });
  assert.equal((html.match(/class="jg-row/g) || []).length, 6);           // 2그룹·3그룹이 두 줄로 갈림
  assert.match(html, /<span class="jg-tag">3그룹<\/span>/);
  assert.match(html, /<mark class="jg-b" lang="ja">かかない<\/mark>/);
  assert.match(html, /<span class="jg-r r">\[かく\] → \[かかない\]<\/span>/);
  assert.match(html, /<b class="jg-ja" lang="ja">ません<\/b>/);
  assert.ok(!html.includes('「'));
});

test('formatGrammar: 실제 카드 전부에서 글자가 빠지지 않고 태그가 깨지지 않는다', () => {
  const D = JSON.parse(readFileSync(new URL('../data/japanese-daily.json', import.meta.url), 'utf8'));
  for (const d of D.days) {
    const html = formatGrammar(d.g);
    const text = html.replace(/<span class="jg-tag">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const strip = s => s.replace(/[「」\s]/g, '');
    const lost = [...strip(d.g)].length - [...strip(text)].length;
    assert.ok(lost >= 0 && lost <= 40, `${d.t}: 사라진 글자 ${lost}`);   // 꼬리표로 옮겨 간 머리말(1그룹은 …)과 쉼표만 빠진다
    assert.equal((html.match(/<p /g) || []).length, (html.match(/<\/p>/g) || []).length);
  }
});
