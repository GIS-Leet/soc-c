import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDeclination,
  orbitalDeclination,
  solarAltitude,
  geometricDayLength,
  dailyInsolation,
  surfaceIllumination,
  convergenceLatitude,
  rainIndex,
  haversineKm,
  journeyMinutes,
  seededRandom,
  gridSample,
  terrainStats,
  diffuseTerrain,
  contourSegments,
} from "../assets/sim-models.mjs";
import {
  encodeGrid,
  decodeGrid,
  validateState,
  parseNotebook,
  recordsCSV,
} from "../assets/sim-records.mjs";
const near = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}, tolerance ${tol}`);

test("slope illumination agrees with an independent normal-vector dot product", () => {
  for (let altitude = 0; altitude <= 90; altitude += 3)
    for (let slope = -45; slope <= 45; slope += 3) {
      const a = (altitude * Math.PI) / 180,
        b = (slope * Math.PI) / 180;
      const dot = Math.cos(a) * Math.sin(b) + Math.sin(a) * Math.cos(b),
        result = surfaceIllumination(altitude, slope);
      near(result.cosine, Math.max(0, dot));
      if (result.footprint !== null) near(result.cosine * result.footprint, 1);
    }
  near(surfaceIllumination(30, 20).cosine, Math.sin((50 * Math.PI) / 180));
  assert.equal(surfaceIllumination(15, -30).footprint, null);
});
test("orbital declination is consistent with a fixed tilted axis in 3D", () => {
  for (let month = 1; month < 13; month += 0.1) {
    const theta = Math.PI - ((month - 6) * Math.PI) / 6,
      epsilon = (23.5 * Math.PI) / 180;
    const dot = -Math.cos(theta) * Math.sin(epsilon);
    near(orbitalDeclination(month), (Math.asin(dot) * 180) / Math.PI);
  }
});
test("NOAA fractional-year reference distinguishes equinox and solstice values", () => {
  near(calendarDeclination(80), -0.065924, 1e-5);
  near(calendarDeclination(172), 23.452046, 1e-5);
  near(calendarDeclination(355), -23.41989, 1e-5);
});
test("polar limits, equinox symmetry and signed below-horizon solar altitude", () => {
  for (const lat of [-90, -80, -37.5, 0, 37.5, 80, 90])
    near(geometricDayLength(lat, 0), 12);
  assert.equal(geometricDayLength(90, 23.5), 24);
  assert.equal(geometricDayLength(-90, 23.5), 0);
  assert.ok(solarAltitude(-70, 23.5, 12) < 0);
  for (let latitude = -90; latitude <= 90; latitude += 3) {
    near(
      geometricDayLength(latitude, 23.5) + geometricDayLength(-latitude, 23.5),
      24,
    );
    near(solarAltitude(latitude, 0, 6), 0, 1e-6);
  }
});
test("analytic daily insolation matches independent numerical time integration", () => {
  const n = 12000;
  for (const lat of [-90, -75, -37.5, 0, 37.5, 75, 90])
    for (const dec of [-23.5, 0, 23.5]) {
      let sum = 0;
      for (let i = 0; i < n; i++)
        sum +=
          Math.max(
            0,
            Math.sin(
              (solarAltitude(lat, dec, ((i + 0.5) * 24) / n) * Math.PI) / 180,
            ),
          ) * 1361;
      near(dailyInsolation(lat, dec), sum / n, 0.002);
    }
});
test("global annual-angle energy is solar constant / 4 for every declination", () => {
  for (const dec of [-23.5, 0, 23.5]) {
    let energy = 0,
      area = 0;
    for (let i = 0; i < 18000; i++) {
      const lat = -90 + (i + 0.5) / 100,
        weight = Math.cos((lat * Math.PI) / 180);
      energy += dailyInsolation(lat, dec) * weight;
      area += weight;
    }
    near(energy / area, 1361 / 4, 0.0001);
  }
});
test("rain model assumptions are explicit, bounded and sensitivity-testable", () => {
  near(convergenceLatitude(6, "continental"), 20);
  near(convergenceLatitude(12, "continental"), -10);
  near(convergenceLatitude(6.5, "oceanic"), 10);
  near(convergenceLatitude(12.5, "oceanic"), 0);
  for (const sector of ["continental", "oceanic", "symmetric"])
    for (let m = 1; m < 13; m += 0.25) {
      near(rainIndex(convergenceLatitude(m, sector), m, sector), 1);
      assert.ok(rainIndex(30, m, sector) <= 1);
    }
  assert.ok(rainIndex(20, 6, "continental") > rainIndex(20, 6, "oceanic"));
});
test("great-circle distance has symmetry, zero identity and known equatorial scale", () => {
  near(haversineKm([0, 0], [0, 1]), 111.1950802335, 1e-8);
  near(haversineKm([37.5, 127], [37.5, 127]), 0);
  near(
    haversineKm([37.5, 127], [37.2, 126.7]),
    haversineKm([37.2, 126.7], [37.5, 127]),
  );
  near(journeyMinutes(30, 30, 1.25, 10), 85);
  near(journeyMinutes(30, 60, 1.25, 10), 47.5);
  assert.throws(() => journeyMinutes(1, 0));
});
test("seeded terrain stream reproduces exactly and differs across seeds", () => {
  const stream = (seed) => {
    const random = seededRandom(seed);
    return Array.from({ length: 30 }, random);
  };
  assert.deepEqual(stream(2026), stream(2026));
  assert.notDeepEqual(stream(2026), stream(2027));
});
test("grid interpolation and central-difference slope reproduce an analytical plane", () => {
  const n = 11,
    extent = 100,
    grid = Array.from(
      { length: n * n },
      (_, i) => 2 * ((i % n) * 10 - 50) + 3 * (Math.floor(i / n) * 10 - 50) + 7,
    );
  near(gridSample(grid, n, 13.5, -22.2, extent), 2 * 13.5 + 3 * -22.2 + 7);
  const stats = terrainStats(grid, n, 0, extent);
  near(stats.meanSlope, (Math.atan(Math.sqrt(13)) * 180) / Math.PI);
  near(stats.relief, 500);
  near(stats.mean, 7);
  near(terrainStats(Array(9).fill(3), 3, 2).landPercent, 100);
  near(terrainStats(Array(9).fill(3), 3, 3).landPercent, 0);
});
test("closed-grid diffusion conserves mass and cannot create new extrema", () => {
  const random = seededRandom(7),
    n = 23,
    grid = Array.from({ length: n * n }, () => random() * 40 - 10),
    after = diffuseTerrain(grid, n, 0.12, 80);
  near(
    after.reduce((a, b) => a + b, 0),
    grid.reduce((a, b) => a + b, 0),
    1e-8,
  );
  assert.ok(Math.min(...after) >= Math.min(...grid));
  assert.ok(Math.max(...after) <= Math.max(...grid));
  assert.ok(terrainStats(after, n).meanSlope < terrainStats(grid, n).meanSlope);
  assert.deepEqual(
    [...diffuseTerrain(Array(16).fill(5), 4, 0.12, 30)],
    Array(16).fill(5),
  );
  assert.throws(() => diffuseTerrain(grid, n, 0.3));
});
test("contour interpolation on a plane follows its exact isoheight", () => {
  const n = 6,
    extent = 10,
    grid = Array.from({ length: n * n }, (_, i) => (i % n) * 2 - 5);
  const segments = contourSegments(grid, n, 0, extent);
  assert.ok(segments.length > 0);
  for (const segment of segments)
    for (const [x, z] of segment) {
      near(x, 0);
      assert.ok(z >= -5 && z <= 5);
    }
});
test("binary grid export restores float32 values exactly and rejects malformed size", () => {
  const values = Float32Array.from([-0.12345, 0, 12.78129, 150, -150]);
  assert.deepEqual(decodeGrid(encodeGrid(values), 5), [...values]);
  assert.throws(() => decodeGrid("AAAA", 5));
  assert.throws(() => decodeGrid(" ".repeat(28), 5));
});
test("import validation rejects wrong page, unbounded controls and dangerous keys", () => {
  const state = { inputs: { sun: "30", toggle: true }, choices: {} },
    fields = { sun: { min: 0, max: 90 }, toggle: { type: "checkbox" } };
  assert.equal(validateState(state, fields), state);
  assert.throws(() =>
    validateState(
      { ...state, inputs: { sun: "Infinity", toggle: true } },
      fields,
    ),
  );
  assert.throws(() =>
    validateState({ ...state, inputs: { sun: "30" } }, fields),
  );
  const data = {
    version: 2,
    page: "climate_solar",
    task: 0,
    records: [{ state, metrics: { energy: 50 } }],
    notes: { explain: "<script>alert(1)</script>" },
  };
  assert.equal(
    parseNotebook(JSON.stringify(data), "climate_solar").notes.explain,
    data.notes.explain,
  );
  assert.throws(() => parseNotebook(JSON.stringify(data), "terrain"));
  assert.throws(() =>
    parseNotebook(
      '{"version":2,"page":"climate_solar","task":0,"records":[],"__proto__":{}}',
      "climate_solar",
    ),
  );
  assert.throws(() =>
    parseNotebook(
      JSON.stringify({ ...data, records: Array(9).fill(data.records[0]) }),
      "climate_solar",
    ),
  );
});
test("CSV quotes multiline observations and neutralizes spreadsheet formula prefixes", () => {
  const csv = recordsCSV([
    {
      state: { inputs: {} },
      metrics: {
        test: '=HYPERLINK("x")',
        description: "line1\nline2",
        value: 12.3,
      },
    },
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"line1\nline2"'));
  assert.ok(csv.includes('"12.3"'));
});
