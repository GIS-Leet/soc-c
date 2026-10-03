import { solarEnergy, footprint, radians } from "./sim-math.mjs?v=999595c7";
import { fitCanvas, line, text, circle } from "./sim-canvas.mjs?v=faadf302";
const $ = (id) => document.getElementById(id),
  slider = $("sunSlider");
let altitude = 45;
const render = fitCanvas($("simCanvas"), (ctx, w, h) => {
  const compact = w < 520,
    base = Math.min(w / 800, h / 530),
    cx = w * 0.38,
    ground = h * 0.66,
    length = Math.min(w * 0.39, h * 0.49),
    angle = radians(altitude);
  const sx = cx + length * Math.cos(angle),
    sy = ground - length * Math.sin(angle),
    beam = 20 * base;
  // Fine reference grid, with unambiguous horizontal ground and vertical normal.
  for (let x = 30; x < w; x += 35) line(ctx, x, 0, x, h, "#a5b8a008", 1);
  for (let y = 20; y < h; y += 35) line(ctx, 0, y, w, y, "#a5b8a008", 1);
  text(
    ctx,
    "PARALLEL RAYS / EQUAL ENERGY",
    w * 0.06,
    h * 0.1,
    compact ? 9 : 10,
    "#7f9d8b",
  );
  const soil = ctx.createLinearGradient(0, ground, 0, ground + 55 * base);
  soil.addColorStop(0, "#a5af7828");
  soil.addColorStop(1, "#a5af7800");
  ctx.fillStyle = soil;
  ctx.fillRect(0, ground, w, 55 * base);
  for (let y = ground + 10 * base; y < ground + 50 * base; y += 10 * base)
    line(ctx, 0, y, w, y, "#b8c18e12");
  line(ctx, 0, ground, w, ground, "#97ad88", 1.3);
  line(ctx, cx, ground, cx, h * 0.14, "#94b7aa88", 1, [4, 6]);
  text(
    ctx,
    "지표면의 수직선",
    cx - 12,
    h * 0.17,
    compact ? 10 : 11,
    "#93b6ac",
    "right",
  );
  const spread = altitude === 0 ? w * 2 : beam / Math.sin(angle);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, ground);
  ctx.clip();
  if (altitude > 0) {
    ctx.beginPath();
    ctx.moveTo(sx - beam * Math.sin(angle), sy - beam * Math.cos(angle));
    ctx.lineTo(sx + beam * Math.sin(angle), sy + beam * Math.cos(angle));
    ctx.lineTo(cx + spread, ground);
    ctx.lineTo(cx - spread, ground);
    ctx.closePath();
    ctx.fillStyle = "#e6bb7722";
    ctx.fill();
  }
  for (let n = -2; n <= 2; n++) {
    const offset = (n * beam) / 2;
    let x = sx + offset * Math.sin(angle),
      y = sy + offset * Math.cos(angle);
    const gx = altitude === 0 ? -w : cx + offset / Math.sin(angle);
    line(
      ctx,
      x,
      y,
      gx,
      altitude === 0 ? y : ground,
      "#e7bd80",
      n === 0 ? 1.5 : 1,
    );
  }
  ctx.restore();
  if (altitude > 0)
    line(
      ctx,
      Math.max(0, cx - spread),
      ground + 2,
      Math.min(w, cx + spread),
      ground + 2,
      "#f4c688",
      4,
    );
  // Angles use the same ray; incidence is explicitly measured from the normal.
  const rr = Math.min(90 * base, w * 0.17);
  ctx.beginPath();
  ctx.moveTo(cx, ground);
  ctx.arc(cx, ground, rr, 0, -angle, true);
  ctx.closePath();
  ctx.fillStyle = "#d1b28318";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, ground, rr, 0, -angle, true);
  ctx.strokeStyle = "#e5bc80";
  ctx.stroke();
  const r2 = rr * 1.45;
  ctx.beginPath();
  ctx.arc(cx, ground, r2, -Math.PI / 2, -angle, false);
  ctx.strokeStyle = "#8dbcb6";
  ctx.stroke();
  const mid = angle / 2;
  text(
    ctx,
    `${altitude}°`,
    cx + (rr + 19) * Math.cos(mid),
    ground - (rr + 19) * Math.sin(mid),
    compact ? 15 : 20,
    "#edc68f",
  );
  const imid = (Math.PI / 2 + angle) / 2;
  text(
    ctx,
    `${90 - altitude}°`,
    cx + (r2 + 19) * Math.cos(imid),
    ground - (r2 + 19) * Math.sin(imid),
    compact ? 11 : 14,
    "#9cc7bc",
  );
  circle(ctx, sx, sy, 23 * base, "#eac79612");
  circle(ctx, sx, sy, 15 * base, "#efcc92");
  circle(ctx, sx, sy, 32 * base, null, "#eac79625");
  circle(ctx, cx, ground, 3, "#f7e5bd");
  text(ctx, "태양 고도", w * 0.06, h * 0.25, 10, "#eac796");
  text(ctx, "입사각", w * 0.06, h * 0.29, 10, "#9cc7bc");
  text(
    ctx,
    altitude === 0
      ? "수평 입사 · 직접 일사량 0"
      : `같은 빛이 닿는 면적  ${footprint(altitude).toFixed(2)}배`,
    w * 0.5,
    ground + 32,
    compact ? 11 : 13,
    "#d9d9b9",
    "center",
  );
  const barY = h * 0.85,
    barX = w * 0.12,
    barW = w * 0.76;
  text(ctx, "단위 면적당 상대 에너지", barX, barY - 15, 10, "#a8bca5");
  text(
    ctx,
    `${Math.round(solarEnergy(altitude) * 100)}%`,
    barX + barW,
    barY - 15,
    12,
    "#efc795",
    "right",
  );
  line(ctx, barX, barY, barX + barW, barY, "#ffffff16", 5);
  line(
    ctx,
    barX,
    barY,
    barX + barW * solarEnergy(altitude),
    barY,
    "#dbb57f",
    5,
  );
  text(ctx, "0", barX, barY + 22, 9, "#75917e");
  text(ctx, "100% · 고도 90°", barX + barW, barY + 22, 9, "#75917e", "right");
});
function update() {
  altitude = Number(slider.value);
  $("altValue").textContent = `${altitude}°`;
  $("incValue").innerHTML = `${90 - altitude}<small>°</small>`;
  $("energyValue").innerHTML =
    `${Math.round(solarEnergy(altitude) * 100)}<small>%</small>`;
  $("areaValue").innerHTML =
    altitude === 0 ? "∞" : `${footprint(altitude).toFixed(2)}<small>배</small>`;
  $("eqAlt").textContent = altitude;
  $("eqInc").textContent = 90 - altitude;
  $("energyMeter").style.width = `${solarEnergy(altitude) * 100}%`;
  slider.setAttribute("aria-valuetext", `${altitude}도`);
  $("infoText").innerHTML =
    altitude === 0
      ? "태양이 지평선에 있으면 햇빛은 지표와 나란히 들어옵니다. 이 모형에서 <b>직접 일사량은 0</b>이며, 투영 면적의 비는 무한대로 발산합니다."
      : `태양 고도 <b>${altitude}°</b>에서 같은 빛은 수직으로 비출 때보다 <b>${footprint(altitude).toFixed(2)}배</b> 넓게 퍼집니다. 단위 면적당 에너지는 수직 입사의 <b>${Math.round(solarEnergy(altitude) * 100)}%</b>입니다.`;
  Lab.setPresets("sunSlider", altitude);
  render();
}
slider.addEventListener("input", update);
update();
Lab.ready();
