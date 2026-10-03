import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.SIM_URL || "http://127.0.0.1:8770";
const output = process.env.SCENE_SCREENSHOTS || ".superpowers/scene-v3";
await mkdir(output, { recursive: true });
const b = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = { accessibility: [], frames: {}, errors: [] };
try {
  const context = await b.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && /THREE|shader|WebGL/i.test(m.text()))
      report.errors.push(m.text());
  });
  await p.goto(base + "/world_landforms.html");
  await p.waitForFunction(() => document.body.dataset.workbench === "ready");
  assert.equal(
    await p.evaluate(() => Lab.workbench.documentData().modelVersion),
    "3.0.0-landforms",
  );
  for (const theme of ["light", "dark"]) {
    if ((await p.locator("html").getAttribute("data-theme")) !== theme)
      await p.locator("#themeToggle").click();
    await p.waitForTimeout(450);
    await p.screenshot({ path: output + "/landforms-" + theme + ".png" });
    const a = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    report.accessibility.push({
      theme,
      width: 1440,
      violations: a.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  await p.locator("#themeToggle").click();
  await p.locator(".stage").scrollIntoViewIfNeeded();
  await p.waitForTimeout(450);
  const frames = () =>
    p.evaluate(() => Lab.renderStats().reduce((n, s) => n + s.frames, 0));
  let before = await frames();
  await p.waitForTimeout(1000);
  report.frames.idle = (await frames()) - before;
  assert.equal(report.frames.idle, 0);
  await p.locator("#rotateToggle").check();
  await p.locator(".stage").scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  before = await frames();
  await p.waitForTimeout(500);
  report.frames.rotating = (await frames()) - before;
  assert.ok(report.frames.rotating > 0);
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(300);
  before = await frames();
  await p.waitForTimeout(1000);
  report.frames.offscreen = (await frames()) - before;
  assert.equal(report.frames.offscreen, 0);
  await p.locator("#rotateToggle").uncheck();
  await p.locator('[data-view="top"]').click();
  await p.locator(".stage").scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.locator(".stage").screenshot({ path: output + "/landforms-top.png" });
  await p.locator('[data-view="oblique"]').click();
  await p.locator('[data-scenario="coast"]').click();
  await p.locator('[data-step="1"]').click();
  await p.waitForTimeout(450);
  await p
    .locator(".stage")
    .screenshot({ path: output + "/landforms-notch.png" });
  await p.locator('[data-step="3"]').click();
  await p.waitForTimeout(450);
  const labels = await p.locator(".map-label").evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
  );
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      assert.ok(
        labels[i].right <= labels[j].left ||
          labels[j].right <= labels[i].left ||
          labels[i].bottom <= labels[j].top ||
          labels[j].bottom <= labels[i].top,
        "projected labels do not overlap",
      );
  await p.locator('[data-scenario="volcano"]').click();
  await p.locator('[data-step="3"]').click();
  for (const width of [320, 390, 768]) {
    await p.setViewportSize({ width, height: 844 });
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(350);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (width === 390) {
      await p.screenshot({ path: output + "/landforms-mobile.png" });
      const a = await new AxeBuilder({ page: p })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      report.accessibility.push({
        theme: "light",
        width,
        violations: a.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      });
    }
  }
  assert.deepEqual(report.errors, []);
  assert.ok(
    report.accessibility.every((r) => r.violations.length === 0),
    "axe violations: " + JSON.stringify(report.accessibility),
  );
  console.log(
    "PASS scene rendering, model version, view controls, labels, responsive layout, accessibility, idle/offscreen rendering",
  );
} finally {
  await b.close();
  await writeFile(
    output + "/scene-check.json",
    JSON.stringify(report, null, 2),
  );
}
