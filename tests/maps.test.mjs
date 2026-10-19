import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MAPS } from '../assets/maps-list.mjs';

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');

test('지도 목록의 판마다 html · 스크립트 · 쓰는 자료 파일이 있다', () => {
  assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length);
  for (const { id } of MAPS) {
    const html = read(`map-${id}.html`);
    assert.match(html, new RegExp(`assets/map-${id}\\.mjs`), id);
    const js = read(`assets/map-${id}.mjs`);
    for (const [, p] of js.matchAll(/['"`](data\/[^'"`?$]+\.json)/g)) assert.ok(existsSync(at(p)), `${id}: ${p}`);
  }
});

test('지도 판은 인증키가 필요한 CARTO 타일을 쓰지 않는다', () => {
  for (const { id } of MAPS) assert.doesNotMatch(read(`assets/map-${id}.mjs`), /basemaps\.cartocdn|carto/i, id);
});

test('사라지는 마을: 시·군·구마다 고령 비율과 증가율이 있다', () => {
  const A = JSON.parse(read('data/maps/aging/aging.json'));
  assert.ok(A.features.length >= 220, String(A.features.length));
  for (const f of A.features) {
    assert.ok(f.d.length > 20, f.key);
    assert.ok(f.aged > 5 && f.aged < 60, `${f.key} ${f.aged}`);
    assert.ok(f.growth == null || Math.abs(f.growth) < 20, `${f.key} ${f.growth}`);
  }
  assert.ok(A.features.some((f) => f.key === '대구>군위군'));
  assert.ok(A.features.some((f) => f.key === '인천>미추홀구'));
});
