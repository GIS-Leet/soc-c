import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, NAMES, shiftHalfYear } from '../assets/climate-koppen.mjs';

const { stations } = JSON.parse(readFileSync(new URL('../data/climate/stations.json', import.meta.url), 'utf8'));
const at = (name) => stations.find((s) => s.name === name);

test('관측 자료: 모든 관측소가 열두 달 기온·강수량과 위치를 가진다', () => {
  assert.ok(stations.length >= 200);
  for (const s of stations) {
    assert.equal(s.t.length, 12, s.name);
    assert.equal(s.p.length, 12, s.name);
    assert.ok(s.t.every(Number.isFinite) && s.p.every((v) => Number.isFinite(v) && v >= 0), s.name);
    assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180, s.name);
  }
  assert.equal(new Set(stations.map((s) => s.id)).size, stations.length, '관측소 id 중복');
});

test('기상청 평년값과 같은 서울 값(1991–2020)', () => {
  const s = at('서울');
  assert.equal(s.t[0], -2);
  assert.equal(s.t[7], 26.1);
  assert.equal(Math.round(s.p.reduce((a, b) => a + b) * 10) / 10, 1417.9);
});

test('잘 알려진 곳의 기후 기호', () => {
  const want = {
    싱가포르: 'Af', 뭄바이: 'Am', 방콕: 'Aw', 리야드: 'BWh', 울란바토르: 'BSk',
    로마: 'Csa', 런던: 'Cfb', 도쿄: 'Cfa', 모스크바: 'Dfb', 대관령: 'Dwb',
    '보스토크 기지': 'EF', 디크손: 'ET', 베르호얀스크: 'Dsd',
  };
  for (const [name, code] of Object.entries(want)) assert.equal(classify(at(name)).code, code, name);
});

test('온대·냉대 경계는 기준에 따라 바뀐다 — 서울은 -3℃면 Cwa, 0℃면 Dwa', () => {
  const s = at('서울');
  assert.equal(classify(s).code, 'Cwa');
  assert.equal(classify(s, { cd: 0 }).code, 'Dwa');
  assert.match(classify(s).steps.find((x) => x.k === 'C').text, /-2\.0℃/);
});

test('판정 단계는 기호의 글자마다 하나씩 나오고 이름이 있다', () => {
  for (const s of stations) {
    const r = classify(s);
    assert.ok(NAMES[r.code], `${s.name} ${r.code}`);
    assert.ok(r.steps.length >= 2 && r.steps.every((x) => x.text && x.result), s.name);
  }
});

test('남반구 맞춤은 6개월을 민다', () => {
  assert.deepEqual(shiftHalfYear([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
});
