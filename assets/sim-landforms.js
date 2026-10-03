(() => {
  // ----------------------------------------------------
  // ★ Three.js 렌더링 엔진 세팅 ★
  // ----------------------------------------------------
  const container = document.getElementById("webgl-container");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102827);
  scene.background = new THREE.Color(0x102827);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    2000,
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.autoRotate =
    document.getElementById("rotateToggle")?.checked || false;
  controls.autoRotateSpeed = 0.35;

  // 대기 원근(거리감) — 먼 지형이 옅은 안개에 잠기게
  scene.fog = new THREE.Fog(0x102827, 750, 1800);

  const sun = new THREE.DirectionalLight(0xfff3df, 0.9); // 살짝 따뜻한 태양광
  sun.position.set(120, 205, 85);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 650;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03; // 그림자 얼룩(acne) 방지
  scene.add(sun);
  // 반구광: 위에서는 하늘빛, 아래에서는 따뜻한 지면 반사광 → 자연스러운 음영
  scene.add(new THREE.HemisphereLight(0xbcd6ea, 0x4a4030, 0.6));
  scene.add(new THREE.AmbientLight(0x6b6b66, 0.22));

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
  ); // 태양광과 하늘 일치

  // ----------------------------------------------------
  // ★ 지형 메시 세팅 ★
  // ----------------------------------------------------
  const simplex = new SimplexNoise("geographia-fieldwork");
  const resolution = 160;
  const size = 250;
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colorAttr = new THREE.BufferAttribute(
    new Float32Array(pos.count * 3),
    3,
  );
  geometry.setAttribute("color", colorAttr);

  const targetHeights = new Float32Array(pos.count);
  const currentColors = [];
  const targetColors = [];

  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
    targetHeights[i] = 0;
    currentColors.push(new THREE.Color(0x6f8f5a));
    targetColors.push(new THREE.Color(0x6f8f5a));
    colorAttr.setXYZ(i, 0.43, 0.56, 0.35);
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: false,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  scene.add(terrain);

  const waterGeo = new THREE.PlaneGeometry(300, 300);
  const water = new THREE.Water(waterGeo, {
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

  // 칼데라호(천지) 전용 호수면 — 전체 바다와 분리해 분화구만 채움
  const craterLake = new THREE.Mesh(
    new THREE.CircleGeometry(24, 64),
    new THREE.MeshStandardMaterial({
      color: 0x3f86ab,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x10303f,
      emissiveIntensity: 0.5,
    }),
  );
  craterLake.rotation.x = -Math.PI / 2;
  craterLake.position.y = -999;
  craterLake.visible = false;
  craterLake.receiveShadow = true;
  scene.add(craterLake);

  // 주상절리(육각 기둥) 묶음 — 용암이 식으며 수축해 갈라진 다각형 기둥
  const basaltMat = new THREE.MeshStandardMaterial({
    color: 0x4c463d,
    roughness: 0.92,
    flatShading: true,
  });
  const basaltColumns = new THREE.Group();
  (function buildColumns() {
    const colR = 3.6,
      dx = colR * Math.sqrt(3),
      dz = colR * 1.5,
      baseY = 6;
    for (let row = -6; row <= 6; row++) {
      for (let col = -7; col <= 7; col++) {
        const x = col * dx + (Math.abs(row) % 2 ? dx / 2 : 0);
        const z = row * dz;
        const r = Math.sqrt(x * x + z * z);
        if (r > 30) continue; // 원형 영역만
        const top = 28 - r * 0.18 + simplex.noise2D(x / 12, z / 12) * 5; // 가운데 높고 가장자리 낮게 + 요철
        const h = Math.max(6, top - baseY);
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(colR * 0.95, colR * 0.95, h, 6),
          basaltMat,
        );
        m.position.set(x, baseY + h / 2, z);
        m.rotation.y = (col + row) * 0.16;
        m.castShadow = true;
        m.receiveShadow = true;
        basaltColumns.add(m);
      }
    }
  })();
  basaltColumns.visible = false;
  scene.add(basaltColumns);

  // ----------------------------------------------------
  // ★ 색상 팔레트 & 고도별 채색 ★
  // ----------------------------------------------------
  const palette = {
    sand: new THREE.Color(0xd9c48a),
    grass: new THREE.Color(0x6aa84f),
    forest: new THREE.Color(0x2f6b34),
    rock: new THREE.Color(0x817567),
    snow: new THREE.Color(0xf2f0ea),
  };
  function elevColor(y) {
    const c = new THREE.Color();
    if (y < 12) c.copy(palette.grass).lerp(palette.forest, Math.max(0, y) / 12);
    else if (y < 26) c.copy(palette.forest).lerp(palette.rock, (y - 12) / 14);
    else c.copy(palette.rock).lerp(palette.snow, Math.min((y - 26) / 12, 1));
    return c;
  }

  // ----------------------------------------------------
  // ★ 지형별 높이 함수 (단계별 형성 과정) ★
  //   x, z 범위: 약 -125 ~ 125
  // ----------------------------------------------------
  const n = (x, z, f) => simplex.noise2D(x / f, z / f);
  const detail = (x, z) => n(x, z, 6.5) * 0.75 + n(x, z, 2.8) * 0.35; // 표면 미세 굴곡(자연스러운 거칠기)

  // I. 작용의 원리
  const upl = (x, z) => Math.max(0, n(x, z, 55) * 40 + n(x, z, 24) * 16 + 6);
  const eroded = (x, z) => Math.max(0, n(x, z, 55) * 20 + n(x, z, 30) * 6);

  // II. 습곡 산지
  const newFold = (x, z) =>
    Math.max(
      0,
      Math.exp(-Math.pow(x / 30, 2)) *
        (58 + Math.cos(x / 8) * 16 + n(x, z, 12) * 10),
    );
  const oldFold = (x, z) =>
    Math.exp(-Math.pow((x + 82) / 26, 2)) *
    (16 + Math.cos(x / 10) * 4 + Math.abs(n(x, z, 20)) * 3);
  const plain = (x, z) => Math.max(0, n(x, z, 40) * 2.5 + 1);

  // III. 화산 (백두산) — 용암대지(base) 위 화산체 → 칼데라 → 천지
  const VBASE = 30; // 용암대지 높이
  const VR = 34,
    VRIM = 47,
    VFLOOR = 18,
    VINNER = 24; // 분화구 반경/가장자리/바닥/바닥반경
  const volCone = (x, z) => {
    // 함몰 전: 높이 솟은 원뿔형 화산체
    const d = Math.sqrt(x * x + z * z);
    return VBASE + Math.max(0, 50 - d * 0.5) + n(x, z, 30) * 1.2;
  };
  const volCaldera = (x, z) => {
    // 정상부가 함몰된 칼데라
    const d = Math.sqrt(x * x + z * z);
    if (d < VINNER) return VFLOOR + n(x, z, 25) * 0.6; // 평평한 바닥
    if (d < VR)
      return VFLOOR + (VRIM - VFLOOR) * ((d - VINNER) / (VR - VINNER)); // 가파른 안쪽 벽
    return VBASE + (VRIM - VBASE) * Math.max(0, 1 - (d - VR) / 60); // 바깥 사면(rim→대지)
  };
  function volColor(x, z, y) {
    if (y < VBASE + 2) return new THREE.Color(0x4a4038); // 용암대지(현무암)
    if (y < VBASE + 16)
      return new THREE.Color(0x36692f).lerp(
        new THREE.Color(0x6b5d4f),
        (y - VBASE - 2) / 14,
      ); // 숲→화산암
    return new THREE.Color(0x6b5d4f).lerp(
      new THREE.Color(0xc9bdab),
      Math.min((y - VBASE - 16) / 30, 1),
    ); // 정상 화산재
  }

  // IV. 용암대지 & 주상절리
  const lavaErupt = (x, z) => {
    let y = 3 + n(x, z, 40) * 1.0;
    if (Math.abs(x) < 6) y -= (6 - Math.abs(x)) * 0.8;
    return y;
  }; // 갈라진 틈(열하)에서 분출
  const lavaPlateau = (x, z) => 10 + n(x, z, 45) * 1.2; // 넓고 평평한 용암대지
  function lavaHotColor(x, z, y) {
    const c = new THREE.Color(0x4a423a);
    if (Math.abs(x) < 7)
      c.lerp(new THREE.Color(0xc4502a), (1 - Math.abs(x) / 7) * 0.9);
    return c;
  }
  function basaltColor(x, z, y) {
    return new THREE.Color(0x554e44).lerp(
      new THREE.Color(0x423c34),
      ((n(x, z, 20) + 1) / 2) * 0.5,
    );
  }

  // V. 빙하 (V자곡 → U자곡)
  const vShape = (x, z) =>
    Math.min(52, 8 + Math.abs(x) * 1.05) - z * 0.04 + n(x, z, 22) * 2;
  const uShape = (x, z) =>
    Math.min(52, 6 + Math.pow(Math.abs(x) / 50, 2) * 46) -
    z * 0.04 +
    n(x, z, 22) * 2;
  const iceSurf = (x, z) => 32 - z * 0.04;
  const glacierIce = (x, z) =>
    Math.abs(x) < 48 ? Math.max(uShape(x, z), iceSurf(x, z)) : uShape(x, z);
  function iceColor(x, z, y) {
    if (Math.abs(x) < 48 && iceSurf(x, z) > uShape(x, z) + 0.4)
      return new THREE.Color(0xe8f1f6); // 빙하(얼음)
    return elevColor(y);
  }

  // VI. 카르스트 (석회암 대지 → 용식 → 돌리네)
  const dolines = [
    [30, 15, 17, 14],
    [-35, -25, 21, 17],
    [6, -46, 13, 10],
    [-18, 33, 11, 8],
  ]; // x, z, 반지름, 깊이
  function karstH(x, z, k) {
    let y = 18 + n(x, z, 35) * 2.5;
    for (const [cx, cz, r, d] of dolines) {
      const dd = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
      if (dd < r) y -= Math.cos((dd / r) * (Math.PI / 2)) * d * k;
    }
    return y;
  }
  const karstFlat = (x, z) => karstH(x, z, 0);
  const karstHalf = (x, z) => karstH(x, z, 0.45);
  const karstFull = (x, z) => karstH(x, z, 1);
  function limeColor(x, z, y) {
    return new THREE.Color(0xcabf9f).lerp(
      new THREE.Color(0x6b6450),
      Math.max(0, Math.min(1, (18 - y) / 14)),
    );
  }

  // VII. 해안 침식 (해수면 5 고정 · 파식대를 수면 위로 드러냄)
  const COAST_SEA = 5;
  const coastLand = (x, z) => 20 - x * 0.3 + n(x, z, 30) * 1.3; // 완만한 해안 경사(육지)
  const coastGentle = (x, z) => coastLand(x, z);
  const coastNotch = (x, z) => {
    // 파도가 밑부분을 깎아 해식 노치
    let y = coastLand(x, z);
    const nd = x - 24;
    if (Math.abs(nd) < 7) y -= (7 - Math.abs(nd)) * 1.4;
    return y;
  };
  function coastProfile(x, z, cliffBase, withStack) {
    let y;
    if (x < cliffBase)
      y = coastLand(x, z); // 절벽 위 육지(해식애)
    else if (x < 48)
      y = 7 + n(x, z, 18) * 0.5; // 파식대(수면 위 평평한 암반 단)
    else y = 7 - (x - 48) * 0.4; // 앞바다 해저로 하강
    if (withStack) {
      const ds = Math.sqrt((x - 26) ** 2 + (z + 14) ** 2);
      if (ds < 7) y = Math.max(y, 22 - ds * 1.6);
    } // 시스택
    return y;
  }
  const coastCliffYoung = (x, z) => coastProfile(x, z, -2, false); // 막 생긴 해식애 + 좁은 파식대
  const coastCliffOld = (x, z) => coastProfile(x, z, -20, true); // 절벽 후퇴 → 넓은 파식대 + 시스택
  function coastColor(x, z, y) {
    const ds = Math.sqrt((x - 26) ** 2 + (z + 14) ** 2);
    if (ds < 8)
      return new THREE.Color(0x9a8d79).lerp(
        new THREE.Color(0x6f6253),
        Math.min((y - 6) / 16, 1),
      ); // 시스택(암석 기둥)
    if (y < 9) return new THREE.Color(0x9c968a); // 파식대(젖은 암반)
    if (y < 17) return new THREE.Color(0x7d7264); // 해식애 암벽
    return new THREE.Color(0x5f9a4f).lerp(
      new THREE.Color(0x2f6b34),
      Math.min((y - 17) / 20, 1),
    ); // 해안 위 식생
  }

  // ----------------------------------------------------
  // ★ 시나리오 정의 ★
  // ----------------------------------------------------
  const scenarios = {
    intro: {
      cat: "§ SECTION I · 작용의 원리",
      title: "지형을 만드는 두 힘",
      force: "both",
      forceLabel: "복합 작용",
      example: "모든 지형의 출발점",
      cam: [185, 140, 205],
      color: null,
      stages: [
        {
          tag: "단계 1",
          name: "평탄한 땅",
          sea: -60,
          h: (x, z) => 0,
          d: "아무 힘도 받지 않은 평평한 땅입니다. 여기서부터 두 가지 힘이 작용하기 시작합니다.",
          labels: [],
        },
        {
          tag: "단계 2",
          name: "내적 작용 — 융기",
          sea: -60,
          h: upl,
          d: "지구 내부의 힘이 땅을 위로 밀어 올립니다. 이렇게 땅을 솟게 하는 힘을 ‘내적 작용’이라 합니다.",
          labels: [{ t: "융기", s: "솟아오름", x: 0, z: 0 }],
        },
        {
          tag: "단계 3",
          name: "외적 작용 — 침식",
          sea: -60,
          h: eroded,
          d: "비·바람·물·빙하가 솟은 땅을 깎아 점점 낮고 완만하게 만듭니다. 이것이 ‘외적 작용’입니다.",
          labels: [{ t: "침식", s: "깎여 완만해짐", x: 0, z: 0 }],
        },
      ],
    },
    world: {
      cat: "§ SECTION II · 대지형",
      title: "세계의 대지형 — 습곡 산지",
      force: "in",
      forceLabel: "내적 작용",
      example: "신기: <b>히말라야·안데스</b> / 고기: <b>우랄·애팔래치아</b>",
      cam: [40, 175, 330],
      color: null,
      stages: [
        {
          tag: "단계 1",
          name: "바다 밑 퇴적층",
          sea: 8,
          h: plain,
          d: "오랜 세월 바다 밑에 흙과 모래가 평평하게 쌓여 두꺼운 퇴적층을 이룹니다.",
          labels: [],
        },
        {
          tag: "단계 2",
          name: "판의 충돌 → 신기 습곡 산지",
          sea: -10,
          h: (x, z) => newFold(x, z) + n(x, z, 18) * 2,
          d: "두 판이 부딪치며 퇴적층이 구겨지듯 솟아오릅니다. 최근에 만들어져 높고 험준한 ‘신기 습곡 산지’입니다.",
          labels: [{ t: "신기 습곡 산지", s: "높고 험준", x: 0, z: 0 }],
        },
        {
          tag: "단계 3",
          name: "오래된 산지의 침식",
          sea: -10,
          h: (x, z) => newFold(x, z) * 0.92 + oldFold(x, z) + plain(x, z) * 0.3,
          d: "아주 오래전 솟은 산지는 긴 세월 깎여 낮고 완만해집니다. 이것이 ‘고기 습곡 산지’입니다.",
          labels: [
            { t: "신기 습곡 산지", s: "신기", x: 0, z: 0 },
            { t: "고기 습곡 산지", s: "낮고 완만", x: -82, z: 0 },
          ],
        },
      ],
    },
    volcano: {
      cat: "§ SECTION III · 화산 지형",
      title: "화산 지형 ① — 백두산 천지",
      force: "in",
      forceLabel: "내적 작용",
      example: "<b>백두산 천지</b> (칼데라호)",
      cam: [95, 150, 150],
      color: volColor,
      stages: [
        {
          tag: "단계 1",
          name: "용암대지",
          sea: -50,
          h: (x, z) => VBASE + n(x, z, 40) * 1.5,
          d: "땅속 마그마가 흘러나와 굳으며 넓고 평평한 ‘용암대지’를 이룹니다.",
          labels: [],
        },
        {
          tag: "단계 2",
          name: "화산체의 성장",
          sea: -50,
          h: volCone,
          d: "한 곳에서 용암과 화산재가 거듭 분출하며 높은 화산이 솟아오릅니다.",
          labels: [{ t: "화산체", s: "분출로 성장", x: 0, z: 0 }],
        },
        {
          tag: "단계 3",
          name: "정상부 함몰 → 칼데라",
          sea: -50,
          h: volCaldera,
          d: "큰 분출 뒤 빈 마그마방이 무너지면서 정상부가 거대하게 내려앉습니다. 이 움푹한 곳이 ‘칼데라’입니다.",
          labels: [{ t: "칼데라", s: "함몰 분지", x: 0, z: 0 }],
        },
        {
          tag: "단계 4",
          name: "물이 고인 칼데라호 (천지)",
          sea: -50,
          h: volCaldera,
          lake: 24,
          d: "칼데라에 빗물과 지하수가 고여 호수가 됩니다. 백두산 정상의 ‘천지’가 바로 이 칼데라호입니다.",
          labels: [{ t: "천지", s: "칼데라호", x: 0, z: 0, y: 24 }],
        },
      ],
    },
    lava: {
      cat: "§ SECTION IV · 화산 지형",
      title: "화산 지형 ② — 용암대지와 주상절리",
      force: "in",
      forceLabel: "내적 작용",
      example: "철원 <b>용암대지</b> / 제주·한탄강 <b>주상절리</b>",
      cam: [78, 72, 116],
      color: basaltColor,
      stages: [
        {
          tag: "단계 1",
          name: "갈라진 틈에서 용암 분출",
          sea: -50,
          h: lavaErupt,
          color: lavaHotColor,
          d: "땅이 갈라진 긴 틈(열하)에서 묽은 현무암질 용암이 흘러나옵니다.",
          labels: [{ t: "용암 분출", s: "갈라진 틈(열하)", x: 0, z: 0, y: 4 }],
        },
        {
          tag: "단계 2",
          name: "넓게 퍼진 용암대지",
          sea: -50,
          h: lavaPlateau,
          d: "묽은 용암은 멀리까지 퍼져 평탄하게 쌓입니다. 이런 과정이 거듭되어 넓고 평평한 ‘용암대지’가 됩니다.",
          labels: [{ t: "용암대지", s: "넓고 평평", x: -40, z: 20, y: 11 }],
        },
        {
          tag: "단계 3",
          name: "식으며 갈라진 주상절리",
          sea: -50,
          h: lavaPlateau,
          columns: true,
          d: "두껍게 쌓인 용암이 식으며 부피가 줄어(수축) 다각형(주로 육각형) 기둥으로 쪼개집니다. 이것이 ‘주상절리’입니다.",
          labels: [{ t: "주상절리", s: "육각 기둥", x: 0, z: 0, y: 30 }],
        },
      ],
    },
    glacier: {
      cat: "§ SECTION V · 빙하 지형",
      title: "빙하 지형 — U자곡",
      force: "ex",
      forceLabel: "외적 작용",
      example: "<b>알프스</b> · 노르웨이 <b>피오르</b>",
      cam: [85, 80, 165],
      color: null,
      stages: [
        {
          tag: "단계 1",
          name: "하천이 깎은 V자곡",
          sea: -50,
          h: vShape,
          color: null,
          d: "하천이 땅을 아래로 깎아 ‘V’자 모양의 뾰족한 골짜기를 만듭니다.",
          labels: [{ t: "V자곡", s: "하천 침식", x: 0, z: 0 }],
        },
        {
          tag: "단계 2",
          name: "빙하가 골짜기를 채움",
          sea: -50,
          h: glacierIce,
          color: iceColor,
          d: "기후가 추워지면 거대한 빙하(얼음덩이)가 골짜기를 가득 채우고 천천히 흘러내립니다.",
          labels: [{ t: "빙하", s: "얼음의 흐름", x: 0, z: 8 }],
        },
        {
          tag: "단계 3",
          name: "빙하가 깎은 U자곡",
          sea: -50,
          h: uShape,
          color: null,
          d: "무거운 빙하가 골짜기 바닥과 옆면을 함께 깎아, 넓고 둥근 ‘U’자 모양 골짜기가 남습니다.",
          labels: [{ t: "U자곡", s: "넓고 둥근 바닥", x: 0, z: 0 }],
        },
      ],
    },
    karst: {
      cat: "§ SECTION VI · 카르스트 지형",
      title: "카르스트 지형 — 돌리네",
      force: "ex",
      forceLabel: "외적 작용",
      example: "강원 <b>정선·삼척</b> / 슬로베니아 <b>카르스트</b>",
      cam: [0, 150, 165],
      color: limeColor,
      stages: [
        {
          tag: "단계 1",
          name: "평평한 석회암 대지",
          sea: -50,
          h: karstFlat,
          d: "바닷속 조개·산호가 쌓여 굳은 석회암이 넓은 대지를 이룹니다.",
          labels: [],
        },
        {
          tag: "단계 2",
          name: "빗물의 용식 작용",
          sea: -50,
          h: karstHalf,
          d: "석회암은 빗물(약한 산성)에 조금씩 녹습니다. 이렇게 화학적으로 녹이는 것을 ‘용식 작용’이라 합니다.",
          labels: [{ t: "용식", s: "빗물이 녹임", x: 30, z: 15 }],
        },
        {
          tag: "단계 3",
          name: "움푹 팬 돌리네",
          sea: -50,
          h: karstFull,
          d: "용식이 계속되어 지표면 곳곳이 원형으로 움푹 패입니다. 이 웅덩이가 ‘돌리네’입니다.",
          labels: [
            { t: "돌리네", s: "용식 웅덩이", x: 30, z: 15 },
            { t: "석회암 대지", s: "", x: -46, z: 8 },
          ],
        },
      ],
    },
    coast: {
      cat: "§ SECTION VII · 해안 침식 지형",
      title: "해안 침식 지형",
      force: "ex",
      forceLabel: "외적 작용",
      example: "부산 <b>태종대</b> / 호주 <b>12사도 바위</b>",
      cam: [118, 56, 122],
      color: coastColor,
      stages: [
        {
          tag: "단계 1",
          name: "완만한 해안",
          sea: COAST_SEA,
          h: coastGentle,
          d: "육지가 바다 쪽으로 완만하게 이어지는 평범한 해안입니다.",
          labels: [],
        },
        {
          tag: "단계 2",
          name: "파도의 침식 — 해식 노치",
          sea: COAST_SEA,
          h: coastNotch,
          d: "파도는 해수면 높이의 절벽 밑부분을 집중적으로 깎습니다. 그 결과 움푹 파인 ‘해식 노치’가 생깁니다.",
          labels: [{ t: "해식 노치", s: "밑부분이 패임", x: 24, z: 0, y: 2 }],
        },
        {
          tag: "단계 3",
          name: "절벽 붕괴 → 해식애·파식대",
          sea: COAST_SEA,
          h: coastCliffYoung,
          d: "밑이 파인 절벽이 무너져 깎아지른 ‘해식애’가 되고, 그 앞 바닥에는 평평한 암반 ‘파식대’가 드러납니다.",
          labels: [
            { t: "해식애", s: "절벽", x: -2, z: 0, y: 20 },
            { t: "파식대", s: "평평한 암반", x: 26, z: 12, y: 7 },
          ],
        },
        {
          tag: "단계 4",
          name: "절벽 후퇴 → 파식대 확대·시스택",
          sea: COAST_SEA,
          h: coastCliffOld,
          d: "침식이 되풀이되어 해식애는 육지 쪽으로 물러나고, 그만큼 파식대는 넓어집니다. 단단해서 남겨진 바위는 ‘시스택’입니다.",
          labels: [
            { t: "해식애", s: "후퇴", x: -20, z: 0, y: 26 },
            { t: "파식대", s: "넓어진 암반", x: 16, z: 14, y: 7 },
            { t: "시스택", s: "바위 기둥", x: 26, z: -14, y: 20 },
          ],
        },
      ],
    },
  };

  // ----------------------------------------------------
  // ★ 상태 & 단계 적용 ★
  // ----------------------------------------------------
  const tmpV = new THREE.Vector3();
  let curKey = null,
    curStage = 0,
    autoPlay = false,
    playTimer = null;
  let activeLabels = [];
  const labelLayer = document.getElementById("label-layer");

  let targetCamPos = new THREE.Vector3(0, 150, 400);
  let targetWaterY = -100;
  let isMovingCamera = false;
  let isMorphing = false;

  function setColor(target, x, z, y, cfn) {
    if (cfn) target.copy(cfn(x, z, y));
    else target.copy(elevColor(y));
    target.multiplyScalar(0.9 + (n(x, z, 11) + 1) * 0.1); // 0.9~1.1 미세한 명암 변화로 단조로운 색띠 완화
  }

  function buildLabels(st) {
    labelLayer.innerHTML = "";
    activeLabels = [];
    const sc = scenarios[curKey];
    (st.labels || []).forEach((L) => {
      const el = document.createElement("div");
      el.className = "map-label";
      el.innerHTML =
        '<span class="dot"></span>' +
        L.t +
        (L.s ? " <small>" + L.s + "</small>" : "");
      el.style.opacity = "0";
      labelLayer.appendChild(el);
      const y = (L.y !== undefined ? L.y : st.h(L.x, L.z)) + 9;
      activeLabels.push({ el, x: L.x, y, z: L.z });
      requestAnimationFrame(() => {
        setTimeout(() => (el.style.opacity = "1"), 250);
      });
    });
  }

  function applyStage() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    const sc = scenarios[curKey];
    const st = sc.stages[curStage];
    const cfn = st.color !== undefined ? st.color : sc.color;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const y = st.h(x, z);
      targetHeights[i] = y + detail(x, z);
      setColor(targetColors[i], x, z, y, cfn);
    }

    // 칼데라호 / 주상절리 표시 여부
    if (st.lake !== undefined) {
      craterLake.visible = true;
      craterLake.position.y = st.lake;
    } else craterLake.visible = false;
    basaltColumns.visible = !!st.columns;

    targetCamPos
      .set(...sc.cam)
      .multiplyScalar(1.65 * Math.max(1, 1.15 / camera.aspect));
    targetWaterY = st.sea;
    water.visible = st.sea > -40;
    isMovingCamera = true;
    isMorphing = true;
    controls.autoRotate = false; // 카메라 이동 중에는 자동 회전 정지 (충돌 방지)

    // 캡션 갱신
    document.getElementById("capForce").className =
      "force-badge force-" + sc.force;
    document.getElementById("capForce").innerText = sc.forceLabel;
    document.getElementById("capEx").innerHTML = "예: " + sc.example;
    document.getElementById("capCat").innerText = sc.cat;
    document.getElementById("capTitle").innerText = sc.title;
    document.getElementById("capStageTag").innerText = st.tag;
    document.getElementById("capStageName").innerText = st.name;
    document.getElementById("capSub").innerText = st.d;

    // 진행 점
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
    if (!sc) return;
    if (curStage < sc.stages.length - 1) {
      curStage++;
      applyStage();
    }
  }
  function prevStage() {
    if (!curKey) return;
    if (curStage > 0) {
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

  // ----------------------------------------------------
  // ★ 라벨 위치 갱신 (3D → 화면 투영) ★
  // ----------------------------------------------------
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

  // ----------------------------------------------------
  // ★ 모핑 & 렌더 루프 ★
  // ----------------------------------------------------
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
      controls.target.lerp(new THREE.Vector3(0, 0, 0), blend(0.05));
      if (camera.position.distanceTo(targetCamPos) < 1) {
        isMovingCamera = false;
        controls.autoRotate =
          document.getElementById("rotateToggle")?.checked || false; // 도착하면 자동 회전 재개
      }
    }

    if (Math.abs(water.position.y - targetWaterY) > 0.1) {
      water.position.y += (targetWaterY - water.position.y) * blend(0.03);
    }

    if (isMorphing) {
      let stillMorphing = false;
      for (let i = 0; i < pos.count; i++) {
        const curY = pos.getY(i);
        const tarY = targetHeights[i];
        if (Math.abs(tarY - curY) > 0.08) {
          pos.setY(i, curY + (tarY - curY) * blend(0.06));
          stillMorphing = true;
        } else {
          pos.setY(i, tarY);
        }
        currentColors[i].lerp(targetColors[i], blend(0.06));
        colorAttr.setXYZ(
          i,
          currentColors[i].r,
          currentColors[i].g,
          currentColors[i].b,
        );
      }
      pos.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geometry.computeVertexNormals();

      if (!stillMorphing) {
        isMorphing = false;
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

  function resizeView() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (curKey) {
      targetCamPos
        .set(...scenarios[curKey].cam)
        .multiplyScalar(1.65 * Math.max(1, 1.15 / camera.aspect));
      isMovingCamera = true;
    }
  }
  window.addEventListener("resize", resizeView);

  // 초기 시작: 첫 시나리오 자동 실행
  loadScenario("volcano");
  curStage = 3;
  applyStage();

  const grid = new THREE.GridHelper(330, 22, 0x506a5a, 0x294338);
  grid.position.y = -32;
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
  new ResizeObserver(resizeView).observe(container);
  function profile() {
    const sc = scenarios[curKey],
      st = sc.stages[curStage],
      first = sc.stages[0],
      x = Array.from({ length: 81 }, (_, i) => -100 + i * 2.5);
    return {
      x,
      y: x.map((x) => st.h(x, 0)),
      baseline: x.map((x) => first.h(x, 0)),
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
      Math.abs(water.position.y - targetWaterY) > 0.1,
  });
  Lab.ready();
})();
