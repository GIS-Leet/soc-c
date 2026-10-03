import test from "node:test";
import assert from "node:assert/strict";
import {
  solarEnergy,
  footprint,
  declination,
  noonAltitude,
  dayLength,
  itczLatitude,
  rainPotential,
} from "../assets/sim-math.mjs";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
test("solar footprint conserves the energy of an equal-width incident beam", () => {
  for (const altitude of [1, 15, 30, 45, 60, 90])
    near(solarEnergy(altitude) * footprint(altitude), 1);
  near(solarEnergy(30), 0.5);
  near(footprint(30), 2);
  near(solarEnergy(90), 1);
  near(solarEnergy(0), 0);
  assert.equal(footprint(0), Infinity);
});
test("equinox and solstice conditions agree across the hemispheres", () => {
  near(declination(3), 0);
  near(declination(9), 0);
  near(declination(6), 23.5);
  near(declination(12), -23.5);
  for (const latitude of [-60, -37.5, 0, 37.5, 60]) {
    near(dayLength(latitude, 0), 12);
    near(dayLength(latitude, 23.5) + dayLength(latitude, -23.5), 24);
    near(noonAltitude(latitude, 23.5), noonAltitude(-latitude, -23.5));
  }
  near(noonAltitude(37.5, 23.5), 76);
  near(noonAltitude(37.5, -23.5), 29);
});
test("polar day, polar night and zero tilt stay finite and bounded", () => {
  near(dayLength(80, 23.5), 24);
  near(dayLength(80, -23.5), 0);
  near(dayLength(-80, 23.5), 0);
  near(dayLength(-80, -23.5), 24);
  for (let month = 1; month <= 12; month++) near(declination(month, 0), 0);
  for (let lat = -89; lat <= 89; lat++)
    for (let month = 1; month <= 12; month++) {
      const length = dayLength(lat, declination(month));
      assert.ok(Number.isFinite(length) && length >= 0 && length <= 24);
    }
});
test("idealized rain band peaks at convergence and follows the season", () => {
  near(itczLatitude(6), 20);
  near(itczLatitude(12), -10);
  for (let month = 1; month <= 12; month++) {
    const center = itczLatitude(month);
    near(rainPotential(center, month), 1);
    near(rainPotential(center + 7, month), rainPotential(center - 7, month));
    assert.ok(
      rainPotential(center + 14, month) < rainPotential(center + 7, month),
    );
  }
});
