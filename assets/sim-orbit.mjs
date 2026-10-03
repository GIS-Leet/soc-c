import { dailyInsolation, solarAltitude } from "./sim-models.mjs?v=a32b816f";
import { fitCanvas, line, text } from "./sim-canvas.mjs?v=31de4804";
import {
  declination,
  noonAltitude,
  dayLength,
  latitudeLabel,
} from "./sim-math.mjs?v=ad464be2";
import {
  createElapsedClock,
  advancePhase,
} from "./simulation-time.mjs?v=422c4a21";
const $ = (id) => document.getElementById(id),
  container = $("simulation-container");
const clock = createElapsedClock(),
  scene = new THREE.Scene();
scene.background = new THREE.Color(0x102827);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2500);
const renderer = Lab.createRenderer(THREE, { antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 190;
controls.maxDistance = 850;
controls.maxPolarAngle = Math.PI * 0.88;
scene.add(new THREE.AmbientLight(0x749286, 0.45));
scene.add(new THREE.PointLight(0xffe5b9, 2, 0));
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(20, 40, 32),
  new THREE.MeshBasicMaterial({ color: 0xf2cc8c }),
);
scene.add(sun);
// A soft radial sprite makes the luminous edge continuous, rather than nested solid shells.
const glowCanvas = document.createElement("canvas");
glowCanvas.width = glowCanvas.height = 128;
const g = glowCanvas.getContext("2d"),
  gradient = g.createRadialGradient(64, 64, 8, 64, 64, 64);
gradient.addColorStop(0, "#f7ca89b0");
gradient.addColorStop(0.35, "#edb56640");
gradient.addColorStop(1, "#edb56600");
g.fillStyle = gradient;
g.fillRect(0, 0, 128, 128);
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    depthWrite: false,
  }),
);
glow.scale.set(115, 115, 1);
scene.add(glow);
const R = 133,
  earthRadius = 28,
  earthGroup = new THREE.Group();
scene.add(earthGroup);
const texture = new THREE.CanvasTexture(
  Geo.earthTexture({ width: 2048, height: 1024 }),
);
texture.encoding = THREE.sRGBEncoding;
texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius, 64, 48),
  new THREE.MeshPhongMaterial({
    map: texture,
    shininess: 8,
    specular: 0x446655,
  }),
);
earthGroup.add(earth);
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.04, 48, 32),
  new THREE.MeshBasicMaterial({
    color: 0xa3c1b5,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
    depthWrite: false,
  }),
);
earthGroup.add(atmosphere);
const equator = new THREE.Mesh(
  new THREE.TorusGeometry(earthRadius + 0.7, 0.23, 8, 100),
  new THREE.MeshBasicMaterial({ color: 0x8bc6c0 }),
);
equator.rotation.x = Math.PI / 2;
earthGroup.add(equator);
const axis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -46, 0),
    new THREE.Vector3(0, 46, 0),
  ]),
  new THREE.LineBasicMaterial({ color: 0xe6d5aa }),
);
earthGroup.add(axis);
function label(str, size = 12, color = "#cad6ba") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = '500 25px "Pretendard Variable",sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(str, 128, 40);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(size * 4, size, 1);
  return sprite;
}
const north = label("N", 8);
north.position.set(0, 51, 0);
earthGroup.add(north);
const sunLabel = label("태양", 10);
sunLabel.position.set(0, -30, 0);
scene.add(sunLabel);
const points = [];
for (let i = 0; i <= 180; i++) {
  const t = (i / 180) * Math.PI * 2;
  points.push(new THREE.Vector3(R * Math.cos(t), 0, R * Math.sin(t)));
}
scene.add(
  new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0x6c917e,
      transparent: true,
      opacity: 0.7,
    }),
  ),
);
for (let i = 0; i < 12; i++) {
  const t = Math.PI - ((i + 1 - 6) * Math.PI) / 6,
    dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
  const a = dir.clone().multiplyScalar(R - 3),
    b = dir.clone().multiplyScalar(R + 3);
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({
        color: 0xb5bf98,
        transparent: true,
        opacity: 0.5,
      }),
    ),
  );
}
for (const [m, str] of [
  [3, "3월 · 춘분"],
  [6, "6월 · 하지"],
  [9, "9월 · 추분"],
  [12, "12월 · 동지"],
]) {
  const t = Math.PI - ((m - 6) * Math.PI) / 6,
    l = label(str, 10);
  l.position.set((R + 30) * Math.cos(t), -9, (R + 30) * Math.sin(t));
  scene.add(l);
}
const ray = new THREE.ArrowHelper(
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(),
  R - earthRadius - 5,
  0xd8b377,
  8,
  4,
);
scene.add(ray);
const starField = new THREE.Group();
scene.add(starField);
const stars = [];
let seed = 27;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 260; i++) {
  const x = (rand() - 0.5) * 1200,
    y = (rand() - 0.5) * 800,
    z = (rand() - 0.5) * 1200;
  if (Math.hypot(x, y, z) > 350) stars.push(x, y, z);
}
starField.add(
  new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(stars, 3),
    ),
    new THREE.PointsMaterial({
      color: 0xa9b99c,
      size: 1.2,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: false,
    }),
  ),
);
const monthSlider = $("monthSlider"),
  monthLabel = $("monthLabel"),
  latitudeSlider = $("latitudeSlider");
let orbitMonth = 6,
  isPlaying = false,
  tiltAngle = 23.5;

const observation = document.createElement("section");
observation.className = "control-panel research-extra";
observation.innerHTML =
  '<div class="panel-heading"><h2>하루 동안 달라지는 빛</h2><span class="panel-no">관찰</span></div><div class="field-label"><label for="solarHour">태양시</label><output id="solarHourValue">12:00</output></div><input id="solarHour" type="range" min="0" max="24" step=".25" value="12"><div class="metric-grid"><div class="metric"><span>현재 태양 고도</span><strong id="hourAltitude"></strong></div><div class="metric"><span>일평균 일사 · 대기권 밖</span><strong id="dailySolar"></strong></div></div><canvas id="dayCurve" role="img" aria-label="태양시에 따른 태양 고도 곡선"></canvas><p class="note-caption">태양시 12시는 남중 시각입니다. 시계의 12시와 다릅니다. 주황 점은 선택한 태양시의 가상 관찰점입니다.</p><details><summary>12개월 계산 표</summary><div class="comparison-scroll"><table class="annual-data" id="orbitTable"></table></div></details>';
document.querySelector(".lab-controls").append(observation);
const observerPoint = new THREE.Mesh(
  new THREE.SphereGeometry(1.7, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffa05c }),
);
earthGroup.add(observerPoint);
const renderDay = fitCanvas($("dayCurve"), (ctx, w, h) => {
  const lat = Number(latitudeSlider.value),
    dec = declination(Number(monthSlider.value), tiltAngle),
    px = (v) => 30 + (v / 24) * (w - 42),
    py = (v) => h - 24 - ((v + 90) / 180) * (h - 40);
  line(ctx, 30, py(0), w - 12, py(0), "#899a8988", 1, [3, 4]);
  for (let i = 1; i <= 96; i++)
    line(
      ctx,
      px((i - 1) / 4),
      py(solarAltitude(lat, dec, (i - 1) / 4)),
      px(i / 4),
      py(solarAltitude(lat, dec, i / 4)),
      "#bc5634",
      2,
    );
  const hour = Number($("solarHour").value);
  ctx.fillStyle = "#b24d30";
  ctx.beginPath();
  ctx.arc(px(hour), py(solarAltitude(lat, dec, hour)), 4, 0, Math.PI * 2);
  ctx.fill();
  for (const t of [0, 6, 12, 18, 24])
    text(ctx, String(t), px(t), h - 5, 9, "#6d806f", "center");
  text(ctx, "0°", 25, py(0) + 3, 9, "#6d806f", "right");
});
let annualTableKey = "";
function updateObservation() {
  const lat = Number(latitudeSlider.value),
    m = Number(monthSlider.value),
    dec = declination(m, tiltAngle),
    hour = Number($("solarHour").value);
  $("solarHourValue").textContent =
    String(Math.floor(hour)).padStart(2, "0") +
    ":" +
    String(Math.round((hour % 1) * 60)).padStart(2, "0");
  $("hourAltitude").innerHTML =
    solarAltitude(lat, dec, hour).toFixed(1) + "<small>°</small>";
  $("dailySolar").innerHTML =
    dailyInsolation(lat, dec).toFixed(1) + "<small> W/m²</small>";
  Lab.paintRange($("solarHour"));
  earthGroup.updateMatrixWorld(true);
  const towardSun = earthGroup.position
    .clone()
    .negate()
    .normalize()
    .applyQuaternion(earthGroup.quaternion.clone().invert());
  const lon =
    Math.atan2(towardSun.z, towardSun.x) + ((hour - 12) * Math.PI) / 12;
  observerPoint.position.set(
    (earthRadius + 1) * Math.cos((lat * Math.PI) / 180) * Math.cos(lon),
    (earthRadius + 1) * Math.sin((lat * Math.PI) / 180),
    (earthRadius + 1) * Math.cos((lat * Math.PI) / 180) * Math.sin(lon),
  );
  const tableKey = `${lat}|${tiltAngle}`;
  if (tableKey !== annualTableKey) {
    annualTableKey = tableKey;
    $("orbitTable").innerHTML =
      "<tr><th>월</th><th>낮(h)</th><th>남중(°)</th><th>일사(W/m²)</th></tr>" +
      Array.from({ length: 12 }, (_, i) => {
        const d = declination(i + 1, tiltAngle);
        return (
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          dayLength(lat, d).toFixed(2) +
          "</td><td>" +
          noonAltitude(lat, d).toFixed(2) +
          "</td><td>" +
          dailyInsolation(lat, d).toFixed(2) +
          "</td></tr>"
        );
      }).join("");
  }
  renderDay();
}
$("solarHour").addEventListener("input", () => {
  updateObservation();
  Lab.changed();
});

function updateSimulation() {
  const m = Number(monthSlider.value),
    latitude = Number(latitudeSlider.value),
    dec = declination(m, tiltAngle),
    hours = dayLength(latitude, dec);
  const theta = Math.PI - ((m - 6) * Math.PI) / 6;
  earthGroup.position.set(R * Math.cos(theta), 0, R * Math.sin(theta));
  earthGroup.rotation.z = (-tiltAngle * Math.PI) / 180;
  ray.setDirection(earthGroup.position.clone().normalize());
  monthLabel.innerHTML = `${Math.floor(m)}<small>월</small>`;
  $("latitudeValue").textContent = latitudeLabel(latitude);
  $("declinationValue").textContent = latitudeLabel(dec);
  $("dayValue").innerHTML = `${hours.toFixed(1)}<small>시간</small>`;
  $("noonValue").innerHTML =
    `${noonAltitude(latitude, dec).toFixed(1)}<small>°</small>`;
  $("tiltValue").innerHTML = `${tiltAngle}<small>°</small>`;
  $("infoText").innerHTML =
    tiltAngle === 0
      ? "자전축을 <b>0°</b>로 두면 태양 직사 위도는 항상 적도입니다. 이 모형에서는 같은 위도의 남중 고도와 낮 길이가 1년 내내 일정해집니다."
      : `태양 직사 위도는 <b>${latitudeLabel(dec)}</b>입니다. ${dec > 0.1 ? "북반구" : dec < -0.1 ? "남반구" : "두 반구"}${Math.abs(dec) > 0.1 ? "가 햇빛을 더 정면으로 받습니다." : "에 햇빛이 대칭으로 들어옵니다."} 관찰 위도 <b>${latitudeLabel(latitude)}</b>의 낮 길이는 약 <b>${hours.toFixed(1)}시간</b>입니다.`;
  Lab.setPresets("monthSlider", m);
  Lab.paintRange(latitudeSlider);
  latitudeSlider.setAttribute("aria-valuetext", latitudeLabel(latitude));
  updateObservation();
  Lab.changed();
}
monthSlider.addEventListener("input", () => {
  orbitMonth = Number(monthSlider.value);
  updateSimulation();
});
latitudeSlider.addEventListener("input", updateSimulation);
document.querySelectorAll("[data-tilt]").forEach((button) =>
  button.addEventListener("click", () => {
    tiltAngle = Number(button.dataset.tilt);
    document
      .querySelectorAll("[data-tilt]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    updateSimulation();
  }),
);
$("playBtn").addEventListener("click", () => {
  isPlaying = !isPlaying;
  $("playBtn").setAttribute("aria-pressed", String(isPlaying));
  $("playText").textContent = isPlaying ? "일시 정지" : "한 해 재생";
  $("playIconSpan").textContent = isPlaying ? "Ⅱ" : "▶";
});
function resetView() {
  const factor = container.clientWidth / container.clientHeight < 1 ? 1.35 : 1;
  camera.position.set(180 * factor, 235 * factor, 345 * factor);
  controls.target.set(0, 0, 0);
  controls.update();
}
$("resetView").addEventListener("click", resetView);
function resize() {
  const w = container.clientWidth,
    h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(container);
resize();
resetView();
function animate(timestamp) {
  const dt = clock.tick(timestamp, isPlaying && !document.hidden);
  if (dt) {
    orbitMonth = advancePhase(orbitMonth, 0.9, dt, 1, 13);
    monthSlider.value = orbitMonth;
    monthSlider.setAttribute(
      "aria-valuetext",
      `${Math.floor(Number(monthSlider.value))}월`,
    );
    updateSimulation();
  }
  earth.rotation.y += 3 * dt;
  starField.rotation.y += 0.03 * dt;
  controls.update();
  renderer.render(scene, camera);
}
// 최초 1회 실행
updateSimulation();
function drawFlat(ctx, w, h) {
  const cx = w / 2,
    cy = h * 0.52,
    r = Math.min(w * 0.32, h * 0.3),
    angle = Math.PI - ((Number(monthSlider.value) - 6) * Math.PI) / 6;
  ctx.strokeStyle = "#91aa86";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f1cf93";
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fill();
  const x = cx + r * Math.cos(angle),
    y = cy + r * 0.7 * Math.sin(angle);
  ctx.fillStyle = "#75b6b1";
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f1dbc0";
  ctx.beginPath();
  ctx.moveTo(x - 10 * Math.sin((tiltAngle * Math.PI) / 180), y + 28);
  ctx.lineTo(x + 10 * Math.sin((tiltAngle * Math.PI) / 180), y - 28);
  ctx.stroke();
  ctx.fillStyle = "#e3e8cf";
  ctx.font = "14px sans-serif";
  ctx.fillText("2D 공전 모형 · 축의 방향은 유지됩니다", 24, 35);
  ctx.fillText(
    "선택 위도의 낮 길이와 태양 고도는 수치 패널에서 비교하세요",
    24,
    h - 28,
  );
}
Lab.register({
  fallback: drawFlat,
  pause() {
    if (isPlaying) $("playBtn").click();
  },
  measure() {
    const m = Number(monthSlider.value),
      lat = Number(latitudeSlider.value),
      dec = declination(m, tiltAngle),
      hour = Number($("solarHour").value);
    return {
      "공전 위치 (월)": +m.toFixed(2),
      "위도 (°)": lat,
      "기울기 (°)": tiltAngle,
      "태양시 (h)": hour,
      "적위 (°)": +dec.toFixed(3),
      "낮 길이 (h)": +dayLength(lat, dec).toFixed(3),
      "남중 고도 (°)": +noonAltitude(lat, dec).toFixed(3),
      "태양 고도 (°)": +solarAltitude(lat, dec, hour).toFixed(3),
      "일평균 일사 (W/m²)": +dailyInsolation(lat, dec).toFixed(3),
    };
  },
});
Lab.renderLoop(animate, {
  element: container,
  renderer,
  controls,
  active: () => isPlaying,
});
Lab.ready();
