// 새만금 간척과 통합적 관점. 같은 지도 위에 관점 네 개를 레이어로 겹친다(레이어 중첩).
//  · 시간 — Sentinel-2 cloudless(EOX) 해마다의 위성 영상을 왼쪽 · 오른쪽으로 밀어 견준다(위성 영상 시계열)
//  · 공간 — 하천 · 방조제 위 도로 · 시·군(OpenStreetMap, data/maps/perspectives/places.json)
//  · 사회 — 이해관계마다 다른 모양 · 색의 표시와 짧은 카드
//  · 윤리 — 인간 중심 · 생태 중심 두 쪽에서 묻는 질문 카드
// 카드에 쓴 사실은 모두 출처(정부 · 공공 기관 · 백과)에서 확인한 것만 쓰고, 판단이 갈리는 것은 질문으로 남긴다.
import { $, $$, esc, fmt, params, setParams, shareButton, initPage, loadLeaflet, darkBase, satellite } from './map-kit.mjs?v=6473793e';


// 2017년 층은 이 지역 확대 단계(11 이상)에서 영상이 비어 있어 뺐다(EOX 타일이 빈 그림을 돌려준다).
const YEARS = [2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const SRC = {
  molit: '국토교통부 「새만금사업 관련 QnA」(2019)',
  mpva: '국가보훈부 국립임실호국원 「새만금 방조제」 안내',
  court: '대법원 2006. 3. 16. 선고 2006두330 전원합의체 판결',
  bai: '감사원 「새만금 세계스카우트잼버리 추진실태」 감사 결과(2025. 4. 10. 공개)',
  osm: 'OpenStreetMap',
};
const LENS = [
  { id: 't', name: '시간', sub: '시대에 따른 변화' },
  { id: 's', name: '공간', sub: '위치와 자연환경' },
  { id: 'c', name: '사회', sub: '이해관계와 제도' },
  { id: 'e', name: '윤리', sub: '옳고 그름의 판단' },
];
const EVENTS = [
  { y: 1991, t: '방조제 공사를 시작했습니다(11월). 처음 목적은 농지를 만드는 것이었습니다.', s: ['mpva', 'molit'] },
  { y: 2006, t: '사업 계획을 취소해 달라는 소송에서 대법원이 정부 쪽 판단을 확정했습니다(3월).', s: ['court'] },
  { y: 2008, t: '새로 생길 땅의 쓰임을 농지 위주에서 산업 · 관광 등 여러 용도로 바꾸었습니다.', s: ['molit'] },
  { y: 2010, t: '19년 만에 방조제 33.9km를 다 지었습니다(4월). 공사 중 환경 논란으로 두 차례 멈추기도 했습니다.', s: ['mpva'] },
  { y: 2011, t: '종합개발계획에서 땅의 30%는 첨단 농업 용지, 70%는 산업 · 관광 · 물류 · 신재생 에너지 용지 등으로 정했습니다.', s: ['molit'] },
  { y: 2013, t: '새만금 특별법이 시행되고 새만금개발청이 생겼습니다(9월).', s: ['molit'] },
  { y: 2023, t: '제25회 세계스카우트잼버리가 부안 쪽 매립지에서 열렸습니다(8월).', s: ['bai'] },
];
// 사회 — 이해관계 무리(색 + 모양을 함께)
const GROUPS = {
  dev: { name: '개발 · 산업', c: '--s1', shape: 'circle' },
  fish: { name: '어민 · 바다', c: '--s2', shape: 'triangle' },
  farm: { name: '농업', c: '--s3', shape: 'square' },
  state: { name: '국가 · 법원', c: '--s4', shape: 'diamond' },
  guest: { name: '행사 · 방문객', c: '--s5', shape: 'cross' },
};
// at: places.json 의 지점 이름(또는 함수로 자료에서 계산)
const SOCIAL = [
  { id: 'farm', g: 'farm', at: '김제시', title: '김제 · 만경 평야 사람들',
    fact: '「새만금」은 김제 · 만경 평야를 함께 부르던 「금만」을 「만금」으로 바꾸고 「새」를 붙인 이름입니다. 1991년의 처음 목적은 농지였습니다.', s: ['molit'],
    q: '평야 옆 바다를 논으로 바꾸려 했던 까닭은 무엇이었을까요? 그 까닭은 지금도 같을까요?' },
  { id: 'fish', g: 'fish', at: 'mouth', title: '갯벌에서 일하던 사람들',
    fact: '만경강과 동진강은 지금 방조제 안쪽으로 흘러듭니다. 밀물과 썰물이 드나들던 하구가 방조제 안에 들게 되었습니다.', s: ['osm'],
    q: '조개를 캐고 고기를 잡던 사람들에게 방조제는 무엇을 바꾸었을까요? 시간 관점을 켜고 2016년과 지금을 견주어 보세요.' },
  { id: 'seawall', g: 'state', at: '신시배수갑문', title: '방조제와 법원',
    fact: '방조제는 1991년에 시작해 2010년에 끝났고 길이는 33.9km입니다. 2006년 대법원은 사업 계획을 취소해 달라는 소송에서 정부 쪽 판단을 확정했습니다.', s: ['mpva', 'court'],
    q: '법원이 「계속해도 된다」고 판단한 것은 「옳다」는 뜻과 같을까요?' },
  { id: 'energy', g: 'dev', at: 'solar', title: '매립지 위 태양광',
    fact: '군산 쪽 매립지에 「새만금 공유수면매립지 태양광」 발전소 세 곳이 지도에 그려져 있습니다. 2011년 계획은 땅의 70%를 산업 · 신재생 에너지 등에 쓰기로 했습니다.', s: ['osm', 'molit'],
    q: '땅의 쓰임이 농지에서 산업 · 에너지로 바뀌면, 이익을 보는 사람과 지역은 어디일까요?' },
  { id: 'industry', g: 'dev', at: '새만금 주행시험장', title: '새 산업 용지',
    fact: '방조제 안쪽 새 땅에 「새만금 주행시험장」이 지도에 그려져 있습니다. 2008년에 땅의 쓰임이 산업 · 관광 등으로 넓어졌습니다.', s: ['osm', 'molit'],
    q: '일자리가 생기는 곳과, 바다를 잃은 곳이 같은 곳일까요? 지도에서 거리를 견주어 보세요.' },
  { id: 'jamboree', g: 'guest', at: '잼버리공원', title: '2023 세계스카우트잼버리',
    fact: '2023년 8월 제25회 세계스카우트잼버리가 부안 쪽 매립지에서 열렸습니다. 감사원은 야영에 맞지 않는 곳을 부지로 고르고, 물이 잘 빠지지 않게 개발한 점을 지적했습니다.', s: ['bai'],
    q: '새로 만든 땅은 어떤 쓰임에 알맞고, 어떤 쓰임에는 아직 이를까요? 땅이 된 지 얼마 안 된 곳이라는 점을 떠올려 보세요.' },
];
const ETHICS = [
  { id: 'eco', at: '새만금 환경생태지구', title: '남겨 둔 자연',
    fact: '매립지 한쪽에 「새만금 환경생태지구」가 지도에 그려져 있습니다. 계획에서 환경생태 용지는 42.0㎢입니다.', s: ['osm', 'molit'],
    human: '사람이 쉬고 배우는 공원이 생긴다면, 잃은 갯벌을 대신했다고 볼 수 있을까요?',
    eco: '갯벌에 살던 생물에게도 「대신할 곳」이 생긴 것일까요? 갯벌과 공원은 같은 자연일까요?' },
  { id: 'water', at: '가력배수갑문', title: '물을 가둘까, 흐르게 할까',
    fact: '배수갑문은 방조제 안쪽 물을 바다로 내보내는 문입니다. 국토교통부 계획에서 수질 개선에 드는 돈은 2.9조 원(총사업비의 13.0%)입니다.', s: ['molit'],
    human: '물을 맑게 하는 데 큰돈을 쓰는 것과 개발을 늦추는 것 가운데 무엇이 사람에게 이로울까요?',
    eco: '바닷물을 더 자주 드나들게 하면 갯벌 생물에게는 무엇이 달라질까요? 그 대신 포기해야 하는 것은 무엇일까요?' },
  { id: 'museum', at: '국립새만금간척박물관', title: '무엇을 기억할까',
    fact: '방조제 남쪽 끝 가까이에 「국립새만금간척박물관」이 있습니다.', s: ['osm'],
    human: '박물관은 간척 공사의 기술과 과정을 기록합니다. 사람의 입장에서 남겨야 할 기록은 무엇일까요?',
    eco: '사라진 갯벌과 그곳의 생물도 기억해야 할 역사일까요? 박물관이라면 그것을 어떻게 보여 줄 수 있을까요?' },
];

const st = { on: new Set(['t', 's', 'c', 'e']), f: 't', a: 2016, b: 2025, x: 0.5, k: null };
let L, map, P, layers = {}, markers = {}, satA, satB, playing = null;

// ── 계산 ──
const hav = (a, b) => {
  const R = 6371.0088, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const pt = (name) => P.points.find((p) => p.name === name);
function where(at) {
  if (at === 'mouth') { // 만경강 옛 하구 — 방조제 안쪽(동경 126.62° 가까이)을 지나는 강 선 위의 점
    const all = P.lines['만경강'].flat();
    const w = all.reduce((m, p) => (Math.abs(p[0] - 126.62) < Math.abs(m[0] - 126.62) ? p : m));
    return [w[1], w[0]];
  }
  if (at === 'solar') {
    const s = P.points.filter((p) => p.name.startsWith('새만금 공유수면매립지 태양광'));
    return [s.reduce((a, p) => a + p.lat, 0) / s.length, s.reduce((a, p) => a + p.lon, 0) / s.length];
  }
  const p = pt(at);
  return p ? [p.lat, p.lon] : null;
}
const srcTag = (s) => `<span class="pv-src">${s.map((k) => esc(SRC[k])).join(' · ')}</span>`;

// ── 표시 모양 ──
function shapeSvg(shape, color, n) {
  const f = `fill="var(${color})" stroke="var(--st-bedrock)" stroke-width="2"`;
  const body = {
    circle: `<circle cx="14" cy="14" r="11" ${f}/>`,
    triangle: `<path d="M14 2 L26 24 H2 Z" ${f}/>`,
    square: `<rect x="3.5" y="3.5" width="21" height="21" rx="2" ${f}/>`,
    diamond: `<path d="M14 1 L27 14 L14 27 L1 14 Z" ${f}/>`,
    cross: `<path d="M9 2h10v7h7v10h-7v7H9v-7H2V9h7z" ${f}/>`,
    ask: `<circle cx="14" cy="14" r="11" fill="var(--st-bedrock)" stroke="var(--st-label)" stroke-width="2"/>`,
  }[shape];
  const ty = shape === 'triangle' ? 19.5 : 18.2;
  return `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">${body}<text x="14" y="${ty}" text-anchor="middle" class="pv-mk-n">${esc(n)}</text></svg>`;
}
const keyShape = (shape, color) => `<svg viewBox="0 0 28 28" width="14" height="14" aria-hidden="true">${shapeSvg(shape, color, '').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;

function cardHtml(c, kind) {
  if (kind === 'e') {
    return `<div class="pv-card"><p class="pv-card-k">윤리 · 질문</p><h3>${esc(c.title)}</h3><p>${esc(c.fact)}</p>
      <dl><dt>인간 중심으로 보면</dt><dd>${esc(c.human)}</dd><dt>생태 중심으로 보면</dt><dd>${esc(c.eco)}</dd></dl>${srcTag(c.s)}</div>`;
  }
  const g = GROUPS[c.g];
  return `<div class="pv-card"><p class="pv-card-k">${keyShape(g.shape, g.c)} 사회 · ${esc(g.name)}</p><h3>${esc(c.title)}</h3><p>${esc(c.fact)}</p>
    <p class="pv-card-q">${esc(c.q)}</p>${srcTag(c.s)}</div>`;
}

// ── 지도 층 ──
function buildLayers() {
  // 시간 — 위성 두 장(왼쪽 a, 오른쪽 b). b 를 오른쪽만 보이게 자른다
  map.createPane('satA'); map.getPane('satA').style.zIndex = 210;
  map.createPane('satB'); map.getPane('satB').style.zIndex = 220;
  layers.t = L.layerGroup();
  // 공간
  map.createPane('geo'); map.getPane('geo').style.zIndex = 430;
  const g = L.layerGroup();
  const RIV = { 금강: [36.02, 126.82], 만경강: [35.88, 126.86], 동진강: [35.70, 126.82] };
  for (const name of ['금강', '만경강', '동진강']) {
    for (const line of P.lines[name]) L.polyline(line.map(([x, y]) => [y, x]), { pane: 'geo', className: 'pv-river', weight: 2.6, interactive: false }).addTo(g);
    L.marker(RIV[name], { pane: 'geo', interactive: false, keyboard: false, icon: L.divIcon({ className: 'pv-lab pv-lab--river', html: esc(name), iconSize: null }) }).addTo(g);
  }
  for (const line of P.lines['새만금로']) L.polyline(line.map(([x, y]) => [y, x]), { pane: 'geo', className: 'pv-dike', weight: 2.2, dashArray: '1 5', lineCap: 'round', interactive: false }).addTo(g);
  for (const n of ['군산시', '김제시', '부안군']) {
    const p = pt(n);
    if (!p) continue;
    L.circleMarker([p.lat, p.lon], { pane: 'geo', className: 'pv-town', radius: 4, weight: 2, fillOpacity: 1, interactive: false }).addTo(g);
    L.marker([p.lat, p.lon], { pane: 'geo', interactive: false, keyboard: false, icon: L.divIcon({ className: 'pv-lab pv-lab--town', html: esc(n), iconSize: null, iconAnchor: [-8, 10] }) }).addTo(g);
  }
  layers.s = g;
  // 사회 · 윤리 — 번호 붙은 표시
  map.createPane('cards'); map.getPane('cards').style.zIndex = 640;
  const mk = (c, kind, i) => {
    const ll = where(c.at);
    if (!ll) return null;
    const g = kind === 'e' ? { shape: 'ask', c: '--st-label' } : GROUPS[c.g];
    const n = kind === 'e' ? '?' : String(i + 1);
    const m = L.marker(ll, { pane: 'cards', title: c.title, alt: c.title, riseOnHover: true,
      icon: L.divIcon({ className: 'pv-mk', html: shapeSvg(g.shape, g.c, n), iconSize: [28, 28], iconAnchor: [14, 14] }) });
    m.bindPopup(cardHtml(c, kind), { maxWidth: 300, minWidth: 220, className: 'pv-pop', autoPanPadding: [24, 24] });
    m.on('popupopen', () => { st.k = c.id; $('#pvMap').classList.add('has-pop'); sync(); });
    m.on('popupclose', () => { $('#pvMap').classList.remove('has-pop'); if (st.k === c.id) { st.k = null; sync(); } });
    markers[c.id] = m;
    return m;
  };
  layers.c = L.layerGroup(SOCIAL.map((c, i) => mk(c, 'c', i)).filter(Boolean));
  layers.e = L.layerGroup(ETHICS.map((c, i) => mk(c, 'e', i)).filter(Boolean));
}

function setYears() {
  if (satA) map.removeLayer(satA);
  if (satB) map.removeLayer(satB);
  satA = satellite(L, st.a); satA.options.pane = 'satA';
  satB = satellite(L, st.b); satB.options.pane = 'satB';
  if (st.on.has('t')) { satA.addTo(map); satB.addTo(map); }
  clipSwipe();
  $('#pvYa').textContent = st.a; $('#pvYb').textContent = st.b;
}
function clipSwipe() {
  if (!satB || !map.hasLayer(satB)) return;
  const size = map.getSize();
  const nw = map.containerPointToLayerPoint([0, 0]);
  const se = map.containerPointToLayerPoint(size);
  const cx = nw.x + size.x * st.x;
  satB.getContainer().style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${cx}px)`;
  satA.getContainer().style.clip = `rect(${nw.y}px, ${cx}px, ${se.y}px, ${nw.x}px)`;
  const h = $('#pvSwipe');
  h.style.left = `${st.x * 100}%`;
  h.setAttribute('aria-valuenow', Math.round(st.x * 100));
  h.setAttribute('aria-valuetext', `왼쪽 ${st.a}년, 오른쪽 ${st.b}년, 경계 ${Math.round(st.x * 100)}%`);
}

function applyLayers() {
  for (const id of ['s', 'c', 'e']) {
    const want = st.on.has(id);
    if (want && !map.hasLayer(layers[id])) layers[id].addTo(map);
    if (!want && map.hasLayer(layers[id])) map.removeLayer(layers[id]);
  }
  const t = st.on.has('t');
  if (t && satA && !map.hasLayer(satA)) { satA.addTo(map); satB.addTo(map); }
  if (!t && satA && map.hasLayer(satA)) { map.removeLayer(satA); map.removeLayer(satB); }
  $('#pvMap').classList.toggle('is-sat', t);
  clipSwipe();
}

// ── 곁판: 관점 하나를 자세히 ──
function detail() {
  const f = st.f;
  if (f === 't') {
    return `<p class="pv-lead">위성 영상 두 장을 겹쳐 놓았습니다. 지도 가운데 손잡이를 밀면 왼쪽은 <b>${st.a}년</b>, 오른쪽은 <b>${st.b}년</b>입니다.</p>
      <div class="mk-field"><label for="pvA"><span>왼쪽 해</span><output>${st.a}</output></label><input type="range" id="pvA" min="0" max="${YEARS.length - 1}" step="1" value="${YEARS.indexOf(st.a)}"></div>
      <div class="mk-field"><label for="pvB"><span>오른쪽 해</span><output>${st.b}</output></label><input type="range" id="pvB" min="0" max="${YEARS.length - 1}" step="1" value="${YEARS.indexOf(st.b)}"></div>
      <div class="mk-tools"><button type="button" class="opt" id="pvPlay" aria-pressed="${!!playing}">${playing ? '멈추기' : '오른쪽을 해마다 넘기기'}</button></div>
      <p class="mk-note">방조제 안쪽에서 물빛(짙은 청록)이던 곳이 밝은 흙빛 · 풀빛으로 바뀌면 메우거나 물이 빠진 곳입니다. 계절과 물때가 해마다 달라 물빛이 바뀌기도 하니, 모양이 반듯한 땅과 새 도로를 찾아보세요.</p>
      <ol class="pv-time">${EVENTS.map((e) => `<li class="${e.y >= 2016 && e.y <= st.b ? 'is-in' : ''}"><b>${e.y}</b><span>${esc(e.t)} ${srcTag(e.s)}</span></li>`).join('')}</ol>`;
  }
  if (f === 's') {
    const gs = pt('군산시'), ba = pt('부안군'), gj = pt('김제시');
    const d1 = gs && ba ? hav([gs.lat, gs.lon], [ba.lat, ba.lon]) : null;
    const d2 = gs && gj ? hav([gs.lat, gs.lon], [gj.lat, gj.lon]) : null;
    return `<p class="pv-lead">새만금은 <b>군산 · 김제 · 부안</b> 세 시·군의 바다에 걸쳐 있습니다. 북쪽 끝은 금강 하구, 안쪽으로는 만경강과 동진강이 흘러듭니다.</p>
      <div class="mk-keys"><span><i style="background:var(--kr-s4)"></i>하천(금강 · 만경강 · 동진강)</span><span><i class="pv-key-dot"></i>방조제 위 도로(새만금로)</span><span><i class="pv-key-town"></i>시청 · 군청 자리</span></div>
      <div class="mk-why"><p>서해안은 바다가 얕고 밀물과 썰물의 차이가 커서 갯벌이 넓게 생깁니다. 여기에 큰 강 두 개가 흙을 실어 와 하구에 쌓았습니다.</p>
      <p>얕고 넓은 바다는 둑을 쌓아 막기 쉽고, 막으면 넓은 땅을 얻을 수 있습니다. 같은 까닭으로 이곳은 물고기와 조개가 많은 갯벌이기도 했습니다.</p></div>
      <p class="mk-note">지도 위 거리 — 군산시청에서 부안군청까지 직선으로 <b>${fmt(d1, 1)}km</b>, 김제시청까지 <b>${fmt(d2, 1)}km</b>입니다(OSM 위치로 계산). 방조제는 이 바다를 바깥쪽으로 크게 둘러 33.9km입니다.</p>`;
  }
  if (f === 'c') {
    return `<p class="pv-lead">같은 땅을 두고 기대하는 것이 사람마다 다릅니다. 표시를 누르면 지도 위에 카드가 열립니다.</p>
      <div class="mk-keys">${Object.values(GROUPS).map((g) => `<span>${keyShape(g.shape, g.c)}${esc(g.name)}</span>`).join('')}</div>
      <ol class="pv-list">${SOCIAL.map((c, i) => `<li><button type="button" data-k="${c.id}" aria-pressed="${st.k === c.id}"><span class="pv-n">${i + 1}</span>${keyShape(GROUPS[c.g].shape, GROUPS[c.g].c)}<span>${esc(c.title)}</span></button></li>`).join('')}</ol>
      <p class="mk-note">카드의 사실은 출처에서 확인한 것만 적었고, 판단이 필요한 부분은 질문으로 남겼습니다.</p>`;
  }
  return `<p class="pv-lead">윤리적 관점에서는 어떤 선택이 옳은지를 따집니다. 표시마다 두 입장의 질문을 견주어 보세요.</p>
    <dl class="pv-two"><dt>인간 중심</dt><dd>자연은 사람에게 쓸모가 있어서 소중하다고 봅니다.</dd><dt>생태 중심</dt><dd>사람을 포함한 생태계 전체가 그 자체로 소중하다고 봅니다.</dd></dl>
    <ol class="pv-list">${ETHICS.map((c) => `<li><button type="button" data-k="${c.id}" aria-pressed="${st.k === c.id}"><span class="pv-n">?</span><span>${esc(c.title)}</span></button></li>`).join('')}</ol>`;
}

function sync() {
  $$('#pvLens [data-l]').forEach((b) => {
    const id = b.dataset.l;
    b.querySelector('.pv-sw').setAttribute('aria-checked', String(st.on.has(id)));
    b.classList.toggle('is-focus', st.f === id);
    b.querySelector('.pv-focus').setAttribute('aria-pressed', String(st.f === id));
  });
  $('#pvDetail').innerHTML = `<h2>${esc(LENS.find((l) => l.id === st.f).name)}적 관점</h2>${detail()}`;
  $('#pvSwipe').hidden = !st.on.has('t');
  $('#pvYears').hidden = !st.on.has('t');
  const n = st.on.size;
  $('#pvSay').innerHTML = n === 0 ? '<p>켠 관점이 없어 바탕 지도만 보입니다.</p>'
    : `<p>지금 켠 관점: <b>${[...st.on].map((id) => LENS.find((l) => l.id === id).name).join(' · ')}</b>. 하나씩 끄고 켜며 지도에서 달라지는 것을 견주어 보세요.</p>`;
  setParams({ on: [...st.on].join('') === 'tsce' ? null : [...st.on].join('') || '0', f: st.f === 't' ? null : st.f, a: st.a === 2016 ? null : st.a, b: st.b === 2025 ? null : st.b, k: st.k });
}

function toggle(id) {
  if (st.on.has(id)) st.on.delete(id); else { st.on.add(id); st.f = id; }
  applyLayers();
  sync();
}
function openCard(id) {
  const m = markers[id];
  if (!m) return;
  const kind = SOCIAL.some((c) => c.id === id) ? 'c' : 'e';
  if (!st.on.has(kind)) { st.on.add(kind); applyLayers(); }
  map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 11), { duration: 0.6 });
  setTimeout(() => m.openPopup(), 650);
}
function play() {
  if (playing) { clearInterval(playing); playing = null; sync(); return; }
  let i = YEARS.indexOf(st.a) + 1;
  const step = () => {
    if (i >= YEARS.length) { clearInterval(playing); playing = null; sync(); return; }
    st.b = YEARS[i++]; setYears(); sync();
  };
  playing = setInterval(step, 1600);
  step();
}

export async function main() {
  await initPage('perspectives');
  const q = params();
  if (q.get('on')) st.on = new Set(q.get('on') === '0' ? [] : q.get('on').split('').filter((c) => 'tsce'.includes(c)));
  if ('tsce'.includes(q.get('f') || 'x')) st.f = q.get('f');
  if (YEARS.includes(Number(q.get('a')))) st.a = Number(q.get('a'));
  if (YEARS.includes(Number(q.get('b')))) st.b = Number(q.get('b'));
  [L, P] = await Promise.all([loadLeaflet(), fetch('data/maps/perspectives/places.json').then((r) => r.json())]);

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left pv-stage">
      <figure class="mk-map pv-map" id="pvMap" aria-label="새만금 지도. 위성 영상 두 해를 견주고, 하천 · 지명과 이해관계 · 윤리 질문 카드를 겹쳐 봅니다." role="region">
        <div id="pvLeaf" class="pv-leaf"></div>
        <div class="pv-years" id="pvYears" aria-hidden="true"><span id="pvYa"></span><span id="pvYb"></span></div>
        <div class="pv-swipe" id="pvSwipe" role="slider" tabindex="0" aria-label="두 해 영상의 경계" aria-valuemin="0" aria-valuemax="100"><i></i><b><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6-6 6 6 6M15 6l6 6-6 6"/></svg></b></div>
      </figure>
      <aside class="mk-panel pv-panel" aria-label="관점 고르기">
        <h2>관점 켜고 끄기</h2>
        <ul class="pv-lens" id="pvLens">${LENS.map((l) => `<li data-l="${l.id}">
          <button type="button" class="pv-sw" role="switch" aria-checked="true" aria-label="${l.name} 관점 켜기"><i></i></button>
          <button type="button" class="pv-focus" aria-pressed="false"><b>${l.name}</b><small>${l.sub}</small></button></li>`).join('')}</ul>
        <div class="mk-why" id="pvSay"></div>
        <section class="pv-detail" id="pvDetail" aria-live="polite"></section>
        <div class="mk-tools"><button type="button" class="share-btn" id="pvShare">공유</button></div>
      </aside>
    </div>
    <section class="mk-panel pv-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>시간 관점만 켜 보세요. 무엇이 바뀌었는지는 보이지만, 왜 바뀌었는지는 보이나요? 그 까닭을 알려면 어떤 관점을 더 켜야 할까요?</li>
        <li>사회 관점의 표시들은 지도 위에서 서로 얼마나 떨어져 있나요? 이익을 보는 곳과 손해를 보는 곳이 같은 자리일까요?</li>
        <li>윤리 카드 하나를 골라 인간 중심과 생태 중심의 답을 각각 한 문장으로 써 보세요. 두 답이 함께 지켜질 수 있는 방법이 있을까요?</li>
        <li>우리 동네의 한 장소(공원, 시장, 재개발 지역)를 골라 네 관점으로 각각 한 줄씩 설명해 보세요.</li>
      </ol>
    </section>`;
  const yA = YEARS[0], yB = YEARS[YEARS.length - 1];
  $('#mkSource').innerHTML = `<p><b>위성 영상</b> Sentinel-2 cloudless by EOX IT Services GmbH(Copernicus Sentinel 자료를 고친 것) — 해마다 구름 없는 날의 영상을 모은 그림입니다. ${yA} · 2017년 층은 CC BY 4.0, 2018년부터는 CC BY-NC-SA 4.0. 2017년 층은 이 지역을 확대하면 영상이 비어 있어 뺐습니다. 한 해의 영상도 여러 날을 이어 붙인 것이라 찍은 날이 곳마다 다릅니다(${yA}~${yB}).</p>
    <p><b>지도 자료</b> © OpenStreetMap 기여자(ODbL) — 하천 · 방조제 위 도로 · 시·군 위치 · 시설 이름을 Overpass API로 ${esc(P.meta.fetched)}에 받았습니다(scripts/build-map-perspectives.mjs). 어두운 바탕 지도 © OpenStreetMap 기여자(색을 뒤집어 어둡게 보여 줌).</p>
    <p><b>사실 확인</b> ${esc(SRC.molit)} — 1991년 사업 시작(농지 조성), 2008년 용도 전환, 2011년 종합개발계획의 30 : 70, 2013년 특별법 · 새만금개발청, 방조제 33.9km, 이름의 유래, 환경생태 용지 42.0㎢, 수질 개선 2.9조 원. ${esc(SRC.mpva)} — 1991년 11월 착공, 2010년 4월 준공, 공사 두 차례 중지. ${esc(SRC.court)}. ${esc(SRC.bai)}(뉴시스 보도로 확인) — 잼버리 부지 선정과 배수 문제.</p>
    <p><b>계산 · 한계</b> 시청 · 군청 사이 거리는 OSM 위치로 하버사인 식(지구 반지름 6,371km)으로 잰 직선 거리입니다. 위성 영상은 해상도가 10m 안팎이라 작은 시설은 보이지 않고, 물빛은 계절 · 물때 · 탁도에 따라 달라 「물이 땅이 되었다」는 판단은 모양과 여러 해의 변화를 함께 보고 해야 합니다. 카드의 판단 질문에는 정답을 정해 두지 않았습니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .pv-stage { grid-template-columns: 340px minmax(0, 1fr); }
    @media (max-width: 900px) { .pv-stage { grid-template-columns: 1fr; } }
    .pv-map { height: min(80vh, 780px); min-height: 460px; }
    @media (min-width: 901px) { .pv-map { position: sticky; top: 76px; } }
    .pv-map .leaflet-pane svg { max-width: none !important; max-height: none !important; }
    .pv-river { stroke: var(--kr-s4); stroke-opacity: 0.95; }
    .pv-dike { stroke: #fff; stroke-opacity: 0.9; }
    .pv-town { stroke: #000; fill: #fff; }
    .pv-leaf { position: absolute; inset: 0; }
    .pv-map .leaflet-container { background: var(--st-bedrock-sunken); }
    .pv-years { position: absolute; z-index: 700; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; pointer-events: none; }
    .pv-years span { padding: 4px 10px; border-radius: var(--st-r-full); background: rgba(0,0,0,0.62); color: #fff; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .pv-swipe { position: absolute; z-index: 690; top: 0; bottom: 0; width: 44px; margin-left: -22px; cursor: ew-resize; touch-action: none; display: grid; place-items: center; }
    .pv-swipe i { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; background: rgba(255,255,255,0.85); }
    .pv-swipe b { position: relative; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #111; }
    .pv-swipe:focus-visible b { outline: 3px solid var(--st-accent); outline-offset: 2px; }
    .pv-lab { background: none; border: 0; white-space: nowrap; font-size: 12.5px; font-weight: 700; color: #fff; text-shadow: 0 0 3px #000, 0 0 6px #000; pointer-events: none; }
    .pv-lab--river { font-style: italic; font-weight: 600; color: var(--kr-s5); }
    .pv-mk { background: none; border: 0; }
    .pv-mk svg { display: block; overflow: visible; }
    .pv-mk-n { font: 700 11.5px var(--sans); fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,0.55); stroke-width: 2px; }
    .pv-mk:focus-visible { outline: 3px solid #fff; outline-offset: 2px; border-radius: 50%; }
    .pv-pop .leaflet-popup-content-wrapper { background: var(--st-surface-raised); color: var(--st-label); border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
    .pv-pop .leaflet-popup-tip { background: var(--st-surface-raised); }
    .pv-pop .leaflet-popup-content { margin: 14px 16px; }
    .pv-pop a.leaflet-popup-close-button { color: var(--st-label-3); }
    .pv-card { display: grid; gap: 7px; font-size: 13px; line-height: 1.6; letter-spacing: var(--track-ko); color: var(--st-label-2); }
    .pv-card p, .pv-card dl { margin: 0; }
    .pv-map.has-pop .pv-swipe, .pv-map.has-pop .pv-years { opacity: 0.2; pointer-events: none; }
    .pv-swipe, .pv-years { transition: opacity 200ms; }
    .pv-card h3 { font-size: 15px; font-weight: 700; color: var(--st-label); }
    .pv-card-k { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--st-label-3); }
    .pv-card-q { color: var(--st-label); }
    .pv-card dl { display: grid; gap: 3px; }
    .pv-card dt { font-size: 11.5px; font-weight: 700; color: var(--st-label-3); margin-top: 4px; }
    .pv-card dd { margin: 0; color: var(--st-label); }
    .pv-src { display: block; font-size: 11px; color: var(--st-label-3); line-height: 1.5; }
    .pv-time .pv-src, .pv-detail .pv-src { display: inline; }
    .pv-lens { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .pv-lens li { display: grid; grid-template-columns: 46px 1fr; align-items: center; gap: 8px; padding: 4px; border-radius: var(--st-r-inner); }
    .pv-lens li.is-focus { background: var(--st-fill-2); }
    .pv-sw { width: 42px; height: 26px; border-radius: 13px; border: 0; background: var(--st-fill); position: relative; cursor: pointer; }
    .pv-sw i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--st-label-2); transition: transform 200ms var(--st-ease), background 200ms; }
    .pv-sw[aria-checked="true"] { background: var(--st-accent); }
    .pv-sw[aria-checked="true"] i { transform: translateX(16px); background: #fff; }
    .pv-focus { display: grid; justify-items: start; gap: 1px; padding: 4px 6px; border: 0; background: none; text-align: left; cursor: pointer; color: var(--st-label); }
    .pv-focus b { font-size: 14px; font-weight: 700; }
    .pv-focus small { font-size: 11.5px; color: var(--st-label-3); }
    .pv-detail { display: grid; gap: 12px; }
    .pv-detail h2 { margin-top: 4px; }
    .pv-lead { font-size: 13.5px; line-height: 1.7; color: var(--st-label); letter-spacing: var(--track-ko); }
    .pv-time { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .pv-time li { display: grid; grid-template-columns: 40px 1fr; gap: 8px; font-size: 12.5px; line-height: 1.6; color: var(--st-label-3); letter-spacing: var(--track-ko); }
    .pv-time li.is-in { color: var(--st-label-2); }
    .pv-time b { font-variant-numeric: tabular-nums; color: var(--st-label); font-weight: 700; }
    .pv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .pv-list button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 0; border-radius: var(--st-r-inner); background: none; color: var(--st-label); font-size: 13px; text-align: left; cursor: pointer; letter-spacing: var(--track-ko); }
    .pv-list button:hover, .pv-list button[aria-pressed="true"] { background: var(--st-fill-2); }
    .pv-n { width: 18px; font-size: 11.5px; font-weight: 700; color: var(--st-label-3); text-align: center; font-variant-numeric: tabular-nums; }
    .pv-two { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 12.5px; line-height: 1.6; letter-spacing: var(--track-ko); }
    .pv-two dt { font-weight: 700; color: var(--st-label); }
    .pv-two dd { margin: 0; color: var(--st-label-2); }
    .pv-key-dot { background: none !important; border-top: 2px dotted var(--st-label); height: 0 !important; width: 14px !important; border-radius: 0 !important; }
    .pv-key-town { background: var(--st-label); border-radius: 50% !important; width: 8px !important; height: 8px !important; }
    .pv-think { margin-top: 16px; }
  `;
  document.head.append(style);

  map = L.map('pvLeaf', { zoomControl: false, maxZoom: 15, minZoom: 8, attributionControl: true });
  darkBase(L, map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  map.fitBounds([[35.66, 126.44], [36.0, 126.9]]);
  buildLayers();
  setYears();
  applyLayers();
  map.on('move zoom resize viewreset zoomend moveend', clipSwipe);

  // 밀기 손잡이
  const sw = $('#pvSwipe');
  L.DomEvent.disableClickPropagation(sw);
  const moveTo = (clientX) => { const r = $('#pvMap').getBoundingClientRect(); st.x = Math.min(0.98, Math.max(0.02, (clientX - r.left) / r.width)); clipSwipe(); };
  sw.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sw.setPointerCapture(e.pointerId); moveTo(e.clientX); });
  sw.addEventListener('pointermove', (e) => { if (sw.hasPointerCapture(e.pointerId)) moveTo(e.clientX); });
  sw.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05, Home: -1, End: 1 }[e.key];
    if (d == null) return;
    e.preventDefault();
    st.x = Math.min(0.98, Math.max(0.02, st.x + d)); clipSwipe();
  });

  const panel = $('.pv-panel');
  panel.addEventListener('click', (e) => {
    const sw2 = e.target.closest('.pv-sw');
    if (sw2) { toggle(sw2.closest('[data-l]').dataset.l); return; }
    const fo = e.target.closest('.pv-focus');
    if (fo) { const id = fo.closest('[data-l]').dataset.l; st.f = id; if (!st.on.has(id)) { st.on.add(id); applyLayers(); } sync(); return; }
    const k = e.target.closest('[data-k]');
    if (k) { openCard(k.dataset.k); return; }
    if (e.target.closest('#pvPlay')) play();
  });
  panel.addEventListener('input', (e) => {
    if (e.target.id === 'pvA' || e.target.id === 'pvB') {
      st[e.target.id === 'pvA' ? 'a' : 'b'] = YEARS[Number(e.target.value)];
      e.target.previousElementSibling.querySelector('output').textContent = YEARS[Number(e.target.value)];
      setYears();
      clearTimeout(panel._t);
      panel._t = setTimeout(sync, 250);
    }
  });
  shareButton($('#pvShare'), () => location.href, () => `켠 관점: ${[...st.on].map((id) => LENS.find((l) => l.id === id).name).join(' · ') || '없음'} · 위성 ${st.a}년 ↔ ${st.b}년`);
  sync();
  const k0 = q.get('k');
  if (k0 && markers[k0]) openCard(k0);
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">지도를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.</p>'; });
