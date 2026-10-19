// 기후 그래프(climate.html) — 관측소 평년값으로 기후 그래프를 그리고, 쾨펜 기호를 왜 그렇게 정했는지 보여 준다.
// 자료: data/climate/stations.json (scripts/build-climate-data.mjs) · 바탕 지도: data/climate/basemap.json (scripts/build-climate-map.mjs)
// 고른 조건은 모두 주소(?c=…&v=…)에 담겨, 주소 하나로 같은 화면을 다시 연다.
import { classify, NAMES, GROUPS } from './climate-koppen.mjs?v=d1b47990';
import { climograph, compareLines, hythergraph, sharedScale, legendMark, marker, MONTHS, view } from './climate-chart.mjs?v=0feaf1f0';
import { openShare, SHARE_ICON } from './share-link.mjs?v=53919a56';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => r1(v).toLocaleString('ko-KR');
const MAX = 6;
const latTxt = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const lonTxt = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
const REGION = { as: '아시아', eu: '유럽', af: '아프리카', na: '북아메리카', sa: '남아메리카', oc: '오세아니아', an: '남극', kr: '한반도' };

// ── 질문으로 고르기 ──
// 곳 이름은 stations.json 의 name. why() 의 숫자는 자료에서 바로 계산한다(글에 숫자를 박아 두지 않는다).
const SETS = [
  {
    id: 'west-east', view: 'world', names: ['리스본', '샌프란시스코', '서울'],
    q: '위도가 거의 같은데, 왜 서울만 여름에 비가 쏟아질까?',
    look: '7월 강수량과 1월 강수량',
    why: () => '리스본과 샌프란시스코는 대륙의 서쪽 끝입니다. 여름이면 아열대 고기압이 올라와 하늘을 덮어 비가 거의 오지 않고, 겨울에는 편서풍을 타고 바다의 저기압이 비를 몰고 옵니다. 같은 위도의 서울은 대륙의 동쪽이라 여름에 바다에서 계절풍이 불어 들어와 장마와 집중 호우가 옵니다.',
  },
  {
    id: 'ocean', view: 'world', names: ['밴쿠버', '위니펙'],
    q: '둘 다 북위 49° 근처인데, 연교차는 왜 이렇게 다를까?',
    look: '가장 따뜻한 달과 가장 추운 달의 차이(연교차)',
    why: (S) => `바다는 땅보다 천천히 데워지고 천천히 식습니다. 편서풍이 바다 공기를 실어 오는 밴쿠버의 연교차는 ${fmt(S('밴쿠버').range)}℃, 대륙 한가운데 위니펙은 ${fmt(S('위니펙').range)}℃입니다.`,
  },
  {
    id: 'itcz', view: 'world', names: ['아비장', '바마코', '니아메', '타만라세트', '알제'],
    q: '아프리카 서쪽을 남에서 북으로 — 비 오는 달이 어떻게 줄어들까?',
    look: '비가 오는 달의 수와 그 시기',
    why: () => '비를 몰고 다니는 적도 수렴대는 해를 따라 북반구 여름에 북쪽으로 올라왔다가 내려갑니다. 적도에서 멀수록 수렴대가 머무는 기간이 짧아 우기가 짧아지고, 수렴대가 닿지 않는 사하라는 사막입니다. 지중해 쪽 알제는 거꾸로 겨울에 비가 옵니다.',
    sim: { href: 'climate_itcz.html?lat=13&month=8', text: '적도 수렴대 실험에서 북위 13°의 8월 보기' },
  },
  {
    id: 'altitude', view: 'world', names: ['다르에스살람', '킬리만자로 공항', '나이로비', '아디스아바바'],
    q: '모두 적도 가까이인데, 왜 나이로비와 아디스아바바는 덥지 않을까?',
    look: '해발 높이와 연평균 기온',
    why: (S) => {
      const a = S('다르에스살람'), b = S('나이로비');
      const dh = b.elev - a.elev, dt = a.MAT - b.MAT;
      return `높이 올라갈수록 공기가 엷어져 기온이 낮아집니다. 다르에스살람(해발 ${fmt(a.elev)}m)과 나이로비(${fmt(b.elev)}m)는 높이가 ${fmt(dh)}m, 연평균 기온은 ${fmt(dt)}℃ 차이 납니다 — 100m 오를 때마다 약 ${fmt((dt / dh) * 100)}℃씩 낮아진 셈입니다. 그래서 적도 가까운 고원 도시는 1년 내내 봄 같은 날씨입니다.`;
    },
  },
  {
    id: 'flip', view: 'world', names: ['도쿄', '시드니', '부에노스아이레스'], south: true,
    q: '셋 다 온난 습윤 기후(Cfa)인데, 그래프가 뒤집힌 것처럼 보이는 까닭은?',
    look: '가장 따뜻한 달이 몇 월인지',
    why: () => '남반구는 1월이 여름입니다. 「남반구 계절 맞추기」를 켜면 남반구 자료를 6개월 밀어 같은 계절끼리 겹쳐 보여 줍니다. 계절을 맞추면 세 곳의 모양이 닮았다는 것이 드러납니다.',
  },
  {
    id: 'desert', view: 'world', names: ['리야드', '리마', '투루판'],
    q: '세 곳 모두 비가 거의 없다 — 그런데 까닭은 저마다 다르다',
    look: '위도, 바다와의 거리, 연평균 기온',
    why: () => '리야드는 아열대 고기압이 1년 내내 공기를 내리눌러 구름이 생기지 못합니다. 리마는 앞바다를 흐르는 찬 해류가 바닥 공기를 식혀 비구름이 자라지 못합니다. 투루판은 바다에서 수천 km 떨어진 데다 높은 산에 둘러싸인 분지라 수증기가 닿지 않습니다.',
  },
  {
    id: 'korea-ns', view: 'korea', names: ['서귀포', '부산', '서울', '중강진'],
    q: '한반도를 남에서 북으로 — 겨울과 여름 중 어느 쪽 차이가 클까?',
    look: '1월 기온과 8월 기온',
    why: (S) => {
      const a = S('서귀포'), b = S('중강진');
      return `서귀포와 중강진의 1월 기온 차이는 ${fmt(a.t[0] - b.t[0])}℃, 8월 기온 차이는 ${fmt(a.t[7] - b.t[7])}℃입니다. 겨울에는 해가 낮게 뜨는 데다 북서 계절풍이 대륙의 찬 공기를 몰고 와 북쪽일수록 훨씬 추워지고, 여름에는 한반도 전체가 덥고 습한 공기 아래 놓여 차이가 작습니다.`;
    },
  },
  {
    id: 'korea-ew', view: 'korea', names: ['인천', '강릉', '대관령'],
    q: '같은 위도인데, 강릉은 인천보다 겨울이 따뜻하고 대관령은 훨씬 춥다',
    look: '1월 기온과 해발 높이',
    why: (S) => `강릉은 태백산맥이 북서 계절풍을 막아 주고 동해가 가까워 인천보다 1월 기온이 ${fmt(S('강릉').t[0] - S('인천').t[0])}℃ 높습니다. 대관령은 해발 ${fmt(S('대관령').elev)}m의 고개라 같은 위도의 강릉보다 1월 기온이 ${fmt(S('강릉').t[0] - S('대관령').t[0])}℃ 낮습니다.`,
  },
  {
    id: 'ulleung', view: 'korea', names: ['서울', '울릉도'],
    q: '서울의 겨울은 메마른데, 울릉도는 왜 겨울에도 강수량이 많을까?',
    look: '12월 · 1월 강수량',
    why: (S) => `겨울 북서 계절풍은 대륙에서 나올 때는 메말라 있지만, 따뜻한 동해를 건너며 수증기를 머금습니다. 이 바람이 울릉도에 부딪혀 눈을 뿌립니다. 1월 강수량은 서울 ${fmt(S('서울').p[0])}mm, 울릉도 ${fmt(S('울릉도').p[0])}mm입니다.`,
  },
];
const DEFAULT = { world: ['싱가포르', '리야드', '로마', '서울'], korea: ['서울', '강릉', '대관령', '서귀포'] };

// ── 상태 ──
const state = { view: 'world', sel: [], slots: new Map(), cd: -3, hide: false, south: false, group: null, set: null, revealed: new Set() };
let DATA = [], BY = new Map(), BASE = null;

async function load() {
  const [s, b] = await Promise.all([
    fetch('data/climate/stations.json').then((r) => r.json()),
    fetch('data/climate/basemap.json').then((r) => r.json()),
  ]);
  BASE = b;
  DATA = s.stations;
  for (const st of DATA) BY.set(st.id, st);
  analyse();
}
// 기호는 경계 기준(cd)에 따라 바뀌므로 바꿀 때마다 다시 계산
function analyse() {
  for (const st of DATA) {
    st.k = classify(st, { cd: state.cd });
    Object.assign(st, { MAT: st.k.stats.MAT, MAP: st.k.stats.MAP, range: st.k.stats.range });
  }
}
const byName = (n) => DATA.find((s) => s.name === n);

// ── 주소 ↔ 상태 ──
function fromUrl() {
  const q = new URLSearchParams(location.search);
  state.view = q.get('v') === 'korea' ? 'korea' : 'world';
  state.cd = q.get('cd') === '0' ? 0 : -3;
  state.hide = q.get('hide') === '1';
  state.south = q.get('south') === '1';
  state.group = /^[ABCDE]$/.test(q.get('g') || '') ? q.get('g') : null;
  state.set = SETS.find((x) => x.id === q.get('set'))?.id || null;
  const ids = (q.get('c') || '').split(',').filter((id) => BY.has(id)).slice(0, MAX);
  setSelection(ids.length ? ids : DEFAULT[state.view].map((n) => byName(n)?.id).filter(Boolean));
}
function toUrl() {
  const q = new URLSearchParams();
  if (state.view === 'korea') q.set('v', 'korea');
  if (state.sel.length) q.set('c', state.sel.join(','));
  if (state.set) q.set('set', state.set);
  if (state.cd === 0) q.set('cd', '0');
  if (state.hide) q.set('hide', '1');
  if (state.south) q.set('south', '1');
  if (state.group) q.set('g', state.group);
  const url = location.pathname.split('/').pop() + (q.toString() ? '?' + q.toString().replace(/%2C/g, ',') : '');
  try { history.replaceState(null, '', url); } catch {}
  return new URL(url, location.href).href;
}
// 색은 고른 순서가 아니라 그 곳에 붙는다 — 하나를 빼도 나머지 색은 그대로
function setSelection(ids) {
  state.sel = [];
  state.slots = new Map();
  ids.forEach((id) => add(id, true));
}
function add(id, quiet) {
  if (state.sel.includes(id)) return true;
  if (state.sel.length >= MAX) {
    if (!quiet) say(`한 번에 ${MAX}곳까지 견줄 수 있습니다. 하나를 빼고 고르세요.`);
    return false;
  }
  const used = new Set(state.slots.values());
  let slot = 0;
  while (used.has(slot)) slot++;
  state.slots.set(id, slot);
  state.sel.push(id);
  return true;
}
function remove(id) {
  state.sel = state.sel.filter((x) => x !== id);
  state.slots.delete(id);
  state.revealed.delete(id);
}
const slotOf = (id) => state.slots.get(id) ?? 0;
function say(msg) {
  const el = $('#climStatus');
  el.textContent = msg;
  clearTimeout(say.t);
  say.t = setTimeout(() => (el.textContent = ''), 4200);
}

// ── 지도 ──
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, MM = Math.sqrt(3) / 2;
function project(st) {
  if (state.view === 'korea') {
    const K = BASE.korea, kx = Math.cos((37.5 * Math.PI) / 180), KS = K.w / ((K.lon1 - K.lon0) * kx);
    return [(st.lon - K.lon0) * kx * KS, (K.lat0 - st.lat) * KS];
  }
  const W = BASE.world;
  const l = (st.lon * Math.PI) / 180, p = (st.lat * Math.PI) / 180;
  const th = Math.asin(MM * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(th)) / (MM * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [W.w / 2 + x * W.s, W.h / 2 - y * W.s];
}
// 기후 무리마다 다른 모양 — 색을 못 가려도 모양으로 읽힌다
const GLYPH = {
  A: '<circle r="4.6"/>',
  B: '<path d="M0,-5.6L5,3.6H-5Z"/>',
  C: '<rect x="-4.2" y="-4.2" width="8.4" height="8.4" rx="1"/>',
  D: '<path d="M0,-5.6L5.6,0L0,5.6L-5.6,0Z"/>',
  E: '<path d="M-5,-1.7H-1.7V-5H1.7V-1.7H5V1.7H1.7V5H-1.7V1.7H-5Z"/>',
};
const mapView = { k: 1, x: 0, y: 0 };

function drawMap() {
  const korea = state.view === 'korea';
  const B = korea ? BASE.korea : BASE.world;
  const svg = $('#mapSvg');
  svg.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
  svg.setAttribute('aria-label', korea ? '한반도 관측소 지도' : '세계 관측소 지도');
  let base = '';
  if (korea) {
    base += `<rect class="mp-sea" width="${B.w}" height="${B.h}"/><path class="mp-land" d="${B.land}"/><path class="mp-border" d="${B.borders}"/>`;
    // 독도 — 축척에 비해 너무 작아 모양 대신 점과 이름으로
    const [dx, dy] = project({ lon: 131.8667, lat: 37.2417 });
    base += `<g class="mp-dokdo"><circle cx="${dx}" cy="${dy}" r="2.4"/><text x="${dx}" y="${dy - 8}" text-anchor="middle">독도</text></g>`;
  } else {
    const P = B.parallels;
    base += `<path class="mp-sea" d="${B.sphere}"/><path class="mp-grid" d="${B.meridians}${P.grid}"/>`;
    base += `<path class="mp-line mp-tropic" d="${P.tropic}"/><path class="mp-line mp-polar" d="${P.polar}"/><path class="mp-line mp-eq" d="${P.eq}"/>`;
    base += `<path class="mp-land" d="${B.land}" fill-rule="evenodd"/><path class="mp-border" d="${B.borders}"/>`;
    // 위선 이름 — 지도 왼쪽 가장자리 안쪽
    const lab = (lat, txt) => { const [, y] = project({ lon: -20, lat }); return `<text class="mp-latlab" x="${B.w * 0.5 - 300}" y="${y - 3}">${txt}</text>`; };
    base += lab(23.44, '북회귀선') + lab(0, '적도') + lab(-23.44, '남회귀선') + lab(66.56, '북극권');
  }
  $('#mapBase').innerHTML = base;
  drawMarkers();
  applyView();
}
function drawMarkers() {
  const korea = state.view === 'korea';
  const list = DATA.filter((s) => (s.region === 'kr') === korea);
  let g = '';
  for (const st of list) {
    const [x, y] = project(st);
    const grp = st.k.group;
    const sel = state.sel.includes(st.id) && !state.hide;
    const dim = state.group && grp !== state.group ? ' is-dim' : '';
    g += `<g class="mk g-${grp}${sel ? ' is-sel' : ''}${dim}" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px" data-id="${st.id}" tabindex="-1">`;
    g += `<circle class="mk-hit" r="11"/>${GLYPH[grp]}`;
    if (sel) g += `<text class="mk-no" y="-10" text-anchor="middle">${slotOf(st.id) + 1}</text>`;
    g += '</g>';
  }
  $('#mapMarks').innerHTML = g;
  // 고른 곳을 맨 위로
  $$('#mapMarks .is-sel').forEach((n) => n.parentNode.append(n));
}
function applyView() {
  const korea = state.view === 'korea';
  const B = korea ? BASE.korea : BASE.world;
  const { k } = mapView;
  const w = B.w / k, h = B.h / k;
  mapView.x = Math.min(Math.max(mapView.x, 0), B.w - w);
  mapView.y = Math.min(Math.max(mapView.y, 0), B.h - h);
  $('#mapSvg').setAttribute('viewBox', `${mapView.x} ${mapView.y} ${w} ${h}`);
  // 확대해도 표식은 덜 커지게. 한반도 지도는 화면에 작게 담기므로 표식을 조금 키운다
  $('#mapSvg').style.setProperty('--k', String((korea ? 1.3 : 1) / Math.sqrt(k)));
  $('#map').dataset.zoomed = k > 1 ? '1' : '0';
}
function zoomAt(f, cx = 0.5, cy = 0.5) {
  const B = state.view === 'korea' ? BASE.korea : BASE.world;
  const k0 = mapView.k, k1 = Math.min(8, Math.max(1, k0 * f));
  const px = mapView.x + (B.w / k0) * cx, py = mapView.y + (B.h / k0) * cy;
  mapView.k = k1;
  mapView.x = px - (B.w / k1) * cx;
  mapView.y = py - (B.h / k1) * cy;
  applyView();
}
function mapEvents() {
  const svg = $('#mapSvg'), fig = $('#map');
  $('#zoomIn').addEventListener('click', () => zoomAt(1.6));
  $('#zoomOut').addEventListener('click', () => zoomAt(1 / 1.6));
  $('#zoomReset').addEventListener('click', () => { mapView.k = 1; mapView.x = mapView.y = 0; applyView(); });
  // 끌어서 옮기기 · 두 손가락으로 확대
  const pts = new Map();
  let drag = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = false;
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vx: mapView.x, vy: mapView.y };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: mapView.k };
      drag = null;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return hover(e);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const rect = svg.getBoundingClientRect();
    const B = state.view === 'korea' ? BASE.korea : BASE.world;
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((pinch.k * d) / pinch.d / mapView.k, ((a[0] + b[0]) / 2 - rect.left) / rect.width, ((a[1] + b[1]) / 2 - rect.top) / rect.height);
      moved = true;
      return;
    }
    if (drag && mapView.k > 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      svg.setPointerCapture?.(e.pointerId);
      mapView.x = drag.vx - (dx / rect.width) * (B.w / mapView.k);
      mapView.y = drag.vy - (dy / rect.height) * (B.h / mapView.k);
      applyView();
      tip.hide();
    }
  });
  const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => tip.hide());
  svg.addEventListener('dblclick', (e) => {
    const rect = svg.getBoundingClientRect();
    zoomAt(1.8, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  });
  svg.addEventListener('click', (e) => {
    if (moved) return;
    const mk = e.target.closest('.mk');
    if (!mk) return;
    toggle(mk.dataset.id);
  });
  function hover(e) {
    const mk = e.target.closest('.mk');
    if (!mk) return tip.hide();
    const st = BY.get(mk.dataset.id);
    const sel = state.sel.includes(st.id);
    if (state.hide && sel) return tip.show(e, ['이름을 가린 곳'], fig);
    tip.show(e, [
      `${st.name} · ${st.country}`,
      `${st.k.code} ${NAMES[st.k.code]}`,
      `연평균 ${fmt(st.MAT)}℃ · 연강수량 ${fmt(st.MAP)}mm`,
      sel ? '누르면 뺍니다' : '누르면 고릅니다',
    ], fig);
  }
}
function toggle(id) {
  state.set = null;
  if (state.sel.includes(id)) remove(id);
  else if (!add(id)) return;
  render();
}

// ── 말풍선 ──
const tip = {
  el: null,
  show(e, lines, host) {
    if (!this.el || this.el.parentNode !== host) {
      this.el?.remove();
      this.el = document.createElement('div');
      this.el.className = 'clim-tip';
      this.el.setAttribute('role', 'status');
      host.append(this.el);
    }
    this.el.innerHTML = lines.map((l, i) => (i ? `<span>${esc(l)}</span>` : `<b>${esc(l)}</b>`)).join('');
    const r = host.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    this.el.style.display = 'grid';
    const tw = this.el.offsetWidth, th = this.el.offsetHeight;
    if (x + tw > r.width - 4) x = e.clientX - r.left - tw - 14;
    if (y + th > r.height - 4) y = e.clientY - r.top - th - 14;
    this.el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};
// 그래프 위 data-tip 은 한 곳에서 처리
function chartTips(root) {
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    const host = e.target.closest('.cg-wrap');
    $$('.cg-on', root).forEach((n) => n.classList.remove('cg-on'));
    if (!t || !host) return tip.hide();
    t.classList.add('cg-on');
    tip.show(e, t.dataset.tip.split('|'), host);
  });
  root.addEventListener('pointerleave', () => tip.hide());
}

// ── 범례(기후 무리) — 누르면 그 무리만 또렷하게 ──
function drawLegend() {
  const korea = state.view === 'korea';
  const list = DATA.filter((s) => (s.region === 'kr') === korea);
  const count = {};
  list.forEach((s) => (count[s.k.group] = (count[s.k.group] || 0) + 1));
  $('#legend').innerHTML = Object.keys(GROUPS).filter((g) => count[g]).map((g) => `
    <button type="button" class="lg-chip g-${g}" data-g="${g}" aria-pressed="${state.group === g}">
      <svg viewBox="-7 -7 14 14" aria-hidden="true">${GLYPH[g]}</svg>
      <b>${g}</b> ${GROUPS[g].name} <small>${count[g]}</small>
    </button>`).join('') + `<span class="lg-note">관측소 ${list.length}곳 · ${state.cd}℃ 기준</span>`;
}

// ── 찾기 ──
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');
function search(q) {
  const n = norm(q);
  if (!n) return [];
  const hits = [];
  for (const st of DATA) {
    const name = norm(st.name), country = norm(st.country), code = norm(st.k.code), cname = norm(NAMES[st.k.code]);
    let score = 0;
    if (name === n) score = 100;
    else if (name.startsWith(n)) score = 80;
    else if (name.includes(n)) score = 60;
    else if (code === n) score = 55;
    else if (country.includes(n)) score = 40;
    else if (cname.includes(n) || norm(GROUPS[st.k.group].name).includes(n)) score = 30;
    else if (n.length <= 3 && code.startsWith(n)) score = 25;
    if (score) hits.push([score + (st.region === 'kr') * (state.view === 'korea' ? 5 : 0), st]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, 10).map((h) => h[1]);
}
function searchEvents() {
  const input = $('#q'), list = $('#qList');
  let items = [], active = -1;
  const paint = () => {
    list.innerHTML = items.map((st, i) => `<li role="option" id="qo${i}" data-id="${st.id}" aria-selected="${i === active}">
      <svg viewBox="-7 -7 14 14" class="g-${st.k.group}" aria-hidden="true">${GLYPH[st.k.group]}</svg>
      <b>${esc(st.name)}</b><span>${esc(st.country)}</span><em>${st.k.code}</em>${state.sel.includes(st.id) ? '<i>고름</i>' : ''}</li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    input.setAttribute('aria-activedescendant', active >= 0 ? 'qo' + active : '');
  };
  const pick = (id) => {
    const st = BY.get(id);
    if (!st) return;
    const korea = st.region === 'kr';
    if ((state.view === 'korea') !== korea) { state.view = korea ? 'korea' : 'world'; resetZoom(); }
    state.set = null;
    if (!state.sel.includes(id) && !add(id)) return;
    input.value = '';
    items = [];
    paint();
    render();
    say(`${state.hide ? '한 곳' : st.name}을(를) 골랐습니다.`);
  };
  input.addEventListener('input', () => { items = search(input.value); active = items.length ? 0 : -1; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) pick(items[active].id);
    } else if (e.key === 'Escape') { items = []; paint(); }
  });
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(li.dataset.id); } });
  input.addEventListener('blur', () => setTimeout(() => { items = []; paint(); }, 120));
}

// ── 질문 목록 ──
function drawSets() {
  const sets = SETS.filter((s) => s.view === state.view);
  $('#sets').innerHTML = `<h2 class="clim-h">질문으로 고르기</h2><ol class="sets">${sets.map((s) => `
      <li><button type="button" class="set${state.set === s.id ? ' is-on' : ''}" data-set="${s.id}" aria-pressed="${state.set === s.id}">
        <span class="set__q">${esc(s.q)}</span><span class="set__who">${s.names.map(esc).join(' · ')}</span></button></li>`).join('')}
      <li><button type="button" class="set set--quiz" data-quiz="1"><span class="set__q">아무 곳이나 네 곳 — 이름을 가리고 기후 맞히기</span><span class="set__who">누를 때마다 새로 뽑습니다</span></button></li>
    </ol>`;
}
function useSet(id) {
  const s = SETS.find((x) => x.id === id);
  if (!s) return;
  state.set = id;
  state.view = s.view;
  if (s.south) state.south = true;
  state.hide = false;
  setSelection(s.names.map((n) => byName(n)?.id).filter(Boolean));
  resetZoom();
  render();
  $('#focus').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
function quiz() {
  // 서로 다른 기후 무리에서 한 곳씩 — 같은 무리 넷이면 맞히기가 너무 어렵다
  const pool = DATA.filter((s) => (s.region === 'kr') === (state.view === 'korea'));
  const groups = [...new Set(pool.map((s) => s.k.group))].sort(() => Math.random() - 0.5).slice(0, 4);
  const ids = groups.map((g) => { const c = pool.filter((s) => s.k.group === g); return c[Math.floor(Math.random() * c.length)].id; });
  while (ids.length < 4) { const s = pool[Math.floor(Math.random() * pool.length)]; if (!ids.includes(s.id)) ids.push(s.id); }
  state.set = null;
  state.hide = true;
  state.revealed.clear();
  setSelection(ids.sort(() => Math.random() - 0.5));
  render();
  $('#focus').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 지금 보는 질문 ──
function drawFocus() {
  const s = SETS.find((x) => x.id === state.set);
  const el = $('#focus');
  if (!s) { el.hidden = true; el.innerHTML = ''; return; }
  const S = (n) => byName(n);
  el.hidden = false;
  el.innerHTML = `<p class="focus__q">${esc(s.q)}</p>
    <p class="focus__look"><span>볼 것</span>${esc(s.look)}</p>
    <details class="focus__why"><summary>까닭 보기</summary><p>${esc(s.why(S))}</p></details>
    ${s.sim ? `<a class="focus__sim" href="${s.sim.href}">${esc(s.sim.text)} →</a>` : ''}`;
}

// ── 카드 ──
function card(st, scale) {
  const slot = slotOf(st.id);
  const hidden = state.hide && !state.revealed.has(st.id);
  const k = st.k, S = k.stats;
  const v = view(st, state.south);
  const mon = (i) => MONTHS[v.order[i]];
  const vi = (arr, val) => arr.indexOf(val);
  const hot = vi(v.t, Math.max(...v.t)), wet = vi(v.p, Math.max(...v.p));
  const sims = [];
  if (Math.abs(st.lat) <= 30) sims.push(`<a href="climate_itcz.html?lat=${Math.round(st.lat)}">적도 수렴대 실험 · 위도 ${latTxt(Math.round(st.lat))}</a>`);
  sims.push(`<a href="climate_3d.html?lat=${Math.round(st.lat * 2) / 2}">공전과 계절 실험 · 위도 ${latTxt(Math.round(st.lat * 2) / 2)}</a>`);
  const src = st.src.startsWith('wmo') ? 'WMO 평년값' : 'Meteostat 평년값';
  const approx = st.src.endsWith('*') ? ' · 평균 기온은 (최고+최저)÷2' : '';
  const no = `<span class="cc-no s${slot + 1}"><svg viewBox="-7 -7 14 14" aria-hidden="true">${marker(slot, 0, 0)}</svg>${slot + 1}</span>`;
  const head = hidden
    ? `<div class="cc-id">${no}<div><h3>이름을 가린 곳</h3><p>위도와 높이도 가렸습니다</p></div></div>
       <button type="button" class="cc-reveal btn-sub" data-reveal="${st.id}">정답 보기</button>`
    : `<div class="cc-id">${no}<div><h3>${esc(st.name)}</h3><p>${esc(st.country)} · ${latTxt(st.lat)} ${lonTxt(st.lon)}${st.elev != null ? ` · 해발 ${fmt(st.elev)}m` : ''}</p></div></div>
       <div class="cc-code g-${k.group}"><b>${k.code}</b><span>${NAMES[k.code]}</span></div>`;
  const nums = `<dl class="cc-nums">
      <div><dt>연평균 기온</dt><dd>${fmt(S.MAT)}<small>℃</small></dd></div>
      <div><dt>연교차</dt><dd>${fmt(S.range)}<small>℃</small></dd></div>
      <div><dt>연강수량</dt><dd>${fmt(S.MAP)}<small>mm</small></dd></div>
      <div><dt>가장 더운 달 · 비 많은 달</dt><dd class="cc-mo">${mon(hot)} · ${mon(wet)}</dd></div></dl>`;
  const why = hidden ? '' : `<ol class="cc-why">${k.steps.map((s) => `<li><span class="why-r">${esc(s.result)}</span><span class="why-t">${esc(s.text)}${s.detail ? `<small>${esc(s.detail)}</small>` : ''}</span></li>`).join('')}</ol>
      ${k.near.length ? `<p class="cc-near">${k.near.map(esc).join(' · ')}</p>` : ''}`;
  const table = `<table class="dtable cc-table"><caption class="st-sr-only">${hidden ? '가린 곳' : esc(st.name)}의 월별 평년값</caption>
      <thead><tr><th scope="col">월</th>${v.order.map((m) => `<th scope="col">${m + 1}</th>`).join('')}<th scope="col">연</th></tr></thead>
      <tbody><tr><th scope="row">기온 ℃</th>${v.t.map((x) => `<td>${fmt(x)}</td>`).join('')}<td>${fmt(S.MAT)}</td></tr>
      ${v.tx ? `<tr><th scope="row">최고</th>${v.tx.map((x) => `<td>${fmt(x)}</td>`).join('')}<td></td></tr><tr><th scope="row">최저</th>${v.tn.map((x) => `<td>${fmt(x)}</td>`).join('')}<td></td></tr>` : ''}
      <tr><th scope="row">강수 mm</th>${v.p.map((x) => `<td>${fmt(x)}</td>`).join('')}<td>${fmt(S.MAP)}</td></tr></tbody></table>`;
  return `<article class="cc${hidden ? ' is-hidden' : ''}" data-id="${st.id}">
    <header class="cc-head">${head}<button type="button" class="cc-x" data-remove="${st.id}" aria-label="${hidden ? '이 곳' : esc(st.name)} 빼기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></header>
    ${nums}
    <div class="cg-wrap">${climograph(st, scale, { south: state.south, hidden })}
      <p class="cg-key"><span class="key-t"></span>기온${st.tx ? ' <span class="key-band"></span>최고·최저' : ''} <span class="key-p"></span>강수량</p></div>
    ${why}
    <details class="cc-data"><summary>월별 값${hidden ? '' : ` · ${src}${approx}`}</summary><div class="cc-table-wrap">${table}</div></details>
    ${hidden ? '' : `<nav class="cc-sims" aria-label="이 위도로 시뮬레이터 열기">${sims.join('')}</nav>`}
  </article>`;
}
function drawCards() {
  const list = state.sel.map((id) => BY.get(id));
  const host = $('#cards');
  $('#pickedCount').textContent = `${list.length} / ${MAX}곳`;
  if (!list.length) {
    host.innerHTML = '<p class="clim-empty">지도의 점을 누르거나 위에서 찾아 고르세요. 고른 곳마다 기후 그래프와 기후 기호를 정한 까닭이 나옵니다.</p>';
    return;
  }
  const scale = sharedScale(list);
  host.innerHTML = list.map((st) => card(st, scale)).join('');
}
function drawCompare() {
  const list = state.sel.map((id) => BY.get(id));
  const host = $('#compare');
  if (list.length < 2) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  const name = (s) => (state.hide && !state.revealed.has(s.id) ? `${slotOf(s.id) + 1}번` : s.name);
  // 색 · 모양은 카드 번호(slot)를 따르고, 범례도 번호 순서로
  const L = list.slice().sort((a, b) => slotOf(a.id) - slotOf(b.id));
  const opt = { names: L.map(name), slots: L.map((s) => slotOf(s.id)), south: state.south };
  const cum = host.dataset.cum === '1';
  host.innerHTML = `<div class="cmp-head"><h2 class="clim-h">겹쳐 보기</h2>
      <ul class="cmp-legend">${L.map((s) => `<li>${legendMark(slotOf(s.id))}${esc(name(s))}</li>`).join('')}</ul></div>
    <div class="cmp-grid">
      <figure class="cg-wrap"><figcaption>월평균 기온</figcaption>${compareLines(L, 't', opt)}</figure>
      <figure class="cg-wrap"><figcaption>${cum ? '누적 강수량' : '월강수량'}
        <span class="st-segmented cmp-seg"><button type="button" class="st-segmented__item${cum ? '' : ' is-on'}" data-cum="0">달마다</button><button type="button" class="st-segmented__item${cum ? ' is-on' : ''}" data-cum="1">쌓아서</button></span></figcaption>
        ${compareLines(L, 'p', { ...opt, cumulative: cum })}</figure>
      <figure class="cg-wrap cmp-hy"><figcaption>기온–강수량 고리 <small>열두 달을 이은 모양 — 가로로 길면 계절에 따라 비가 크게 달라지고, 세로로 길면 연교차가 큽니다</small></figcaption>${hythergraph(L, opt)}</figure>
    </div>`;
}

// ── 내려받기 · 복사 ──
function rows() {
  const head = ['곳', '나라', '위도', '경도', '해발(m)', `기후(${state.cd}℃ 기준)`, '항목', ...MONTHS, '연'];
  const out = [head];
  for (const id of state.sel) {
    const s = BY.get(id);
    const base = [s.name, s.country, s.lat, s.lon, s.elev ?? '', s.k.code];
    out.push([...base, '평균 기온(℃)', ...s.t, r1(s.MAT)]);
    if (s.tx) out.push([...base, '평균 최고(℃)', ...s.tx, ''], [...base, '평균 최저(℃)', ...s.tn, '']);
    out.push([...base, '강수량(mm)', ...s.p, r1(s.MAP)]);
  }
  out.push([]);
  out.push(['출처: WMO 기후 평년값 1991–2020(각국 기상청 제출, NOAA NCEI 보관) · 일부 Meteostat 평년값 1991–2020 · 정리 Leet\'s Geographia']);
  return out;
}
function download() {
  if (state.hide) return say('이름을 가린 동안에는 내려받을 수 없습니다.');
  const csv = rows().map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `기후자료_${state.sel.map((id) => BY.get(id).name).join('_')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say('CSV 파일을 내려받았습니다. 엑셀과 한글에서 열 수 있습니다.');
}
async function copyTable() {
  if (state.hide) return say('이름을 가린 동안에는 복사할 수 없습니다.');
  try {
    await navigator.clipboard.writeText(rows().map((r) => r.join('\t')).join('\n'));
    say('표를 복사했습니다. 엑셀이나 한글 표에 붙여 넣으세요.');
  } catch { say('복사하지 못했습니다. CSV로 받아 주세요.'); }
}

// ── 화면 전체 ──
function syncControls() {
  $$('#viewSeg .st-segmented__item').forEach((b) => { const on = b.dataset.value === state.view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $$('#cdSeg .st-segmented__item').forEach((b) => { const on = Number(b.dataset.value) === state.cd; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  segThumb($('#viewSeg'));
  segThumb($('#cdSeg'));
  $('#optHide').setAttribute('aria-pressed', String(state.hide));
  $('#optSouth').setAttribute('aria-pressed', String(state.south));
  $('#clim').dataset.view = state.view;
  $('#clim').dataset.hide = state.hide ? '1' : '0';
}
function segThumb(el) {
  if (!el) return;
  let th = el.querySelector('.st-segmented__thumb');
  if (!th) { th = document.createElement('span'); th.className = 'st-segmented__thumb'; el.prepend(th); }
  const on = el.querySelector('.st-segmented__item.is-on');
  if (!on || !on.offsetWidth) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
function resetZoom() { mapView.k = 1; mapView.x = mapView.y = 0; }
let lastView = null;
function render() {
  syncControls();
  if (lastView !== state.view) { drawMap(); lastView = state.view; } else drawMarkers();
  drawLegend();
  drawSets();
  drawFocus();
  drawCards();
  drawCompare();
  toUrl();
}

function controls() {
  const seg = (el, fn) => el.addEventListener('click', (e) => { const b = e.target.closest('.st-segmented__item'); if (b) fn(b.dataset.value); });
  seg($('#viewSeg'), (v) => {
    if (v === state.view) return;
    state.view = v;
    state.set = null;
    state.group = null;
    resetZoom();
    // 다른 쪽 지도의 곳은 그대로 두되, 아무것도 없으면 기본 곳을 고른다
    if (!state.sel.some((id) => (BY.get(id).region === 'kr') === (v === 'korea'))) setSelection(DEFAULT[v].map((n) => byName(n)?.id).filter(Boolean));
    render();
  });
  seg($('#cdSeg'), (v) => { state.cd = Number(v); analyse(); render(); say(`온대와 냉대를 최한월 ${state.cd}℃로 가릅니다.`); });
  $('#optHide').addEventListener('click', () => { state.hide = !state.hide; state.revealed.clear(); render(); });
  $('#optSouth').addEventListener('click', () => { state.south = !state.south; render(); });
  $('#share').innerHTML = SHARE_ICON + '공유';
  $('#share').addEventListener('click', () => {
    const names = state.hide ? `${state.sel.length}곳(이름 가림)` : state.sel.map((id) => BY.get(id).name).join(' · ');
    openShare(toUrl(), names ? `고른 곳: ${names}` : '');
  });
  $('#csv').addEventListener('click', download);
  $('#copy').addEventListener('click', copyTable);
  $('#clearSel').addEventListener('click', () => { state.sel = []; state.slots.clear(); state.set = null; render(); });
  $('#legend').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    state.group = state.group === b.dataset.g ? null : b.dataset.g;
    drawMarkers(); drawLegend(); toUrl();
  });
  $('#sets').addEventListener('click', (e) => {
    const b = e.target.closest('.set');
    if (!b) return;
    if (b.dataset.quiz) quiz(); else useSet(b.dataset.set);
  });
  $('#cards').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { state.set = null; remove(rm.dataset.remove); render(); return; }
    const rv = e.target.closest('[data-reveal]');
    if (rv) { state.revealed.add(rv.dataset.reveal); drawCards(); drawCompare(); }
  });
  $('#compare').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cum]');
    if (!b) return;
    $('#compare').dataset.cum = b.dataset.cum;
    drawCompare();
  });
  chartTips($('#cards'));
  chartTips($('#compare'));
  addEventListener('resize', () => { segThumb($('#viewSeg')); segThumb($('#cdSeg')); });
}

(async function init() {
  try {
    await load();
  } catch {
    $('#cards').innerHTML = '<p class="clim-empty">관측 자료를 불러오지 못했습니다. 새로고침해 주세요.</p>';
    return;
  }
  fromUrl();
  analyse();
  controls();
  mapEvents();
  searchEvents();
  render();
  document.body.dataset.ready = 'true';
})();
