// 도시 사이의 거리와 이동 시간 — 지도 위의 거리(직선)와 자동차로 걸리는 시간을 견준다. 「시간 지도」에서는 출발 도시를 가운데 두고
// 각 도시를 방향은 그대로, 거리는 걸리는 시간에 비례하게 옮긴다(방사형 시간 거리 지도).
// 자료: data/maps/distance/cities.json — OSRM(OpenStreetMap 도로망)으로 미리 계산한 30개 도시 사이 자동차 시간 · 도로 거리
//       (scripts/build-map-distance.mjs). 바탕: data/stats/korea.json 의 시·도 경계(같은 정거 원통 도법).
// 땅 모양은 도시들이 옮겨 간 만큼 둘레의 점을 거리 가중 평균(역거리 가중, IDW)으로 함께 밀어 「고무판」처럼 늘인다.
import { $, $$, esc, fmt, tips, DIV, legendBar, params, setParams, shareButton, initPage } from './map-kit.mjs?v=affb9c7a';

// korea.json 지도와 같은 투영(scripts/build-korea-stats.mjs 의 BOX · P)
const BOX = { lon0: 124.55, lat0: 38.65, lon1: 132.0, w: 560 };
const KX = Math.cos((36 * Math.PI) / 180), S = BOX.w / ((BOX.lon1 - BOX.lon0) * KX);
const P = (lon, lat) => [(lon - BOX.lon0) * KX * S, (BOX.lat0 - lat) * S];
const PX_PER_KM = S / 111.2; // 위도 1°≈111.2km

// 이름표 자리(기본 오른쪽) — 붐비는 곳만 옮긴다
const LAB = { incheon: 'l', seosan: 'l', hongseong: 'l', mokpo: 'l', muan: 'b', gunsan: 'l', suwon: 'b', sejong: 'l', daejeon: 'b', cheongju: 't', gwangju: 'b', jinju: 'l', changwon: 'b', tongyeong: 'b', busan: 'r', ulsan: 'r', jeonju: 't', namwon: 'b', wonju: 'b', chuncheon: 't', seoul: 't' };

const st = { o: 'seoul', mode: 'real', c: null, t: 0 };
let D, K, idx, shapes, anim = null;

const hav = (a, b) => {
  const R = 6371.0088, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const isIsland = (c) => c.lat < 34; // 제주 — 배를 타야 닿는다
const hm = (sec) => { if (sec == null) return '—'; const m = Math.round(sec / 60); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${String(m % 60).padStart(2, '0')}분`; };

// ── 출발 도시마다 계산 ──
function compute(oid) {
  const o = idx[oid], O = D.cities[o];
  const po = P(O.lon, O.lat);
  const rows = D.cities.map((c, i) => {
    const km = hav(O, c), sec = D.dur[o][i], road = D.road[o][i];
    return { ...c, i, km, sec, road: road == null ? null : road / 1000, p: P(c.lon, c.lat) };
  });
  // 시간 1시간을 몇 px로? — 육지 도시들의 「직선 거리 ÷ 시간」 가운데값(평균적인 빠르기)을 쓴다
  const sp = rows.filter((r) => r.i !== o && r.sec && !isIsland(r)).map((r) => r.km / (r.sec / 3600)).sort((a, b) => a - b);
  const kmh = sp[Math.floor(sp.length / 2)];
  for (const r of rows) {
    if (r.i === o || r.sec == null) { r.q = r.p; r.ratio = null; continue; }
    const dx = r.p[0] - po[0], dy = r.p[1] - po[1], len = Math.hypot(dx, dy) || 1;
    const rr = (r.sec / 3600) * kmh * PX_PER_KM;
    r.q = [po[0] + (dx / len) * rr, po[1] + (dy / len) * rr];
    r.ratio = (r.sec / 3600) * kmh / r.km; // 1보다 크면 평균보다 더디다(시간 지도에서 바깥으로)
    r.speed = r.km / (r.sec / 3600);
  }
  // 땅 모양 밀기 — 꼭짓점마다 도시 이동량의 역거리 가중 평균(거듭제곱 2). 출발 도시는 움직이지 않는다
  const anchors = rows.filter((r) => r.sec != null || r.i === o).map((r) => ({ x: r.p[0], y: r.p[1], dx: r.q[0] - r.p[0], dy: r.q[1] - r.p[1] }));
  const disp = shapes.map((ring) => {
    const out = new Float32Array(ring.length);
    for (let k = 0; k < ring.length; k += 2) {
      let sw = 0, sx = 0, sy = 0;
      for (const a of anchors) {
        const d2 = (ring[k] - a.x) ** 2 + (ring[k + 1] - a.y) ** 2 + 4;
        const w = 1 / (d2 * d2); // 거리의 4제곱 — 가까운 도시를 훨씬 크게 따른다
        sw += w; sx += w * a.dx; sy += w * a.dy;
      }
      out[k] = sx / sw; out[k + 1] = sy / sw;
    }
    return out;
  });
  return { o, O, po, rows, kmh, disp };
}

// ── 그리기 ──
let C; // 지금 출발 도시의 계산 결과
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const colorOf = (r) => {
  if (r.ratio == null) return 'var(--st-label)';
  const l = Math.log2(r.ratio); // 0 = 평균, +1 = 두 배 더딤
  return `var(${l < -0.3 ? DIV[4] : l < -0.1 ? DIV[3] : l <= 0.1 ? DIV[2] : l <= 0.3 ? DIV[1] : DIV[0]})`;
};
function viewBox() {
  const xs = [], ys = [];
  for (const r of C.rows) { xs.push(r.p[0], r.q[0]); ys.push(r.p[1], r.q[1]); }
  xs.push(0, K.map.w); ys.push(0, K.map.h);
  const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 20;
  return [x0, y0, x1 - x0, y1 - y0];
}
function frame(t) {
  st.t = t;
  const e = ease(t);
  // 땅
  let d = '';
  shapes.forEach((ring, s) => {
    const dp = C.disp[s];
    for (let k = 0; k < ring.length; k += 2) d += (k ? 'L' : 'M') + (ring[k] + dp[k] * e).toFixed(1) + ',' + (ring[k + 1] + dp[k + 1] * e).toFixed(1);
    d += 'Z';
  });
  $('#dsLand').setAttribute('d', d);
  // 고리 — 지도 위 거리(100km)에서 시간(1시간)으로 바뀐다
  $('#dsRingsKm').style.opacity = String(1 - e);
  $('#dsRingsH').style.opacity = String(e);
  // 도시
  for (const r of C.rows) {
    const x = lerp(r.p[0], r.q[0], e), y = lerp(r.p[1], r.q[1], e);
    const g = $(`#ds-${r.id}`);
    if (g) g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    const ln = $(`#dsl-${r.id}`);
    if (ln) { ln.setAttribute('x2', x.toFixed(1)); ln.setAttribute('y2', y.toFixed(1)); }
  }
}
function animateTo(target) {
  cancelAnimationFrame(anim);
  const from = st.t, t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1100;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    frame(from + (target - from) * k);
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function drawMap() {
  const vb = viewBox();
  const [ox, oy] = C.po;
  // 고리 이름표는 서남쪽(대개 바다 쪽)에 단다
  const ringLab = (r, t) => `<circle cx="${ox}" cy="${oy}" r="${r}"/><text x="${(ox - r * 0.866 - 3).toFixed(1)}" y="${(oy + r * 0.5 + 3).toFixed(1)}" text-anchor="end">${t}</text>`;
  const rk = [100, 200, 300, 400].map((km) => ringLab(km * PX_PER_KM, `${km}km`)).join('');
  const hrs = [1, 2, 3, 4, 5, 6, 7, 8].filter((h) => h * C.kmh * PX_PER_KM < Math.max(vb[2], vb[3]) * 1.1);
  const rh = hrs.map((h) => ringLab(h * C.kmh * PX_PER_KM, `${h}시간`)).join('');
  const lines = C.rows.filter((r) => r.i !== C.o && r.sec != null).map((r) => `<line id="dsl-${r.id}" class="ds-spoke" x1="${ox}" y1="${oy}" x2="${r.p[0]}" y2="${r.p[1]}"/>`).join('');
  const dots = C.rows.map((r) => {
    const me = r.i === C.o, pos = LAB[r.id] || 'r';
    const [tx, ty, an] = { r: [7, 4, 'start'], l: [-7, 4, 'end'], t: [0, -8, 'middle'], b: [0, 14, 'middle'] }[pos];
    const tip = me ? `${r.name}|출발 도시` : r.sec == null ? `${r.name}|도로로 닿지 않음` : `${r.name}${isIsland(r) ? ' (배 포함)' : ''}|직선 ${fmt(r.km, 0)}km · 도로 ${fmt(r.road, 0)}km|자동차 ${hm(r.sec)}`;
    const shape = r.kind === 'capital' ? `<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5"/>` : `<circle r="4"/>`;
    return `<g id="ds-${r.id}" class="ds-city${me ? ' is-o' : ''}${st.c === r.id ? ' is-sel' : ''}${isIsland(r) ? ' is-island' : ''}" data-city="${r.id}" data-tip="${esc(tip)}" tabindex="0" role="button" aria-label="${esc(tip.replace(/\|/g, ', '))}" style="--c:${colorOf(r)}">
      ${me ? '<circle class="ds-ohalo" r="11"/>' : ''}${shape}<text x="${tx}" y="${ty}" text-anchor="${an}">${esc(r.name)}</text></g>`;
  }).join('');
  $('#dsMap').innerHTML = `<svg class="mk-svg ds-svg" viewBox="${vb.join(' ')}" role="img" aria-label="${esc(C.O.name)}에서 각 도시까지의 ${st.mode === 'time' ? '시간 지도' : '실제 위치 지도'}">
    <path id="dsLand" class="ds-land"/>
    <g id="dsRingsKm" class="ds-rings">${rk}</g><g id="dsRingsH" class="ds-rings ds-rings--h">${rh}</g>
    <g class="ds-spokes">${lines}</g>${dots}</svg>`;
  frame(st.t);
}

function drawScatter() {
  const pts = C.rows.filter((r) => r.i !== C.o && r.sec != null);
  const W = 340, H = 250, m = { l: 38, r: 10, t: 12, b: 34 };
  const xmax = Math.ceil(Math.max(...pts.map((r) => r.km)) / 100) * 100;
  const ymax = Math.ceil(Math.max(...pts.map((r) => r.sec / 3600)));
  const X = (v) => m.l + (v / xmax) * (W - m.l - m.r), Y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);
  let g = '';
  for (let v = 0; v <= xmax; v += 100) g += `<line class="ds-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text class="ds-ax" x="${X(v)}" y="${H - m.b + 14}" text-anchor="middle">${v}</text>`;
  for (let v = 0; v <= ymax; v += 1) g += `<line class="ds-grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ds-ax" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  // 평균 빠르기 선
  const xe = Math.min(xmax, ymax * C.kmh);
  g += `<line class="ds-avg" x1="${X(0)}" y1="${Y(0)}" x2="${X(xe)}" y2="${Y(xe / C.kmh)}"/><text class="ds-ax ds-avgt" x="${X(xe * 0.5) + 6}" y="${Y(xe * 0.5 / C.kmh) + 14}">가운데값 빠르기</text>`;
  g += `<text class="ds-ax" x="${(W + m.l) / 2}" y="${H - 4}" text-anchor="middle">직선 거리(km)</text><text class="ds-ax" transform="translate(11 ${(H - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle">자동차 시간(시간)</text>`;
  for (const r of pts) {
    const tip = `${r.name}${isIsland(r) ? ' (배 포함)' : ''}|직선 ${fmt(r.km, 0)}km · ${hm(r.sec)}|직선 100km에 ${fmt((r.sec / 60) / (r.km / 100), 0)}분`;
    const shape = r.kind === 'capital' ? `<rect x="${X(r.km) - 4}" y="${Y(r.sec / 3600) - 4}" width="8" height="8" rx="1.5"/>` : `<circle cx="${X(r.km)}" cy="${Y(r.sec / 3600)}" r="4"/>`;
    g += `<g class="ds-pt${st.c === r.id ? ' is-sel' : ''}" style="--c:${colorOf(r)}" data-city="${r.id}" data-tip="${esc(tip)}">${shape}</g>`;
  }
  // 이름표: 가장 빠른 곳, 150km 넘는 곳 가운데 가장 더딘 곳, 고른 곳
  const land = pts.filter((r) => !isIsland(r)).sort((a, b) => a.ratio - b.ratio);
  const far = land.filter((r) => r.km > 150);
  const show = new Set([land[0], far[far.length - 1], pts.find((r) => isIsland(r)), st.c && pts.find((p) => p.id === st.c)].filter(Boolean));
  for (const r of show) {
    g += `<text class="ds-plab" x="${X(r.km) + 6}" y="${Y(r.sec / 3600) - 6}">${esc(r.name)}</text>`;
  }
  $('#dsScatter').innerHTML = `<svg class="mk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="직선 거리와 자동차 시간의 관계">${g}</svg>`;
}

function readout() {
  const land = C.rows.filter((r) => r.i !== C.o && r.sec != null && !isIsland(r));
  const by = [...land].sort((a, b) => a.ratio - b.ratio);
  const fast = by.slice(0, 3), slow = by.slice(-3).reverse();
  const per100 = (r) => fmt((r.sec / 60) / (r.km / 100), 0);
  const sel = st.c && C.rows.find((r) => r.id === st.c && r.i !== C.o);
  const isl = C.rows.find((r) => isIsland(r) && r.i !== C.o && r.sec != null);
  $('#dsRead').innerHTML = sel ? `<h2>${esc(C.O.name)} → ${esc(sel.name)}</h2>
      <dl class="ds-dl"><dt>지도 위 직선 거리</dt><dd>${fmt(sel.km, 0)}km</dd><dt>도로 거리</dt><dd>${sel.road == null ? '—' : fmt(sel.road, 0) + 'km'}${sel.road ? ` <small>직선의 ${fmt(sel.road / sel.km, 2)}배</small>` : ''}</dd>
      <dt>자동차 시간</dt><dd>${hm(sel.sec)}${isIsland(sel) ? ' <small>배 포함</small>' : ''}</dd><dt>직선 100km에</dt><dd>${sel.sec ? per100(sel) + '분' : '—'} <small>가운데값 ${fmt(6000 / C.kmh, 0)}분</small></dd></dl>
      <p class="mk-note">${sel.ratio == null ? '' : sel.ratio < 0.9 ? '평균보다 빨리 닿아 시간 지도에서 안쪽으로 당겨집니다.' : sel.ratio > 1.1 ? '평균보다 더디게 닿아 시간 지도에서 바깥으로 밀려납니다.' : '평균과 비슷한 빠르기라 시간 지도에서도 자리가 거의 그대로입니다.'}</p>`
    : `<h2>${esc(C.O.name)}에서 출발하면</h2>
      <div class="mk-why"><p>직선 100km를 가는 데 걸리는 시간의 가운데값은 <b>${fmt(6000 / C.kmh, 0)}분</b>입니다.</p>
      <p>빨리 닿는 곳: <b>${fast.map((r) => `${r.name}(${per100(r)}분)`).join(' · ')}</b>.</p>
      <p>더디게 닿는 곳: <b>${slow.map((r) => `${r.name}(${per100(r)}분)`).join(' · ')}</b>.</p>
      ${isl ? `<p>${esc(isl.name)}는 바다를 건너야 해서 ${hm(isl.sec)}이 걸립니다(배 시간 포함).</p>` : ''}</div>
      <p class="mk-note">도시를 누르면 자세한 값이 나옵니다.</p>`;
}

function draw() {
  drawMap();
  drawScatter();
  readout();
  $$('#dsMode .st-segmented__item').forEach((b) => { const on = b.dataset.m === st.mode; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $('#dsOrigin').value = st.o;
  setParams({ o: st.o === 'seoul' ? null : st.o, m: st.mode === 'time' ? 'time' : null, c: st.c });
}

function setOrigin(id) {
  if (!(id in idx)) return;
  st.o = id;
  if (st.c === id) st.c = null;
  C = compute(id);
  draw();
}

export async function main() {
  await initPage('distance');
  [D, K] = await Promise.all([fetch('data/maps/distance/cities.json').then((r) => r.json()), fetch('data/stats/korea.json').then((r) => r.json())]);
  idx = Object.fromEntries(D.cities.map((c, i) => [c.id, i]));
  // 시·도 경계 경로를 점 배열로 풀어 둔다
  shapes = [];
  for (const s of Object.values(K.map.shapes)) {
    for (const part of s.d.split('Z')) {
      const nums = part.match(/-?\d+(\.\d+)?/g);
      if (nums && nums.length >= 6) shapes.push(Float32Array.from(nums.map(Number)));
    }
  }
  const q = params();
  if (q.get('o') in idx) st.o = q.get('o');
  if (q.get('m') === 'time') { st.mode = 'time'; st.t = 1; }
  if (q.get('c') in idx) st.c = q.get('c');
  C = compute(st.o);
  const seoul = compute('seoul');
  const sb = seoul.rows.find((r) => r.id === 'busan'), mk = seoul.rows.find((r) => r.id === 'mokpo'), uj = seoul.rows.find((r) => r.id === 'uljin');
  const KTX = 138; // 분 — 2010년 11월 전 구간 개통 뒤 서울~부산(한국민족문화대백과사전)
  const sorted = [...D.cities].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ko') : a.kind === 'capital' ? -1 : 1));

  $('#mkBody').innerHTML = `
    <section class="mk-panel ds-bar" aria-label="지도 조작">
      <div class="st-segmented ds-mode" id="dsMode" role="tablist" aria-label="지도 종류">
        <button type="button" role="tab" class="st-segmented__item" data-m="real">지도 위 거리</button>
        <button type="button" role="tab" class="st-segmented__item" data-m="time">걸리는 시간</button>
      </div>
      <label class="ds-pick"><span>출발 도시</span><select id="dsOrigin">${['capital', 'city'].map((k) => `<optgroup label="${k === 'capital' ? '시·도청 소재지' : '그 밖의 도시'}">${sorted.filter((c) => c.kind === k).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <p class="mk-note ds-hint">지도에서 도시를 두 번 누르면 그 도시가 출발점이 됩니다.</p>
      <button type="button" class="share-btn" id="dsShare">공유</button>
    </section>
    <div class="ds-stage">
      <figure class="mk-map mk-tiphost ds-mapbox" id="dsMap"></figure>
      <div class="ds-side">
        <section class="mk-panel" id="dsRead" aria-live="polite"></section>
        <section class="mk-panel mk-tiphost">
          <h2>거리와 시간 <small class="ds-sub">점 하나가 도시 하나 · 선보다 위면 더딘 곳</small></h2>
          <div id="dsScatter"></div>
          <div class="ds-legend">${legendBar(DIV.slice().reverse(), '빨리 닿음', '더디게 닿음', '평균')}
            <div class="mk-keys"><span><svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden="true"><rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5" fill="var(--st-label-2)"/></svg>시·도청 소재지</span><span><svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden="true"><circle r="4" fill="var(--st-label-2)"/></svg>그 밖의 도시</span></div></div>
        </section>
      </div>
    </div>
    <div class="ds-after">
      <section class="mk-panel">
        <h2>예전과 견주면</h2>
        <div class="mk-why">
          <p>경부고속도로는 1970년 7월 7일에 개통했습니다. 이 지도에서 서울 → 부산 자동차 시간은 <b>${hm(sb.sec)}</b>(도로 ${fmt(sb.road, 0)}km)입니다.</p>
          <p>경부고속철도는 2004년 4월 1일 1단계, 2010년 11월 1일 전 구간이 개통했고, 그 뒤 서울~부산 열차 운행 시간은 <b>2시간 18분</b>이 되었습니다. 이 지도의 자동차 시간의 ${fmt((KTX / (sb.sec / 60)) * 100, 0)}%입니다. 같은 두 도시라도 무엇을 타느냐에 따라 「시간 거리」가 크게 달라집니다.</p>
        </div>
        <p class="mk-note">고속 도로 · 고속 철도가 생기기 전에 몇 시간이 걸렸는지는 공식 기관이 낸 숫자를 찾지 못해 적지 않았습니다. 교과서나 국가기록원 자료에서 찾아 비교해 보세요.</p>
      </section>
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>「걸리는 시간」을 눌러 보세요. 서울에서 볼 때 안쪽으로 당겨지는 방향과 바깥으로 밀려나는 방향은 어디인가요? 그 방향에는 어떤 도로가 지나고, 어떤 산줄기가 있나요?</li>
          <li>서울에서 목포는 직선 ${fmt(mk.km, 0)}km, 울진은 ${fmt(uj.km, 0)}km입니다. 그런데 자동차 시간은 ${hm(mk.sec)}과 ${hm(uj.sec)}으로 거의 같습니다. 두 방향의 땅 모양과 도로를 떠올려 까닭을 설명해 보세요.</li>
          <li>출발 도시를 부산이나 광주로 바꿔 보세요. 시간 지도의 모양이 서울과 어떻게 다른가요? 교통망이 어느 도시를 중심으로 짜여 있는지 말해 보세요.</li>
          <li>시간 거리가 줄어들면 좋은 점만 있을까요? 큰 도시로 사람과 돈이 빨려 들어가는 일(빨대 효과)과 함께 생각해 보세요.</li>
        </ol>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 자동차 시간 · 도로 거리 — OSRM 시연 서버(router.project-osrm.org)의 자동차 길찾기, 도로 자료 © OpenStreetMap 기여자(ODbL). 도시 위치 — 시·도청 · 시청 · 군청을 OpenStreetMap Nominatim으로 찾은 자리. ${esc(D.meta.fetched)}에 한 번 계산해 저장했습니다(scripts/build-map-distance.mjs). 시·도청은 2025년까지의 17개 시·도 기준입니다(광주 · 전남은 2026년 7월 전남광주통합특별시로 합쳐짐). 땅 모양 — 옛 통계청(현 국가데이터처) 센서스 행정구역 경계(data/stats/korea.json).</p>
    <p><b>예전 자료</b> 경부고속도로 개통일 — 국가기록원 「경부고속도로」 기록. 경부고속철도 개통일과 서울~부산 2시간 18분 — 한국민족문화대백과사전 「경부고속철도」(한국학중앙연구원).</p>
    <p><b>계산</b> 직선 거리는 하버사인 식(지구 반지름 6,371km). 시간 지도에서는 출발 도시를 가운데 두고, 각 도시를 같은 방향으로 「자동차 시간 × 빠르기 가운데값(육지 도시들의 직선 거리 ÷ 시간)」만큼 떨어진 곳에 놓았습니다. 그래서 평균보다 빠른 곳은 안으로, 느린 곳은 밖으로 움직입니다. 색은 이 비율을 2를 밑으로 한 로그로 다섯 칸에 나눈 것입니다.</p>
    <p><b>한계</b> OSRM 시간은 도로 등급 · 제한 속도로 어림한 「막히지 않을 때」의 시간이라 실제 운전 시간보다 짧을 수 있고, 휴게 · 신호 대기 · 출퇴근 정체가 빠져 있습니다. 제주는 OSM에 그려진 뱃길 시간이 들어간 값입니다. 가까운 도시(인천 · 수원 등)는 도심을 빠져나가는 시간이 전체에서 차지하는 몫이 커서 100km당 시간이 길게 나옵니다. 땅 모양은 도시 30곳의 움직임으로 둘레를 끌어 늘인 그림이라, 도시가 없는 곳(섬 · 산간)의 모양은 정확하지 않습니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .ds-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; padding: 12px 16px; margin-bottom: 16px; }
    .ds-pick { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--st-label-2); letter-spacing: var(--track-ko); }
    .ds-pick select { height: 34px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--st-separator); background: var(--st-bedrock); color: var(--st-label); font: inherit; font-size: 13.5px; }
    .ds-hint { flex: 1 1 200px; }
    .ds-stage { display: grid; gap: 16px; grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); align-items: start; }
    @media (max-width: 900px) { .ds-stage { grid-template-columns: 1fr; } }
    .ds-side { display: grid; gap: 16px; }
    .ds-mapbox { padding: 10px; }
    .ds-svg { max-height: 82vh; }
    .ds-land { fill: var(--st-fill-3); stroke: var(--st-label-4); stroke-width: 0.6; stroke-linejoin: round; }
    .ds-rings circle { fill: none; stroke: var(--st-label-4); stroke-width: 0.8; stroke-dasharray: 2 4; }
    .ds-rings text { fill: var(--st-label-3); font-size: 9.5px; font-variant-numeric: tabular-nums; }
    .ds-rings--h circle { stroke: var(--st-label-3); stroke-dasharray: none; stroke-width: 0.7; }
    .ds-spoke { stroke: var(--st-label-4); stroke-width: 0.6; opacity: 0.6; }
    .ds-city { cursor: pointer; outline: none; }
    .ds-city rect, .ds-city circle:not(.ds-ohalo) { fill: var(--c); stroke: var(--st-bedrock); stroke-width: 1.5; }
    .ds-city.is-island rect, .ds-city.is-island circle:not(.ds-ohalo) { stroke: var(--st-label); stroke-dasharray: 2 2; }
    .ds-city text { fill: var(--st-label-2); font-size: 10.5px; font-weight: 600; stroke: var(--st-bedrock); stroke-width: 3px; paint-order: stroke; pointer-events: none; }
    .ds-city.is-o text, .ds-city.is-sel text { fill: var(--st-label); font-size: 12px; }
    .ds-ohalo { fill: none; stroke: var(--st-label); stroke-width: 1.6; }
    .ds-city.is-sel rect, .ds-city.is-sel circle:not(.ds-ohalo) { stroke: var(--st-label); stroke-width: 2.4; }
    .ds-city:focus-visible text { text-decoration: underline; }
    .ds-sub { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .ds-grid { stroke: var(--st-separator); stroke-width: 0.6; }
    .ds-ax { fill: var(--st-label-3); font-size: 10px; font-variant-numeric: tabular-nums; }
    .ds-avg { stroke: var(--st-label-3); stroke-width: 1.2; stroke-dasharray: 5 4; }
    .ds-pt { cursor: pointer; }
    .ds-pt rect, .ds-pt circle { fill: var(--c); stroke: var(--st-bedrock); stroke-width: 1.2; }
    .ds-pt.is-sel rect, .ds-pt.is-sel circle { stroke: var(--st-label); stroke-width: 2.2; }
    .ds-plab { fill: var(--st-label-2); font-size: 10px; font-weight: 600; pointer-events: none; }
    .ds-legend { display: grid; gap: 8px; }
    .ds-dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 13px; letter-spacing: var(--track-ko); }
    .ds-dl dt { color: var(--st-label-3); }
    .ds-dl dd { margin: 0; color: var(--st-label); font-weight: 600; font-variant-numeric: tabular-nums; }
    .ds-dl small { font-weight: 400; color: var(--st-label-3); margin-left: 4px; }
    @media (max-width: 600px) { .ds-city > * { transform: scale(1.8); } .ds-rings text { font-size: 17px; } .ds-mapbox { padding: 4px; } }
    .ds-after { display: grid; gap: 16px; margin-top: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 900px) { .ds-after { grid-template-columns: 1fr; } }
  `;
  document.head.append(style);
  draw();

  // 이벤트
  tips($('#mkBody'));
  const body = $('#mkBody');
  let lastTap = { id: null, t: 0 };
  body.addEventListener('click', (e) => {
    const m = e.target.closest('#dsMode [data-m]');
    if (m) { st.mode = m.dataset.m; draw(); animateTo(st.mode === 'time' ? 1 : 0); return; }
    const c = e.target.closest('[data-city]');
    if (c) {
      const id = c.dataset.city, now = Date.now();
      if (lastTap.id === id && now - lastTap.t < 450 && id !== st.o) { lastTap = { id: null, t: 0 }; setOrigin(id); return; }
      lastTap = { id, t: now };
      st.c = st.c === id || id === st.o ? null : id;
      draw();
    }
  });
  body.addEventListener('keydown', (e) => {
    const c = e.target.closest('.ds-city');
    if (!c) return;
    if (e.key === 'Enter') { e.preventDefault(); setOrigin(c.dataset.city); setTimeout(() => $(`#ds-${c.dataset.city}`)?.focus(), 0); }
    if (e.key === ' ') { e.preventDefault(); st.c = c.dataset.city === st.o ? null : c.dataset.city; draw(); setTimeout(() => $(`#ds-${c.dataset.city}`)?.focus(), 0); }
  });
  $('#dsOrigin').addEventListener('change', (e) => setOrigin(e.target.value));
  shareButton($('#dsShare'), () => location.href, () => `출발 ${C.O.name} · ${st.mode === 'time' ? '시간 지도' : '실제 위치 지도'}`);
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
