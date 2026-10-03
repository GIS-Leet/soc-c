import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.SIM_URL || "http://127.0.0.1:8770";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = [];
try {
  for (const name of [
    "simulators",
    "climate_solar",
    "climate_3d",
    "climate_itcz",
    "terrain",
    "dynamic_earth",
    "world_landforms",
    "seoul",
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.goto(base + "/" + name + ".html");
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    if (name !== "simulators")
      await page.waitForFunction(
        () => document.body.dataset.workbench === "ready",
      );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      report.push({
        page: name,
        theme,
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      });
      console.log(name, theme, JSON.stringify(report.at(-1).violations));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await mkdir(".superpowers/qa", { recursive: true });
  await writeFile(
    ".superpowers/qa/accessibility.json",
    JSON.stringify(report, null, 2),
  );
}
if (report.some((r) => r.violations.length)) process.exitCode = 1;
