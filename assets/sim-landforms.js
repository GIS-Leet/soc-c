(() => {
  // ----------------------------------------------------
  // ★ Three.js 렌더링 엔진 세팅 ★
  // ----------------------------------------------------
  const container = document.getElementById("webgl-container");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / container.clientHeight,
    0.1,
    1800,
  );
  const renderer = Lab.createRenderer(THREE, {
    antialias: true,
    powerPreference: "default",
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  camera.position.set(230, 220, 310);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 110;
  controls.maxDistance = 720;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.target.set(0, 18, 0);
  controls.autoRotateSpeed = 0.3;
  const sun = new THREE.DirectionalLight(0xfff5e6, 1.8);
  sun.position.set(-160, 260, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -195,
    right: 195,
    top: 195,
    bottom: -195,
    near: 1,
    far: 700,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.55;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xdce8f6, 0x726b5e, 0.7));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const simplex = new SimplexNoise("geographia-fieldwork");
  const resolution = 192,
    size = 250;
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const colorAttr = new THREE.BufferAttribute(
    new Float32Array(pos.count * 3),
    3,
  );
  geometry.setAttribute("color", colorAttr);
  const targetHeights = new Float32Array(pos.count),
    currentColors = [],
    targetColors = [];
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
    currentColors.push(new THREE.Color());
    targetColors.push(new THREE.Color());
  }
  const material = Landscape.rockMaterial({ vertexColors: true });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A cut-out block, not a paper-thin plane. These walls expose the model domain,
  // not measured bedding or a claimed sequence of geological strata.
  const boundary = [];
  for (let i = 0; i <= resolution; i++) boundary.push(i);
  for (let j = 1; j <= resolution; j++)
    boundary.push(j * (resolution + 1) + resolution);
  for (let i = resolution - 1; i >= 0; i--)
    boundary.push(resolution * (resolution + 1) + i);
  for (let j = resolution - 1; j > 0; j--) boundary.push(j * (resolution + 1));
  const wallGeo = new THREE.BufferGeometry(),
    wallPos = new Float32Array(boundary.length * 18);
  wallGeo.setAttribute("position", new THREE.BufferAttribute(wallPos, 3));
  const walls = new THREE.Mesh(
    wallGeo,
    Landscape.rockMaterial({ color: 0x645f57, side: THREE.DoubleSide }),
  );
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);
  function updateWalls() {
    let k = 0;
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i],
        b = boundary[(i + 1) % boundary.length];
      const ax = pos.getX(a),
        az = pos.getZ(a),
        ay = pos.getY(a),
        bx = pos.getX(b),
        bz = pos.getZ(b),
        by = pos.getY(b);
      for (const v of [
        ax,
        ay,
        az,
        ax,
        -22,
        az,
        bx,
        by,
        bz,
        bx,
        by,
        bz,
        ax,
        -22,
        az,
        bx,
        -22,
        bz,
      ])
        wallPos[k++] = v;
    }
    wallGeo.attributes.position.needsUpdate = true;
    wallGeo.computeVertexNormals();
    wallGeo.computeBoundingSphere();
  }
  const waterNormals = new THREE.TextureLoader().load(
    "assets/sim-vendor/waternormals.jpg",
    (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      Lab.invalidate?.();
    },
  );
  function reflectiveWater() {
    const mesh = new THREE.Water(new THREE.PlaneGeometry(1, 1), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: sun.position.clone().normalize(),
      sunColor: 0xfff7eb,
      waterColor: 0x16465a,
      distortionScale: 0.65,
      size: 3.2,
      alpha: 1,
    });
    mesh.rotation.x = -Math.PI / 2;
    // Air/water normal-incidence reflectance is about 2%, not a metallic 30%.
    mesh.material.fragmentShader = mesh.material.fragmentShader.replace(
      "float rf0 = 0.3;",
      "float rf0 = 0.02;",
    );
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  const water = reflectiveWater(),
    craterLake = reflectiveWater();
  function waterGeometry(mesh, g, level) {
    if (mesh === water && curKey === "coast" && curStage === 1) {
      const existing = Array.from(g.attributes.position.array),
        y = level + 0.035;
      existing.push(
        16,
        y,
        -125,
        16,
        y,
        125,
        24,
        y,
        -125,
        24,
        y,
        -125,
        16,
        y,
        125,
        24,
        y,
        125,
      );
      g.dispose();
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(existing, 3));
      g.computeVertexNormals();
    }
    mesh.geometry.dispose();
    g.translate(0, -level - 0.035, 0);
    g.rotateX(Math.PI / 2);
    mesh.geometry = g;
    mesh.position.y = level + 0.035;
  }

  const basaltMat = Landscape.rockMaterial({
    color: 0x45474a,
    roughness: 0.91,
  });
  const basaltColumns = new THREE.Group();
  const colR = 3.4,
    dx = Math.sqrt(3) * colR,
    dz = 1.5 * colR;
  for (let row = -7; row <= 7; row++)
    for (let col = -8; col <= 8; col++) {
      const x = col * dx + (Math.abs(row) % 2 ? dx / 2 : 0),
        z = row * dz;
      if (Math.hypot(x, z) > 36) continue;
      const top = 24 + simplex.noise2D(x / 17, z / 17) * 4;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(colR * 0.97, colR * 0.97, top - 2, 6),
        basaltMat,
      );
      mesh.position.set(x, (top + 2) / 2, z);
      // The tessellating orientation is shared. Randomly rotating each hexagon
      // creates impossible overlaps rather than adjacent contraction joints.
      mesh.rotation.y = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.columnTop = top;
      basaltColumns.add(mesh);
    }
  basaltColumns.visible = false;
  scene.add(basaltColumns);
  const palette = {
    sand: new THREE.Color(0xa99d87),
    grass: new THREE.Color(0x596345),
    forest: new THREE.Color(0x3e5141),
    rock: new THREE.Color(0x898479),
    snow: new THREE.Color(0xe5eaf0),
  };
  function elevColor(y) {
    return palette.grass
      .clone()
      .lerp(palette.rock, Landscape.smooth(20, 65, y) * 0.55);
  }
  const grid = new THREE.GridHelper(250, 10, 0x8c969f, 0xb8c0c6);
  grid.position.y = -30.2;
  grid.visible = false;
  scene.add(grid);
  function themeScene() {
    const dark = document.documentElement.dataset.theme === "dark";
    scene.background = new THREE.Color(dark ? 0x15191e : 0xedf0f3);
    scene.fog = new THREE.Fog(scene.background, 850, 1600);
    Lab.invalidate?.();
  }
  themeScene();
  document.addEventListener("lab:theme", themeScene);
  const n = (x, z, f) => simplex.noise2D(x / f, z / f);
  const detail = (x, z) => Landscape.detail(x, z, curKey, curStage);

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
  const plain = (x, z) => Math.max(0, n(x, z, 40) * 2.5 + 1);

  // III. 화산 (백두산) — 용암대지(base) 위 화산체 → 칼데라 → 천지
  const volCone = Landscape.cone,
    volCaldera = Landscape.caldera;
  function volColor(x, z, y) {
    const c = palette.grass.clone();
    return c.lerp(new THREE.Color(0x8e8575), Landscape.smooth(20, 47, y));
  }

  // IV. 용암대지 & 주상절리
  const lavaErupt = (x, z) => {
    let y = 3 + n(x, z, 40) * 1.0;
    if (Math.abs(x) < 6) y -= (6 - Math.abs(x)) * 0.8;
    return y;
  }; // 갈라진 틈(열하)에서 분출
  const lavaPlateau = (x, z) => 24 + n(x, z, 17) * 4;
  const lavaExposed = (x, z) => {
    const r = Math.hypot(x, z);
    return 3 + (lavaPlateau(x, z) - 3) * Landscape.smooth(37, 49, r);
  };
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
    Math.min(52, 8 + Math.abs(x) * 1.05) -
    z * 0.04 +
    n(x, z, 22) * 2 * Landscape.smooth(0, 25, Math.abs(x));
  const uShape = (x, z) =>
    Math.min(52, 6 + Math.pow(Math.abs(x) / 50, 2) * 46) -
    z * 0.04 +
    n(x, z, 22) * 2 * Landscape.smooth(0, 25, Math.abs(x));
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
  // Top envelope only. A separate overhanging mesh represents the undercut;
  // a heightfield alone cannot represent two heights at the same (x,z).
  const coastNotch = (x, z) =>
    x <= 24 ? coastLand(x, z) : 1 - (x - 24) * 0.12;
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
    return new THREE.Color(0x576949).lerp(
      new THREE.Color(0x3e5141),
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
      cam: [200, 205, 280],
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
      cam: [100, 220, 300],
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
          h: (x, z) => newFold(x, z) * 0.3 + plain(x, z) * 0.35,
          d: "융기보다 침식이 우세한 조건을 오래 지속시킨 개념적 모습입니다. 실제 산지 높이는 연대뿐 아니라 융기 속도·암석·기후에 따라 달라집니다.",
          labels: [{ t: "침식된 산지", s: "낮아진 기복", x: 0, z: 0 }],
        },
      ],
    },
    volcano: {
      cat: "§ SECTION III · 화산 지형",
      title: "화산과 칼데라호",
      force: "in",
      forceLabel: "내적 작용",
      example: "<b>백두산 천지</b> (칼데라호)",
      cam: [170, 310, 220],
      color: volColor,
      stages: [
        {
          tag: "단계 1",
          name: "용암대지",
          sea: -50,
          h: Landscape.plateau,
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
          d: "대규모 분출 등으로 마그마가 빠져나가면 지지력이 줄어 정상부가 함몰될 수 있습니다. 이렇게 생긴 큰 함몰 지형이 칼데라입니다.",
          labels: [{ t: "칼데라", s: "함몰 분지", x: 0, z: 0 }],
        },
        {
          tag: "단계 4",
          name: "물이 고인 칼데라호",
          sea: -50,
          h: volCaldera,
          lake: 32,
          d: "칼데라 분지에 물이 모여 호수를 이룬 모습입니다. 백두산 천지는 칼데라호의 사례이며, 이 장면은 천지의 실측 지형이 아닙니다.",
          labels: [{ t: "칼데라호", s: "", x: -10, z: 0, y: 32 }],
        },
      ],
    },
    lava: {
      cat: "§ SECTION IV · 화산 지형",
      title: "화산 지형 ② — 용암대지와 주상절리",
      force: "in",
      forceLabel: "내적 작용",
      example: "철원 <b>용암대지</b> / 제주·한탄강 <b>주상절리</b>",
      cam: [170, 180, 235],
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
          name: "냉각 수축과 주상절리의 노출",
          sea: -50,
          h: lavaExposed,
          columns: true,
          d: "용암이 냉각·수축하면서 다각형 절리가 생깁니다. 주변이 침식되어 드러난 모습을 함께 표현했습니다. 냉각할 때 기둥이 위로 자라는 것은 아닙니다.",
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
      cam: [175, 165, 270],
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
      cam: [85, 250, 250],
      color: limeColor,
      stages: [
        {
          tag: "단계 1",
          name: "평평한 석회암 대지",
          sea: -50,
          h: karstFlat,
          d: "석회암이 지표에 드러난 대지입니다. 석회암은 탄산칼슘 퇴적물이나 생물의 유해 등이 쌓여 형성될 수 있습니다.",
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
      cam: [230, 155, 250],
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
          labels: [{ t: "해식 노치", s: "해수면 부근", x: 17, z: 8, y: 5 }],
        },
        {
          tag: "단계 3",
          name: "절벽 붕괴 → 해식애·파식대",
          sea: COAST_SEA,
          h: coastCliffYoung,
          d: "절벽이 후퇴하며 앞쪽에 완만한 파식대가 발달합니다. 여기서는 지형을 관찰하도록 파식대가 드러난 낮은 수위 조건을 표현했습니다.",
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
  let viewKind = "oblique";
  const viewTarget = new THREE.Vector3();
  function fitSceneView() {
    const direction =
      viewKind === "top"
        ? new THREE.Vector3(0, 1, 0.001)
        : new THREE.Vector3(...scenarios[curKey].cam).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    viewTarget.set(0, -16, 0);
    let distance = 0;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    function include(x, y, z) {
      const dy = y - viewTarget.y,
        depth = x * direction.x + dy * direction.y + z * direction.z;
      const px = x * right.x + dy * right.y + z * right.z,
        py = x * up.x + dy * up.y + z * up.z;
      distance = Math.max(
        distance,
        depth + Math.abs(px) / (tan * camera.aspect),
        depth + Math.abs(py) / tan,
      );
    }
    for (let i = 0; i < pos.count; i++)
      include(pos.getX(i), targetHeights[i], pos.getZ(i));
    for (const x of [-125, 125])
      for (const z of [-125, 125]) include(x, -22, z);
    targetCamPos.copy(viewTarget).addScaledVector(direction, distance * 1.055);
    isMovingCamera = true;
  }

  function stageHeight(st, x, z) {
    return st.h(x, z) + detail(x, z);
  }
  function rockSurface(st, x, z) {
    let y = stageHeight(st, x, z);
    if (st.columns)
      for (const column of basaltColumns.children) {
        const px = x - column.position.x,
          pz = z - column.position.z,
          r = colR * 0.97;
        let inside = true;
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3,
            b = ((k + 1) * Math.PI) / 3;
          const ax = r * Math.sin(a),
            az = r * Math.cos(a),
            bx = r * Math.sin(b),
            bz = r * Math.cos(b);
          if ((bx - ax) * (pz - az) - (bz - az) * (px - ax) > 1e-8) {
            inside = false;
            break;
          }
        }
        if (inside) y = Math.max(y, column.userData.columnTop);
      }
    return y;
  }
  const undercut = new THREE.Mesh(
    new THREE.BufferGeometry(),
    Landscape.rockMaterial({ color: 0x777267, side: THREE.DoubleSide }),
  );
  undercut.castShadow = true;
  undercut.receiveShadow = false;
  undercut.visible = false;
  scene.add(undercut);
  function rebuildUndercut(st) {
    undercut.visible = curKey === "coast" && curStage === 1;
    terrain.visible = !undercut.visible;
    walls.visible = !undercut.visible;
    if (!undercut.visible) return;
    const vertices = [];
    function crossSection(z) {
      const points = [];
      for (let x = -125; x <= 20; x += 2.5)
        points.push([x, stageHeight(st, x, z), z]);
      points.push(
        [24, coastLand(24, z), z],
        [24, 9, z],
        [16, 5, z],
        [24, 1, z],
      );
      for (let x = 26; x <= 125; x += 3)
        points.push([x, 1 - (x - 24) * 0.12, z]);
      points.push([125, 1 - 101 * 0.12, z]);
      return points;
    }
    const rows = [];
    for (let i = 0; i <= 100; i++) rows.push(crossSection(-125 + i * 2.5));
    for (let j = 0; j < rows.length - 1; j++)
      for (let i = 0; i < rows[j].length - 1; i++) {
        const a = rows[j][i],
          b = rows[j][i + 1],
          c = rows[j + 1][i],
          d = rows[j + 1][i + 1];
        for (const p of [a, c, b, b, c, d]) vertices.push(...p);
      }
    for (const row of [rows[0], rows.at(-1)]) {
      const points = row.map((p) => new THREE.Vector2(p[0], p[1]));
      points.push(new THREE.Vector2(125, -22), new THREE.Vector2(-125, -22));
      const cap = new THREE.ShapeGeometry(
        new THREE.Shape(points),
      ).toNonIndexed();
      const a = cap.attributes.position;
      for (let i = 0; i < a.count; i++)
        vertices.push(a.getX(i), a.getY(i), row[0][2]);
      cap.dispose();
    }
    for (const index of [0, rows[0].length - 1])
      for (let j = 0; j < rows.length - 1; j++) {
        const a = rows[j][index],
          b = rows[j + 1][index],
          c = [a[0], -22, a[2]],
          d = [b[0], -22, b[2]];
        for (const p of [a, b, c, c, b, d]) vertices.push(...p);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    undercut.geometry.dispose();
    undercut.geometry = g;
  }
  function setColor(target, x, z, y, cfn, slope) {
    if (cfn) target.copy(cfn(x, z, y));
    else target.copy(elevColor(y));
    const rocky = Landscape.smooth(0.35, 1.35, slope);
    if (curKey === "volcano") {
      target.copy(volColor(x, z, y));
      target.lerp(new THREE.Color(0x928878), rocky * 0.82);
      if (y < 26 && curStage >= 2 && Math.hypot(x, z) < 42)
        target.lerp(new THREE.Color(0x544e45), 0.6);
    } else if (curKey === "glacier") {
      const ice =
        curStage === 1 &&
        Math.abs(x) < 48 &&
        iceSurf(x, z) > uShape(x, z) + 0.4;
      if (!ice)
        target.copy(new THREE.Color(0x696c61)).lerp(palette.rock, rocky);
    } else if (curKey !== "lava") target.lerp(palette.rock, rocky * 0.78);
    target.multiplyScalar(0.89 + (Landscape.noise(x, z, 18) + 1) * 0.065);
    target.convertSRGBToLinear();
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
      const y = (L.y !== undefined ? L.y : stageHeight(st, L.x, L.z)) + 1;
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

    for (let i = 0; i < pos.count; i++)
      targetHeights[i] = stageHeight(st, pos.getX(i), pos.getZ(i));
    const stride = resolution + 1,
      cell = size / resolution;
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(i / stride),
        col = i % stride;
      const sx =
        (targetHeights[row * stride + Math.min(col + 1, resolution)] -
          targetHeights[row * stride + Math.max(0, col - 1)]) /
        (cell * (col === 0 || col === resolution ? 1 : 2));
      const sz =
        (targetHeights[Math.min(row + 1, resolution) * stride + col] -
          targetHeights[Math.max(0, row - 1) * stride + col]) /
        (cell * (row === 0 || row === resolution ? 1 : 2));
      setColor(
        targetColors[i],
        pos.getX(i),
        pos.getZ(i),
        targetHeights[i],
        cfn,
        Math.hypot(sx, sz),
      );
    }
    if (st.lake !== undefined) {
      // Clip only the closed crater basin, excluding low outer flanks.
      waterGeometry(
        craterLake,
        Landscape.basinWater(
          (x, z) =>
            Math.hypot(x * 0.94, z * 1.08) < 45 ? stageHeight(st, x, z) : 100,
          st.lake,
          49,
          144,
        ),
        st.lake,
      );
      craterLake.visible = true;
    } else craterLake.visible = false;
    if (st.sea > -40)
      waterGeometry(
        water,
        Landscape.basinWater((x, z) => stageHeight(st, x, z), st.sea, 125, 128),
        st.sea,
      );
    basaltColumns.visible = !!st.columns;
    rebuildUndercut(st);

    fitSceneView();
    targetWaterY = water.position.y;
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
    document.getElementById("btnPlay").innerText = "재생";
    document.getElementById("btnPlay").setAttribute("aria-pressed", "false");
  }
  function playAll() {
    if (!curKey) return;
    if (autoPlay) {
      stopAuto();
      return;
    }
    autoPlay = true;
    document.getElementById("btnPlay").innerText = "정지";
    if (curStage === scenarios[curKey].stages.length - 1) curStage = 0;
    applyStage();
  }

  // ----------------------------------------------------
  // ★ 라벨 위치 갱신 (3D → 화면 투영) ★
  // ----------------------------------------------------
  function updateLabels() {
    const w = container.clientWidth,
      h = container.clientHeight,
      used = [];
    for (const L of activeLabels) {
      tmpV.set(L.x, L.y, L.z).project(camera);
      if (tmpV.z > 1 || tmpV.z < -1) {
        L.el.style.display = "none";
        continue;
      }
      const anchorX = (tmpV.x * 0.5 + 0.5) * w,
        anchorY = (-tmpV.y * 0.5 + 0.5) * h;
      if (anchorX < 0 || anchorX > w || anchorY < 0 || anchorY > h) {
        L.el.style.display = "none";
        continue;
      }
      L.el.style.display = "block";
      const width = L.el.offsetWidth,
        height = L.el.offsetHeight;
      const left = Math.max(
        width / 2 + 8,
        Math.min(w - width / 2 - 8, anchorX),
      );
      let lift = 48,
        rect;
      for (let attempt = 0; attempt < 5; attempt++) {
        rect = {
          left: left - width / 2,
          right: left + width / 2,
          top: anchorY - lift,
          bottom: anchorY - lift + height,
        };
        if (
          !used.some(
            (r) =>
              rect.left < r.right + 8 &&
              rect.right > r.left - 8 &&
              rect.top < r.bottom + 8 &&
              rect.bottom > r.top - 8,
          )
        )
          break;
        lift += height + 10;
      }
      used.push(rect);
      L.el.style.left = left + "px";
      L.el.style.top = anchorY + "px";
      L.el.style.transform = `translate(-50%, ${-lift}px)`;
      L.el.style.setProperty("--leader-h", Math.max(4, lift - height) + "px");
      L.el.style.setProperty("--leader-x", anchorX - left + width / 2 + "px");
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
      controls.target.lerp(viewTarget, blend(0.05));
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
      geometry.computeBoundingSphere();
      updateWalls();

      if (!stillMorphing) {
        isMorphing = false;
      }
    }

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
      fitSceneView();
    }
  }
  window.addEventListener("resize", resizeView);

  // 초기 시작: 첫 시나리오 자동 실행
  loadScenario("volcano");
  curStage = 3;
  applyStage();

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
  document.getElementById("gridToggle").onchange = (event) => {
    grid.visible = event.target.checked;
    Lab.invalidate();
  };
  document.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        stopAuto();
        isMovingCamera = false;
        controls.autoRotate = false;
        document.getElementById("rotateToggle").checked = false;
        viewKind = button.dataset.view;
        fitSceneView();
        Lab.invalidate();
        document
          .querySelectorAll("[data-view]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      }),
  );
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
      y: x.map((x) => rockSurface(st, x, 0)),
      baseline: x.map((x) => first.h(x, 0) + Landscape.detail(x, 0, curKey, 0)),
    };
  }
  Lab.register({
    version: Landscape.version,
    profile,
    fallback(ctx, w, h) {
      const style = getComputedStyle(document.documentElement),
        p = profile();
      ctx.fillStyle = style.getPropertyValue("--sim-canvas").trim();
      ctx.fillRect(0, 0, w, h);
      const low = Math.min(...p.y, ...p.baseline),
        high = Math.max(...p.y, ...p.baseline) + 1;
      ctx.font = "14px sans-serif";
      ctx.fillStyle = style.getPropertyValue("--st-label").trim();
      ctx.fillText("중앙 단면 · 실선 현재 / 점선 첫 단계", 20, 30);
      for (const [values, color, dash] of [
        [p.baseline, "--st-label-3", [5, 5]],
        [p.y, "--st-accent-ink", []],
      ]) {
        ctx.beginPath();
        ctx.strokeStyle = style.getPropertyValue(color).trim();
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        values.forEach((v, i) => {
          const x = 20 + (i / (values.length - 1)) * (w - 40),
            y = h - 45 - ((v - low) / (high - low)) * (h - 100);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillText(
        "모형 높이 " + low.toFixed(1) + " ~ " + (high - 1).toFixed(1),
        20,
        h - 18,
      );
    },
    sceneInfo: () => ({
      key: curKey,
      stage: curStage,
      vertices: pos.count,
      waterLevel:
        scenarios[curKey].stages[curStage].lake ??
        scenarios[curKey].stages[curStage].sea,
    }),
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
