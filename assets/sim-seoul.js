/* Teaching atlas. Locations and corridors are schematic, not legal boundaries or live routes. */
(() => {
  const $ = (id) => document.getElementById(id);
  const map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: false,
  }).setView([37.52, 126.99], 10);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 18,
  });
  let loadedTiles = 0;
  const tileNotice = document.createElement("div");
  tileNotice.className = "tile-notice";
  tileNotice.hidden = true;
  tileNotice.setAttribute("role", "status");
  tileNotice.textContent =
    "배경지도 연결이 지연되고 있습니다. 신도시·교통 개념도는 계속 사용할 수 있습니다.";
  document.getElementById("map").parentElement.append(tileNotice);
  tiles.on("tileload", () => {
    loadedTiles++;
    tileNotice.hidden = true;
  });
  tiles.on("tileerror", () => {
    if (!loadedTiles) tileNotice.hidden = false;
  });
  tiles.addTo(map);
  const seoul = [
    [37.645, 126.915],
    [37.655, 126.95],
    [37.685, 126.995],
    [37.695, 127.045],
    [37.675, 127.085],
    [37.625, 127.095],
    [37.595, 127.125],
    [37.565, 127.175],
    [37.535, 127.145],
    [37.485, 127.135],
    [37.465, 127.105],
    [37.435, 127.055],
    [37.455, 126.995],
    [37.435, 126.955],
    [37.435, 126.915],
    [37.465, 126.885],
    [37.485, 126.825],
    [37.525, 126.825],
    [37.555, 126.795],
    [37.585, 126.815],
    [37.585, 126.865],
    [37.605, 126.885],
    [37.625, 126.915],
  ];
  L.polygon(seoul, {
    color: "#586b56",
    weight: 1.4,
    fillColor: "#6a8160",
    fillOpacity: 0.16,
  })
    .bindTooltip("서울 · 경계를 단순화한 개념도")
    .addTo(map);
  L.circleMarker([37.5665, 126.978], {
    radius: 5,
    fillColor: "#374f39",
    color: "#fffce9",
    weight: 2,
    fillOpacity: 1,
  })
    .bindTooltip("서울 도심", {
      permanent: true,
      direction: "top",
      offset: [0, -7],
    })
    .addTo(map);
  const first = [
    ["분당", 37.38, 127.12, 3500],
    ["일산", 37.66, 126.77, 3500],
    ["평촌", 37.39, 126.96, 2200],
    ["산본", 37.36, 126.93, 1800],
    ["중동", 37.5, 126.76, 2300],
  ];
  const second = [
    ["동탄", 37.2, 127.09, 4200],
    ["판교", 37.4, 127.11, 2700],
    ["김포한강", 37.64, 126.67, 3200],
    ["광교", 37.29, 127.05, 2700],
    ["위례", 37.47, 127.14, 1900],
    ["운정", 37.73, 126.74, 3200],
    ["양주", 37.82, 127.09, 2700],
  ];
  function towns(items, color, generation) {
    return L.layerGroup(
      items.flatMap(([name, lat, lng, radius]) => [
        L.circle([lat, lng], {
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 1.2,
        }).bindTooltip(`${name} · ${generation}기 신도시`),
        L.circleMarker([lat, lng], {
          radius: 3,
          color: "#fffce9",
          weight: 1,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindTooltip(name, {
            permanent: true,
            direction: "top",
            offset: [0, -4],
          })
          .bindPopup(
            `<b>${name}</b><br>${generation}기 신도시의 대표 위치<br><small>원은 실제 개발 경계를 뜻하지 않습니다.</small>`,
          ),
      ]),
    );
  }
  const firstLayer = towns(first, "#328975", 1),
    secondLayer = towns(second, "#b47b38", 2);
  const localRoutes = L.layerGroup(
    [
      [
        [37.52, 127.04],
        [37.38, 127.12],
      ],
      [
        [37.56, 126.92],
        [37.66, 126.77],
      ],
      [
        [37.48, 126.98],
        [37.39, 126.96],
        [37.36, 126.93],
      ],
      [
        [37.53, 126.9],
        [37.5, 126.76],
      ],
    ].map((coords) =>
      L.polyline(coords, {
        color: "#578775",
        weight: 2,
        dashArray: "4 6",
        opacity: 0.8,
      }).bindTooltip("광역 전철 연결축 · 개념도"),
    ),
  );
  const ring = L.polyline(
    [
      [37.68, 126.75],
      [37.74, 127.05],
      [37.58, 127.17],
      [37.4, 127.1],
      [37.38, 126.9],
      [37.45, 126.75],
      [37.55, 126.74],
      [37.68, 126.75],
    ],
    { color: "#aa8b59", weight: 2, dashArray: "5 7", opacity: 0.8 },
  ).bindTooltip("수도권 순환 교통축 · 개념도");
  const express = L.layerGroup(
    [
      [
        "A",
        "#af6062",
        [
          [37.73, 126.74],
          [37.61, 126.92],
          [37.55, 126.97],
          [37.48, 127.1],
          [37.2, 127.09],
        ],
      ],
      [
        "B",
        "#69938d",
        [
          [37.38, 126.64],
          [37.52, 126.92],
          [37.55, 126.97],
          [37.58, 127.04],
          [37.65, 127.3],
        ],
      ],
      [
        "C",
        "#bf964c",
        [
          [37.84, 127.06],
          [37.63, 127.05],
          [37.58, 127.04],
          [37.51, 127.06],
          [37.26, 127.0],
        ],
      ],
    ].map(([name, color, coords]) =>
      L.polyline(coords, {
        color,
        weight: 3,
        opacity: 0.85,
        dashArray: "9 4",
      }).bindTooltip(`GTX-${name} 연결 방향 · 운행·계획 구분 없는 개념도`),
    ),
  );
  const phases = {
    1: {
      year: "1980",
      label: "집중",
      count: 0,
      area: "서울에 인구와 일자리, 도시 기능이 집중되면서 주택 부족과 혼잡이 커집니다. 서울 주변 지역에도 주거·산업 공간이 존재합니다.",
      transport:
        "도심으로 향하는 이동이 집중됩니다. 이후 주거지가 외곽으로 분산되면서 광역 교통의 중요성이 커집니다.",
    },
    2: {
      year: "1990",
      label: "교외화",
      count: 5,
      area: "분당·일산·평촌·산본·중동의 1기 신도시가 개발되면서 서울 외곽으로 주거 공간이 넓어집니다.",
      transport:
        "광역 전철의 연결과 확장으로 서울과 신도시 사이의 통근이 활발해집니다. 집과 일터가 서로 다른 도시에 놓이는 경우가 늘어납니다.",
    },
    3: {
      year: "2000",
      label: "다핵화",
      count: 12,
      area: "판교·동탄·김포한강·광교 등 2기 신도시로 개발이 이어집니다. 일부 거점은 주거 기능과 함께 업무·산업 기능도 갖춥니다.",
      transport:
        "순환 도로와 광역버스 등 교통망이 거점들을 연결합니다. 서울 중심의 이동에 더해 주변 도시 사이의 이동도 중요해집니다.",
    },
    4: {
      year: "2020",
      label: "광역화",
      count: 12,
      area: "행정구역을 넘어 주거·일자리·서비스 이용이 연결됩니다. 대도시권의 확대는 통근과 지역 간 기능 분담을 함께 바꿉니다.",
      transport:
        "GTX 등 광역급행 교통은 장거리 이동의 시간 부담을 줄이는 방향으로 추진됩니다. 표시된 선은 연결 방향이며, 실제 개통 상태나 운행 시간표가 아닙니다.",
    },
  };
  function update() {
    const phase = Number($("stageSlider").value),
      data = phases[phase];
    for (const layer of [firstLayer, secondLayer, localRoutes, ring, express])
      map.removeLayer(layer);
    if ($("townToggle").checked) {
      if (phase >= 2) firstLayer.addTo(map);
      if (phase >= 3) secondLayer.addTo(map);
    }
    if ($("transportToggle").checked) {
      if (phase >= 2) localRoutes.addTo(map);
      if (phase >= 3) ring.addTo(map);
      if (phase >= 4) express.addTo(map);
    }
    $("stageLabel").innerHTML = `${data.year}<small>s</small>`;
    $("descArea").textContent = data.area;
    $("descTransport").textContent = data.transport;
    $("cityCount").innerHTML = `${data.count}<small>곳</small>`;
    $("phaseValue").textContent = data.label;
    Lab.setPresets("stageSlider", phase);
    $("stageSlider").setAttribute(
      "aria-valuetext",
      `${data.year}년대, ${data.label}`,
    );
  }
  $("stageSlider").addEventListener("input", update);
  $("townToggle").addEventListener("change", update);
  $("transportToggle").addEventListener("change", update);
  $("resetView").onclick = () =>
    map.fitBounds(
      [
        [37.16, 126.63],
        [37.85, 127.31],
      ],
      {
        padding: [18, 18],
        animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
    );
  new ResizeObserver(() => map.invalidateSize()).observe($("map"));
  update();
  $("resetView").click();
  Lab.ready();
})();
