import { surfaceIllumination } from "./sim-models.mjs?v=a32b816f";
import { fitCanvas, line, text, circle, arrow } from "./sim-canvas.mjs?v=a3a44df5";
const $ = (id) => document.getElementById(id),
  slider = $("sunSlider");
const extra = document.createElement("div");
extra.className = "research-extra";
extra.innerHTML =
  '<div class="control-divider"></div><div class="field-label"><label for="slopeAngle">사면 기울기</label><output id="slopeValue">0°</output></div><input type="range" id="slopeAngle" min="-45" max="45" value="0" step="1"><div class="range-ends"><span>태양 반대 −45°</span><span>태양 방향 +45°</span></div><p class="note-caption">같은 태양 고도에서 사면의 방향만 바꿔 보세요.</p>';
slider.closest(".control-panel").append(extra);
let altitude = 45,
  slope = 0;
const render = fitCanvas($("simCanvas"), (ctx, w, h) => {
  const small = w < 520,
    cx = w * 0.43,
    cy = h * 0.59,
    a = (altitude * Math.PI) / 180,
    b = (slope * Math.PI) / 180;
  const illum = surfaceIllumination(altitude, slope),
    length = Math.min(w * 0.33, h * 0.36),
    beam = Math.min(w * 0.025, 14);
  const dir = { x: Math.cos(b), y: Math.sin(b) },
    normal = { x: Math.sin(b), y: -Math.cos(b) },
    ray = { x: -Math.cos(a), y: Math.sin(a) };
  const sun = { x: cx - ray.x * length, y: cy - ray.y * length };
  for (let x = 20; x < w; x += 34) line(ctx, x, 0, x, h, "#a5b8a00b");
  for (let y = 20; y < h; y += 34) line(ctx, 0, y, w, y, "#a5b8a00b");
  text(
    ctx,
    "SAME BEAM / DIFFERENT SURFACE",
    w * 0.06,
    32,
    small ? 8 : 10,
    "#9ab5a4",
  );
  line(ctx, 0, cy, w, cy, "#9cbaa366", 1, [4, 6]);
  const extent = Math.max(w, h);
  ctx.beginPath();
  ctx.moveTo(cx - dir.x * extent, cy - dir.y * extent);
  ctx.lineTo(cx + dir.x * extent, cy + dir.y * extent);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = "#759a6d15";
  ctx.fill();
  line(
    ctx,
    cx - dir.x * extent,
    cy - dir.y * extent,
    cx + dir.x * extent,
    cy + dir.y * extent,
    "#acc092",
    2,
  );
  arrow(
    ctx,
    cx,
    cy,
    cx + normal.x * length * 0.86,
    cy + normal.y * length * 0.86,
    "#a8d3c3",
    5,
  );
  text(
    ctx,
    "면에 수직인 법선",
    cx + normal.x * length * 0.86 - 7,
    cy + normal.y * length * 0.86 - 12,
    10,
    "#a8d3c3",
    "right",
  );
  const hits = [];
  for (let i = -2; i <= 2; i++) {
    const offset = (i * beam) / 2,
      ox = sun.x + offset * Math.sin(a),
      oy = sun.y + offset * Math.cos(a);
    const cross = ray.x * dir.y - ray.y * dir.x;
    const t =
      Math.abs(cross) < 1e-10
        ? length * 3
        : ((cx - ox) * dir.y - (cy - oy) * dir.x) / cross;
    const hit = { x: ox + ray.x * t, y: oy + ray.y * t };
    if (illum.cosine > 1e-8) {
      line(ctx, ox, oy, hit.x, hit.y, "#ebc389", i === 0 ? 1.8 : 1);
      hits.push(hit);
    } else
      line(
        ctx,
        ox,
        oy,
        ox + ray.x * length * 2,
        oy + ray.y * length * 2,
        "#ebc38988",
        1,
      );
  }
  if (hits.length)
    line(ctx, hits[0].x, hits[0].y, hits.at(-1).x, hits.at(-1).y, "#f7cb8e", 5);
  circle(ctx, sun.x, sun.y, 24, "#efcf9420");
  circle(ctx, sun.x, sun.y, 13, "#efcf94");
  circle(ctx, cx, cy, 3, "#ffe9c1");
  const r = Math.min(57, w * 0.13);
  ctx.beginPath();
  ctx.arc(cx, cy, r, -a, 0);
  ctx.strokeStyle = "#d7b884";
  ctx.stroke();
  text(ctx, `${altitude}°`, cx + r + 12, cy - 8, small ? 14 : 18, "#e8c78f");
  text(
    ctx,
    `입사각 ${illum.incidence.toFixed(1)}°`,
    w * 0.06,
    h * 0.18,
    small ? 12 : 15,
    "#a8d3c3",
  );
  text(
    ctx,
    `수광 비율 ${(illum.cosine * 100).toFixed(1)}%`,
    w * 0.06,
    h * 0.24,
    small ? 12 : 15,
    "#eac58c",
  );
  const boxY = h - 88;
  ctx.fillStyle = "#102827ef";
  ctx.fillRect(0, boxY - 15, w, 103);
  text(
    ctx,
    illum.footprint === null
      ? "빛이 닿지 않는 방향 · 수광 비율 0%"
      : `같은 빛이 닿는 면적 ${illum.footprint.toFixed(2)}배`,
    w / 2,
    boxY + 3,
    small ? 11 : 13,
    "#e3e6cb",
    "center",
  );
  line(ctx, w * 0.12, boxY + 28, w * 0.88, boxY + 28, "#a8bba533", 6);
  line(
    ctx,
    w * 0.12,
    boxY + 28,
    w * (0.12 + 0.76 * illum.cosine),
    boxY + 28,
    "#e7be83",
    6,
  );
  text(ctx, "0%", w * 0.12, boxY + 51, 10, "#9bb5a2");
  text(ctx, "100% · 면에 수직", w * 0.88, boxY + 51, 10, "#9bb5a2", "right");
});
function measure() {
  const result = surfaceIllumination(altitude, slope);
  return {
    "태양 고도 (°)": altitude,
    "사면 기울기 (°)": slope,
    "입사각 (°)": +result.incidence.toFixed(2),
    "상대 에너지 (%)": +(result.cosine * 100).toFixed(2),
    "면적 비":
      result.footprint === null ? "수광 없음" : +result.footprint.toFixed(4),
  };
}
function update() {
  altitude = Number(slider.value);
  slope = Number($("slopeAngle").value);
  const result = surfaceIllumination(altitude, slope);
  $("altValue").textContent = altitude + "°";
  $("slopeValue").textContent = (slope > 0 ? "+" : "") + slope + "°";
  $("incValue").innerHTML = result.incidence.toFixed(1) + "<small>°</small>";
  $("energyValue").innerHTML =
    (result.cosine * 100).toFixed(1) + "<small>%</small>";
  $("areaValue").innerHTML =
    result.footprint === null
      ? "—"
      : result.footprint.toFixed(2) + "<small>배</small>";
  $("energyMeter").style.width = result.cosine * 100 + "%";
  const equation = $("eqAlt")?.parentElement;
  if (equation)
    equation.textContent = "입사각은 햇빛과 면의 법선 사이의 각도입니다.";
  $("infoText").textContent =
    result.footprint === null
      ? "이 면은 빛을 직접 받지 않습니다. 기울기 또는 태양 고도를 바꾸어 빛과 법선의 관계를 관찰하세요."
      : `이 조건에서 같은 빛은 수직 입사보다 ${result.footprint.toFixed(2)}배 넓은 면에 퍼지고, 단위 면적당 에너지는 ${(result.cosine * 100).toFixed(1)}%입니다. 기온은 계산하지 않습니다.`;
  slider.setAttribute("aria-valuetext", `${altitude}도`);
  $("slopeAngle").setAttribute("aria-valuetext", `${slope}도`);
  Lab.setPresets("sunSlider", altitude);
  Lab.paintRange($("slopeAngle"));
  render();
  Lab.changed();
}
slider.addEventListener("input", update);
$("slopeAngle").addEventListener("input", update);
Lab.register({ measure });
update();
Lab.ready();
