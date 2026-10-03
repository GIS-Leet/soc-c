// Teaching models, independent of presentation and rendering.
export const radians = (degrees) => (degrees * Math.PI) / 180;
export const solarEnergy = (altitude) =>
  Math.max(0, Math.sin(radians(altitude)));
export const footprint = (altitude) =>
  altitude <= 0 ? Infinity : 1 / solarEnergy(altitude);
// Months 3, 6, 9 and 12 represent the equinoxes and solstices in this idealized year.
export const declination = (month, tilt = 23.5) =>
  tilt * Math.sin(((month - 3) * Math.PI) / 6);
export const noonAltitude = (latitude, declinationDegrees) =>
  Math.max(0, 90 - Math.abs(latitude - declinationDegrees));
export function dayLength(latitude, declinationDegrees) {
  const product =
    Math.tan(radians(latitude)) * Math.tan(radians(declinationDegrees));
  if (product >= 1) return 24;
  if (product <= -1) return 0;
  return (24 * Math.acos(-product)) / Math.PI;
}
// Deliberately idealized seasonal migration; not an observed rainfall forecast.
export const itczLatitude = (month) =>
  5 + 15 * Math.sin(((month - 3) * Math.PI) / 6);
export const rainPotential = (latitude, month) =>
  Math.exp(-0.5 * ((latitude - itczLatitude(month)) / 7) ** 2);
export function latitudeLabel(value) {
  return Math.abs(value) < 0.05
    ? "0°"
    : `${Math.abs(value).toFixed(1)}°${value > 0 ? "N" : "S"}`;
}
