const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.SIM_URL || "http://127.0.0.1:8770";
(async () => {
  fs.mkdirSync(".superpowers/qa/visual", { recursive: true });
  const b = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const p = await b.newPage({
      viewport: { width: 1100, height: 950 },
      reducedMotion: "reduce",
    });
    await p.addInitScript(() => {
      localStorage.setItem(
        "geographia-notebook-v2-climate_solar",
        "legacy-notebook",
      );
      window.noteWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (/notebook|lab-note/.test(key)) window.noteWrites.push(key);
        return original.call(this, key, value);
      };
    });
    await p.goto(base + "/climate_solar.html");
    await p.waitForFunction(() => document.body.dataset.viewer === "ready");
    assert.equal(
      await p
        .locator("#researchWorkbench,#recordTrial,#observationNote")
        .count(),
      0,
    );
    await p.locator('[data-preset="30"]').click();
    assert.deepEqual(await p.evaluate(() => window.noteWrites), []);
    assert.equal(
      await p.evaluate(() =>
        localStorage.getItem("geographia-notebook-v2-climate_solar"),
      ),
      "legacy-notebook",
    );
    console.log(
      "PASS notebook UI removed, no notebook writes, historical local data preserved",
    );
    await p.goto(base + "/climate_3d.html");
    await p.waitForFunction(() => document.body.dataset.viewer === "ready");
    await p.locator(".stage").scrollIntoViewIfNeeded();
    const count = await p.evaluate(() => Lab.renderStats().length);
    await p.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    assert.equal(await p.evaluate(() => Lab.renderStats().length), count);
    await p.waitForTimeout(300);
    const before = await p.evaluate(() => Lab.renderStats()[0].frames);
    await p.locator("#playBtn").click();
    await p.waitForTimeout(500);
    assert.ok((await p.evaluate(() => Lab.renderStats()[0].frames)) > before);
    console.log("PASS persisted page lifecycle retains rendering loop");
  } finally {
    await b.close();
  }
})();
