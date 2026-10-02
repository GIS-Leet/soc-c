// 통합사회 카드 글 그리기: 문장 나누기 · 꼬리표 · 용어 형광펜 · 포인트 떼어 내기
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sentences, classify, formatProse, splitDetail, formatDetail, formatPoint } from '../assets/concept-format.mjs';

test('sentences: 괄호·낫표 안과 영문 머리글자 뒤에서는 자르지 않는다', () => {
  assert.deepEqual(sentences('밀스(C. W. Mills)는 구별했다. 『책. 둘』은 고전이다. 끝.'), ['밀스(C. W. Mills)는 구별했다.', '『책. 둘』은 고전이다.', '끝.']);
});

test('classify: 머리말로 꼬리표를 정한다', () => {
  assert.deepEqual(classify('첫째, 인지의 문제다.'), { kind: 'ord', tag: '첫째', body: '인지의 문제다.' });
  assert.equal(classify('그러나 한계가 있다.').tag, '단서');
  assert.equal(classify('반면 자유주의는 다르다.').tag, '대비');
  assert.equal(classify('노직은 이를 반박했다.').tag, '논쟁');
  assert.equal(classify('평범한 문장이다.').kind, 'plain');
});

test('formatProse: 핵심 용어는 처음 한 번만 형광펜, 학자(연도)와 저작은 굵게', () => {
  const html = formatProse('구조적 폭력은 갈퉁(1969)의 개념이다. 구조적 폭력은 『평화 연구』에 나온다.', { terms: ['구조적 폭력'] });
  assert.equal((html.match(/<mark class="cf-term">구조적 폭력<\/mark>/g) || []).length, 1);
  assert.match(html, /<b class="cf-ref">갈퉁\(1969\)<\/b>/);
  assert.match(html, /<b class="cf-book">『평화 연구』<\/b>/);
  assert.equal((html.match(/<p /g) || []).length, 2);
});

test('splitDetail · formatDetail: 포인트를 떼어 내고 세 문단에 제목을 단다', () => {
  const { body, point } = splitDetail('가. 나.\n\n다.\n\n라. 포인트: 섞지 않는다. 구별한다.');
  assert.equal(point, '섞지 않는다. 구별한다.');
  const html = formatDetail(body);
  assert.deepEqual(html.match(/<h4 class="cf-h">([^<]+)</g).map(s => s.replace(/.*>|</g, '')), ['교과서', '심화', '연결']);
  assert.match(formatPoint(point), /^<span class="cf-tag">포인트<\/span>/);
});

test('실제 카드 전부: 글자가 빠지지 않고, 모든 카드에 포인트가 있으며, 태그가 짝이 맞는다', () => {
  const D = JSON.parse(readFileSync(new URL('../data/geography-daily.json', import.meta.url), 'utf8'));
  const plain = html => html.replace(/<span class="cf-tag">[^<]*<\/span>|<h4[^>]*>[^<]*<\/h4>/g, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const bare = s => s.replace(/\s/g, '');
  for (const c of D.days) {
    const terms = c.k.map(([w]) => w), seen = new Set();
    for (const f of ['a', 'x']) {
      const html = formatProse(c[f], { terms, seen });
      const lost = bare(c[f]).length - bare(plain(html)).length;
      assert.ok(lost >= 0 && lost <= 16, `${c.t}.${f}: 사라진 글자 ${lost}`);      // 「첫째,」 같은 머리말만 꼬리표로 옮겨 간다
      assert.equal((html.match(/<p /g) || []).length, (html.match(/<\/p>/g) || []).length);
    }
    const { body, point } = splitDetail(c.d);
    assert.ok(point.length > 20, `${c.t}: 포인트 없음`);
    const html = formatDetail(body, { terms, seen });
    assert.equal((html.match(/<section/g) || []).length, 3, `${c.t}: 문단 수`);
    const lost = bare(body).length - bare(plain(html)).length;
    assert.ok(lost >= 0 && lost <= 24, `${c.t}.d: 사라진 글자 ${lost}`);
    assert.equal(bare(plain(formatPoint(point))), bare(point));
  }
});
