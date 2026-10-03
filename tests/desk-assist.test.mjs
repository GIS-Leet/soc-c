import test from 'node:test';
import assert from 'node:assert/strict';
// desk-assist 는 브라우저용 pdf.js 모듈을 불러오므로, 순수 함수만 쓰는 이 테스트에선 그 import 를 가짜로 바꾼다
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../assets/desk-assist.mjs', import.meta.url), 'utf8').replace(/^import \{ openPdf \}.*$/m, 'const openPdf = null;');
const A = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

test('stem·terms: 조사·어미를 떼고 합성어는 앞뒤 두 글자도', () => {
  assert.equal(A.stem('사막기후에서는'), '사막기후');
  const t = A.terms('사막기후에서는 왜 비가 적나요? 선생님 질문입니다');
  assert.ok(t.has('사막기후') && t.has('사막') && t.has('기후'));
  assert.ok(!t.has('선생님') && !t.has('질문'));
  assert.ok(A.terms('cfb구분을 알려주세요').has('cfb'));
});

test('related: 답이 달린 비슷한 질문만, 자기 자신·무관한 질문 제외', () => {
  const all = [
    { id: 'a', title: '사막 기후', text: '사막기후에서 강수량이 적은 이유가 궁금합니다', replies: { r: { isTeacher: true, text: '아열대 고압대 때문입니다.' } } },
    { id: 'b', title: '시험 범위', text: '기말 시험 범위가 어디까지인가요', replies: { r: { isTeacher: true, text: '3단원까지.' } } },
    { id: 'c', title: '사막', text: '사막기후 강수량 질문', replies: {} },
    { id: 'q', title: '사막기후 질문', text: '사막기후는 왜 강수량이 적나요' }
  ];
  const r = A.related(all[3], all);
  assert.deepEqual(r.map(x => x.q.id), ['a']);
  assert.equal(r[0].answer, '아열대 고압대 때문입니다.');
});

test('chunks·pick: 500자 안팎 조각, 맞는 조각만 고름', () => {
  const long = Array.from({ length: 30 }, (_, i) => `${i}번째 줄은 지형과 무관한 내용입니다.`).join('\n');
  const cs = A.chunks(long, 'k', 's', '자료');
  assert.ok(cs.length >= 2 && cs.every(c => c.text.length <= 520));
  const list = [
    { key: 'x', source: '기후', text: '사막기후는 아열대 고압대의 영향으로 하강 기류가 강해 강수량이 적고 일교차가 크다. 사막기후 지역의 식생은 빈약하다.' },
    { key: 'y', source: '경제', text: '시장 경제에서 가격은 수요와 공급에 의해 결정된다. 기업은 이윤을 추구한다.' }
  ];
  assert.deepEqual(A.pick('사막기후의 강수량이 적은 이유', list, 3, 1).map(c => c.key), ['x']);
  assert.deepEqual(A.pick('', list), []);
});

test('htmlText: 스크립트·태그를 걷고 줄을 남김', () => {
  assert.equal(A.htmlText('<style>x{}</style><h1>세계화</h1><p>A &amp; B</p><script>1</script>'), '세계화\nA & B');
});

test('insertSummary: 맨 위에 넣고, 이미 있으면 바꿈', () => {
  const once = A.insertSummary('- 하나\n- 둘', '# 회의\n본문');
  assert.equal(once, '## 요약\n- 하나\n- 둘\n\n# 회의\n본문');
  assert.equal(A.insertSummary('- 새 요약', once), '## 요약\n- 새 요약\n\n# 회의\n본문');
});

test('draftPrompt: 자료·이전 답을 붙이고 없으면 생략', () => {
  assert.equal(A.draftPrompt({ title: 'T', text: 'Q' }, [], []), '학생 질문 제목: T\n학생 질문: Q');
  const p = A.draftPrompt({ title: 'T', text: 'Q' }, [{ q: { title: '이전' }, answer: '답' }], [{ source: '자료', text: '조각' }]);
  assert.match(p, /참고할 수업 자료:\n\[자료\]\n조각/); assert.match(p, /이전 질문: 이전\n이전 답변: 답/);
});
