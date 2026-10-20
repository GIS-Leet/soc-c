// 미래 인구 실험(ai_dashboard.html)의 코호트 요인법 계산 — 원자료(유엔 WPP 2024)와 맞는지, 이상한 값이 나오지 않는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lifeTable, tablesFor, project, groups, fiveYear } from '../assets/dashboard-cohort.mjs';

const D = JSON.parse(readFileSync(new URL('../data/dashboard/pop.json', import.meta.url), 'utf8'));
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('첫 해 합계는 원자료 2023년 인구와 같다', () => {
  const r = project(D);
  const raw = sum(D.base.m) + sum(D.base.f);
  assert.equal(r[0].y, 2023);
  assert.ok(Math.abs(r[0].g[0] - raw) < 1e-6);
  assert.ok(Math.abs(raw - D.wpp[0].g[0]) < 0.05, 'pop.json 의 base 와 wpp 2023 합계가 같아야 한다');
  assert.ok(Math.abs(r[0].g[1] + r[0].g[2] + r[0].g[3] - r[0].g[0]) < 1e-6);
});

test('2023년 생명표를 그대로 쓰면 기대 수명이 WPP 남녀 값과 맞다', () => {
  assert.ok(Math.abs(lifeTable(D.life.m).e0 - D.life.m.e0) < 0.05);
  assert.ok(Math.abs(lifeTable(D.life.f).e0 - D.life.f.e0) < 0.05);
});

test('기준 그대로 한 해를 밀면 출생 · 총인구가 WPP 2024 중위와 가깝다', () => {
  const r = project(D, { end: D.base_year + 1 });
  // WPP 2023년 출생(천 명)과 1% 안
  assert.ok(Math.abs(r[1].births - D.births) / D.births < 0.01, `출생 ${r[1].births}`);
  // WPP 2024년 7월 총인구와 0.2% 안
  const w = D.wpp[1];
  assert.equal(w.y, 2024);
  assert.ok(Math.abs(r[1].g[0] - w.g[0]) / w.g[0] < 0.002, `${r[1].g[0]} vs ${w.g[0]}`);
});

test('기대 수명 목표를 정하면 그 값에 맞춘다', () => {
  const t = tablesFor(D, 90);
  assert.ok(Math.abs(t.e0 - 90) < 0.01);
  const r = project(D, { e0End: 88, end: 2073 });
  assert.ok(Math.abs(r.at(-1).e0 - 88) < 0.2);
});

test('극단 값에서도 인구가 음수가 되지 않는다', () => {
  for (const o of [{ tfr: 0.3, netmig: -500 }, { tfr: 0, netmig: -2000, e0End: 70 }, { tfr: 3, netmig: 500, e0End: 95 }]) {
    const r = project(D, o);
    for (const y of r) for (const s of ['m', 'f']) for (const v of y.pop[s]) assert.ok(Number.isFinite(v) && v >= 0, JSON.stringify(o));
  }
});

test('출산율이 높을수록 끝 해 인구가 많다', () => {
  const lo = project(D, { tfr: 0.7 }).at(-1).g[0];
  const hi = project(D, { tfr: 1.3 }).at(-1).g[0];
  assert.ok(hi > lo);
});

test('5세 무리 합은 전체와 같다', () => {
  const g = fiveYear(D.base.f);
  assert.equal(g.length, 21);
  assert.ok(Math.abs(sum(g) - sum(D.base.f)) < 1e-6);
  assert.deepEqual(groups({ m: D.base.m, f: D.base.f }).map((v) => Math.round(v)), D.wpp[0].g.map((v) => Math.round(v)));
});
