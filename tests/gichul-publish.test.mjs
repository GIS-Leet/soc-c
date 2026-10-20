// 기출 학생용 공개 — 무엇이 올라가고 무엇이 빠지는지(통합사회만 · 검증한 것만 · 기타 태그와 수업용 메모 제외)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../assets/gichul.mjs';
import { buildPublic, publicNotes, imageName, signature } from '../assets/gichul-publish.mjs';

const part = [{ p: 0, x: 10, y: 20, w: 250, h: 300 }];
const data = G.parseData({
  exams: {
    a: { title: '2026학년도 3월 고1 학평 통합사회', year: 2026, exam: '3월 학평', grade: '고1', subject: '통합사회', pdf: '기출/a.pdf', createdAt: 1 },
    b: { title: '2026학년도 수능 한국지리', year: 2026, exam: '수능', grade: '고3', subject: '한국지리', pdf: '기출/b.pdf', createdAt: 2 },
    c: { title: '2025학년도 6월 고1 학평 통합사회', year: 2025, exam: '6월 학평', grade: '고1', subject: '통합사회', pdf: '기출/c.pdf', createdAt: 3 },
  },
  items: {
    a: {
      '01': { parts: part, ans: 3, pts: 2, c: ['통사1 Ⅲ 자연환경과 인간 > 자연재해와 안전권'], d: ['지도'], o: ['개념 혼동'], x: ['킬러', '수업 예시'], memo: '핵심: 태풍 경로 → 오른쪽 위험 반원 / 함정: 왼쪽과 혼동' },
      '02': { parts: part, ans: 1, c: ['통사1 Ⅰ 통합적 관점'], x: [G.PENDING] },                       // 검증 전 — 빠짐
      '03': { parts: part, ans: 5, memo: '수업 3차시 도입에 쓰기' },                                       // 태그 없음 — 빠짐
      '04': { parts: part, ans: 2, c: [G.OUT_OF_SCOPE], memo: '핵심: 옛 교육과정' },                       // 범위 밖 — 빠짐
      '05': { parts: part, ans: 4, c: ['통사2 Ⅴ 미래와 지속가능한 삶'], memo: '수업용 메모만' },
    },
    b: { '01': { parts: part, ans: 1, c: ['한지 Ⅰ'] } },                                                  // 다른 과목 — 빠짐
    c: { '07': { parts: part, ans: 2, c: ['통사2 Ⅳ 세계화와 평화'] } },
  },
});

test('통합사회 · 검증 · 개념 분류가 있는 문항만, 최근 학년도부터', () => {
  const p = buildPublic(data);
  assert.deepEqual(p.items.map((i) => i.id), ['a/01', 'a/05', 'c/07']);
  assert.deepEqual(p.exams.map((e) => e.title), ['2026학년도 3월 고1 학평 통합사회', '2025학년도 6월 고1 학평 통합사회']);
  assert.equal(p.items[2].e, 1);
});

test('기타 태그 · 비공개 경로 · 이름표 없는 메모는 올라가지 않는다', () => {
  const p = buildPublic(data);
  const s = JSON.stringify(p);
  assert.ok(!s.includes('킬러') && !s.includes('수업 예시') && !s.includes('기출/a.pdf') && !s.includes('수업용 메모'));
  const one = p.items[0];
  assert.deepEqual(one.notes, [{ k: '풀이', t: '태풍 경로 → 오른쪽 위험 반원' }, { k: '주의할 점', t: '왼쪽과 혼동' }]);
  assert.equal(one.ans, 3); assert.equal(one.pts, 2); assert.deepEqual(one.d, ['지도']); assert.deepEqual(one.o, ['개념 혼동']);
  assert.equal(p.items[1].notes, undefined);
});

test('메모 이름표는 학생 화면에서 「풀이」 · 「주의할 점」', () => {
  assert.deepEqual(publicNotes({ memo: '그냥 메모' }), []);
  assert.deepEqual(publicNotes({ memo: '핵심: 가 / 함정: 나' }).map((n) => n.k), ['풀이', '주의할 점']);
});

test('그림 이름은 조각이 바뀌면 바뀌고, 한글 · 경로가 드러나지 않는다', () => {
  const it = data.items.find((i) => i.id === 'a/01'), ex = data.exams[0];
  const n1 = imageName(it, signature(ex, it));
  const n2 = imageName(it, signature(ex, { ...it, parts: [{ ...part[0], h: 301 }] }));
  assert.notEqual(n1, n2);
  assert.match(n1, /^[0-9a-z]+\.webp$/);
  assert.equal(n1, imageName(it, signature(ex, it)));
});

test('지리 단원(통사1 Ⅲ·Ⅳ·Ⅴ, 통사2 Ⅳ·Ⅴ) 문항만 — 단원 이름은 분류표와 같다', async () => {
  const { GEO_UNITS, isGeo } = await import('../assets/gichul-publish.mjs');
  const { readFileSync } = await import('node:fs');
  const tax = G.parseTaxonomy(JSON.parse(readFileSync(new URL('../data/gichul-taxonomy.json', import.meta.url), 'utf8')));
  const all = tax.concepts.flatMap((c) => c.units.map((u) => u.tag));
  for (const u of GEO_UNITS) assert.ok(all.includes(u), u);
  const d = G.parseData({
    exams: { a: { title: 't', year: 2026, exam: '3월 학평', grade: '고1', subject: '통합사회', pdf: 'p', createdAt: 1 } },
    items: { a: {
      '01': { parts: part, ans: 1, c: ['통사2 Ⅲ 시장 경제와 지속가능발전 > 금융 자산과 금융 생활 설계'] },          // 일반사회 — 빠짐
      '02': { parts: part, ans: 1, c: ['통사1 Ⅰ 통합적 관점', '통사1 Ⅴ 생활공간과 사회 > 교통·통신 발달과 생활양식 변화'] }, // 하나라도 지리 — 들어감
      '03': { parts: part, ans: 1, c: ['통사1 Ⅲ 자연환경과 인간 > 자연을 바라보는 관점(인간 중심·생태 중심)'] },        // 단원 통째로 — 들어감
      '04': { parts: part, ans: 1, c: ['통사2 Ⅰ 인권 보장과 헌법'] },                                                  // 빠짐
    } },
  });
  assert.deepEqual(buildPublic(d).items.map((i) => i.n), [2, 3]);
  assert.equal(isGeo({ c: ['통사2 Ⅴ 미래와 지속가능한 삶 > 인구 문제'] }), true);
});
