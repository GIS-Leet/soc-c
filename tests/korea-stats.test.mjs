import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const K = JSON.parse(readFileSync(new URL('../data/stats/korea.json', import.meta.url), 'utf8'));

test('시·도 17곳과 지도 모양이 모두 있다', () => {
  assert.equal(K.units.length, 17);
  for (const u of K.units) assert.ok(K.map.shapes[u.code]?.d.length > 100, u.name);
});

test('지표마다 값이 비지 않고, 통합특별시 값만 있는 지표는 광주 · 전남이 비어 있다', () => {
  for (const d of K.indicators) {
    const vals = Object.values(d.values).filter((v) => v != null);
    if (d.merged != null) {
      assert.equal(d.values['24'], null, d.id);
      assert.equal(d.values['36'], null, d.id);
      assert.equal(vals.length, 15, d.id);
    } else assert.equal(vals.length, 17, d.id);
    assert.ok(d.def && d.read && d.year && d.src.length, d.id);
  }
});

test('KOSIS 원자료와 같은 값', () => {
  const at = (id) => K.indicators.find((d) => d.id === id);
  assert.equal(at('tfr').values['11'], 0.632); // 서울 합계 출산율 2025
  assert.equal(at('tfr').nation, 0.799);
  assert.equal(at('pop').merged, 3154398); // 전남광주통합특별시 2026.09
  assert.equal(at('density').values['32'], 90.2); // 강원 인구 밀도 2025
});
