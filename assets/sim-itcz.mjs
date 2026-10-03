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
import { fitCanvas, line, text, arrow } from "./sim-canvas.mjs?v=31de4804";
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
const render = fitCanvas($("simCanvas"), (ctx, w, h) => {
  const left = w < 500 ? 40 : 60,
    right = w - 25,
    top = h * 0.22,
    bottom = h * 0.77,
    width = right - left,
    height = bottom - top,
    toY = (v) => top + ((40 - v) / 80) * height;
  text(
    ctx,
    "SEASONAL MIGRATION / IDEALIZED MODEL",
    left,
    h * 0.11,
    w < 500 ? 8 : 10,
    "#8ca58f",
  );
  // 40°S–40°N crop of the same geographic texture as the orbital model.
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.drawImage(
    earth,
    0,
    (earth.height * 50) / 180,
    earth.width,
    (earth.height * 80) / 180,
    left,
    top,
    width,
    height,
  );
  ctx.restore();
  ctx.fillStyle = "#12352c55";
  ctx.fillRect(left, top, width, height);
  for (let longitude = 0; longitude <= 360; longitude += 45) {
    const x = left + (longitude / 360) * width;
    line(ctx, x, top, x, bottom, "#dbe7ce19");
  }
  for (let v = -30; v <= 30; v += 15) {
    const y = toY(v);
    line(
      ctx,
      left,
      y,
      right,
      y,
      v === 0 ? "#c4ceb47a" : "#dbe7ce25",
      1,
      v === 0 ? [5, 5] : [],
    );
    text(
      ctx,
      v === 0 ? "EQ" : `${Math.abs(v)}°${v > 0 ? "N" : "S"}`,
      left - 8,
      y + 3,
      9,
      "#b6c7af",
      "right",
    );
  }
  const center = centerAt(m),
    y = toY(center),
    bandH = (height * 14) / 80;
  const band = ctx.createLinearGradient(0, y - bandH, 0, y + bandH);
  band.addColorStop(0, "#e6c18500");
  band.addColorStop(0.5, "#e6c18544");
  band.addColorStop(1, "#e6c18500");
  ctx.fillStyle = band;
  ctx.fillRect(left, y - bandH, width, bandH * 2);
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const x = left + (i / 100) * width,
      yy = y + Math.sin((i / 100) * Math.PI * 4) * 4;
    i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
  }
  ctx.strokeStyle = "#ebc88c";
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const x = left + (width * (i + 0.5)) / 6;
    arrow(
      ctx,
      x + width * 0.025,
      Math.max(top + 8, y - bandH - 35),
      x - 5,
      y - 9,
      "#a6c9be",
      5,
    );
    arrow(
      ctx,
      x + width * 0.025,
      Math.min(bottom - 8, y + bandH + 35),
      x - 5,
      y + 9,
      "#a6c9be",
      5,
    );
  }
  const obsY = toY(lat);
  line(ctx, left, obsY, right, obsY, "#f1f0d2", 1.4, [2, 5]);
  ctx.fillStyle = "#f1f0d2";
  ctx.fillRect(right - 4, obsY - 3, 6, 6);
  const labelY = Math.abs(obsY - y) < 23 ? obsY + 22 : obsY - 9;
  text(
    ctx,
    `관찰 ${latitudeLabel(lat)}`,
    right - 7,
    labelY,
    10,
    "#f0ebcc",
    "right",
  );
  text(ctx, "ITCZ", left + 10, y - 10, 11, "#ecc58b");
  text(
    ctx,
    "태양을 따라 움직이는 상승 기류와 비의 띠",
    w * 0.5,
    h * 0.87,
    w < 500 ? 10 : 12,
    "#d4d8ba",
    "center",
  );
  text(
    ctx,
    "↙ 북동 무역풍     ·     ↖ 남동 무역풍",
    w * 0.5,
    h * 0.93,
    w < 500 ? 9 : 10,
    "#8da999",
    "center",
  );
});
const chart = fitCanvas($("rainChart"), (ctx, w, h) => {
  const pad = 20,
    graphH = h - 42,
    barW = (w - pad * 2) / 12;
  line(ctx, pad, h - 24, w - pad, h - 24, "#99a99555");
  for (let i = 1; i <= 12; i++) {
    const x = pad + (i - 1) * barW,
      bar = rainAt(lat, i) * graphH;
    ctx.fillStyle = i === Math.floor(m) ? "#c16b40" : "#8da78e";
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
