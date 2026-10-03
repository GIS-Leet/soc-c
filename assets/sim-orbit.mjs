import {
  declination,
  noonAltitude,
  dayLength,
  latitudeLabel,
} from "./sim-math.mjs?v=999595c7";
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
const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  requestAnimationFrame(animate);
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
animate();
Lab.ready();
