// Pure, versioned teaching models. See docs/simulator-models.md for scope and sources.
export const MODEL_VERSION = "2.0.0";
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const rad = (n) => (n * Math.PI) / 180;
const deg = (n) => (n * 180) / Math.PI;

// NOAA GML fractional-year approximation, evaluated at 12:00 in a 365-day year.
export function calendarDeclination(day) {
  const g = ((2 * Math.PI) / 365) * (clamp(day, 1, 365) - 1);
  return deg(
    0.006918 -
      0.399912 * Math.cos(g) +
      0.070257 * Math.sin(g) -
      0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) +
      0.00148 * Math.sin(3 * g),
  );
}
export function orbitalDeclination(month, tilt = 23.5) {
  return deg(
    Math.asin(Math.sin(rad(tilt)) * Math.sin(((month - 3) * Math.PI) / 6)),
  );
}
export function solarAltitude(latitude, declination, solarHour = 12) {
  return deg(
    Math.asin(
      clamp(
        Math.sin(rad(latitude)) * Math.sin(rad(declination)) +
          Math.cos(rad(latitude)) *
            Math.cos(rad(declination)) *
            Math.cos(rad(15 * (solarHour - 12))),
        -1,
        1,
      ),
    ),
  );
}
export function geometricDayLength(latitude, declination) {
  // At an exact pole on the equinox use the symmetric limiting convention (12 h).
  if (Math.abs(declination) < 1e-10) return 12;
  const a = Math.sin(rad(latitude)) * Math.sin(rad(declination));
  const b = Math.cos(rad(latitude)) * Math.cos(rad(declination));
  if (Math.abs(b) < 1e-12) return a > 0 ? 24 : 0;
  return (24 * Math.acos(clamp(-a / b, -1, 1))) / Math.PI;
}
export function dailyInsolation(latitude, declination, solarConstant = 1361) {
  const hours = geometricDayLength(latitude, declination),
    h = (Math.PI * hours) / 24;
  return Math.max(
    0,
    (solarConstant / Math.PI) *
      (h * Math.sin(rad(latitude)) * Math.sin(rad(declination)) +
        Math.cos(rad(latitude)) * Math.cos(rad(declination)) * Math.sin(h)),
  );
}
export function surfaceIllumination(altitude, slope = 0) {
  const cosine =
    altitude < 0 ? 0 : Math.max(0, Math.sin(rad(altitude + slope)));
  return {
    cosine,
    incidence: deg(Math.acos(clamp(Math.sin(rad(altitude + slope)), -1, 1))),
    footprint: cosine < 1e-12 ? null : 1 / cosine,
  };
}
export const rainSectors = Object.freeze({
  continental: {
    label: "계절 이동이 큰 대륙형",
    mean: 5,
    amplitude: 15,
    lag: 0,
    width: 7,
  },
  oceanic: {
    label: "계절 이동이 작은 해양형",
    mean: 5,
    amplitude: 5,
    lag: 0.5,
    width: 7,
  },
  symmetric: {
    label: "남북 대칭 가상 지구",
    mean: 0,
    amplitude: 15,
    lag: 0,
    width: 7,
  },
});
export function convergenceLatitude(month, sector = "continental") {
  const p = rainSectors[sector] || rainSectors.continental;
  return p.mean + p.amplitude * Math.sin(((month - 3 - p.lag) * Math.PI) / 6);
}
export function rainIndex(latitude, month, sector = "continental") {
  const p = rainSectors[sector] || rainSectors.continental;
  return Math.exp(
    -0.5 * ((latitude - convergenceLatitude(month, sector)) / p.width) ** 2,
  );
}
export function haversineKm(a, b) {
  const dlat = rad(b[0] - a[0]),
    dlon = rad(b[1] - a[1]);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dlon / 2) ** 2;
  return (
    6371.0088 *
    2 *
    Math.atan2(Math.sqrt(clamp(h, 0, 1)), Math.sqrt(clamp(1 - h, 0, 1)))
  );
}
// An explicitly hypothetical route, not a journey planner or an observed travel time.
export function journeyMinutes(
  distanceKm,
  speedKmh,
  routeFactor = 1.25,
  accessMinutes = 10,
) {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0)
    throw new RangeError("Speed must be positive");
  return ((distanceKm * routeFactor) / speedKmh) * 60 + accessMinutes;
}
export function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function gridSample(heights, n, x, z, extent = 200) {
  const gx = clamp((x / extent + 0.5) * (n - 1), 0, n - 1),
    gz = clamp((z / extent + 0.5) * (n - 1), 0, n - 1);
  const ix = Math.min(n - 2, Math.floor(gx)),
    iz = Math.min(n - 2, Math.floor(gz)),
    u = gx - ix,
    v = gz - iz;
  return (
    heights[iz * n + ix] * (1 - u) * (1 - v) +
    heights[iz * n + ix + 1] * u * (1 - v) +
    heights[(iz + 1) * n + ix] * (1 - u) * v +
    heights[(iz + 1) * n + ix + 1] * u * v
  );
}
export function terrainStats(heights, n, sea = 0, extent = 200) {
  if (heights.length !== n * n || n < 2) throw new RangeError("Invalid grid");
  let min = Infinity,
    max = -Infinity,
    total = 0,
    land = 0,
    slope = 0;
  const cell = extent / (n - 1);
  // Cell-center sampling avoids over-weighting boundary vertices for area estimates.
  for (let z = 0; z < n - 1; z++)
    for (let x = 0; x < n - 1; x++) {
      const i = z * n + x,
        a = heights[i],
        b = heights[i + 1],
        c = heights[i + n],
        d = heights[i + n + 1];
      const center = (a + b + c + d) / 4;
      total += center;
      if (center > sea) land++;
      const dx = (b + d - (a + c)) / (2 * cell),
        dz = (c + d - (a + b)) / (2 * cell);
      slope += deg(Math.atan(Math.hypot(dx, dz)));
    }
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const cells = (n - 1) ** 2;
  return {
    min,
    max,
    relief: max - min,
    mean: total / cells,
    landPercent: (100 * land) / cells,
    meanSlope: slope / cells,
  };
}
// Conservative diffusion on a closed uniform grid: each edge exchange is antisymmetric.
// This models idealized hillslope smoothing, not fluvial sediment transport.
export function diffuseTerrain(heights, n, rate = 0.12, steps = 1) {
  if (n * n !== heights.length || n < 2) throw new RangeError("Invalid grid");
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.24)
    throw new RangeError("Unstable diffusion rate");
  let a = Float64Array.from(heights);
  for (let step = 0; step < steps; step++) {
    const delta = new Float64Array(a.length);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        for (const j of [x + 1 < n ? i + 1 : -1, z + 1 < n ? i + n : -1])
          if (j >= 0) {
            const flux = (a[i] - a[j]) * rate;
            delta[i] -= flux;
            delta[j] += flux;
          }
      }
    for (let i = 0; i < a.length; i++) a[i] += delta[i];
  }
  return a;
}
export function contourSegments(heights, n, level, extent = 200) {
  const segments = [],
    coord = (x, z) => [
      (x / (n - 1) - 0.5) * extent,
      (z / (n - 1) - 0.5) * extent,
    ];
  // Triangular cells remove marching-square saddle ambiguity deterministically.
  for (let z = 0; z < n - 1; z++)
    for (let x = 0; x < n - 1; x++) {
      const i = z * n + x,
        vs = [
          [x, z, heights[i]],
          [x + 1, z, heights[i + 1]],
          [x, z + 1, heights[i + n]],
          [x + 1, z + 1, heights[i + n + 1]],
        ];
      for (const ids of [
        [0, 1, 2],
        [1, 3, 2],
      ]) {
        const hits = [];
        for (let e = 0; e < 3; e++) {
          const a = vs[ids[e]],
            b = vs[ids[(e + 1) % 3]];
          if (a[2] < level === b[2] < level) continue;
          const t = (level - a[2]) / (b[2] - a[2]);
          hits.push(coord(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])));
        }
        if (hits.length === 2) segments.push(hits);
      }
    }
  return segments;
}
