(() => {
  // ====================================================
  // ★ 렌더링 엔진 (사실적 세팅) ★
  // ====================================================
  const container = document.getElementById("webgl-container");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102827);
  scene.background = new THREE.Color(0x102827);
  scene.fog = new THREE.Fog(0x102827, 600, 1300);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    3000,
  );
  camera.position.set(0, 150, 400);

  const renderer = Lab.createRenderer(THREE, {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.autoRotate =
    document.getElementById("rotateToggle")?.checked || false;
  controls.autoRotateSpeed = 0.32;

  const sun = new THREE.DirectionalLight(0xfff3df, 0.9);
  sun.position.set(120, 205, 85);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd6ea, 0x4a4030, 0.42));
  scene.add(new THREE.AmbientLight(0x6b6b66, 0.16));

  const sky = new THREE.Sky();
  sky.scale.setScalar(10000);
  sky.visible = false;
  scene.add(sky);
  sky.material.uniforms["turbidity"].value = 8;
  sky.material.uniforms["rayleigh"].value = 1.6;
  sky.material.uniforms["mieCoefficient"].value = 0.005;
  sky.material.uniforms["mieDirectionalG"].value = 0.8;
  sky.material.uniforms["sunPosition"].value.copy(
    sun.position.clone().normalize(),
  );

  const simplex = new SimplexNoise("geographia-fieldwork");
  const n = (x, z, f) => simplex.noise2D(x / f, z / f);
  const detail = (x, z) => n(x, z, 6.5) * 0.75 + n(x, z, 2.8) * 0.35;

  // ====================================================
  // ★ 바다(공용) ★
  // ====================================================
  const water = new THREE.Water(new THREE.PlaneGeometry(320, 320), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      "assets/sim-vendor/waternormals.jpg",
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
      },
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x274f63,
    distortionScale: 2.4,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = -100;
  scene.add(water);
  water.material.uniforms["sunDirection"].value.copy(
    sun.position.clone().normalize(),
  );

  // 지층 블록용 반투명 바다 (가라앉은 지층이 물 속으로 비쳐 보이도록)
  const simpleSea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({
      color: 0x527f86,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
  );
  simpleSea.rotation.x = -Math.PI / 2;
  simpleSea.position.y = -100;
  simpleSea.visible = false;
  scene.add(simpleSea);

  // ====================================================
  // ★ 외적 작용용 지형 (하천: 산→바다) ★
  // ====================================================
  const resolution = 170,
    size = 250;
  const tGeo = new THREE.PlaneGeometry(size, size, resolution, resolution);
  tGeo.rotateX(-Math.PI / 2);
  const tPos = tGeo.attributes.position;
  const tColorAttr = new THREE.BufferAttribute(
    new Float32Array(tPos.count * 3),
    3,
  );
  tGeo.setAttribute("color", tColorAttr);
  const targetHeights = new Float32Array(tPos.count);
  const curCol = [],
    tarCol = [];
  for (let i = 0; i < tPos.count; i++) {
    tPos.setY(i, 0);
    targetHeights[i] = 0;
    curCol.push(new THREE.Color(0x6f8f5a));
    tarCol.push(new THREE.Color(0x6f8f5a));
    tColorAttr.setXYZ(i, 0.43, 0.56, 0.35);
  }
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: false,
    }),
  );
  terrain.castShadow = terrain.receiveShadow = true;
  terrain.visible = false;
  scene.add(terrain);

  // 산→바다 기본 단면 + 산지(풍화로 거칠어진 정상부)
  function extBase(x, z) {
    let y = 56 - 0.32 * (x + 112);
    const m = Math.max(0, Math.min(1, (-38 - x) / 82)); // 산지 가중치(상류일수록 1)
    y += (n(x, z, 42) * 17 + n(x, z, 19) * 8) * m; // 산지 능선
    y += Math.abs(n(x, z, 4)) * 4 * m; // 풍화로 부서진 거친 표면
    y += n(x, z, 80) * 1.8;
    return y;
  }
  const chZone = (x) => (x < -26 ? 0 : x < 34 ? 1 : 2); // 0 상류 / 1 중류 / 2 하류
  const meanderZ = (x) =>
    x < -26
      ? 0
      : x < 34
        ? 15 * Math.sin((x + 26) / 19)
        : 22 * Math.sin((x + 26) / 25);
  function channelAt(x, z, front) {
    const zone = chZone(x);
    if (x > front) return { carve: 0, dzN: 1, zone };
    let depth, hw, vsh;
    if (zone === 0) {
      depth = 26;
      hw = 9;
      vsh = true;
    } // 상류 깊은 V
    else if (zone === 1) {
      depth = 14;
      hw = 15;
      vsh = false;
    } // 중류
    else {
      depth = 7;
      hw = 24;
      vsh = false;
    } // 하류 넓고 얕음
    const dz = Math.abs(z - meanderZ(x));
    if (dz > hw) return { carve: 0, dzN: 1, zone };
    const t = dz / hw;
    return {
      carve: -depth * (vsh ? 1 - t : Math.pow(1 - t, 0.55)),
      dzN: t,
      zone,
    };
  }
  function deltaFan(x, z) {
    const mx = 58;
    if (x < mx) return 0;
    const a = (x - mx) / 42;
    if (a > 1) return 0;
    const halfw = 10 + a * 50;
    const dz = Math.abs(z - 22 * Math.sin((x + 26) / 25) * (1 - a * 0.5));
    if (dz > halfw) return 0;
    return 13 * (1 - dz / halfw) * (1 - a * 0.5);
  }
  // 과정별 또렷한 색 — 풍화(회색 암설)·침식(갈색 바위 사면)·운반(강)·퇴적(황록 평야·황금 모래)
  function extColor(x, z, y, front, delta) {
    const ci = channelAt(x, z, front);
    if (ci.carve < -1.2 && ci.dzN < 0.55) {
      if (ci.zone === 0) return new THREE.Color(0x4f9ad0); // 상류 맑은 물
      if (ci.zone === 1) return new THREE.Color(0x6d8aa0); // 중류(약간 탁함)
      return new THREE.Color(0x97916f); // 하류 흙탕물(운반·퇴적물 많음)
    }
    if (delta && deltaFan(x, z) > 0.6 && y < 12)
      return new THREE.Color(0xcdb15e); // 삼각주 모래톱
    if (y > 46) return new THREE.Color(0x837b6f); // 정상 풍화 암설(회색)
    if (y > 22)
      return new THREE.Color(0x6a5942).lerp(
        new THREE.Color(0x8a745a),
        (n(x, z, 9) + 1) * 0.5,
      ); // 바위 사면(침식·갈색)
    if (y > 8)
      return new THREE.Color(0x55893a).lerp(
        new THREE.Color(0x32591f),
        (y - 8) / 14,
      ); // 식생 사면
    if (y > 2) return new THREE.Color(0x90a64a); // 범람원(퇴적 평야·황록)
    return new THREE.Color(0xceb368); // 하안·해안 모래(퇴적·황금)
  }
  const riverStage = (front, delta) => ({
    h: (x, z) =>
      extBase(x, z) +
      channelAt(x, z, front).carve +
      (delta ? deltaFan(x, z) : 0),
    color: (x, z, y) => extColor(x, z, y, front, delta),
  });

  // ====================================================
  // ★ 내적 작용용 지층 블록 (단면에 색층이 보임) ★
  // ====================================================
  const BW = 210,
    BH = 50,
    BD = 120;
  const bGeo = new THREE.BoxGeometry(BW, BH, BD, 108, 16, 3);
  const bPos = bGeo.attributes.position;
  const bRest = new Float32Array(bPos.count * 3);
  const bTarget = new Float32Array(bPos.count * 3);
  const bColorAttr = new THREE.BufferAttribute(
    new Float32Array(bPos.count * 3),
    3,
  );
  bGeo.setAttribute("color", bColorAttr);
  const strata = [
    0x5b4a37, 0x856a49, 0xb89b6d, 0x9a8456, 0xc9b487, 0x7c6648, 0x728a48,
  ];
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i),
      y = bPos.getY(i),
      z = bPos.getZ(i);
    bRest[i * 3] = x;
    bRest[i * 3 + 1] = y;
    bRest[i * 3 + 2] = z;
    bTarget[i * 3] = x;
    bTarget[i * 3 + 1] = y;
    bTarget[i * 3 + 2] = z;
    const t = (y + BH / 2) / BH;
    const c = new THREE.Color(strata[Math.min(6, Math.floor(t * 7))]);
    c.multiplyScalar(0.9 + (n(x, z, 14) + 1) * 0.1);
    bColorAttr.setXYZ(i, c.r, c.g, c.b);
  }
  const blockMesh = new THREE.Mesh(
    bGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false,
    }),
  );
  blockMesh.position.y = -BH / 2; // 윗면이 월드 y=0
  blockMesh.castShadow = blockMesh.receiveShadow = true;
  blockMesh.visible = false;
  scene.add(blockMesh);

  // 변형 함수 (rest 좌표 → 목표 좌표). 월드 y = local + (-BH/2)
  const dFlat = (x, y, z) => [x, y, z];
  const dUplift = (x, y, z) => [x, y + 22 + 6 * Math.cos(x / 70), z];
  const dSubside = (x, y, z) => [
    x,
    y - 2 - 18 * Math.max(0, Math.cos(x / 46)),
    z,
  ];
  const dFold = (x, y, z) => [x * 0.82, y + 15 * Math.cos(x / 19), z];
  const dFault = (x, y, z) => (x > 0 ? [x + 7, y - 18, z] : [x, y, z]);

  // ====================================================
  // ★ 시나리오 ★
  // ====================================================
  const scenarios = {
    uplift: {
      kind: "block",
      cat: "§ 내적 작용 · 융기",
      title: "융기 — 솟아오름",
      force: "in",
      forceLabel: "내적 작용",
      example: "히말라야의 <b>해양 퇴적층</b>이 산 위에서 발견되는 까닭",
      cam: [70, 60, 185],
      stages: [
        {
          tag: "단계 1",
          name: "바다 밑 수평 퇴적층",
          sea: 6,
          deform: dFlat,
          d: "오랜 세월 바다 밑에 퇴적물이 수평으로 쌓여 지층(색층)을 이룹니다.",
          labels: [{ t: "수평 퇴적층", s: "", x: 0, z: 62, y: 2 }],
        },
        {
          tag: "단계 2",
          name: "융기 시작",
          sea: 6,
          deform: (x, y, z) => [x, y + 11 + 3 * Math.cos(x / 70), z],
          d: "지구 내부의 힘이 지층을 위로 밀어 올리기 시작합니다.",
          labels: [{ t: "융기", s: "솟아오르는 중", x: 0, z: 62, y: 16 }],
        },
        {
          tag: "단계 3",
          name: "육지로 솟아오른 지층",
          sea: 6,
          deform: dUplift,
          d: "지층이 해수면 위로 솟아 육지가 됩니다. 그래서 산 위에서도 바다 퇴적층이 발견됩니다.",
          labels: [{ t: "융기한 지층", s: "해수면 위로", x: 0, z: 62, y: 30 }],
        },
      ],
    },
    subside: {
      kind: "block",
      cat: "§ 내적 작용 · 침강",
      title: "침강 — 가라앉음",
      force: "in",
      forceLabel: "내적 작용",
      example: "가라앉은 땅에 물이 차는 <b>침강 분지</b>",
      cam: [62, 82, 178],
      stages: [
        {
          tag: "단계 1",
          name: "평탄한 지층",
          sea: -8,
          deform: dFlat,
          d: "수평으로 쌓인 지층이 육지를 이루고 있습니다.",
          labels: [{ t: "수평 지층", s: "", x: 0, z: 62, y: 2 }],
        },
        {
          tag: "단계 2",
          name: "침강 시작",
          sea: -8,
          deform: (x, y, z) => [
            x,
            y - 1 - 9 * Math.max(0, Math.cos(x / 46)),
            z,
          ],
          d: "지층의 가운데가 아래로 내려앉기 시작합니다.",
          labels: [{ t: "침강", s: "가라앉는 중", x: 0, z: 62, y: 0 }],
        },
        {
          tag: "단계 3",
          name: "물에 잠긴 분지",
          sea: -8,
          deform: dSubside,
          d: "가운데가 깊이 내려앉고 물이 고여 분지(내해·호수)가 됩니다. 가장자리는 육지로 남습니다.",
          labels: [
            { t: "침강 분지", s: "물이 고인 가운데", x: 0, z: 0, y: -7 },
            { t: "남은 육지", s: "가장자리", x: -88, z: 62, y: -2 },
          ],
        },
      ],
    },
    fold: {
      kind: "block",
      cat: "§ 내적 작용 · 습곡",
      title: "습곡 — 휘어짐",
      force: "in",
      forceLabel: "내적 작용",
      example: "<b>알프스·히말라야</b> 습곡 산맥",
      cam: [52, 46, 188],
      stages: [
        {
          tag: "단계 1",
          name: "수평 지층",
          sea: null,
          deform: dFlat,
          d: "수평으로 쌓인 지층입니다.",
          labels: [{ t: "수평 지층", s: "", x: 0, z: 62, y: 4 }],
        },
        {
          tag: "단계 2",
          name: "양옆에서 미는 힘(횡압력)",
          sea: null,
          deform: (x, y, z) => [x * 0.9, y + 7 * Math.cos(x / 19), z],
          d: "양쪽에서 미는 힘(횡압력)을 받아 지층이 서서히 구부러집니다.",
          labels: [
            { t: "횡압력", s: "미는 힘", x: -86, z: 62, y: 8 },
            { t: "횡압력", s: "미는 힘", x: 86, z: 62, y: 8 },
          ],
        },
        {
          tag: "단계 3",
          name: "물결치는 습곡",
          sea: null,
          deform: dFold,
          d: "지층이 물결처럼 휘어집니다. 위로 볼록한 곳이 ‘배사’, 아래로 오목한 곳이 ‘향사’입니다.",
          labels: [
            { t: "배사", s: "위로 볼록", x: 0, z: 62, y: 18 },
            { t: "향사", s: "아래로 오목", x: 47, z: 62, y: -12 },
          ],
        },
      ],
    },
    fault: {
      kind: "block",
      cat: "§ 내적 작용 · 단층",
      title: "단층 — 끊어짐",
      force: "in",
      forceLabel: "내적 작용",
      example: "땅이 끊겨 어긋난 <b>단층애(절벽)</b>",
      cam: [78, 48, 178],
      stages: [
        {
          tag: "단계 1",
          name: "수평 지층",
          sea: null,
          deform: dFlat,
          d: "수평으로 쌓인 지층입니다.",
          labels: [{ t: "수평 지층", s: "", x: 0, z: 62, y: 4 }],
        },
        {
          tag: "단계 2",
          name: "힘이 쌓임",
          sea: null,
          deform: (x, y, z) => (x > 0 ? [x + 2, y - 5, z] : [x, y, z]),
          d: "지층이 힘을 받아 한쪽이 어긋나기 직전까지 버팁니다.",
          labels: [{ t: "단층면", s: "끊어질 면", x: 2, z: 62, y: 8 }],
        },
        {
          tag: "단계 3",
          name: "끊어져 어긋난 단층",
          sea: null,
          deform: dFault,
          d: "버티던 지층이 단번에 끊어져 한쪽이 아래로 떨어집니다. 그 경계에 생긴 절벽이 ‘단층애’입니다.",
          labels: [
            { t: "단층면", s: "끊어진 경계", x: 4, z: 62, y: 9 },
            { t: "단층애", s: "절벽(낙차)", x: 9, z: 62, y: -7 },
          ],
        },
      ],
    },
    river: {
      kind: "terrain",
      cat: "§ 외적 작용 · 하천의 일생",
      title: "풍화·침식·운반·퇴적",
      force: "ex",
      forceLabel: "외적 작용",
      example: "산 정상 <b>분수계</b>에서 <b>바다</b>까지 이어지는 하나의 흐름",
      cam: [70, 150, 185],
      color: null,
      stages: [
        {
          ...riverStage(-130, false),
          tag: "단계 1 · 풍화",
          name: "풍화 — 암석이 제자리에서 부서짐",
          sea: 0,
          cam: [-18, 78, 122],
          target: [-86, 40, 0],
          d: "산 정상의 단단한 암석이 비·바람·기온 변화에 ‘제자리에서’ 잘게 부서집니다(풍화). 산마루는 물이 좌우로 갈리는 ‘분수계’입니다. 부서진 돌·모래가 다음 과정의 재료가 됩니다.",
          labels: [
            { t: "분수계", s: "물이 갈리는 마루", x: -98, z: 0, y: 60 },
            { t: "풍화", s: "암석이 부서짐", x: -70, z: 28, y: 44 },
          ],
        },
        {
          ...riverStage(-26, false),
          tag: "단계 2 · 침식",
          name: "침식 — 상류에서 깎임(V자곡)",
          sea: 0,
          cam: [16, 60, 116],
          target: [-52, 22, 0],
          d: "경사가 급한 상류에서는 빠른 물이 바닥을 강하게 ‘깎아냅니다’(침식). 깊고 좁은 ‘V자곡’이 파입니다.",
          labels: [{ t: "상류", s: "침식 · V자곡", x: -54, z: 0, y: 26 }],
        },
        {
          ...riverStage(34, false),
          tag: "단계 3 · 운반",
          name: "운반 — 중류에서 실어 나름",
          sea: 0,
          cam: [46, 52, 122],
          target: [2, 12, 0],
          d: "경사가 완만해지는 중류에서는 깎인 자갈·모래를 하류로 ‘실어 나릅니다’(운반). 물길이 구불구불 휘는 ‘곡류’가 나타납니다.",
          labels: [{ t: "중류", s: "운반 · 곡류", x: 4, z: 16, y: 14 }],
        },
        {
          ...riverStage(130, true),
          tag: "단계 4 · 퇴적",
          name: "퇴적 — 하류·바다에 쌓임",
          sea: 0,
          cam: [86, 46, 112],
          target: [50, 2, 0],
          d: "물이 느려지는 하류에서는 나르던 물질을 ‘쌓습니다’(퇴적). 강가에 넓은 ‘범람원’, 바다와 만나는 하구에 ‘삼각주’가 생깁니다.",
          labels: [
            { t: "하류", s: "퇴적 · 범람원", x: 46, z: 0, y: 5 },
            { t: "삼각주", s: "하구 퇴적", x: 80, z: 0, y: 4 },
          ],
        },
        {
          ...riverStage(130, true),
          tag: "단계 5 · 한눈에",
          name: "하나의 강에 모두 이어짐",
          sea: 0,
          cam: [70, 150, 185],
          target: [-6, 8, 0],
          d: "풍화로 부서진 물질이 → 상류에서 깎이고(침식) → 중류에서 옮겨져(운반) → 하류·바다에 쌓입니다(퇴적). 네 과정이 하나의 강줄기에 이어져 나타납니다.",
          labels: [
            { t: "분수계·풍화", s: "", x: -98, z: 0, y: 60 },
            { t: "상류 침식", s: "", x: -54, z: 0, y: 26 },
            { t: "중류 운반", s: "", x: 4, z: 16, y: 14 },
            { t: "하류 퇴적", s: "", x: 46, z: 0, y: 5 },
            { t: "삼각주", s: "", x: 80, z: 0, y: 4 },
          ],
        },
      ],
    },
  };

  // ====================================================
  // ★ 상태 & 단계 적용 ★
  // ====================================================
  const tmpV = new THREE.Vector3();
  let curKey = null,
    curStage = 0,
    autoPlay = false,
    playTimer = null;
  let activeLabels = [];
  const labelLayer = document.getElementById("label-layer");
  let targetCamPos = new THREE.Vector3(0, 150, 400);
  const camTarget = new THREE.Vector3(0, 0, 0);
  let curCam = [0, 150, 400],
    curTgt = [0, 0, 0];
  let targetWaterY = -100;

  // 화면 비율을 반영해 카메라 거리를 정함 — 세로(모바일)일수록 뒤로 빼서 지형 전체가 들어오게
  function frameCamera() {
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const f = 1.45 * Math.max(1, 1.2 / aspect);
    const t = new THREE.Vector3(...curTgt);
    targetCamPos.copy(
      new THREE.Vector3(...curCam).sub(t).multiplyScalar(f).add(t),
    );
    camTarget.copy(t);
  }
  let seaMesh = water;
  let isMovingCamera = false,
    isMorphing = false,
    isBlockMorphing = false;

  function setColor(target, x, z, y, cfn) {
    target.copy(cfn ? cfn(x, z, y) : new THREE.Color(0x6aa84f));
    target.multiplyScalar(0.9 + (n(x, z, 11) + 1) * 0.1);
  }

  function buildLabels(st) {
    labelLayer.innerHTML = "";
    activeLabels = [];
    (st.labels || []).forEach((L) => {
      const el = document.createElement("div");
      el.className = "map-label";
      el.innerHTML =
        '<span class="dot"></span>' +
        L.t +
        (L.s ? " <small>" + L.s + "</small>" : "");
      el.style.opacity = "0";
      labelLayer.appendChild(el);
      const baseY = L.y !== undefined ? L.y : st.h ? st.h(L.x, L.z) : 0;
      activeLabels.push({ el, x: L.x, y: baseY + 9, z: L.z });
      requestAnimationFrame(() =>
        setTimeout(() => (el.style.opacity = "1"), 250),
      );
    });
  }

  function applyStage() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    const sc = scenarios[curKey],
      st = sc.stages[curStage];

    if (sc.kind === "block") {
      terrain.visible = false;
      blockMesh.visible = true;
      for (let i = 0; i < bPos.count; i++) {
        const p = st.deform(bRest[i * 3], bRest[i * 3 + 1], bRest[i * 3 + 2]);
        bTarget[i * 3] = p[0];
        bTarget[i * 3 + 1] = p[1];
        bTarget[i * 3 + 2] = p[2];
      }
      isBlockMorphing = true;
      isMorphing = false;
    } else {
      blockMesh.visible = false;
      terrain.visible = true;
      const cfn = st.color !== undefined ? st.color : sc.color;
      for (let i = 0; i < tPos.count; i++) {
        const x = tPos.getX(i),
          z = tPos.getZ(i);
        const y = st.h(x, z);
        targetHeights[i] = y + detail(x, z);
        setColor(tarCol[i], x, z, y, cfn);
      }
      isMorphing = true;
      isBlockMorphing = false;
    }

    // 바다 (지층 블록은 반투명 바다, 하천 지형은 사실적 물)
    if (st.sea === null) {
      water.visible = false;
      simpleSea.visible = false;
    } else {
      targetWaterY = st.sea;
      if (sc.kind === "block") {
        seaMesh = simpleSea;
        simpleSea.visible = true;
        water.visible = false;
      } else {
        seaMesh = water;
        water.visible = true;
        simpleSea.visible = false;
      }
    }

    curCam = st.cam || sc.cam;
    curTgt = st.target || sc.target || [0, -12, 0];
    frameCamera();
    isMovingCamera = true;
    controls.autoRotate = false;

    // 캡션
    document.getElementById("capForce").className =
      "force-badge force-" + sc.force;
    document.getElementById("capForce").innerText = sc.forceLabel;
    document.getElementById("capEx").innerHTML = "예: " + sc.example;
    document.getElementById("capCat").innerText = sc.cat;
    document.getElementById("capTitle").innerText = sc.title;
    document.getElementById("capStageTag").innerText = st.tag;
    document.getElementById("capStageName").innerText = st.name;
    document.getElementById("capSub").innerText = st.d;
    let dots = "";
    for (let s = 0; s < sc.stages.length; s++)
      dots +=
        '<button class="' +
        (s === curStage ? "on" : "") +
        '" data-step="' +
        s +
        '" aria-label="단계 ' +
        (s + 1) +
        '" aria-pressed="' +
        (s === curStage) +
        '"></button>';
    document.getElementById("capDots").innerHTML = dots;
    document.getElementById("btnPrev").disabled = curStage === 0;
    document.getElementById("btnNext").disabled =
      curStage === sc.stages.length - 1;

    buildLabels(st);
    Lab.changed();
    document
      .getElementById("btnPlay")
      .setAttribute("aria-pressed", String(autoPlay));
    if (autoPlay) {
      if (curStage < sc.stages.length - 1)
        playTimer = setTimeout(() => {
          if (autoPlay) nextStage();
        }, 3200);
      else stopAuto();
    }
  }

  function loadScenario(key) {
    stopAuto();
    curKey = key;
    curStage = 0;
    document.querySelectorAll(".scenario-card").forEach((c, idx) => {
      c.classList.toggle("active", c.dataset.scenario === key);
      c.setAttribute("aria-pressed", String(c.dataset.scenario === key));
    });
    applyStage();
  }
  function nextStage() {
    const sc = scenarios[curKey];
    if (sc && curStage < sc.stages.length - 1) {
      curStage++;
      applyStage();
    }
  }
  function prevStage() {
    if (curKey && curStage > 0) {
      curStage--;
      applyStage();
    }
  }
  function stopAuto() {
    autoPlay = false;
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    document.getElementById("btnPlay").innerText = "▶ 자동 재생";
    document.getElementById("btnPlay").setAttribute("aria-pressed", "false");
  }
  function playAll() {
    if (!curKey) return;
    if (autoPlay) {
      stopAuto();
      return;
    }
    autoPlay = true;
    document.getElementById("btnPlay").innerText = "❚❚ 정지";
    if (curStage === scenarios[curKey].stages.length - 1) curStage = 0;
    applyStage();
  }

  function updateLabels() {
    const w = container.clientWidth,
      h = container.clientHeight;
    for (const L of activeLabels) {
      tmpV.set(L.x, L.y, L.z).project(camera);
      if (tmpV.z > 1) {
        L.el.style.display = "none";
        continue;
      }
      L.el.style.display = "block";
      L.el.style.left = (tmpV.x * 0.5 + 0.5) * w + "px";
      L.el.style.top = (-tmpV.y * 0.5 + 0.5) * h + "px";
    }
  }

  // ====================================================
  // ★ 렌더 루프 ★
  // ====================================================
  let previousFrame = 0;
  function animate(timestamp = 0) {
    const dt = Math.min(0.05, Math.max(0, (timestamp - previousFrame) / 1000));
    previousFrame = timestamp;
    if (document.hidden) return;
    const blend = (k) =>
      matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 1
        : 1 - Math.pow(1 - k, dt * 60);

    if (isMovingCamera) {
      camera.position.lerp(targetCamPos, blend(0.05));
      controls.target.lerp(camTarget, blend(0.05));
      if (camera.position.distanceTo(targetCamPos) < 1) {
        isMovingCamera = false;
        controls.autoRotate =
          document.getElementById("rotateToggle")?.checked || false;
      }
    }
    if (seaMesh.visible && Math.abs(seaMesh.position.y - targetWaterY) > 0.1)
      seaMesh.position.y += (targetWaterY - seaMesh.position.y) * blend(0.03);

    if (isMorphing) {
      let still = false;
      for (let i = 0; i < tPos.count; i++) {
        const cy = tPos.getY(i),
          ty = targetHeights[i];
        if (Math.abs(ty - cy) > 0.08) {
          tPos.setY(i, cy + (ty - cy) * blend(0.07));
          still = true;
        } else tPos.setY(i, ty);
        curCol[i].lerp(tarCol[i], blend(0.07));
        tColorAttr.setXYZ(i, curCol[i].r, curCol[i].g, curCol[i].b);
      }
      tPos.needsUpdate = true;
      tColorAttr.needsUpdate = true;
      tGeo.computeVertexNormals();
      if (!still) {
        isMorphing = false;
      }
    }

    if (isBlockMorphing) {
      let still = false;
      for (let i = 0; i < bPos.count; i++) {
        for (let k = 0; k < 3; k++) {
          const c = bPos.array[i * 3 + k],
            t = bTarget[i * 3 + k];
          if (Math.abs(t - c) > 0.05) {
            bPos.array[i * 3 + k] = c + (t - c) * blend(0.08);
            still = true;
          } else bPos.array[i * 3 + k] = t;
        }
      }
      bPos.needsUpdate = true;
      bGeo.computeVertexNormals();
      if (!still) {
        isBlockMorphing = false;
      }
    }

    if (
      autoPlay &&
      !document.hidden &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      water.material.uniforms["time"].value += dt;
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
  }

  let lastW = 0,
    lastH = 0;
  function onResize() {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (w === 0 || h === 0 || (w === lastW && h === lastH)) return;
    lastW = w;
    lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    frameCamera();
    if (!isMovingCamera) {
      camera.position.copy(targetCamPos);
      controls.target.copy(camTarget);
    }
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
  // 캔버스 크기 변화(주소창 접힘·회전·뒤늦은 레이아웃)를 효율적으로 감지 — 매 프레임 reflow 없이
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(container);
  onResize();

  loadScenario("fold");
  curStage = 2;
  applyStage();

  const grid = new THREE.GridHelper(330, 22, 0x506a5a, 0x294338);
  grid.position.y = -65;
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xd0dec3, 0x29483c, 0.22));
  document
    .querySelectorAll("[data-scenario]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        loadScenario(button.dataset.scenario),
      ),
    );
  document.getElementById("btnPrev").onclick = () => {
    stopAuto();
    prevStage();
  };
  document.getElementById("btnNext").onclick = () => {
    stopAuto();
    nextStage();
  };
  document.getElementById("btnPlay").onclick = playAll;
  document.getElementById("capDots").addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (button) {
      stopAuto();
      curStage = Number(button.dataset.step);
      applyStage();
    }
  });
  document.getElementById("labelToggle").onchange = (event) => {
    labelLayer.hidden = !event.target.checked;
  };
  document.getElementById("rotateToggle").onchange = (event) => {
    controls.autoRotate = event.target.checked;
  };
  document.getElementById("resetView").onclick = () => {
    stopAuto();
    applyStage();
  };
  controls.addEventListener("start", () => {
    isMovingCamera = false;
    controls.autoRotate = false;
    document.getElementById("rotateToggle").checked = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAuto();
  });
  new ResizeObserver(() => {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }).observe(container);
  function profile() {
    const sc = scenarios[curKey],
      st = sc.stages[curStage],
      first = sc.stages[0],
      x = Array.from({ length: 81 }, (_, i) => -100 + i * 2.5);
    const height = (stage, x) =>
      sc.kind === "block"
        ? stage.deform(x, BH / 2, 0)[1] - BH / 2
        : stage.h(x, 0);
    return {
      x,
      y: x.map((x) => height(st, x)),
      baseline: x.map((x) => height(first, x)),
    };
  }
  Lab.register({
    profile,
    pause: stopAuto,
    validateChoices: (c) =>
      !!scenarios[c.scenario] &&
      Number.isInteger(c.step) &&
      c.step >= 0 &&
      c.step < scenarios[c.scenario].stages.length,
    measure() {
      const p = profile(),
        sc = scenarios[curKey];
      return {
        과정: sc.title,
        단계: curStage + 1,
        "단계 이름": sc.stages[curStage].name,
        "중앙 단면 최고 높이": +Math.max(...p.y).toFixed(2),
        "중앙 단면 최저 높이": +Math.min(...p.y).toFixed(2),
        "중앙 단면 비고": +(Math.max(...p.y) - Math.min(...p.y)).toFixed(2),
      };
    },
  });
  Lab.renderLoop(animate, {
    element: container,
    renderer,
    controls,
    active: () =>
      autoPlay ||
      controls.autoRotate ||
      isMovingCamera ||
      isMorphing ||
      isBlockMorphing ||
      (seaMesh.visible && Math.abs(seaMesh.position.y - targetWaterY) > 0.1),
  });
  Lab.ready();
})();
