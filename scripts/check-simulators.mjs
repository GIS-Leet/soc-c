// Real-browser checks for the public learning tools. No credentials or external services required.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const screenshotDir = process.env.SIM_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const numeric = async (page, selector) =>
  parseFloat(await page.locator(selector).textContent());
const range = async (page, id, value) =>
  page.locator("#" + id).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(value));
const pauseCheck = async (page) => {
  await page.locator("#playBtn").click();
  await page.waitForTimeout(350);
  await page.locator("#playBtn").click();
  const month = await page.locator("#monthSlider").inputValue();
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator("#monthSlider").inputValue(),
    month,
    "pause freezes the month",
  );
};
const scenarios = async (page) => {
  for (const key of await page
    .locator("[data-scenario]")
    .evaluateAll((els) => els.map((el) => el.dataset.scenario))) {
    await page.locator(`[data-scenario="${key}"]`).click();
    assert.equal(await page.locator("#btnPrev").isDisabled(), true);
    const count = await page.locator("#capDots button").count();
    assert.ok(count >= 2);
    for (let i = 1; i < count; i++) {
      await page.locator("#btnNext").click();
      assert.equal(
        await page
          .locator('#capDots button[aria-pressed="true"]')
          .getAttribute("data-step"),
        String(i),
      );
      assert.ok((await page.locator("#capTitle").textContent()).length > 0);
    }
    assert.equal(await page.locator("#btnNext").isDisabled(), true);
  }
  // Start from a settled final stage: playback must restart and keep advancing.
  await page.waitForTimeout(400);
  await page.locator("#btnPlay").click();
  assert.equal(
    await page
      .locator('#capDots button[aria-pressed="true"]')
      .getAttribute("data-step"),
    "0",
  );
  await page.waitForFunction(() => document.querySelector('#capDots button[aria-pressed="true"]').dataset.step !== '0');
  // Stop and read in one browser task so software-rendering delays cannot race the timer.
  const stage = await page.evaluate(() => {
    const button=document.getElementById('btnPlay');
    if(button.getAttribute('aria-pressed')==='true')button.click();
    return document.querySelector('#capDots button[aria-pressed="true"]').dataset.step;
  });
  assert.notEqual(stage, '0');
  await page.waitForTimeout(3350);
  assert.equal(
    await page
      .locator('#capDots button[aria-pressed="true"]')
      .getAttribute("data-step"),
    stage,
  );
  await page.locator("#labelToggle").uncheck();
  assert.equal(await page.locator("#label-layer").isVisible(), false);
  await page.locator("#labelToggle").check();
};
try {
  for (const name of [
    "simulators",
    "climate_solar",
    "climate_itcz",
    "climate_3d",
    "dynamic_earth",
    "world_landforms",
    "terrain",
    "seoul",
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
    });
    const errors = [],
      missing = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().startsWith(base) && r.status() >= 400) missing.push(r.url());
    });
    await page.route("**/*googletagmanager*", (r) => r.abort());
    // Tile availability is inspected separately; automated interaction tests stay offline.
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.goto(`${base}/${name}.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    assert.equal(await page.locator("#simulationFallback").isVisible(), false);
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    assert.deepEqual(duplicates, [], "unique document IDs");
    if (name === "simulators") {
      const filters = page.locator("[data-filter]");
      for (const [index, count] of [
        [1, 3],
        [2, 3],
        [3, 1],
        [0, 7],
      ]) {
        await filters.nth(index).click();
        assert.equal(
          await page.locator(".experiment-card:visible").count(),
          count,
        );
      }
      for (const href of await page
        .locator(".experiment-card")
        .evaluateAll((els) => els.map((el) => el.getAttribute("href"))))
        assert.equal((await page.request.get(base + "/" + href)).status(), 200);
    }
    if (name === "climate_solar") {
      await range(page, "sunSlider", 30);
      assert.equal(await numeric(page, "#energyValue"), 50);
      assert.equal(await numeric(page, "#areaValue"), 2);
      await page.locator("#captureState").click();
      await range(page, "sunSlider", 90);
      await page.locator("#captureState").click();
      assert.equal(await numeric(page, "#energyValue"), 100);
      await range(page, "sunSlider", 0);
      await page.locator("#captureState").click();
      assert.equal(await numeric(page, "#energyValue"), 0);
      assert.equal(await page.locator("#snapshotList .snapshot").count(), 2);
      await page.locator("#clearSnapshots").click();
      assert.equal(await page.locator("#snapshotList .snapshot").count(), 0);
      await page
        .locator("#observationNote")
        .fill("검증용 관찰: 태양 고도와 에너지");
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === "true");
      assert.equal(
        await page.locator("#observationNote").inputValue(),
        "검증용 관찰: 태양 고도와 에너지",
      );
      await page.locator("#themeToggle").click();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "dark",
      );
    }
    if (name === "climate_3d") {
      await range(page, "monthSlider", 6);
      const summer = await numeric(page, "#dayValue");
      await range(page, "monthSlider", 12);
      assert.ok(summer > (await numeric(page, "#dayValue")));
      await page.locator('[data-tilt="0"]').click();
      assert.equal(await numeric(page, "#dayValue"), 12);
      await page.locator('[data-tilt="23.5"]').click();
      await pauseCheck(page);
    }
    if (name === "climate_itcz") {
      await range(page, "monthSlider", 6);
      assert.match(await page.locator("#itczValue").textContent(), /20.*N/);
      await range(page, "monthSlider", 12);
      assert.match(await page.locator("#itczValue").textContent(), /10.*S/);
      await range(page, "latitudeSlider", -10);
      assert.equal(await page.locator("#rainValue").textContent(), "높음");
      await pauseCheck(page);
    }
    if (name === "dynamic_earth" || name === "world_landforms")
      await scenarios(page);
    if (name === "terrain") {
      await range(page, "seaLevel", -15);
      const low = await numeric(page, "#landValue");
      await range(page, "seaLevel", 25);
      assert.ok(low > (await numeric(page, "#landValue")));
      assert.match(
        await page.locator("#seaVal").textContent(),
        /25/,
        "direct manipulation works while paused",
      );
      await page.locator('[data-tool="section"]').click();
      await page.locator("#centerBrush").click();
      assert.ok(
        (await page.evaluate(
          () => Chart.getChart("profileChart").data.datasets[0].data.length,
        )) > 20,
      );
      await page.locator('[data-tool="raise"]').click();
      const before = await numeric(page, "#heightValue");
      const sample = await page.evaluate(() => Chart.getChart('profileChart').data.datasets[0].data[25]);
      for (let i = 0; i < 5; i++) await page.locator("#centerBrush").click();
      assert.ok((await page.evaluate(() => Chart.getChart('profileChart').data.datasets[0].data[25])) > sample);
      await page.locator("#resetBtn").click();
      assert.equal(await numeric(page, "#heightValue"), before);
      await page.locator("#btnBaekdu").click();
      assert.equal(await page.locator("#seaLevel").inputValue(), "28");
      await page.locator("#btnKorea").click();
      await page.waitForFunction(() =>
        document.getElementById("btnKorea").classList.contains("active"),
      );
      assert.equal(await page.locator("#seaLevel").inputValue(), "0");
    }
    if (name === "seoul") {
      for (const [phase, count] of [
        [1, 0],
        [2, 5],
        [3, 12],
        [4, 12],
      ]) {
        await range(page, "stageSlider", phase);
        assert.equal(await numeric(page, "#cityCount"), count);
      }
      const paths = await page.locator(".leaflet-overlay-pane path").count();
      await page.locator("#townToggle").uncheck();
      assert.ok(
        (await page.locator(".leaflet-overlay-pane path").count()) < paths,
      );
      await page.locator("#transportToggle").uncheck();
      assert.equal(await page.locator(".leaflet-overlay-pane path").count(), 2);
      await page.locator("#townToggle").check();
      await page.locator("#transportToggle").check();
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} fits ${width}px`,
      );
      if (width === 390) {
        const quick = page.locator(".mobile-control input");
        if (await quick.count()) {
          await range(
            page,
            await quick.getAttribute("id"),
            await quick.getAttribute("max"),
          );
          const id = (await quick.getAttribute("id")).replace("Quick", "");
          assert.equal(
            await page.locator("#" + id).inputValue(),
            await quick.inputValue(),
          );
        }
        if (await page.locator("#quickScenario").count()) {
          const value = await page
            .locator("#quickScenario option")
            .first()
            .getAttribute("value");
          await page.locator("#quickScenario").selectOption(value);
          assert.equal(
            await page
              .locator(`[data-scenario="${value}"]`)
              .getAttribute("aria-pressed"),
            "true",
          );
        }
      }
      if (screenshotDir && (width === 390 || width === 1440))
        await page.screenshot({
          path: resolve(screenshotDir, `${name}-${width}.png`),
          fullPage: true,
        });
    }
    assert.deepEqual(errors, [], `${name}: no runtime errors`);
    assert.deepEqual(missing, [], `${name}: no missing local assets`);
    console.log(`PASS ${name}: interactions, responsive layout, local assets`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.route("**/sim-solar.mjs*", (r) => r.abort());
  await page.goto(`${base}/climate_solar.html`);
  await page.locator("#simulationFallback").waitFor({ state: "visible" });
  console.log("PASS dependency failure shows accessible recovery");
  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
