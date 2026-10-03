import { createElapsedClock, approach } from "./simulation-time.mjs?v=422c4a21";
const clock = createElapsedClock();
let motionPaused = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
const ctxChart = document.getElementById("profileChart").getContext("2d");
let profileChart = new Chart(ctxChart, {
  type: "line",
  data: {
    labels: Array(50).fill(""),
    datasets: [
      {
        label: "모형 고도(m)",
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
    seaVal.innerText = Math.round(targetSeaLevel) + "m";
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
scene.background = new THREE.Color(0x102827);
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  2000,
);
camera.position.set(200, 150, 200);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(container.clientWidth, container.clientHeight);
// 밝은 곳이 하얗게 타지 않도록 밝기 압축과 색공간을 지정한다
if (THREE.ACESFilmicToneMapping) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
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
const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
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
scene.add(new THREE.AmbientLight(0x404040, 0.6));

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

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.8,
  metalness: 0.05,
  flatShading: false,
});
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
    if (y < -2) c.copy(colorPalette.sand).lerp(colorPalette.deepWater, 0.5);
    else if (y < 2) c.copy(colorPalette.sand);
    else if (y < 12)
      c.copy(colorPalette.grass).lerp(colorPalette.forest, (y - 2) / 10);
    else if (y < 22)
      c.copy(colorPalette.forest).lerp(colorPalette.rock, (y - 12) / 10);
    else
      c.copy(colorPalette.rock).lerp(
        colorPalette.snow,
        Math.min((y - 22) / 5, 1),
      );
    colorAttr.setXYZ(i, c.r, c.g, c.b);
  }
  colorAttr.needsUpdate = true;
  updateMetrics();
  if (sectionLine.visible) extractProfileAndGraph();
}

function generateTerrain() {
  sectionLine.visible = false;
  updateChart([]);
  const seed = Math.random() * 1000;
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

function extractProfileAndGraph() {
  const samples = 50;
  const heightsData = [];
  const downRay = new THREE.Raycaster();
  const dirDown = new THREE.Vector3(0, -1, 0);

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const px = startPt.x + (endPt.x - startPt.x) * t;
    const pz = startPt.z + (endPt.z - startPt.z) * t;

    downRay.set(new THREE.Vector3(px, 500, pz), dirDown);
    const hits = downRay.intersectObject(terrain);
    if (hits.length > 0) {
      heightsData.push(Math.round(hits[0].point.y * 10) / 10);
    } else {
      heightsData.push(0);
    }
  }
  updateChart(heightsData);
}

function handlePointer(event, type) {
  if (currentTool === "orbit") return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(terrain);

  if (intersects.length > 0) {
    const point = intersects[0].point;

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
      } else if (type === "up" && isDrawingSection) {
        isDrawingSection = false;
        controls.enabled = true;
        extractProfileAndGraph();
      }
    } else {
      if (type === "down" || (type === "move" && isSculpting)) {
        if (type === "down") {
          isSculpting = true;
          controls.enabled = false;
        }
        const bSize = parseFloat(sizeInput.value);
        const bPower = parseFloat(powerInput.value);
        for (let i = 0; i < positionAttribute.count; i++) {
          const vx = positionAttribute.getX(i);
          const vz = positionAttribute.getZ(i);
          const vy = positionAttribute.getY(i);
          const dist = Math.sqrt((vx - point.x) ** 2 + (vz - point.z) ** 2);
          if (dist < bSize) {
            const influence = Math.cos((dist / bSize) * (Math.PI / 2));
            let newY = vy;
            if (currentTool === "raise") newY += influence * bPower * 0.2;
            else if (currentTool === "lower") newY -= influence * bPower * 0.2;
            else if (currentTool === "flatten")
              newY += (point.y - vy) * influence * 0.1;
            positionAttribute.setY(i, newY);
          }
        }
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        updateTerrainColors();
      }
    }
  }
  if (type === "up") {
    if (isDrawingSection) extractProfileAndGraph();
    isSculpting = false;
    isDrawingSection = false;
    controls.enabled = true;
  }
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
  sectionLine.visible = false;
  document
    .querySelectorAll(".tool-btn:not([data-tool])")
    .forEach((b) => b.classList.remove("active"));
  generateTerrain();
};
document.getElementById("resetBtn").onclick = () => {
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
  requestAnimationFrame(animate);
  const dt = clock.tick(timestamp, !motionPaused && !document.hidden);
  water.material.uniforms["time"].value += dt;

  if (Math.abs(water.position.y - targetSeaLevel) > 0.05) {
    water.position.y = approach(water.position.y, targetSeaLevel, 0.05, dt);
    seaVal.innerText = Math.round(water.position.y) + "m";
  }

  controls.update();
  renderer.render(scene, camera);
}

updateSun();
generateTerrain();
animate();

const grid = new THREE.GridHelper(300, 24, 0x587262, 0x29483d);
grid.position.y = -25;
scene.add(grid);
scene.add(new THREE.HemisphereLight(0xe5edcb, 0x334f44, 0.35));
function updateMetrics() {
  let above = 0,
    highest = -Infinity;
  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    if (y > Number(seaInput.value)) above++;
    highest = Math.max(highest, y);
  }
  document.getElementById("landValue").innerHTML =
    ((above / positionAttribute.count) * 100).toFixed(0) + "<small>%</small>";
  document.getElementById("heightValue").innerHTML =
    highest.toFixed(1) + "<small>m</small>";
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
    startPt.set(-95, 0, 0);
    endPt.set(95, 0, 0);
    updateSectionLine();
    extractProfileAndGraph();
    return;
  }
  if (currentTool === "orbit") return;
  const radius = Number(sizeInput.value),
    power = Number(powerInput.value),
    middle = positionAttribute.getY(Math.floor(positionAttribute.count / 2));
  for (let i = 0; i < positionAttribute.count; i++) {
    const d = Math.hypot(positionAttribute.getX(i), positionAttribute.getZ(i));
    if (d >= radius) continue;
    const weight = Math.cos(((d / radius) * Math.PI) / 2),
      y = positionAttribute.getY(i);
    positionAttribute.setY(
      i,
      currentTool === "flatten"
        ? y + (middle - y) * weight * 0.1
        : y + (currentTool === "raise" ? 1 : -1) * weight * power * 0.8,
    );
  }
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
}).observe(container);
updateMetrics();
Lab.ready();
