// 지역 조사 지도 도구 — 지도 위에 점 · 선 · 면을 그리고, 거리 · 넓이를 재고, 이름 · 메모 · 범주를 붙여 나만의 조사 지도를 만든다.
// 그리기 · 재기는 외부 라이브러리 없이 직접 한다. 길이는 하버사인 식, 넓이는 구면 다각형 넓이 식(지구 반지름 6,378,137m).
// 작업은 이 브라우저의 localStorage 에만 저장한다(서버로 보내지 않는다). GeoJSON 내보내기 · 불러오기, 지도 그림(PNG) 내보내기.
// 주소 검색은 OpenStreetMap Nominatim — 사용 정책에 따라 단추를 눌렀을 때만, 1초에 한 번 넘게 묻지 않는다(자동 완성 없음).
import { $, $$, esc, fmt, params, setParams, shareButton, initPage, loadLeaflet, darkBase } from './map-kit.mjs?v=affb9c7a';

const KEY = 'mapFieldwork.v1';
// 범주 — 색(--s1~s6)과 모양 · 선 무늬를 함께 바꿔 색만으로 구분하지 않는다
const CATS = [
  { id: 'problem', name: '문제점', c: '--s2', shape: 'triangle', dash: '' },
  { id: 'facility', name: '시설', c: '--s1', shape: 'circle', dash: '9 5' },
  { id: 'photo', name: '사진 지점', c: '--s4', shape: 'square', dash: '2 6' },
  { id: 'safety', name: '안전', c: '--s5', shape: 'diamond', dash: '12 4 2 4' },
  { id: 'nature', name: '자연 · 녹지', c: '--s3', shape: 'cross', dash: '5 5' },
  { id: 'etc', name: '기타', c: '--s6', shape: 'ring', dash: '1 7' },
];
const cat = (id) => CATS.find((c) => c.id === id) || CATS[5];
const TYPES = { point: '점', line: '선', area: '면' };
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/';
const BASES = {
  // 어두운 지도 = map-kit 의 darkBase(OSM 표준 타일을 CSS 필터로 어둡게). 지도 그림(PNG)에 담으려고 crossOrigin 을 켜서 다시 얹는다
  dark: { name: '어두운 지도', make: (L) => { const l = darkBase(L, map); map.removeLayer(l); l.options.crossOrigin = 'anonymous'; return [l]; } },
  light: { name: '밝은 지도(OSM)', make: (L) => [
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: 'anonymous', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자' })] },
  sat: { name: '위성', make: (L) => [
    L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 19, crossOrigin: 'anonymous', attribution: 'Esri, Maxar, Earthstar Geographics, GIS 사용자 커뮤니티' })] },
};

const st = { mode: 'pan', cat: 'problem', base: 'dark', sel: null, draft: [], feats: [] };
let L, map, baseLayers = [], layers = {}, handles = [], draftLine, draftGuide, saveOk = true, lastSearch = 0;

// ── 재기 ──
const R_HAV = 6371008.8, R_AREA = 6378137, rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_HAV * Math.asin(Math.sqrt(h));
}
const pathLen = (ll, closed = false) => {
  let s = 0;
  for (let i = 1; i < ll.length; i++) s += dist(ll[i - 1], ll[i]);
  if (closed && ll.length > 2) s += dist(ll[ll.length - 1], ll[0]);
  return s;
};
/** 구면 위 다각형 넓이(m²) — 변마다 (λ2−λ1)(2 + sinφ1 + sinφ2) 를 더해 R²/2 를 곱한다 */
function areaOf(ll) {
  if (ll.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < ll.length; i++) {
    const [la1, lo1] = ll[i], [la2, lo2] = ll[(i + 1) % ll.length];
    s += rad(lo2 - lo1) * (2 + Math.sin(rad(la1)) + Math.sin(rad(la2)));
  }
  return Math.abs((s * R_AREA * R_AREA) / 2);
}
const fmtLen = (m) => (m < 1000 ? `${fmt(m, 0)}m` : `${fmt(m / 1000, m < 10000 ? 2 : 1)}km`);
const fmtArea = (a) => (a < 10000 ? `${fmt(a, 0)}m²` : a < 1e6 ? `${fmt(a / 1e4, 2)}ha · ${fmt(a / 1e6, 3)}km²` : `${fmt(a / 1e6, 2)}km²`);
function measure(f) {
  if (f.type === 'line') return fmtLen(pathLen(f.ll));
  if (f.type === 'area') return fmtArea(areaOf(f.ll));
  return `${f.ll[0][0].toFixed(5)}, ${f.ll[0][1].toFixed(5)}`;
}

// ── 모양 ──
function shapeSvg(shape, color, size = 22) {
  const f = `fill="var(${color})" stroke="#000" stroke-opacity="0.55" stroke-width="1.6"`;
  const body = {
    circle: `<circle cx="12" cy="12" r="8.5" ${f}/>`,
    triangle: `<path d="M12 2.5 L21.5 20 H2.5 Z" ${f}/>`,
    square: `<rect x="4" y="4" width="16" height="16" rx="1.5" ${f}/>`,
    diamond: `<path d="M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z" ${f}/>`,
    cross: `<path d="M8.5 3h7v5.5H21v7h-5.5V21h-7v-5.5H3v-7h5.5z" ${f}/>`,
    ring: `<circle cx="12" cy="12" r="7.5" fill="none" stroke="var(${color})" stroke-width="4.5"/><circle cx="12" cy="12" r="10" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1"/>`,
  }[shape];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
const lineKey = (c) => `<svg viewBox="0 0 24 12" width="22" height="11" aria-hidden="true"><path d="M1 6H23" stroke="var(${c.c})" stroke-width="3" stroke-dasharray="${c.dash ? c.dash.split(' ').map((v) => v / 2).join(' ') : ''}"/></svg>`;
function typeIcon(f) {
  const c = cat(f.cat);
  if (f.type === 'point') return shapeSvg(c.shape, c.c, 18);
  if (f.type === 'line') return lineKey(c);
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7 L14 3 L21 12 L15 21 L5 18 Z" fill="var(${c.c})" fill-opacity="0.35" stroke="var(${c.c})" stroke-width="2" stroke-dasharray="${c.dash ? c.dash.split(' ').map((v) => v / 2).join(' ') : ''}"/></svg>`;
}

// ── 저장 ──
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(toGeoJSON())); saveOk = true; } catch { saveOk = false; }
  $('#fwSaved').textContent = saveOk ? `이 브라우저에 저장됨 · 표시 ${st.feats.length}개` : '이 브라우저에는 저장할 수 없습니다(사생활 보호 모드 등). GeoJSON으로 내보내 두세요.';
}
function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j) fromGeoJSON(j, false); } catch { saveOk = false; }
}
function toGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: st.feats.map((f) => {
      const xy = f.ll.map(([la, lo]) => [Math.round(lo * 1e6) / 1e6, Math.round(la * 1e6) / 1e6]);
      const geometry = f.type === 'point' ? { type: 'Point', coordinates: xy[0] } : f.type === 'line' ? { type: 'LineString', coordinates: xy } : { type: 'Polygon', coordinates: [[...xy, xy[0]]] };
      const props = { name: f.name, memo: f.memo, category: cat(f.cat).name, categoryId: f.cat };
      if (f.type === 'line') props.length_m = Math.round(pathLen(f.ll));
      if (f.type === 'area') { props.area_m2 = Math.round(areaOf(f.ll)); props.perimeter_m = Math.round(pathLen(f.ll, true)); }
      return { type: 'Feature', geometry, properties: props };
    }),
  };
}
function fromGeoJSON(j, append = true) {
  const list = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [];
  let n = 0;
  if (!append) st.feats = [];
  for (const ft of list) {
    const g = ft?.geometry, p = ft?.properties || {};
    if (!g) continue;
    const cid = CATS.some((c) => c.id === p.categoryId) ? p.categoryId : (CATS.find((c) => c.name === p.category)?.id || 'etc');
    const base = { name: String(p.name ?? '').slice(0, 80), memo: String(p.memo ?? '').slice(0, 2000), cat: cid };
    const ok = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180;
    const toLL = (cs) => cs.filter(ok).map(([lo, la]) => [la, lo]);
    const push = (type, ll) => { if ((type === 'point' && ll.length) || (type === 'line' && ll.length > 1) || (type === 'area' && ll.length > 2)) { st.feats.push({ id: uid(), type, ll, ...base }); n++; } };
    if (g.type === 'Point') push('point', toLL([g.coordinates]));
    else if (g.type === 'MultiPoint') g.coordinates.forEach((c) => push('point', toLL([c])));
    else if (g.type === 'LineString') push('line', toLL(g.coordinates));
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c) => push('line', toLL(c)));
    else if (g.type === 'Polygon') { const r = toLL(g.coordinates[0] || []); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); push('area', r); }
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((pg) => { const r = toLL(pg[0] || []); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); push('area', r); });
  }
  return n;
}
const uid = () => Math.random().toString(36).slice(2, 9);

// ── 지도에 그리기 ──
function styleOf(f, selected) {
  const c = cat(f.cat);
  return { className: `fw-path fw-t-${f.type} fw-c-${c.id}${selected ? ' is-sel' : ''}`, weight: selected ? 5 : 3.5, dashArray: c.dash || null, fillOpacity: f.type === 'area' ? 0.28 : 0, lineCap: 'round', lineJoin: 'round' };
}
function labelText(f) {
  const nm = f.name || `${cat(f.cat).name} ${TYPES[f.type]}`;
  return f.type === 'point' ? nm : `${nm} · ${measure(f)}`;
}
function drawFeat(f) {
  if (layers[f.id]) map.removeLayer(layers[f.id]);
  const c = cat(f.cat), sel = st.sel === f.id;
  let lay;
  if (f.type === 'point') {
    lay = L.marker(f.ll[0], { icon: L.divIcon({ className: 'fw-pt' + (sel ? ' is-sel' : ''), html: shapeSvg(c.shape, c.c, sel ? 28 : 22), iconSize: sel ? [28, 28] : [22, 22] }),
      draggable: sel, keyboard: true, title: labelText(f), alt: labelText(f) });
    lay.on('drag', (e) => { const p = e.target.getLatLng(); f.ll = [[p.lat, p.lng]]; refreshInfo(); });
    lay.on('dragend', () => { save(); renderList(); });
  } else if (f.type === 'line') lay = L.polyline(f.ll, styleOf(f, sel));
  else lay = L.polygon(f.ll, styleOf(f, sel));
  lay.bindTooltip(esc(labelText(f)), { permanent: !!f.name || sel, direction: f.type === 'point' ? 'right' : 'center', offset: f.type === 'point' ? [12, 0] : [0, 0], className: 'fw-tip', interactive: false });
  lay.on('click', (e) => {
    if (st.mode !== 'pan') return; // 그리는 중에는 지도 클릭으로 넘긴다
    L.DomEvent.stop(e);
    select(f.id);
  });
  lay.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') select(f.id); });
  lay.addTo(map);
  layers[f.id] = lay;
}
function drawAll() {
  for (const id of Object.keys(layers)) if (!st.feats.some((f) => f.id === id)) { map.removeLayer(layers[id]); delete layers[id]; }
  st.feats.forEach(drawFeat);
  drawHandles();
}
// 고른 선 · 면의 꼭짓점 손잡이 — 끌어서 옮긴다
function drawHandles() {
  handles.forEach((h) => map.removeLayer(h));
  handles = [];
  const f = st.feats.find((x) => x.id === st.sel);
  if (!f || f.type === 'point' || st.mode !== 'pan') return;
  f.ll.forEach((p, i) => {
    const h = L.marker(p, { draggable: true, keyboard: false, icon: L.divIcon({ className: 'fw-handle', iconSize: [14, 14] }), zIndexOffset: 1000 });
    h.on('drag', (e) => { const q = e.target.getLatLng(); f.ll[i] = [q.lat, q.lng]; layers[f.id].setLatLngs(f.ll); layers[f.id].setTooltipContent(esc(labelText(f))); refreshInfo(); });
    h.on('dragend', () => { save(); renderList(); });
    h.addTo(map);
    handles.push(h);
  });
}

// ── 그리기 ──
function setMode(m) {
  if (st.draft.length) cancelDraft();
  st.mode = m;
  if (m !== 'pan') st.sel = null;
  map.getContainer().classList.toggle('is-drawing', m !== 'pan');
  m === 'pan' ? map.doubleClickZoom.enable() : map.doubleClickZoom.disable();
  drawAll();
  renderBar();
  renderEdit();
  renderList();
}
function updateDraft(cursor) {
  if (cursor && !Array.isArray(cursor)) cursor = [cursor.lat, cursor.lng];
  const pts = st.draft;
  if (!draftLine) {
    draftLine = L.polyline([], { className: `fw-path fw-draft fw-c-${st.cat}`, weight: 3, interactive: false }).addTo(map);
    draftGuide = L.polyline([], { className: `fw-path fw-guide fw-c-${st.cat}`, weight: 2, dashArray: '4 6', interactive: false }).addTo(map);
  }
  draftLine.setLatLngs(st.mode === 'area' && pts.length > 2 ? [...pts, pts[0]] : pts);
  const g = cursor && pts.length ? [pts[pts.length - 1], cursor, ...(st.mode === 'area' && pts.length > 1 ? [pts[0]] : [])] : [];
  draftGuide.setLatLngs(g);
  const live = cursor ? [...pts, cursor] : pts;
  let txt = '';
  if (st.mode === 'line') txt = pts.length ? `지금까지 ${fmtLen(pathLen(live))}` : '';
  if (st.mode === 'area') txt = live.length > 2 ? `넓이 ${fmtArea(areaOf(live))} · 둘레 ${fmtLen(pathLen(live, true))}` : pts.length ? `점 ${pts.length}개 — 3개 이상 찍으세요` : '';
  $('#fwLive').textContent = txt;
  $('#fwFinish').disabled = !((st.mode === 'line' && pts.length > 1) || (st.mode === 'area' && pts.length > 2));
  $('#fwUndo').disabled = !pts.length;
}
function clearDraftLayers() {
  if (draftLine) { map.removeLayer(draftLine); map.removeLayer(draftGuide); draftLine = draftGuide = null; }
}
function cancelDraft() { st.draft = []; clearDraftLayers(); if ($('#fwLive')) $('#fwLive').textContent = ''; }
function finishDraft() {
  const pts = st.draft;
  const ok = (st.mode === 'line' && pts.length > 1) || (st.mode === 'area' && pts.length > 2);
  if (!ok) return;
  const f = { id: uid(), type: st.mode, ll: pts.slice(), name: '', memo: '', cat: st.cat };
  st.feats.push(f);
  cancelDraft();
  st.mode = 'pan';
  map.getContainer().classList.remove('is-drawing');
  map.doubleClickZoom.enable();
  select(f.id);
  save();
}
function addPoint(ll) {
  const f = { id: uid(), type: 'point', ll: [ll], name: '', memo: '', cat: st.cat };
  st.feats.push(f);
  st.mode = 'pan';
  map.getContainer().classList.remove('is-drawing');
  map.doubleClickZoom.enable();
  select(f.id);
  save();
}
function select(id) {
  st.sel = id;
  drawAll();
  renderBar();
  renderEdit();
  renderList();
  if (id) setTimeout(() => $('#fwName')?.focus({ preventScroll: true }), 0);
}

// ── 화면 ──
function renderBar() {
  $$('#fwTools [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
  $$('#fwCats [data-c]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === st.cat)));
  $$('#fwBase [data-b]').forEach((b) => { const on = b.dataset.b === st.base; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  const help = {
    pan: '지도를 끌어 옮기고, 표시를 누르면 고칠 수 있습니다.',
    point: '지도에서 한 곳을 누르면 점이 찍힙니다.',
    line: '지도를 차례로 눌러 선을 그립니다. 마지막 점을 두 번 누르거나 「끝내기」(Enter)로 마칩니다.',
    area: '지도를 차례로 눌러 둘레를 그립니다. 첫 점을 다시 누르거나 「끝내기」(Enter)로 마칩니다.',
  }[st.mode];
  $('#fwHelp').textContent = help;
  $('#fwDrawOps').hidden = !(st.mode === 'line' || st.mode === 'area');
  setParams({ b: st.base === 'dark' ? null : st.base, c: `${map.getCenter().lat.toFixed(5)},${map.getCenter().lng.toFixed(5)},${map.getZoom()}` });
}
function refreshInfo() {
  const f = st.feats.find((x) => x.id === st.sel);
  if (!f) return;
  const m = $('#fwMeasure');
  if (m) m.innerHTML = measureHtml(f);
}
function measureHtml(f) {
  if (f.type === 'point') return `<span>위치</span><b>${f.ll[0][0].toFixed(5)}°N, ${f.ll[0][1].toFixed(5)}°E</b>`;
  if (f.type === 'line') return `<span>길이</span><b>${fmtLen(pathLen(f.ll))}</b><span>꼭짓점</span><b>${f.ll.length}개</b>`;
  return `<span>넓이</span><b>${fmtArea(areaOf(f.ll))}</b><span>둘레</span><b>${fmtLen(pathLen(f.ll, true))}</b><span>꼭짓점</span><b>${f.ll.length}개</b>`;
}
function renderEdit() {
  const f = st.feats.find((x) => x.id === st.sel);
  const box = $('#fwEdit');
  if (!f) {
    box.innerHTML = `<h2>고른 표시</h2><p class="mk-note">지도나 목록에서 표시를 누르면 여기서 이름 · 메모 · 범주를 붙이고 고칠 수 있습니다. 선과 면은 하얀 꼭짓점을 끌어 모양을 바꿉니다.</p>`;
    return;
  }
  box.innerHTML = `<h2>고른 표시 <small>${TYPES[f.type]}</small></h2>
    <dl class="fw-measure" id="fwMeasure">${measureHtml(f)}</dl>
    <div class="mk-field"><label for="fwName" class="mk-l"><span>이름</span></label><input id="fwName" class="fw-input" maxlength="80" value="${esc(f.name)}" placeholder="예: 통학로 좁은 보도"></div>
    <div class="mk-field"><span class="mk-l">범주</span><div class="fw-cats" role="radiogroup" aria-label="범주">${CATS.map((c) => `<button type="button" role="radio" aria-checked="${c.id === f.cat}" data-ec="${c.id}">${shapeSvg(c.shape, c.c, 16)}${esc(c.name)}</button>`).join('')}</div></div>
    <div class="mk-field"><label for="fwMemo" class="mk-l"><span>메모 — 본 것, 잰 것, 생각한 까닭</span></label><textarea id="fwMemo" class="fw-input" rows="4" maxlength="2000" placeholder="예: 아침 8시 무렵 학생과 차가 함께 지나감. 보도 폭 약 1m.">${esc(f.memo)}</textarea></div>
    <div class="mk-tools"><button type="button" class="opt" id="fwZoom">이 표시로 가기</button><button type="button" class="opt fw-del" id="fwDel">지우기</button></div>`;
}
function renderList() {
  const ul = $('#fwList');
  if (!st.feats.length) {
    ul.innerHTML = `<li class="fw-empty">아직 표시가 없습니다. 위에서 점 · 선 · 면 도구를 골라 지도에 그려 보세요.</li>`;
  } else {
    ul.innerHTML = st.feats.map((f, i) => `<li><button type="button" data-f="${f.id}" aria-pressed="${st.sel === f.id}">
      <span class="fw-i">${typeIcon(f)}</span><span class="fw-nm">${esc(f.name || '이름 없음')}<small>${esc(cat(f.cat).name)} · ${TYPES[f.type]}</small></span><span class="fw-ms">${f.type === 'point' ? '' : esc(measure(f))}</span></button></li>`).join('');
  }
  const sum = { point: 0, line: 0, area: 0 };
  st.feats.forEach((f) => sum[f.type]++);
  const tl = st.feats.filter((f) => f.type === 'line').reduce((a, f) => a + pathLen(f.ll), 0);
  const ta = st.feats.filter((f) => f.type === 'area').reduce((a, f) => a + areaOf(f.ll), 0);
  $('#fwSum').textContent = st.feats.length ? `점 ${sum.point} · 선 ${sum.line}(모두 ${fmtLen(tl)}) · 면 ${sum.area}(모두 ${fmtArea(ta)})` : '';
  $('#fwExport').disabled = $('#fwPng').disabled = !st.feats.length;
}

// ── 주소 검색(Nominatim) ──
async function search(q) {
  const out = $('#fwResults');
  q = q.trim();
  if (!q) return;
  const wait = 1100 - (Date.now() - lastSearch);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  out.hidden = false;
  out.innerHTML = '<li class="fw-empty">찾는 중…</li>';
  try {
    const b = map.getBounds();
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=kr&accept-language=ko&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!j.length) { out.innerHTML = '<li class="fw-empty">찾지 못했습니다. 동 이름이나 큰 건물 이름으로 다시 찾거나, 지도를 직접 옮겨 보세요.</li>'; return; }
    out.innerHTML = j.map((x) => `<li><button type="button" data-ll="${x.lat},${x.lon}" data-bb="${(x.boundingbox || []).join(',')}">${esc(x.display_name.split(',').slice(0, 3).join(','))}<small>${esc(x.display_name.split(',').slice(3, 6).join(','))}</small></button></li>`).join('');
  } catch {
    out.innerHTML = '<li class="fw-empty">지금은 주소 검색을 쓸 수 없습니다. 지도를 끌고 확대해 직접 찾아 주세요.</li>';
  }
}

// ── 내보내기 ──
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const today = () => new Date().toLocaleDateString('sv-SE'); // 이 컴퓨터 시각의 YYYY-MM-DD
async function exportPng() {
  const btn = $('#fwPng');
  btn.disabled = true;
  const size = map.getSize(), dpr = 2;
  const cv = document.createElement('canvas');
  cv.width = size.x * dpr; cv.height = size.y * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim() || '#888';
  g.fillStyle = st.base === 'light' ? '#f2efe9' : '#111';
  g.fillRect(0, 0, size.x, size.y);
  const box = map.getContainer().getBoundingClientRect();
  let tiles = true;
  for (const img of $$('.leaflet-tile-pane img.leaflet-tile-loaded', map.getContainer())) {
    const r = img.getBoundingClientRect();
    g.filter = img.closest('.mk-osm-dark') ? getComputedStyle(img.closest('.mk-osm-dark')).filter : 'none';
    try { g.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height); } catch { tiles = false; }
  }
  g.filter = 'none';
  try { cv.toDataURL(); } catch { // 바탕 그림이 막히면 표시만 그린다
    tiles = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#111'; g.fillRect(0, 0, size.x, size.y);
  }
  const P = (ll) => map.latLngToContainerPoint(ll);
  const used = new Set();
  for (const f of st.feats.filter((x) => x.type !== 'point').sort((a) => (a.type === 'area' ? -1 : 1))) {
    const c = cat(f.cat); used.add(c.id);
    g.beginPath();
    f.ll.forEach((p, i) => { const q = P(p); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); });
    if (f.type === 'area') { g.closePath(); g.globalAlpha = 0.28; g.fillStyle = col(c.c); g.fill(); g.globalAlpha = 1; }
    g.setLineDash(c.dash ? c.dash.split(' ').map(Number) : []);
    g.lineWidth = 3.5; g.strokeStyle = col(c.c); g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
    g.setLineDash([]);
  }
  const shapePath = (shape, x, y, s) => {
    g.beginPath();
    if (shape === 'circle' || shape === 'ring') g.arc(x, y, s * 0.42, 0, Math.PI * 2);
    else if (shape === 'triangle') { g.moveTo(x, y - s * 0.45); g.lineTo(x + s * 0.45, y + s * 0.38); g.lineTo(x - s * 0.45, y + s * 0.38); g.closePath(); }
    else if (shape === 'square') g.rect(x - s * 0.36, y - s * 0.36, s * 0.72, s * 0.72);
    else if (shape === 'diamond') { g.moveTo(x, y - s * 0.48); g.lineTo(x + s * 0.48, y); g.lineTo(x, y + s * 0.48); g.lineTo(x - s * 0.48, y); g.closePath(); }
    else { const a = s * 0.15, b = s * 0.42; g.moveTo(x - a, y - b); g.lineTo(x + a, y - b); g.lineTo(x + a, y - a); g.lineTo(x + b, y - a); g.lineTo(x + b, y + a); g.lineTo(x + a, y + a); g.lineTo(x + a, y + b); g.lineTo(x - a, y + b); g.lineTo(x - a, y + a); g.lineTo(x - b, y + a); g.lineTo(x - b, y - a); g.lineTo(x - a, y - a); g.closePath(); }
  };
  const drawShape = (shape, color, x, y, s) => {
    shapePath(shape, x, y, s);
    if (shape === 'ring') { g.lineWidth = s * 0.2; g.strokeStyle = color; g.stroke(); return; }
    g.fillStyle = color; g.fill(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
  };
  for (const f of st.feats.filter((x) => x.type === 'point')) {
    const c = cat(f.cat); used.add(c.id);
    const q = P(f.ll[0]);
    drawShape(c.shape, col(c.c), q.x, q.y, 22);
  }
  // 이름표
  g.font = '600 12px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  g.textBaseline = 'middle';
  for (const f of st.feats) {
    if (!f.name) continue;
    let q;
    if (f.type === 'point') q = P(f.ll[0]).add([14, 0]);
    else { const b = L.latLngBounds(f.ll).getCenter(); q = P(b); }
    const t = f.type === 'point' ? f.name : `${f.name} · ${measure(f)}`;
    g.textAlign = f.type === 'point' ? 'left' : 'center';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(t, q.x, q.y);
    g.fillStyle = '#fff'; g.fillText(t, q.x, q.y);
  }
  // 아랫단: 제목 · 범례 · 축척 · 출처
  const H = 58;
  g.fillStyle = 'rgba(18,18,20,0.88)';
  g.fillRect(0, size.y - H, size.x, H);
  g.textAlign = 'left'; g.fillStyle = '#fff';
  g.font = '700 14px Pretendard, "Malgun Gothic", sans-serif';
  g.fillText(`우리 동네 조사 지도 · ${today()}`, 12, size.y - H + 16);
  let x = 12;
  g.font = '500 12px Pretendard, "Malgun Gothic", sans-serif';
  for (const c of CATS.filter((k) => used.has(k.id))) {
    drawShape(c.shape, col(c.c), x + 7, size.y - H + 38, 14);
    g.fillStyle = '#ddd'; g.fillText(c.name, x + 18, size.y - H + 38);
    x += 26 + g.measureText(c.name).width;
  }
  // 축척 막대 — 지도 가운데 높이에서 잰 거리
  const y0 = size.y / 2, m100 = map.distance(map.containerPointToLatLng([0, y0]), map.containerPointToLatLng([100, y0]));
  const nice = [1, 2, 5].flatMap((k) => [k, k * 10, k * 100, k * 1000, k * 10000]).sort((a, b) => a - b).filter((v) => v <= m100 * 1.2).pop() || 1;
  const px = (nice / m100) * 100, sx = size.x - 12 - px;
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, size.y - H + 30); g.lineTo(sx, size.y - H + 36); g.lineTo(sx + px, size.y - H + 36); g.lineTo(sx + px, size.y - H + 30); g.stroke();
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(fmtLen(nice), size.x - 12, size.y - H + 18);
  g.fillStyle = '#aaa'; g.font = '400 10px Pretendard, "Malgun Gothic", sans-serif';
  const credit = st.base === 'sat' ? '바탕: Esri, Maxar, Earthstar Geographics' : '바탕: © OpenStreetMap 기여자';
  g.fillText(tiles ? credit : '바탕 지도는 그리지 못했습니다', size.x - 12, size.y - H + 50);
  cv.toBlob((b) => { if (b) download(`우리동네조사_${today()}.png`, b); btn.disabled = false; }, 'image/png');
}

function setBase(b) {
  baseLayers.forEach((l) => map.removeLayer(l));
  st.base = BASES[b] ? b : 'dark';
  baseLayers = BASES[st.base].make(L);
  baseLayers.forEach((l) => l.addTo(map));
  map.getContainer().dataset.base = st.base;
  renderBar();
}

export async function main() {
  await initPage('fieldwork');
  const q = params();
  L = await loadLeaflet();
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--below fw-stage">
      <section class="mk-panel fw-bar" aria-label="그리기 도구">
        <div class="fw-row">
          <div class="mk-tools" id="fwTools" role="toolbar" aria-label="도구">
            <button type="button" class="opt" data-m="pan" title="이동 · 고르기 (V)">이동 · 고르기</button>
            <button type="button" class="opt" data-m="point" title="점 (P)">${shapeSvg('circle', '--st-label', 12)} 점</button>
            <button type="button" class="opt" data-m="line" title="선 (L)"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M3 18 L10 8 L15 14 L21 5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg> 선 · 거리</button>
            <button type="button" class="opt" data-m="area" title="면 (A)"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 7 L14 3 L21 12 L15 21 L5 18 Z" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="2"/></svg> 면 · 넓이</button>
          </div>
          <div class="mk-tools fw-drawops" id="fwDrawOps" hidden>
            <button type="button" class="opt" id="fwUndo">한 점 되돌리기</button>
            <button type="button" class="opt" id="fwFinish">끝내기</button>
            <button type="button" class="opt" id="fwCancel">그만두기</button>
          </div>
          <div class="st-segmented fw-base" id="fwBase" role="tablist" aria-label="바탕 지도">${Object.entries(BASES).map(([k, v]) => `<button type="button" role="tab" class="st-segmented__item" data-b="${k}">${v.name}</button>`).join('')}</div>
        </div>
        <div class="fw-row">
          <div class="fw-cats" id="fwCats" role="radiogroup" aria-label="새로 그릴 표시의 범주"><span class="fw-cl">새 표시의 범주</span>${CATS.map((c) => `<button type="button" role="radio" data-c="${c.id}">${shapeSvg(c.shape, c.c, 16)}${esc(c.name)}</button>`).join('')}</div>
          <form class="fw-search" id="fwSearch" role="search"><input id="fwQ" type="search" placeholder="동 · 역 · 건물 이름으로 찾기" aria-label="주소 검색"><button type="submit" class="opt">찾기</button>
            <ul class="fw-results" id="fwResults" hidden></ul></form>
        </div>
        <p class="fw-help"><span id="fwHelp"></span> <b id="fwLive" aria-live="polite"></b></p>
      </section>
      <figure class="mk-map fw-map" aria-label="조사 지도. 도구를 골라 점 · 선 · 면을 그립니다." role="region"><div id="fwLeaf" class="fw-leaf"></div></figure>
      <div class="fw-below">
        <section class="mk-panel fw-listbox" aria-label="내 표시 목록">
          <h2>내 표시 <small id="fwSum"></small></h2>
          <ul class="fw-list" id="fwList"></ul>
          <div class="mk-tools">
            <button type="button" class="opt" id="fwExport">GeoJSON 내보내기</button>
            <label class="opt fw-file">GeoJSON 불러오기<input type="file" id="fwImport" accept=".geojson,.json,application/geo+json,application/json"></label>
            <button type="button" class="opt" id="fwPng">지도 그림(PNG)</button>
            <button type="button" class="opt fw-del" id="fwClear">모두 지우기</button>
            <button type="button" class="share-btn" id="fwShare">공유</button>
          </div>
          <p class="mk-note" id="fwSaved"></p>
          <p class="mk-note">표시는 <b>이 브라우저에만</b> 저장되고 어디에도 보내지 않습니다. 다른 기기에서 이어 하려면 GeoJSON으로 내보내 옮기세요. 「공유」는 지금 보는 지도 위치만 건네고, 그린 표시는 건네지 않습니다. 이름 · 학번 같은 개인 정보나 집 위치는 적지 마세요.</p>
        </section>
        <section class="mk-panel fw-edit" id="fwEdit" aria-live="polite"></section>
      </div>
    </div>
    <div class="fw-after">
      <section class="mk-panel">
        <h2>지역 탐구 프로젝트와 이어 쓰기</h2>
        <div class="mk-why"><p>수행평가 <a href="project_guide.html">「지역 탐구 프로젝트」</a>의 <b>Ⅱ 공간 데이터 수집</b>과 <b>Ⅲ 분석 및 시각화</b> 단계에서 쓰는 도구입니다. 현장에서 본 문제점 · 시설 · 사진 찍은 곳을 범주로 나누어 표시하고, 거리와 넓이를 재어 근거로 삼으세요. 다 그렸으면 지도 그림(PNG)을 보고서에 넣고, GeoJSON은 다음 시간에 이어 그릴 때 불러옵니다. 제출 형식과 기한은 가이드와 수업 공지를 따릅니다.</p></div>
      </section>
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>학교에서 가장 가까운 버스 정류장까지 선을 그어 보세요. 지도 위 직선 거리와 실제로 걷는 길의 길이는 얼마나 다른가요? 차이가 큰 까닭은 무엇일까요?</li>
          <li>동네 공원이나 운동장을 면으로 그려 넓이를 재 보세요. 같은 넓이라도 이용하는 사람 수가 다르면 「충분하다」는 판단이 어떻게 달라질까요?</li>
          <li>「문제점」 표시들이 한곳에 모여 있나요, 흩어져 있나요? 모여 있다면 그 자리에 어떤 공통점(도로, 경사, 시설)이 있을까요?</li>
          <li>내 지도는 무엇을 보여 주고 무엇을 빠뜨렸을까요? 같은 동네를 다른 사람이 그리면 어떻게 다를지 견주어 보세요.</li>
        </ol>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>바탕 지도</b> 어두운 지도 · 밝은 지도 — © OpenStreetMap 기여자(ODbL, 어두운 지도는 같은 그림의 색을 뒤집은 것). 위성 — Esri World Imagery(Esri, Maxar, Earthstar Geographics). 주소 검색 — OpenStreetMap Nominatim(검색어는 Nominatim 서버로 보내집니다. 단추를 누를 때만 묻습니다).</p>
    <p><b>계산</b> 길이는 이웃한 두 점 사이를 하버사인 식(지구 반지름 6,371km)으로 잰 대원 거리를 더한 값입니다. 넓이는 지구를 공(반지름 6,378,137m)으로 보고 꼭짓점 사이 경도 차와 위도의 사인 값으로 계산한 구면 다각형 넓이입니다. 지도 화면의 픽셀로 재지 않으므로 축척이나 위도가 달라도 값이 같습니다.</p>
    <p><b>한계</b> 지구는 완전한 공이 아니어서 측지 측량 값과 0.5% 안팎 다를 수 있고, 높낮이(비탈)는 넣지 않았습니다. 선의 길이는 그린 꼭짓점을 곧게 이은 값이라, 굽은 길은 점을 촘촘히 찍을수록 실제에 가깝습니다. 위성 사진은 찍은 때가 곳마다 달라 지금 모습과 다를 수 있습니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .fw-stage { gap: 12px; }
    .fw-bar { gap: 10px; padding: 12px 14px; position: relative; z-index: 1001; }
    .fw-row { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; justify-content: space-between; }
    .fw-bar .opt { display: inline-flex; align-items: center; gap: 6px; }
    .fw-base { flex-shrink: 0; }
    .fw-cats { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .fw-cl { font-size: 12px; color: var(--st-label-3); margin-right: 4px; }
    .fw-cats button { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px 0 7px; border: 0; border-radius: var(--st-r-full); background: none; color: var(--st-label-2); font-size: 12.5px; cursor: pointer; letter-spacing: var(--track-ko); }
    .fw-cats button:hover { background: var(--st-fill-3); }
    .fw-cats button[aria-pressed="true"], .fw-cats button[aria-checked="true"] { background: var(--st-fill); color: var(--st-label); font-weight: 600; }
    .fw-search .opt { flex-shrink: 0; white-space: nowrap; }
    .fw-search { position: relative; display: flex; gap: 6px; flex: 1 1 260px; max-width: 380px; }
    .fw-input, .fw-search input { width: 100%; min-height: 34px; padding: 7px 12px; border: 1px solid var(--st-separator); border-radius: 10px; background: var(--st-bedrock); color: var(--st-label); font: inherit; font-size: 13px; letter-spacing: var(--track-ko); }
    .fw-search input { border-radius: var(--st-r-full); }
    .fw-input:focus, .fw-search input:focus { outline: 2px solid var(--st-accent); outline-offset: 0; }
    textarea.fw-input { resize: vertical; line-height: 1.6; }
    .fw-results { position: absolute; z-index: 900; top: 40px; left: 0; right: 0; list-style: none; margin: 0; padding: 6px; border-radius: 12px; background: var(--st-surface-raised); box-shadow: 0 8px 28px rgba(0,0,0,0.5); display: grid; gap: 2px; }
    .fw-results button { width: 100%; display: grid; gap: 1px; padding: 7px 9px; border: 0; border-radius: 8px; background: none; color: var(--st-label); font-size: 13px; text-align: left; cursor: pointer; }
    .fw-results button:hover, .fw-results button:focus-visible { background: var(--st-fill-2); }
    .fw-results small { font-size: 11px; color: var(--st-label-3); }
    .fw-help { font-size: 12.5px; color: var(--st-label-2); letter-spacing: var(--track-ko); min-height: 1.4em; }
    .fw-help b { color: var(--st-label); font-weight: 700; margin-left: 6px; font-variant-numeric: tabular-nums; }
    .fw-map { height: min(72vh, 720px); min-height: 420px; }
    .fw-leaf { position: absolute; inset: 0; }
    .fw-map .leaflet-pane svg { max-width: none !important; max-height: none !important; }
    .fw-map .leaflet-container.is-drawing { cursor: crosshair; }
    .fw-map .leaflet-container[data-base="light"] { background: #f2efe9; }
    ${CATS.map((c) => `.fw-c-${c.id} { stroke: var(${c.c}); fill: var(${c.c}); }`).join('\n    ')}
    .fw-path.is-sel { stroke-opacity: 1; filter: drop-shadow(0 0 3px rgba(255,255,255,0.7)); }
    .fw-draft, .fw-t-line { fill: none !important; }
    .fw-guide { fill: none; stroke-opacity: 0.8; }
    .fw-pt { background: none; border: 0; }
    .fw-pt svg { display: block; overflow: visible; }
    .fw-pt.is-sel svg { filter: drop-shadow(0 0 3px #fff); }
    .fw-pt:focus-visible { outline: 3px solid #fff; outline-offset: 2px; border-radius: 4px; }
    .fw-handle { background: #fff; border: 2px solid #000; border-radius: 50%; cursor: move; }
    .fw-tip { background: rgba(20,20,22,0.86); color: #fff; border: 0; box-shadow: none; font: 600 12px var(--sans); padding: 3px 7px; border-radius: 6px; }
    .fw-tip::before { display: none; }
    .fw-below { display: grid; gap: 12px; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 900px) { .fw-below { grid-template-columns: 1fr; } .fw-row { justify-content: flex-start; } }
    .fw-listbox h2 small, .fw-edit h2 small { margin-left: 6px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .fw-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 360px; overflow: auto; }
    .fw-list button { width: 100%; display: grid; grid-template-columns: 26px 1fr auto; gap: 8px; align-items: center; padding: 7px 8px; border: 0; border-radius: var(--st-r-inner); background: none; color: var(--st-label); text-align: left; cursor: pointer; font-size: 13px; letter-spacing: var(--track-ko); }
    .fw-list button:hover, .fw-list button[aria-pressed="true"] { background: var(--st-fill-2); }
    .fw-i { display: grid; place-items: center; }
    .fw-nm { display: grid; gap: 1px; font-weight: 600; }
    .fw-nm small { font-size: 11px; font-weight: 400; color: var(--st-label-3); }
    .fw-ms { font-size: 12.5px; color: var(--st-label-2); font-variant-numeric: tabular-nums; }
    .fw-empty { padding: 10px 8px; font-size: 12.5px; color: var(--st-label-3); line-height: 1.6; }
    .fw-measure { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
    .fw-measure span { color: var(--st-label-3); }
    .fw-measure b { color: var(--st-label); font-variant-numeric: tabular-nums; }
    .fw-file { position: relative; cursor: pointer; display: inline-flex; align-items: center; }
    .fw-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
    .fw-file:focus-within { outline: 2px solid var(--st-accent); }
    .fw-del { color: var(--st-label-3); }
    .opt:disabled { opacity: 0.4; cursor: default; }
    .fw-after { display: grid; gap: 16px; margin-top: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 900px) { .fw-after { grid-template-columns: 1fr; } }
    .fw-after a { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
  `;
  document.head.append(style);

  // 상태 읽기
  if (BASES[q.get('b')]) st.base = q.get('b');
  const c = (q.get('c') || '').split(',').map(Number);
  const view = c.length === 3 && c.every(Number.isFinite) ? [[c[0], c[1]], Math.min(19, Math.max(5, c[2]))] : [[37.5665, 126.978], 15];
  map = L.map('fwLeaf', { zoomControl: false, maxZoom: 19, minZoom: 5 }).setView(view[0], view[1]);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  setBase(st.base);
  load();
  drawAll();
  renderBar(); renderEdit(); renderList(); save();

  // 지도 이벤트
  map.on('click', (e) => {
    const ll = [e.latlng.lat, e.latlng.lng];
    if (st.mode === 'point') return addPoint(ll);
    if (st.mode === 'line' || st.mode === 'area') {
      const pts = st.draft;
      if (st.mode === 'area' && pts.length > 2 && map.latLngToContainerPoint(pts[0]).distanceTo(e.containerPoint) < 12) return finishDraft();
      if (pts.length && map.latLngToContainerPoint(pts[pts.length - 1]).distanceTo(e.containerPoint) < 6) return; // 두 번 누름의 첫 번째
      pts.push(ll);
      updateDraft(e.latlng);
      return;
    }
    if (st.sel) select(null);
  });
  map.on('dblclick', () => { if (st.mode === 'line' || st.mode === 'area') finishDraft(); });
  map.on('mousemove', (e) => { if (st.draft.length) updateDraft(e.latlng); });
  map.on('moveend', () => renderBar());
  const KEYS = { v: 'pan', p: 'point', l: 'line', a: 'area' };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (st.draft.length && e.key === 'Enter') { e.preventDefault(); finishDraft(); }
    else if (e.key === 'Escape') { if (st.draft.length) cancelDraft(); else setMode('pan'); }
    else if (st.draft.length && e.key === 'Backspace') { e.preventDefault(); st.draft.pop(); updateDraft(null); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && KEYS[e.key.toLowerCase()] && (e.target === document.body || e.target.closest('.fw-stage'))) setMode(KEYS[e.key.toLowerCase()]);
  });

  // 조작판
  const body = $('#mkBody');
  body.addEventListener('click', (e) => {
    const t = e.target;
    const m = t.closest('#fwTools [data-m]'); if (m) return setMode(m.dataset.m);
    const cc = t.closest('#fwCats [data-c]'); if (cc) { st.cat = cc.dataset.c; if (st.mode === 'pan') setMode('point'); else { renderBar(); if (draftLine) { clearDraftLayers(); updateDraft(null); } } return; }
    const b = t.closest('#fwBase [data-b]'); if (b) return setBase(b.dataset.b);
    if (t.closest('#fwFinish')) return finishDraft();
    if (t.closest('#fwUndo')) { st.draft.pop(); return updateDraft(null); }
    if (t.closest('#fwCancel')) return setMode('pan');
    const f = t.closest('[data-f]');
    if (f) {
      if (st.mode !== 'pan') setMode('pan');
      select(f.dataset.f);
      const ft = st.feats.find((x) => x.id === f.dataset.f);
      if (ft) ft.type === 'point' ? map.panTo(ft.ll[0]) : map.fitBounds(L.latLngBounds(ft.ll), { padding: [40, 40], maxZoom: 18 });
      return;
    }
    const ec = t.closest('[data-ec]');
    if (ec) { const ft = st.feats.find((x) => x.id === st.sel); if (ft) { ft.cat = ec.dataset.ec; save(); drawAll(); renderEdit(); renderList(); } return; }
    if (t.closest('#fwZoom')) { const ft = st.feats.find((x) => x.id === st.sel); if (ft) ft.type === 'point' ? map.setView(ft.ll[0], Math.max(map.getZoom(), 17)) : map.fitBounds(L.latLngBounds(ft.ll), { padding: [40, 40] }); return; }
    if (t.closest('#fwDel')) { st.feats = st.feats.filter((x) => x.id !== st.sel); st.sel = null; save(); drawAll(); renderEdit(); renderList(); return; }
    if (t.closest('#fwClear')) { if (st.feats.length && confirm('그린 표시를 모두 지울까요? 되돌릴 수 없습니다.')) { st.feats = []; st.sel = null; save(); drawAll(); renderEdit(); renderList(); } return; }
    if (t.closest('#fwExport')) return download(`우리동네조사_${today()}.geojson`, new Blob([JSON.stringify(toGeoJSON(), null, 1)], { type: 'application/geo+json' }));
    if (t.closest('#fwPng')) return exportPng().catch(() => { $('#fwPng').disabled = false; });
    const r = t.closest('[data-ll]');
    if (r) {
      const bb = r.dataset.bb.split(',').map(Number);
      if (bb.length === 4 && bb.every(Number.isFinite)) map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 17 });
      else map.setView(r.dataset.ll.split(',').map(Number), 16);
      $('#fwResults').hidden = true;
    }
  });
  body.addEventListener('input', (e) => {
    const ft = st.feats.find((x) => x.id === st.sel);
    if (!ft) return;
    if (e.target.id === 'fwName') { ft.name = e.target.value; layers[ft.id]?.setTooltipContent(esc(labelText(ft))); }
    else if (e.target.id === 'fwMemo') ft.memo = e.target.value;
    else return;
    clearTimeout(body._t);
    body._t = setTimeout(() => { save(); renderList(); }, 300);
  });
  body.addEventListener('change', (e) => {
    if (e.target.id === 'fwName') drawFeat(st.feats.find((x) => x.id === st.sel));
    if (e.target.id !== 'fwImport' || !e.target.files[0]) return;
    const file = e.target.files[0];
    file.text().then((txt) => {
      const before = st.feats.length;
      const n = fromGeoJSON(JSON.parse(txt), true);
      save(); drawAll(); renderList();
      $('#fwSaved').textContent = n ? `표시 ${n}개를 불러왔습니다.` : '불러올 수 있는 점 · 선 · 면이 없습니다.';
      if (n) map.fitBounds(L.latLngBounds(st.feats.slice(before).flatMap((f) => f.ll)), { padding: [40, 40], maxZoom: 17 });
    }).catch(() => { $('#fwSaved').textContent = 'GeoJSON 파일을 읽지 못했습니다.'; });
    e.target.value = '';
  });
  $('#fwSearch').addEventListener('submit', (e) => { e.preventDefault(); search($('#fwQ').value); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#fwSearch')) $('#fwResults').hidden = true; });
  shareButton($('#fwShare'), () => location.href, () => `${BASES[st.base].name} · 지금 보는 위치(그린 표시는 함께 가지 않습니다)`);
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">지도를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
