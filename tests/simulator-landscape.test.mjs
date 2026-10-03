import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const THREE = require("../assets/sim-vendor/three.min.js");
const SimplexNoise = require("../assets/sim-vendor/simplex-noise.min.js");
const context = { window: {}, THREE, SimplexNoise };
vm.runInNewContext(
  readFileSync(new URL("../assets/sim-landscape.js", import.meta.url), "utf8"),
  context,
);
const model = context.window.Landscape;
test("caldera retains a closed rim above its lake and a depressed floor", () => {
  assert.ok(model.caldera(0, 0) < 32);
  assert.ok(model.cone(0, 0) > model.caldera(0, 0) + 60);
  for (let i = 0; i < 720; i++) {
    const angle = (i * Math.PI) / 360;
    let crest = -Infinity;
    for (let r = 30; r <= 52; r += 0.5)
      crest = Math.max(
        crest,
        model.caldera(r * Math.cos(angle), r * Math.sin(angle)),
      );
    assert.ok(crest > 45, "continuous closed rim, above water level 32");
  }
});
test("landscape geometry is deterministic, finite and independent of UI theme", () => {
  const heights = [];
  for (let x = -125; x <= 125; x += 5)
    for (let z = -125; z <= 125; z += 5) {
      const h = model.caldera(x, z);
      assert.ok(Number.isFinite(h));
      heights.push(h);
    }
  vm.runInNewContext(
    readFileSync(
      new URL("../assets/sim-landscape.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const again = [];
  for (let x = -125; x <= 125; x += 5)
    for (let z = -125; z <= 125; z += 5)
      again.push(context.window.Landscape.caldera(x, z));
  assert.deepEqual(again, heights);
});
test("lake triangulation is level, clipped to its closed basin and has upward normals", () => {
  const g = model.basinWater(
    (x, z) => (Math.hypot(x * 0.94, z * 1.08) < 45 ? model.caldera(x, z) : 100),
    32,
    49,
    144,
  );
  const p = g.attributes.position,
    n = g.attributes.normal;
  assert.ok(p.count > 1000);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getY(i) - 32.035) < 1e-5);
    assert.ok(
      Math.hypot(p.getX(i) * 0.94, p.getZ(i) * 1.08) < 38,
      "no water on the outer flank",
    );
    assert.ok(
      model.caldera(p.getX(i), p.getZ(i)) < 32.15,
      "shoreline interpolation tolerance",
    );
    assert.ok(n.getY(i) > 0.99, "front-facing surface");
  }
  g.dispose();
});
test("water mask produces no geometry above a dry flat surface", () => {
  const dry = model.basinWater(() => 10, 5, 20, 8);
  assert.equal(dry.attributes.position.count, 0);
  const wet = model.basinWater(() => 0, 5, 20, 8);
  assert.equal(wet.attributes.position.count, 8 * 8 * 6);
  dry.dispose();
  wet.dispose();
});
