import { drawConvergence } from "./sim-itcz-drawing.mjs?v=6740d58e";
import {
  convergenceLatitude,
  rainIndex,
  rainSectors,
} from "./sim-models.mjs?v=a32b816f";
import {
  itczLatitude,
  rainPotential,
  latitudeLabel,
} from "./sim-math.mjs?v=7551fc73";
import {
  createElapsedClock,
  advancePhase,
} from "./simulation-time.mjs?v=422c4a21";
import { fitCanvas, line, text, arrow } from "./sim-canvas.mjs?v=0a622b13";
const $ = (id) => document.getElementById(id),
  month = $("monthSlider"),
  latitude = $("latitudeSlider"),
  clock = createElapsedClock();
let m = 6,
  lat = 15,
  isPlaying = false;
const sectorPanel = document.createElement("div");
sectorPanel.className = "research-extra";
sectorPanel.innerHTML =
  '<label for="rainSector">계절 이동 유형</label><select id="rainSector"></select><p class="note-caption">가정값의 차이가 결과를 어떻게 바꾸는지 비교하는 세 가지 모형입니다.</p><details><summary>월별 상대 강수 지수 표</summary><table class="annual-data" id="rainData"></table></details>';
latitude.closest(".control-panel").append(sectorPanel);
for (const [id, config] of Object.entries(rainSectors)) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = config.label;
  $("rainSector").append(opt);
}
const centerAt = (month) => convergenceLatitude(month, $("rainSector").value),
  rainAt = (lat, month) => rainIndex(lat, month, $("rainSector").value);
const earth = Geo.earthTexture({ width: 1024, height: 512 });
const render = fitCanvas($("simCanvas"), (ctx, w, h) =>
  drawConvergence(ctx, w, h, centerAt(m), lat, m, earth),
);
const chart = fitCanvas($("rainChart"), (ctx, w, h) => {
  const pad = 20,
    graphH = h - 42,
    barW = (w - pad * 2) / 12;
  line(ctx, pad, h - 24, w - pad, h - 24, "#99a99555");
  for (let i = 1; i <= 12; i++) {
    const x = pad + (i - 1) * barW,
      bar = rainAt(lat, i) * graphH;
    const styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles
      .getPropertyValue(i === Math.floor(m) ? "--st-accent-ink" : "--st-gray-2")
      .trim();
    ctx.fillRect(x + 3, h - 25 - bar, Math.max(2, barW - 6), Math.max(1, bar));
    if (i % 2 === 1 || i === 12)
      text(ctx, `${i}`, x + barW / 2, h - 7, 9, "#7a887a", "center");
  }
});
let annualTableKey = "";
function update() {
  m = Number(month.value);
  lat = Number(latitude.value);
  const center = centerAt(m),
    rain = rainAt(lat, m);
  $("monthLabel").innerHTML = `${Math.floor(m)}<small>월</small>`;
  $("latitudeValue").textContent = latitudeLabel(lat);
  $("itczValue").textContent = latitudeLabel(center);
  $("rainValue").textContent =
    rain > 0.6 ? "높음" : rain > 0.2 ? "보통" : "낮음";
  $("infoText").innerHTML =
    `이 모형에서 ${Math.floor(m)}월 수렴대는 <b>${latitudeLabel(center)}</b> 부근에 놓입니다. 관찰 지점 <b>${latitudeLabel(lat)}</b>는 수렴대${rain > 0.6 ? "에 가까워 공기가 상승하고 비가 내리기 쉬운" : "에서 떨어져 상대적으로 비가 적은"} 조건입니다.`;
  month.setAttribute("aria-valuetext", `${Math.floor(m)}월`);
  latitude.setAttribute("aria-valuetext", latitudeLabel(lat));
  Lab.setPresets("monthSlider", m);
  Lab.paintRange(latitude);
  const tableKey = `${lat}|${$("rainSector").value}`;
  if (tableKey !== annualTableKey) {
    annualTableKey = tableKey;
    $("rainData").innerHTML =
      "<tr><th>월</th><th>수렴대 위도 (°)</th><th>지수 (0–100)</th></tr>" +
      Array.from(
        { length: 12 },
        (_, i) =>
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          centerAt(i + 1).toFixed(1) +
          "</td><td>" +
          (100 * rainAt(lat, i + 1)).toFixed(1) +
          "</td></tr>",
      ).join("");
  }
  render();
  chart();
  Lab.changed();
}
month.addEventListener("input", update);
latitude.addEventListener("input", update);
$("rainSector").addEventListener("change", update);
$("playBtn").addEventListener("click", () => {
  isPlaying = !isPlaying;
  $("playBtn").setAttribute("aria-pressed", String(isPlaying));
  $("playText").textContent = isPlaying ? "일시 정지" : "한 해 재생";
  $("playIconSpan").textContent = isPlaying ? "Ⅱ" : "▶";
});
function animate(timestamp) {
  const dt = clock.tick(timestamp, isPlaying && !document.hidden);
  if (dt) {
    m = advancePhase(m, 0.7, dt, 1, 13);
    month.value = m;
    update();
  }
}
update();
Lab.register({
  pause() {
    if (isPlaying) $("playBtn").click();
  },
  measure() {
    return {
      월: +m.toFixed(2),
      "관찰 위도 (°)": lat,
      유형: rainSectors[$("rainSector").value].label,
      "수렴대 위도 (°)": +centerAt(m).toFixed(2),
      "상대 강수 지수 (0–100)": +(100 * rainAt(lat, m)).toFixed(2),
    };
  },
});
Lab.renderLoop(animate, { element: $("simCanvas"), active: () => isPlaying });
Lab.ready();
