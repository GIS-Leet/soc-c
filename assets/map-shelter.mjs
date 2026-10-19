// 대피소까지 몇 분? — 서울의 지진 옥외 대피 장소마다 「걸음 속도 × 시간」 반지름의 원(버퍼)을 그리고,
// 원 밖에 남는 곳(사각지대)과 그곳에 사는 사람 수를 인구 격자와 겹쳐(중첩) 센다.
// 자료: data/maps/shelter/ — scripts/build-map-shelter.py 가 만든다(서울 열린데이터광장 OA-21063 · WorldPop 2025 100m 격자).
// 칸마다 가장 가까운 대피 장소까지의 직선 거리를 미리 재 두었으므로, 반지름 r 만 정하면 r 보다 먼 칸이 곧 사각지대다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, loadLeaflet, darkBase, initPage } from './map-kit.mjs?v=d3b6045c';

const SPEEDS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]; // 시속 km
const st = { v: 4, t: 5, ring: false, g: null };
let M, S, L, map, overlay, bounds, ringLayer, ringR, pickLayer, code, pop, colors;

const mPerMin = () => (st.v * 1000) / 60;
const radius = () => mPerMin() * st.t;
/** 반지름 r(m)보다 먼 곳에 사는 인구 — 10m 칸 막대에서 더한다 */
function beyond(h, r) {
  const from = Math.min(M.nb, Math.ceil(r / M.bin));
  let s = 0;
  for (let i = from; i < h.length; i++) s += h[i];
  return s;
}
const man = (v) => fmt(v, 0, { man: true }) + '명';

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── 겹침 그림: 칸 하나 = 화소 하나 ──
const cv = document.createElement('canvas');
function paint() {
  const { w, h } = M.grid;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const r = radius();
  const [rin, rout, rbare] = [colors.in, colors.out, colors.bare];
  for (let i = 0; i < w * h; i++) {
    const c = code[i];
    if (c === 255) continue;
    const d = c * M.grid.step;
    const k = i * 4;
    let col, a;
    if (d <= r) { col = rin; a = 125; }
    else if (pop[i] > 0) { col = rout; a = 175; }
    else { col = rbare; a = 95; }
    img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  if (overlay) overlay.setUrl(url);
  else overlay = L.imageOverlay(url, bounds, { interactive: false, className: 'sh-raster' }).addTo(map);
}

function drawRings() {
  ringLayer.clearLayers();
  if (!st.ring) return;
  const r = radius();
  const color = css('--st-label') || '#ece8dd';
  for (const s of S) L.circle([s.lat, s.lon], { radius: r, renderer: ringR, color, opacity: 0.4, weight: 1, fill: false, interactive: false }).addTo(ringLayer);
}

function draw() {
  const r = radius();
  const total = M.all.pop;
  const out = beyond(M.all.h, r);
  $('#shV').textContent = `시속 ${fmt(st.v, 1)}km · 1분에 ${fmt(mPerMin(), 0)}m`;
  $('#shT').textContent = `${st.t}분`;
  $('#shVin').value = SPEEDS.indexOf(st.v);
  $('#shTin').value = st.t;
  $('#shR').innerHTML = `<b>${fmt(r, 0)}m</b><span>대피 장소에서 ${st.t}분 동안 걸어 닿는 직선 반지름</span>`;
  $('#shOut').innerHTML = `<p>서울 인구 격자 ${man(total)} 가운데 <b>${man(out)}(${fmt((out / total) * 100, 1)}%)</b>이 이 반지름 밖에 삽니다.</p>`;
  // 구별 — 반지름 밖 인구 비율
  const rows = M.units.map((u) => ({ ...u, out: beyond(u.h, r) })).map((u) => ({ ...u, p: u.pop ? (u.out / u.pop) * 100 : 0 }))
    .sort((a, b) => b.p - a.p || b.out - a.out);
  const maxP = Math.max(1, ...rows.map((u) => u.p));
  $('#shGu').innerHTML = rows.map((u, i) => `<li><button type="button" class="sh-gu${st.g === u.code ? ' is-sel' : ''}" data-g="${u.code}" aria-pressed="${st.g === u.code}"
      data-tip="${esc(`${u.name}|반지름 밖 ${man(u.out)} · ${fmt(u.p, 1)}%|대피 장소 ${u.n}곳 · 인구 격자 ${man(u.pop)}`)}">
      <span class="sh-rk">${i + 1}</span><span class="sh-n">${esc(u.name)}</span>
      <span class="sh-bar"><i style="width:${(u.p / maxP) * 100}%"></i></span><span class="sh-p">${fmt(u.p, 1)}%</span></button></li>`).join('');
  // 까닭 — 지금 값에서 계산
  const slow = beyond(M.all.h, ((2 * 1000) / 60) * st.t);
  const top = rows[0];
  $('#shWhy').innerHTML = `<p>대피 장소 둘레에 같은 반지름의 원을 그린 것이 <b>버퍼</b>, 그 원과 인구 격자를 겹쳐 원 밖의 사람을 센 것이 <b>중첩</b>입니다.</p>
    <p>지금 조건에서 원 밖 인구 비율이 가장 큰 곳은 <b>${esc(top.name)}</b>(${fmt(top.p, 1)}%)입니다. ${st.v > 2 ? `같은 ${st.t}분이라도 시속 2km로 걸으면 원 밖 인구가 ${man(slow)}으로 늘어납니다.` : '시속 2km는 고를 수 있는 가장 느린 걸음입니다.'}</p>`;
  $$('#shRing').forEach((b) => b.setAttribute('aria-pressed', String(st.ring)));
  paint();
  drawRings();
  setParams({ v: st.v !== 4 ? st.v : null, t: st.t !== 5 ? st.t : null, ring: st.ring ? 1 : null, g: st.g });
}

/** 지도를 누른 곳에서 가장 가까운 대피 장소 */
function pick(latlng) {
  const k = Math.cos((latlng.lat * Math.PI) / 180);
  let best = null, bd = Infinity;
  for (const s of S) {
    const dx = (s.lon - latlng.lng) * k * 111320, dy = (s.lat - latlng.lat) * 110574;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = s; }
  }
  pickLayer.clearLayers();
  if (!best) return;
  const fg = css('--st-label') || '#ece8dd', bg = css('--st-bedrock') || '#121815';
  L.polyline([latlng, [best.lat, best.lon]], { color: fg, weight: 2, dashArray: '4 4', interactive: false }).addTo(pickLayer);
  L.circleMarker(latlng, { radius: 5, color: bg, weight: 2, fillColor: fg, fillOpacity: 1, interactive: false }).addTo(pickLayer);
  L.circleMarker([best.lat, best.lon], { radius: 6, color: fg, weight: 2, fill: false, interactive: false }).addTo(pickLayer);
  const min = bd / mPerMin();
  $('#shPick').innerHTML = `<p><b>${esc(best.n)}</b> <small>${esc(best.g)}${best.a ? ` · 면적 ${fmt(best.a)}㎡` : ''}</small></p>
    <p>누른 곳에서 직선 ${fmt(bd, 0)}m · 시속 ${fmt(st.v, 1)}km로 약 ${fmt(min, min < 10 ? 1 : 0)}분${bd > radius() ? ' — 지금 반지름 밖입니다' : ''}</p>`;
}

export async function main() {
  await initPage('shelter');
  const q = params();
  if (SPEEDS.includes(Number(q.get('v')))) st.v = Number(q.get('v'));
  const t = Number(q.get('t'));
  if (t >= 1 && t <= 20) st.t = Math.round(t);
  st.ring = q.get('ring') === '1';
  st.g = /^11\d{3}$/.test(q.get('g') || '') ? q.get('g') : null;

  const [meta, buf, shel, Lf] = await Promise.all([
    fetch('data/maps/shelter/meta.json').then((r) => r.json()),
    fetch('data/maps/shelter/grid.bin').then((r) => r.arrayBuffer()),
    fetch('data/maps/shelter/shelters.json').then((r) => r.json()),
    loadLeaflet(),
  ]);
  M = meta; S = shel; L = Lf;
  const n = M.grid.w * M.grid.h;
  code = new Uint8Array(buf, 0, n);
  pop = new Uint16Array(buf.slice(n, n * 3));
  colors = { in: rgb(css('--kr-p1')), out: rgb(css('--kr-n2')), bare: rgb(css('--kr-mid')) };
  const school = S.filter((s) => /학교|초등|중학|고등|대학/.test(s.n)).length;
  const park = S.filter((s) => /공원/.test(s.n) && !/학교|초등|중학|고등|대학/.test(s.n)).length;

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left">
      <figure class="mk-map mk-map--tall mk-tiphost sh-map" id="shMap" role="img" aria-label="서울 지진 옥외 대피 장소와 걸어서 닿지 못하는 곳 지도"></figure>
      <aside class="mk-panel sh-panel mk-tiphost" aria-label="걸음과 시간 고르기">
        <h2>얼마나 빨리, 몇 분 동안 걷나요?</h2>
        <div class="mk-field">
          <label for="shVin"><span>걷는 속도</span><output id="shV"></output></label>
          <input type="range" id="shVin" min="0" max="${SPEEDS.length - 1}" step="1" aria-describedby="shVhelp">
          <p class="mk-note" id="shVhelp">보통 걸음을 시속 4km(1분에 약 67m)로 잡았습니다. 느린 걸음 · 휠체어 · 아이와 함께라면 줄여 보세요.</p>
        </div>
        <div class="mk-field">
          <label for="shTin"><span>걷는 시간</span><output id="shT"></output></label>
          <input type="range" id="shTin" min="1" max="20" step="1">
        </div>
        <p class="sh-r" id="shR"></p>
        <div class="mk-why" id="shOut"></div>
        <div class="mk-keys sh-keys">
          <span><i class="sh-k sh-k--in"></i>반지름 안</span>
          <span><i class="sh-k sh-k--out"></i>반지름 밖 · 사람이 사는 칸</span>
          <span><i class="sh-k sh-k--bare"></i>반지름 밖 · 사람이 없는 칸(산 · 강 · 공장 등)</span>
          <span><i class="sh-k sh-k--pt"></i>지진 옥외 대피 장소 ${fmt(S.length)}곳</span>
        </div>
        <div class="mk-tools">
          <button type="button" class="opt" id="shRing" aria-pressed="false">대피 장소마다 원 그리기</button>
          <button type="button" class="share-btn" id="shShare">공유</button>
        </div>
        <div class="mk-why sh-pick" id="shPick" aria-live="polite"><p class="mk-note">지도에서 아무 곳이나 누르면 가장 가까운 대피 장소와 걸리는 시간을 알려 줍니다.</p></div>
        <h2>구별로 보면 <small class="sh-sub">반지름 밖에 사는 사람의 비율 · 누르면 그 구로 갑니다</small></h2>
        <ol class="sh-gulist" id="shGu"></ol>
        <div class="mk-why" id="shWhy"></div>
      </aside>
    </div>
    <section class="mk-panel sh-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>속도를 시속 4km에서 2km로 줄여 보세요. 같은 5분인데 반지름 밖 사람은 몇 배가 되나요? 대피 장소까지의 거리는 누구에게나 같은 거리일까요?</li>
        <li>주황색 칸이 넓게 남는 곳을 확대해 보세요. 대피 장소가 적어서일까요, 산 · 강 · 큰 길 · 넓은 단지 때문에 빈터가 멀어서일까요?</li>
        <li>대피 장소 ${fmt(S.length)}곳 가운데 ${fmt(school)}곳은 학교, ${fmt(park)}곳은 공원입니다. 지진이 났을 때 왜 건물 안이 아니라 이런 빈터로 가라고 할까요?</li>
        <li>이 지도의 원은 직선 거리입니다. 실제로는 길을 따라 돌아가야 하고, 무너진 담이나 끊긴 길도 있을 수 있습니다. 그렇다면 실제 사각지대는 지도보다 넓을까요, 좁을까요?</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 서울특별시 「서울시 지진옥외대피소」(서울 열린데이터광장 OA-21063, 원본 행정안전부 재난안전데이터공유플랫폼, ${esc(M.made)} 내려받음, 공공누리 제1유형) ${fmt(S.length)}곳 ·
      인구 격자 WorldPop Global2 R2025A 「2025년 대한민국 100m 인구」(건물이 있는 곳에 나눈 판, CC BY 4.0) · 자치구 경계 옛 통계청(현 국가데이터처) 2018(southkorea-maps 정리본).</p>
    <p><b>계산</b> 격자 칸(약 74m × 93m)마다 가장 가까운 대피 장소까지의 <b>직선 거리</b>를 미리 재 두고, 반지름(걷는 속도 × 시간)보다 먼 칸의 인구를 더했습니다. 그래서 실제 걷는 길(돌아가는 길 · 다리 · 계단 · 담)과 대피 장소의 넓이(몇 명이 들어갈 수 있는지)는 따지지 않았습니다.
      격자 인구는 인구 조사 값을 위성 영상과 건물 자료로 나눠 놓은 <b>추정값</b>이라 칸 하나하나의 값보다 넓은 무늬를 보는 데 알맞습니다. 낮에는 사람들이 일터 · 학교로 옮겨 가므로, 이 지도는 「사는 곳」 기준입니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .sh-map { min-height: 420px; }
    @media (max-width: 900px) { .sh-map.mk-map--tall { height: 62vh; min-height: 360px; } }
    .sh-map .leaflet-image-layer { image-rendering: pixelated; }
    .sh-panel h2 small.sh-sub { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .sh-r { display: grid; gap: 2px; }
    .sh-r b { font-size: 26px; font-weight: 700; color: var(--st-label); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
    .sh-r span { font-size: 12px; color: var(--st-label-3); letter-spacing: var(--track-ko); }
    .sh-keys { display: grid; gap: 6px; }
    .sh-k { width: 12px; height: 12px; border-radius: 2px; }
    .sh-k--in { background: var(--kr-p1); opacity: 0.6; }
    .sh-k--out { background: var(--kr-n2); }
    .sh-k--bare { background: var(--kr-mid); }
    .sh-k--pt { width: 7px; height: 7px; margin: 0 2.5px; border-radius: 50%; background: var(--st-label); box-shadow: 0 0 0 1px var(--st-bedrock); }
    .sh-pick small { font-size: 12px; color: var(--st-label-3); }
    .sh-gulist { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; max-height: 360px; overflow: auto; }
    .sh-gu { width: 100%; display: grid; grid-template-columns: 20px 62px 1fr 44px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--st-r-inner);
      font-variant-numeric: tabular-nums; text-align: left; background: none; color: inherit; cursor: pointer; }
    .sh-gu:hover, .sh-gu.is-sel { background: var(--st-fill-2); }
    .sh-gu:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -2px; }
    .sh-rk { display: block; font-size: 11.5px; color: var(--st-label-3); text-align: right; }
    .sh-n { font-size: 12.5px; font-weight: 600; color: var(--st-label); white-space: nowrap; }
    .sh-bar { height: 10px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .sh-bar i { display: block; height: 100%; background: var(--kr-n2); border-radius: 0 4px 4px 0; transition: width 300ms var(--st-ease); }
    .sh-p { font-size: 12px; color: var(--st-label); text-align: right; }
    .sh-think { margin-top: 16px; }
  `;
  document.head.append(style);

  // ── 지도 ──
  map = L.map('shMap', { zoomControl: true, preferCanvas: true, attributionControl: true }).setView([37.5565, 126.99], 11);
  darkBase(L, map);
  const g = M.grid;
  bounds = [[g.north - g.h * g.dy, g.west], [g.north, g.west + g.w * g.dx]];
  ringR = L.canvas({ padding: 0.2 });
  ringLayer = L.layerGroup().addTo(map);
  const ptR = L.canvas({ padding: 0.2 });
  const pts = L.layerGroup().addTo(map);
  for (const s of S) {
    L.circleMarker([s.lat, s.lon], { radius: 2.6, renderer: ptR, weight: 1, fillOpacity: 1, color: css('--st-bedrock') || '#121815', fillColor: css('--st-label') || '#ece8dd' })
      .bindTooltip(`${s.n}${s.a ? ` · ${fmt(s.a)}㎡` : ''}`, { direction: 'top' }).addTo(pts);
  }
  const ptSize = () => { const z = map.getZoom(); const r = z <= 11 ? 1.6 : z === 12 ? 2.4 : 3.2; pts.eachLayer((m) => m.setRadius(r)); };
  map.on('zoomend', ptSize);
  pickLayer = L.layerGroup().addTo(map);
  map.on('click', (e) => pick(e.latlng));
  if (st.g) { const u = M.units.find((x) => x.code === st.g); if (u) map.fitBounds([[u.bb[0], u.bb[1]], [u.bb[2], u.bb[3]]]); }
  else map.fitBounds(bounds, { padding: [6, 6] });
  ptSize();

  // ── 조작 ──
  const body = $('#mkBody');
  tips(body.querySelector('.sh-panel'));
  $('#shVin').addEventListener('input', (e) => { st.v = SPEEDS[Number(e.target.value)]; draw(); });
  $('#shTin').addEventListener('input', (e) => { st.t = Number(e.target.value); draw(); });
  $('#shRing').addEventListener('click', () => { st.ring = !st.ring; draw(); });
  $('#shGu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    st.g = st.g === b.dataset.g ? null : b.dataset.g;
    const u = M.units.find((x) => x.code === st.g);
    if (u) map.fitBounds([[u.bb[0], u.bb[1]], [u.bb[2], u.bb[3]]]);
    else map.fitBounds(bounds, { padding: [6, 6] });
    draw();
  });
  shareButton($('#shShare'), () => location.href, () => `시속 ${fmt(st.v, 1)}km · ${st.t}분 · 반지름 ${fmt(radius(), 0)}m`);
  draw();
  setTimeout(() => map.invalidateSize(), 50);
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
