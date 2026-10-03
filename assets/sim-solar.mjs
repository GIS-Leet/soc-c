import { drawSolar } from "./sim-solar-drawing.mjs?v=1c99307a";
import { surfaceIllumination } from "./sim-models.mjs?v=a32b816f";
import {
  fitCanvas,
  line,
  text,
  circle,
  arrow,
} from "./sim-canvas.mjs?v=0a622b13";
const $ = (id) => document.getElementById(id),
  slider = $("sunSlider");
const extra = document.createElement("div");
extra.className = "research-extra";
extra.innerHTML =
  '<div class="control-divider"></div><div class="field-label"><label for="slopeAngle">사면 기울기</label><output id="slopeValue">0°</output></div><input type="range" id="slopeAngle" min="-45" max="45" value="0" step="1"><div class="range-ends"><span>태양 반대 −45°</span><span>태양 방향 +45°</span></div><p class="note-caption">같은 태양 고도에서 사면의 방향만 바꿔 보세요.</p>';
slider.closest(".control-panel").append(extra);
let altitude = 45,
  slope = 0;
const render = fitCanvas($("simCanvas"), (ctx, w, h) =>
  drawSolar(ctx, w, h, altitude, slope, surfaceIllumination(altitude, slope)),
);

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
