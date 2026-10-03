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
    await p.goto(base + "/climate_solar.html");
    await p.waitForFunction(() => !!window.Lab?.workbench);
    const note =
      "긴 관찰 기록의 모든 문장이 인쇄에 포함되어야 합니다.\n".repeat(25);
    await p.locator("#predictionNote").fill(note);
    await p.locator("#recordTrial").click();
    const dl = p.waitForEvent("download");
    await p.locator("#downloadCSV").click();
    const download = await dl;
    assert.match(download.suggestedFilename(), /csv$/);
    await p.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      document.body.classList.add("presentation-mode");
      window.dispatchEvent(new Event("beforeprint"));
    });
    await p.emulateMedia({ media: "print" });
    assert.equal(await p.locator(".printed-note").first().textContent(), note);
    assert.equal(await p.locator("#researchWorkbench").isVisible(), true);
    assert.equal(await p.locator("#predictionNote").isVisible(), false);
    assert.equal(
      await p
        .locator(".evidence-section")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
    );
    await p.screenshot({
      path: ".superpowers/qa/visual/print-report.png",
      fullPage: true,
    });
    console.log(
      "PASS CSV download and complete print notes in dark/presentation mode",
    );
    await p.emulateMedia({ media: "screen" });
    await p.goto(base + "/climate_3d.html");
    await p.waitForFunction(() => !!window.Lab?.workbench);
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
