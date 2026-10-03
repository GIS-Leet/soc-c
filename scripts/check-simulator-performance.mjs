import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const base = process.env.SIM_URL || "http://127.0.0.1:8770",
  report = [];
try {
  for (const name of [
    "climate_3d",
    "terrain",
    "dynamic_earth",
    "world_landforms",
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
      reducedMotion: "reduce",
    });
    await page.goto(base + "/" + name + ".html");
    await page.waitForFunction(
      () => document.body.dataset.workbench === "ready",
    );
    await page.locator(".stage").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const frames = () =>
      page.evaluate(() => Lab.renderStats().reduce((n, s) => n + s.frames, 0));
    let first = await frames();
    await page.waitForTimeout(1000);
    const idleFrames = (await frames()) - first;
    assert.equal(idleFrames, 0, name + " must not render an unchanged scene");
    await page
      .locator(
        name === "terrain"
          ? "#motionPause"
          : name === "climate_3d"
            ? "#playBtn"
            : "#btnPlay",
      )
      .click();
    await page.locator(".stage").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    first = await frames();
    await page.waitForTimeout(500);
    const activeFrames = (await frames()) - first;
    assert.ok(activeFrames > 0, name + " animates when visible");
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    assert.ok(
      await page
        .locator(".stage")
        .evaluate((el) => el.getBoundingClientRect().bottom < -80),
    );
    first = await frames();
    await page.waitForTimeout(1000);
    const offscreenFrames = (await frames()) - first;
    assert.equal(offscreenFrames, 0, name + " stops GPU work outside viewport");
    report.push({
      page: name,
      idleFramesPerSecond: idleFrames,
      activeFramesInHalfSecond: activeFrames,
      offscreenFramesPerSecond: offscreenFrames,
    });
    console.log("PASS", JSON.stringify(report.at(-1)));
    await page.close();
  }
} finally {
  await browser.close();
  await mkdir(".superpowers/qa", { recursive: true });
  await writeFile(
    ".superpowers/qa/performance.json",
    JSON.stringify(
      {
        environment:
          "Chromium / software WebGL / 1366x900 / reduced motion for deterministic setup",
        results: report,
      },
      null,
      2,
    ),
  );
}
