import { encodeGrid, decodeGrid } from "./sim-records.mjs?v=c4583f9f";
import {
  seededRandom,
  gridSample,
  terrainStats,
  diffuseTerrain,
  contourSegments,
} from "./sim-models.mjs?v=a32b816f";
import { createElapsedClock, approach } from "./simulation-time.mjs?v=422c4a21";
const clock = createElapsedClock();
let motionPaused = true;
const motionButton = document.getElementById("motionPause");
const renderMotionButton = () => {
  motionButton.textContent = motionPaused ? "움직임 재생" : "움직임 일시 정지";
  motionButton.setAttribute("aria-pressed", String(motionPaused));
};
motionButton.onclick = () => {
  motionPaused = !motionPaused;
  renderMotionButton();
};
renderMotionButton();
// ----------------------------------------------------
// 단면도 차트 (Chart.js) 초기화 - 붉은 잉크 테마(Terra)로 색상 변경
// ----------------------------------------------------
const researchPanel = document.createElement("section");
researchPanel.className = "control-panel research-extra";
researchPanel.innerHTML =
  '<div class="panel-heading"><h2>재현 가능한 지형 실험</h2><span class="panel-no">탐구</span></div><label for="terrainSeed">지형 시드</label><input type="number" id="terrainSeed" min="1" max="999999" step="1" value="2026"><div class="action-btns"><button id="applySeed" class="secondary-btn">이 시드로 만들기</button><button id="planView" class="secondary-btn">위에서 보기</button></div><div class="action-btns"><button id="undoTerrain" class="secondary-btn" disabled>실행 취소</button><button id="redoTerrain" class="secondary-btn" disabled>다시 실행</button></div><div class="layer-switch"><label for="contourToggle">등고선 · 높이 5단위 간격</label><input type="checkbox" id="contourToggle"></div><button class="secondary-btn" id="smoothTerrain">사면 완화 10회</button><p class="note-caption">이웃 셀 사이의 높이를 교환합니다. 닫힌 영역에서 물질의 총량을 보존하는 단순 사면 모형입니다.</p><div class="metric-grid"><div class="metric"><span>비고</span><strong id="reliefValue"></strong></div><div class="metric"><span>평균 경사</span><strong id="slopeMetric"></strong></div></div><p id="massBalance" role="status" class="note-caption">높이·거리는 모형 단위입니다.</p>';
document.querySelector(".lab-controls").append(researchPanel);
const keyboardPanel = document.createElement("div");
keyboardPanel.className = "research-extra";
keyboardPanel.innerHTML =
  '<div class="metric-grid"><div><label for="brushX">적용 위치 X</label><input id="brushX" type="number" min="-95" max="95" step="5" value="0"></div><div><label for="brushZ">적용 위치 Z</label><input id="brushZ" type="number" min="-95" max="95" step="5" value="0"></div></div>';
document.getElementById("centerBrush").parentElement.before(keyboardPanel);
document.getElementById("centerBrush").textContent = "선택 위치에 적용";
let terrainSeed = 2026,
  terrainSource = "seed",
  smoothingSteps = 0,
  contourTimer;
const undoStack = [],
  redoStack = [];
const ctxChart = document.getElementById("profileChart").getContext("2d");
let profileChart = new Chart(ctxChart, {
  type: "line",
  data: {
    labels: Array(50).fill(""),
    datasets: [
      {
        label: "모형 높이",
        data: Array(50).fill(0),
        borderColor: "#b4502e",
        backgroundColor: "rgba(180, 80, 46, 0.15)",
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        display: true,
        grid: { color: "rgba(26,23,20,0.06)" },
        ticks: {
          font: { family: "'Space Grotesk', sans-serif" },
          color: "#8c8479",
        },
      },
    },
    animation: { duration: 0 },
  },
});

function updateChart(heightsData) {
  profileChart.data.datasets[0].data = heightsData;
  profileChart.update();
}
function themeChart() {
  const style = getComputedStyle(document.documentElement);
  profileChart.data.datasets[0].borderColor = style
    .getPropertyValue("--st-accent-ink")
    .trim();
  profileChart.data.datasets[0].backgroundColor = style
    .getPropertyValue("--st-accent-soft")
    .trim();
  profileChart.options.scales.y.ticks.color = style
    .getPropertyValue("--st-label-2")
    .trim();
  profileChart.options.scales.y.grid.color = style
    .getPropertyValue("--st-separator")
    .trim();
  profileChart.update();
}
themeChart();
document.addEventListener("lab:theme", themeChart);

// ----------------------------------------------------
// UI 요소 및 해수면 애니메이션 로직
// ----------------------------------------------------
const sizeInput = document.getElementById("brushSize");
const sizeVal = document.getElementById("sizeVal");
const powerInput = document.getElementById("brushPower");
const powerVal = document.getElementById("powerVal");
const seaInput = document.getElementById("seaLevel");
const seaVal = document.getElementById("seaVal");
const sunInput = document.getElementById("sunElevation");
const sunVal = document.getElementById("sunVal");

let targetSeaLevel = 5;

sizeInput.oninput = () => (sizeVal.innerText = sizeInput.value);
powerInput.oninput = () => (powerVal.innerText = powerInput.value);
seaInput.oninput = () => {
  targetSeaLevel = parseFloat(seaInput.value);
  if (motionPaused) {
    water.position.y = targetSeaLevel;
    seaVal.innerText = Math.round(targetSeaLevel) + " 단위";
  }
};
sunInput.oninput = () => {
  sunVal.innerText = sunInput.value + "°";
  updateSun();
};

// 기후 시나리오 버튼
const btnIce = document.getElementById("btnIceAge");
const btnPre = document.getElementById("btnPresent");
const btnWrm = document.getElementById("btnWarming");
function clearScenario() {
  btnIce.classList.remove("active-ice");
  btnPre.style.color = "";
  btnPre.style.borderColor = "";
  btnWrm.classList.remove("active-warm");
}

btnIce.onclick = () => {
  clearScenario();
  btnIce.classList.add("active-ice");
  targetSeaLevel = -15;
  seaInput.value = -15;
  seaInput.dispatchEvent(new Event("input"));
};
btnPre.onclick = () => {
  clearScenario();
  btnPre.style.color = "var(--ink)";
  btnPre.style.borderColor = "var(--ink)";
  targetSeaLevel = 5;
  seaInput.value = 5;
  seaInput.dispatchEvent(new Event("input"));
};
btnWrm.onclick = () => {
  clearScenario();
  btnWrm.classList.add("active-warm");
  targetSeaLevel = 25;
  seaInput.value = 25;
  seaInput.dispatchEvent(new Event("input"));
};

let currentTool = "raise";
const guideBadge = document.getElementById("guideBadge");

// 아이콘 문자열
const svgPointer = `<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>`;
const svgScissors = `<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;

document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.onclick = () => {
    document
      .querySelectorAll(".tool-btn[data-tool]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.dataset.tool;
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));

    if (currentTool === "section") {
      guideBadge.innerHTML = `${svgScissors} <span style="color:var(--accent);">지도 위에 선을 그어 단면도를 추출하세요</span>`;
    } else {
      guideBadge.innerHTML = `${svgPointer} <span>드래그: 지형 조작 · 시점 회전 도구로 각도 변경</span>`;
    }
  };
});

// ----------------------------------------------------
// Three.js 엔진
// ----------------------------------------------------
const container = document.getElementById("webgl-container");
const scene = new THREE.Scene();
SceneVisual.theme(scene);
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  2000,
);
camera.position.set(200, 150, 200);

const renderer = Lab.createRenderer(THREE, {
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(container.clientWidth, container.clientHeight);
// 밝은 곳이 하얗게 타지 않도록 밝기 압축과 색공간을 지정한다
if (THREE.ACESFilmicToneMapping) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}
if ("outputColorSpace" in renderer && THREE.SRGBColorSpace)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
else if ("outputEncoding" in renderer && THREE.sRGBEncoding)
  renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.01;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;

const sky = new THREE.Sky();
sky.scale.setScalar(10000);
sky.visible = false;
scene.add(sky);
const skyUniforms = sky.material.uniforms;
skyUniforms["turbidity"].value = 10;
skyUniforms["rayleigh"].value = 2;
skyUniforms["mieCoefficient"].value = 0.005;
skyUniforms["mieDirectionalG"].value = 0.8;

const sun = new THREE.Vector3();
const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 1000;
dirLight.shadow.camera.left = -150;
dirLight.shadow.camera.right = 150;
dirLight.shadow.camera.top = 150;
dirLight.shadow.camera.bottom = -150;
scene.add(dirLight);
scene.add(new THREE.HemisphereLight(0xdce8f6, 0x726b5e, 0.75));

const waterGeometry = new THREE.PlaneGeometry(270, 270);
const water = new THREE.Water(waterGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: new THREE.TextureLoader().load(
    "assets/sim-vendor/waternormals.jpg",
    function (texture) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    },
  ),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff,
  waterColor: 0x315d58,
  distortionScale: 3.7,
  fog: scene.fog !== undefined,
});
water.rotation.x = -Math.PI / 2;
water.position.y = 5;
scene.add(water);
SceneVisual.calmWater(water);

function updateSun() {
  const phi = THREE.MathUtils.degToRad(90 - sunInput.value);
  const theta = THREE.MathUtils.degToRad(45);
  sun.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms["sunPosition"].value.copy(sun);
  dirLight.position.copy(sun).multiplyScalar(200);
  water.material.uniforms["sunDirection"].value.copy(sun).normalize();
}

const simplex = new SimplexNoise("geographia-fieldwork");
const terrainSize = 200;
const resolution = 128;
const geometry = new THREE.PlaneGeometry(
  terrainSize,
  terrainSize,
  resolution,
  resolution,
);
geometry.rotateX(-Math.PI / 2);

const material = SceneVisual.photoSurface(geometry);
const terrain = new THREE.Mesh(geometry, material);
terrain.castShadow = true;
terrain.receiveShadow = true;
scene.add(terrain);

const positionAttribute = geometry.attributes.position;
const colors = [];
const baseHeights = [];
const colorPalette = {
  deepWater: new THREE.Color(0x1e3a8a),
  sand: new THREE.Color(0xcbbd88),
  grass: new THREE.Color(0x819568),
  forest: new THREE.Color(0x3f6854),
  rock: new THREE.Color(0x92968a),
  snow: new THREE.Color(0xf8fafc),
};

function updateTerrainColors() {
  const colorAttr = geometry.attributes.color;
  let c = new THREE.Color();
  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    c.copy(colorPalette.rock).multiplyScalar(
      0.75 +
        (simplex.noise2D(
          positionAttribute.getX(i) / 24,
          positionAttribute.getZ(i) / 24,
        ) +
          1) *
          0.1,
    );
    colorAttr.setXYZ(i, c.r, c.g, c.b);
  }
  colorAttr.needsUpdate = true;
  SceneVisual.surfaceData(geometry, { water: targetSeaLevel });
  updateMetrics();
  if (sectionLine.visible) extractProfileAndGraph();
  clearTimeout(contourTimer);
  contourTimer = setTimeout(updateContours, 100);
  Lab.changed();
}

function generateTerrain() {
  terrainSource = "seed";
  smoothingSteps = 0;
  sectionLine.visible = false;
  updateChart([]);
  const seed = seededRandom(terrainSeed)() * 1000;
  colors.length = 0;
  baseHeights.length = 0;
  for (let i = 0; i < positionAttribute.count; i++) {
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);
    let y = simplex.noise2D(x / 50 + seed, z / 50 + seed) * 15;
    y += simplex.noise2D(x / 20 + seed, z / 20 + seed) * 5;
    y += 20 * Math.exp(-(x * x + z * z) / 3800);
    if (y < 0) y *= 0.3;
    positionAttribute.setY(i, y);
    baseHeights.push(y);
    colors.push(1, 1, 1);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();
  btnPre.click();
}

function generateBaekdu() {
  terrainSource = "caldera";
  smoothingSteps = 0;
  sectionLine.visible = false;
  updateChart([]);
  colors.length = 0;
  baseHeights.length = 0;
  for (let i = 0; i < positionAttribute.count; i++) {
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);
    const dist = Math.sqrt(x * x + z * z);
    let y = 0;
    if (dist < 80) y = Math.cos((dist / 80) * (Math.PI / 2)) * 45;
    if (dist < 25) y -= (25 - dist) * 1.8;
    y += simplex.noise2D(x / 10, z / 10) * 2;
    if (y < -5) y = -5;
    positionAttribute.setY(i, y);
    baseHeights.push(y);
    colors.push(1, 1, 1);
  }
  if (!geometry.attributes.color)
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();

  clearScenario();
  targetSeaLevel = 28;
  seaInput.value = 28;
  seaInput.dispatchEvent(new Event("input"));
  document
    .querySelectorAll(".tool-btn:not([data-tool])")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("btnBaekdu").classList.add("active");
}

function loadDEM(imageUrl) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = function () {
    remember();
    terrainSource = "image";
    smoothingSteps = 0;
    sectionLine.visible = false;
    updateChart([]);
    const imgCanvas = document.createElement("canvas");
    imgCanvas.width = resolution + 1;
    imgCanvas.height = resolution + 1;
    const imgCtx = imgCanvas.getContext("2d");
    imgCtx.drawImage(img, 0, 0, imgCanvas.width, imgCanvas.height);
    const data = imgCtx.getImageData(
      0,
      0,
      imgCanvas.width,
      imgCanvas.height,
    ).data;
    baseHeights.length = 0;
    colors.length = 0;
    for (let i = 0; i < positionAttribute.count; i++) {
      const px = i * 4;
      const brightness = (data[px] + data[px + 1] + data[px + 2]) / 3;
      let height = (brightness / 255) * 80 - 10;
      positionAttribute.setY(i, height);
      baseHeights.push(height);
      colors.push(1, 1, 1);
    }
    if (!geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    updateTerrainColors();

    clearScenario();
    targetSeaLevel = 0;
    seaInput.value = 0;
    seaInput.dispatchEvent(new Event("input"));
    document
      .querySelectorAll(".tool-btn:not([data-tool])")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById("btnKorea").classList.add("active");
  };
  img.onerror = function () {
    document.getElementById("infoText").textContent =
      "한반도 지형을 불러오지 못했습니다. 잠시 후 다시 선택해 주세요. 현재 지형은 계속 탐구할 수 있습니다.";
  };
  img.src = imageUrl;
}

document.getElementById("btnBaekdu").onclick = generateBaekdu;
document.getElementById("btnKorea").onclick = () => loadDEM("./korea_dem.jpg");

// ----------------------------------------------------
// ★ 마우스 인터랙션 (브러시 & 단면선 긋기) ★
// ----------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isSculpting = false;
let isDrawingSection = false;
let startPt = new THREE.Vector3();
let endPt = new THREE.Vector3();

const lineMat = new THREE.LineBasicMaterial({
  color: 0xb4502e,
  linewidth: 4,
  depthTest: false,
});
const lineGeo = new THREE.BufferGeometry();
const sectionLine = new THREE.Line(lineGeo, lineMat);
sectionLine.visible = false;
scene.add(sectionLine);

function updateSectionLine() {
  lineGeo.setFromPoints([startPt, endPt]);
  sectionLine.visible = true;
}

function heights() {
  return Array.from({ length: positionAttribute.count }, (_, i) =>
    positionAttribute.getY(i),
  );
}
function extractProfileAndGraph() {
  const grid = heights();
  updateChart(
    Array.from({ length: 50 }, (_, i) =>
      gridSample(
        grid,
        resolution + 1,
        startPt.x + ((endPt.x - startPt.x) * i) / 49,
        startPt.z + ((endPt.z - startPt.z) * i) / 49,
        terrainSize,
      ),
    ),
  );
}
function snapshot() {
  return {
    heights: heights(),
    base: [...baseHeights],
    seed: terrainSeed,
    source: terrainSource,
    steps: smoothingSteps,
    sea: Number(seaInput.value),
  };
}
function updateHistory() {
  document.getElementById("undoTerrain").disabled = !undoStack.length;
  document.getElementById("redoTerrain").disabled = !redoStack.length;
}
function remember() {
  undoStack.push(snapshot());
  if (undoStack.length > 20) undoStack.shift();
  redoStack.length = 0;
  updateHistory();
}
function restoreTerrain(data) {
  terrainSeed = data.seed;
  terrainSource = data.source;
  smoothingSteps = data.steps;
  document.getElementById("terrainSeed").value = terrainSeed;
  baseHeights.splice(0, baseHeights.length, ...data.base);
  for (let i = 0; i < positionAttribute.count; i++)
    positionAttribute.setY(i, data.heights[i]);
  seaInput.value = data.sea;
  seaInput.dispatchEvent(new Event("input"));
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();
  updateHistory();
  Lab.invalidate();
}
let contourLines;
function updateContours() {
  if (contourLines) {
    scene.remove(contourLines);
    contourLines.geometry.dispose();
    contourLines.material.dispose();
    contourLines = null;
  }
  if (!document.getElementById("contourToggle").checked) {
    Lab.invalidate();
    return;
  }
  const grid = heights(),
    vertices = [],
    stats = terrainStats(grid, resolution + 1, Number(seaInput.value));
  for (let level = Math.ceil(stats.min / 5) * 5; level <= stats.max; level += 5)
    for (const [a, b] of contourSegments(
      grid,
      resolution + 1,
      level,
      terrainSize,
    ))
      vertices.push(a[0], level + 0.16, a[1], b[0], level + 0.16, b[1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  contourLines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xeff0b8,
      transparent: true,
      opacity: 0.75,
    }),
  );
  scene.add(contourLines);
  Lab.invalidate();
}
let lastBrush = null,
  flattenTarget = 0;
function sculpt(point, multiplier = 0.2) {
  const radius = Number(sizeInput.value),
    power = Number(powerInput.value);
  for (let i = 0; i < positionAttribute.count; i++) {
    const dist = Math.hypot(
      positionAttribute.getX(i) - point.x,
      positionAttribute.getZ(i) - point.z,
    );
    if (dist >= radius) continue;
    const weight = Math.cos(((dist / radius) * Math.PI) / 2),
      y = positionAttribute.getY(i);
    const next =
      currentTool === "flatten"
        ? y + (flattenTarget - y) * weight * 0.1
        : y + (currentTool === "raise" ? 1 : -1) * weight * power * multiplier;
    positionAttribute.setY(i, Math.min(150, Math.max(-150, next)));
  }
}
function handlePointer(event, type) {
  if (
    currentTool === "orbit" ||
    (type === "move" && !isSculpting && !isDrawingSection)
  )
    return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = renderer.isFallback
    ? {
        point: new THREE.Vector3(
          (mouse.x * terrainSize) / 2,
          gridSample(
            heights(),
            resolution + 1,
            (mouse.x * terrainSize) / 2,
            (-mouse.y * terrainSize) / 2,
            terrainSize,
          ),
          (-mouse.y * terrainSize) / 2,
        ),
      }
    : raycaster.intersectObject(terrain)[0];
  if (hit) {
    const point = hit.point;
    if (currentTool === "section") {
      if (type === "down") {
        isDrawingSection = true;
        controls.enabled = false;
        startPt.copy(point);
        endPt.copy(point);
        updateSectionLine();
      } else if (type === "move" && isDrawingSection) {
        endPt.copy(point);
        updateSectionLine();
      }
    } else if (type === "down" || (type === "move" && isSculpting)) {
      if (type === "down") {
        remember();
        isSculpting = true;
        controls.enabled = false;
        lastBrush = point.clone();
        flattenTarget = point.y;
        sculpt(point);
      } else {
        const distance = Math.hypot(
            point.x - lastBrush.x,
            point.z - lastBrush.z,
          ),
          spacing = Math.max(1, Number(sizeInput.value) * 0.2),
          count = Math.floor(distance / spacing);
        if (count) {
          const origin = lastBrush.clone();
          for (let i = 1; i <= count; i++) {
            lastBrush.copy(origin).lerp(point, (i * spacing) / distance);
            sculpt(lastBrush);
          }
        }
      }
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      updateTerrainColors();
    }
  }
  if (type === "up") {
    if (isDrawingSection) extractProfileAndGraph();
    isSculpting = false;
    isDrawingSection = false;
    controls.enabled = true;
    lastBrush = null;
  }
  Lab.invalidate();
}

container.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button === 0) {
      if (currentTool !== "orbit")
        renderer.domElement.setPointerCapture(e.pointerId);
      handlePointer(e, "down");
    }
  },
  true,
);
container.addEventListener("pointermove", (e) => {
  handlePointer(e, "move");
});
window.addEventListener("pointerup", (e) => {
  handlePointer(e, "up");
  updateMetrics();
});
container.addEventListener("pointercancel", () => {
  isSculpting = false;
  isDrawingSection = false;
  controls.enabled = true;
});

document.getElementById("randomBtn").onclick = () => {
  remember();
  terrainSeed = (terrainSeed % 999999) + 1;
  document.getElementById("terrainSeed").value = terrainSeed;
  sectionLine.visible = false;
  document
    .querySelectorAll(".tool-btn:not([data-tool])")
    .forEach((b) => b.classList.remove("active"));
  generateTerrain();
};
document.getElementById("resetBtn").onclick = () => {
  remember();
  smoothingSteps = 0;
  sectionLine.visible = false;
  updateChart([]);
  for (let i = 0; i < positionAttribute.count; i++)
    positionAttribute.setY(i, baseHeights[i]);
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();
  sectionLine.visible = false;
};

window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ----------------------------------------------------
// ★ 메인 렌더링 루프 ★
// ----------------------------------------------------
function animate(timestamp) {
  const dt = clock.tick(timestamp, !motionPaused && !document.hidden);
  water.material.uniforms["time"].value += dt;

  if (Math.abs(water.position.y - targetSeaLevel) > 0.05) {
    water.position.y = approach(water.position.y, targetSeaLevel, 0.05, dt);
    seaVal.innerText = Math.round(water.position.y) + " 단위";
  }

  controls.update();
  renderer.render(scene, camera);
}

updateSun();
generateTerrain();

const grid = new THREE.GridHelper(300, 24, 0x587262, 0x29483d);
grid.position.y = -25;
grid.visible = false;
scene.add(grid);
scene.add(new THREE.HemisphereLight(0xe5edcb, 0x334f44, 0.35));
function measure() {
  const stats = terrainStats(
    heights(),
    resolution + 1,
    Number(seaInput.value),
    terrainSize,
  );
  return {
    "지형 시드": terrainSeed,
    "지형 출처": terrainSource,
    "해수면 (모형 단위)": Number(seaInput.value),
    "육지 비율 (%)": +stats.landPercent.toFixed(2),
    "최고 높이": +stats.max.toFixed(3),
    비고: +stats.relief.toFixed(3),
    "평균 경사 (°)": +stats.meanSlope.toFixed(3),
    "사면 완화 횟수": smoothingSteps,
  };
}
function updateMetrics() {
  const m = measure();
  document.getElementById("landValue").innerHTML =
    m["육지 비율 (%)"].toFixed(1) + "<small>%</small>";
  document.getElementById("heightValue").textContent =
    m["최고 높이"].toFixed(1);
  document.getElementById("reliefValue").textContent = m["비고"].toFixed(1);
  document.getElementById("slopeMetric").innerHTML =
    m["평균 경사 (°)"].toFixed(1) + "<small>°</small>";
}

seaInput.addEventListener("input", () => {
  updateMetrics();
  Lab.paintRange(seaInput);
});
document.querySelectorAll("#btnIceAge,#btnPresent,#btnWarming").forEach((b) =>
  b.addEventListener("click", () => {
    document
      .querySelectorAll("#btnIceAge,#btnPresent,#btnWarming")
      .forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
  }),
);
document.getElementById("resetView").onclick = () => {
  camera.position.set(200, 150, 200);
  controls.target.set(0, 0, 0);
};
document.getElementById("centerBrush").onclick = () => {
  if (currentTool === "section") {
    startPt.set(-95, 0, Number(document.getElementById("brushZ").value));
    endPt.set(95, 0, Number(document.getElementById("brushZ").value));
    updateSectionLine();
    extractProfileAndGraph();
    Lab.invalidate();
    return;
  }
  if (currentTool === "orbit") return;
  remember();
  const x = Number(document.getElementById("brushX").value),
    z = Number(document.getElementById("brushZ").value);
  flattenTarget = gridSample(heights(), resolution + 1, x, z, terrainSize);
  sculpt({ x, z }, 0.8);
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();
};

new ResizeObserver(() => {
  const w = container.clientWidth,
    h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  Lab.invalidate?.();
}).observe(container);
updateMetrics();
document.getElementById("applySeed").onclick = () => {
  const value = Number(document.getElementById("terrainSeed").value);
  if (!Number.isInteger(value) || value < 1 || value > 999999) {
    document.getElementById("massBalance").textContent =
      "시드는 1~999999의 정수로 입력하세요.";
    return;
  }
  remember();
  terrainSeed = value;
  generateTerrain();
};
document.getElementById("undoTerrain").onclick = () => {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restoreTerrain(undoStack.pop());
};
document.getElementById("redoTerrain").onclick = () => {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restoreTerrain(redoStack.pop());
};
document.getElementById("planView").onclick = () => {
  camera.position.set(0, 265, 0.01);
  controls.target.set(0, 0, 0);
  controls.update();
  Lab.invalidate();
};
document
  .getElementById("contourToggle")
  .addEventListener("change", updateContours);
const originalBaekdu = document.getElementById("btnBaekdu").onclick;
document.getElementById("btnBaekdu").onclick = () => {
  remember();
  originalBaekdu();
};
document.getElementById("smoothTerrain").onclick = () => {
  remember();
  const before = heights(),
    sum = before.reduce((a, b) => a + b, 0),
    next = diffuseTerrain(before, resolution + 1, 0.12, 10);
  for (let i = 0; i < next.length; i++) positionAttribute.setY(i, next[i]);
  smoothingSteps += 10;
  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  updateTerrainColors();
  const after = heights().reduce((a, b) => a + b, 0);
  document.getElementById("massBalance").textContent =
    "높이 합 변화: " +
    (after - sum).toExponential(2) +
    " · 닫힌 영역의 부동소수점 오차";
};
function validateExtra(data) {
  return (
    data &&
    Number.isInteger(data.seed) &&
    data.seed >= 1 &&
    data.seed <= 999999 &&
    ["seed", "caldera", "image"].includes(data.source) &&
    Number.isInteger(data.steps) &&
    data.steps >= 0 &&
    Number.isFinite(data.sea) &&
    data.sea >= -20 &&
    data.sea <= 50 &&
    ["heights", "base"].every(
      (key) =>
        Array.isArray(data[key]) &&
        data[key].length === positionAttribute.count &&
        data[key].every((v) => Number.isFinite(v) && v >= -150 && v <= 150),
    )
  );
}
function packed() {
  const data = snapshot();
  return {
    ...data,
    encoding: "f32le-base64",
    heights: encodeGrid(data.heights),
    base: encodeGrid(data.base),
  };
}
function unpack(data) {
  if (data?.encoding !== "f32le-base64")
    throw new Error("지원하지 않는 격자 형식입니다.");
  return {
    ...data,
    heights: decodeGrid(data.heights, positionAttribute.count),
    base: decodeGrid(data.base, positionAttribute.count),
  };
}
const flatMap = document.createElement("canvas");
flatMap.width = flatMap.height = resolution + 1;
let mapImage;
function drawFlat(ctx, w, h) {
  const side = resolution + 1;
  if (!mapImage)
    mapImage = flatMap.getContext("2d").createImageData(side, side);
  const grid = heights();
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i],
      under = value < Number(seaInput.value),
      c = under
        ? [42, 85, 92]
        : [
            100 + Math.min(100, value * 2),
            126 + Math.min(90, value),
            88 + Math.min(80, value),
          ];
    mapImage.data.set([...c, 255], i * 4);
  }
  flatMap.getContext("2d").putImageData(mapImage, 0, 0);
  ctx.drawImage(flatMap, 0, 0, w, h);
  ctx.fillStyle = "#102827db";
  ctx.fillRect(0, 0, w, 45);
  ctx.fillStyle = "#edf2d5";
  ctx.font = "13px sans-serif";
  ctx.fillText("2D 평면 고도 · 밝을수록 높은 땅 / 파랑은 수면 아래", 16, 28);
}
Lab.register({
  fallback: drawFlat,
  measure,
  serialize: packed,
  normalizeState(state) {
    state.inputs.terrainSeed = String(terrainSeed);
  },
  validate(data) {
    try {
      return validateExtra(unpack(data));
    } catch {
      return false;
    }
  },
  restore(data) {
    remember();
    restoreTerrain(unpack(data));
  },
  pause() {
    motionPaused = true;
    renderMotionButton();
    water.position.y = targetSeaLevel;
    seaVal.innerText = targetSeaLevel + " 단위";
  },
});
Lab.renderLoop(animate, {
  element: container,
  renderer,
  controls,
  active: () => !motionPaused || isSculpting || isDrawingSection,
});
Lab.ready();
