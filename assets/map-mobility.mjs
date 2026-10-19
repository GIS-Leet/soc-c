// 서울 지하철역의 승강기와 이동권 — 서울교통공사 1~8호선 역마다 엘리베이터 · 휠체어 리프트를 모아, 휠체어로 다니기 어려운 자리를 지도에 찍는다(접근성).
// 자료: data/maps/mobility/mobility.json — scripts/build-map-mobility.py 가 서울 열린데이터광장 자료로 만든다.
// 역을 네 갈래로 나눈다: 갈아타는 길에 리프트가 있는 역 · 리프트가 남은 역 · 엘리베이터만 있는 역 · 이 자료에 엘리베이터가 없는 역.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, loadLeaflet, darkBase, initPage } from './map-kit.mjs?v=6473793e';

// 갈래 — 색(--s*)과 모양을 함께 쓴다
const CATS = [
  { id: 't', name: '갈아타는 길에 리프트', c: '--s2', shape: 'tri', hint: '다른 호선으로 갈아타려면 휠체어 리프트를 타야 하는 곳이 있는 역' },
  { id: 'w', name: '리프트가 남은 역', c: '--s4', shape: 'sq', hint: '출입구 · 대합실 · 승강장으로 가는 길 어딘가에 리프트가 있는 역' },
  { id: 'e', name: '엘리베이터만', c: '--s1', shape: 'dot', hint: '휠체어 리프트 없이 엘리베이터만 있는 역' },
  { id: 'n', name: '이 자료에 엘리베이터 없음', c: '--s5', shape: 'ring', hint: '서울교통공사 구간에는 엘리베이터가 없는 역(다른 기관이 맡은 구간은 자료 밖)' },
];
const catOf = (s) => (s.wl.some((w) => w.tr) ? 't' : s.wl.length ? 'w' : s.ev ? 'e' : 'n');
const st = { on: new Set(CATS.map((c) => c.id)), s: null, down: false };
let D, L, map, layer, markers = {};

function icon(cat, sel, down) {
  const c = CATS.find((x) => x.id === cat);
  const z = cat === 'e' ? 9 : 16;
  const h = z / 2;
  let g;
  if (c.shape === 'tri') g = `<path d="M${h} 1.5 L${z - 1} ${z - 2} L1 ${z - 2} Z"/>`;
  else if (c.shape === 'sq') g = `<rect x="2" y="2" width="${z - 4}" height="${z - 4}" rx="1.5"/>`;
  else if (c.shape === 'ring') g = `<circle cx="${h}" cy="${h}" r="${h - 2.5}" fill="none" stroke-width="3" style="stroke:var(${c.c})"/>`;
  else g = `<circle cx="${h}" cy="${h}" r="${h - 1}"/>`;
  const ring = down ? `<circle class="mb-down" cx="${h}" cy="${h}" r="${h + 4}" />` : '';
  const pad = 6;
  return L.divIcon({
    className: `mb-ic${sel ? ' is-sel' : ''}`,
    html: `<svg width="${z + pad * 2}" height="${z + pad * 2}" viewBox="${-pad} ${-pad} ${z + pad * 2} ${z + pad * 2}" style="--c:var(${c.c})" aria-hidden="true">${ring}${g}</svg>`,
    iconSize: [z + pad * 2, z + pad * 2], iconAnchor: [h + pad, h + pad],
  });
}

function detail(s) {
  if (!s) return `<p class="mk-note">지도의 역을 누르거나(키보드는 Tab으로 옮겨 Enter) 아래 목록에서 고르면, 그 역의 엘리베이터와 리프트가 여기 나옵니다.</p>`;
  const cat = CATS.find((c) => c.id === catOf(s));
  const lines = s.l.split('').map((x) => x + '호선').join(' · ');
  const wl = s.wl.map((w) => `<li><b>${esc(w.at)}</b> <span>${esc(w.span)}${w.tr ? ' · 갈아타는 길' : ''}${w.down ? ' · 내려받은 때 보수 중' : ''}</span></li>`).join('');
  return `<p class="mb-dname">${esc(s.n)} <small>${esc(lines)}</small></p>
    <p class="mb-dcat"><span class="mb-sw" style="--c:var(${cat.c})">${shapeSvg(cat)}</span>${esc(cat.name)}</p>
    <dl class="mb-dl">
      <div><dt>엘리베이터</dt><dd>${s.ev}대${s.evDown ? ` <small>(보수 중 ${s.evDown})</small>` : ''}</dd></div>
      <div><dt>에스컬레이터</dt><dd>${s.es}대</dd></div>
      <div><dt>휠체어 리프트</dt><dd>${s.wl.length}대</dd></div>
    </dl>
    ${wl ? `<ul class="mb-wl">${wl}</ul>` : ''}
    ${s.other.length ? `<p class="mk-note">이 역의 ${esc(s.other.join(' · '))} 구간은 다른 기관이 맡아 이 자료에 없습니다.</p>` : ''}
    ${s.ev === 1 && !s.wl.length ? '<p class="mk-note">엘리베이터가 한 대뿐입니다. 그 한 대가 멈추면 이 자료의 승강기만으로는 휠체어로 오르내릴 길이 없습니다.</p>' : ''}`;
}
function shapeSvg(c) {
  const g = c.shape === 'tri' ? '<path d="M6 1 L11 10.5 L1 10.5 Z"/>' : c.shape === 'sq' ? '<rect x="1.5" y="1.5" width="9" height="9" rx="1.5"/>'
    : c.shape === 'ring' ? `<circle cx="6" cy="6" r="4" fill="none" stroke-width="2.4" style="stroke:var(${c.c})"/>` : '<circle cx="6" cy="6" r="3.5"/>';
  return `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">${g}</svg>`;
}

function draw() {
  const S = D.stations;
  layer.clearLayers(); markers = {};
  for (const s of S) {
    const cat = catOf(s);
    if (!st.on.has(cat)) continue;
    const down = st.down && (s.evDown || s.wl.some((w) => w.down));
    if (st.down && !down) continue;
    const m = L.marker([s.lat, s.lon], { icon: icon(cat, st.s === s.n, down), keyboard: true, title: s.n, alt: s.n, riseOnHover: true,
      zIndexOffset: cat === 'e' ? 0 : cat === 'w' ? 400 : 800 });
    m.bindTooltip(`${s.n} · 엘리베이터 ${s.ev}대${s.wl.length ? ` · 리프트 ${s.wl.length}대` : ''}`, { direction: 'top', offset: [0, -6] });
    m.on('click', () => select(s.n));
    m.addTo(layer); markers[s.n] = m;
  }
  // 거름 단추
  const n = (id) => S.filter((s) => catOf(s) === id).length;
  $('#mbCats').innerHTML = CATS.map((c) => `<button type="button" class="lg-chip" data-c="${c.id}" aria-pressed="${st.on.has(c.id)}" data-tip="${esc(`${c.name}|${c.hint}`)}">
      <span class="mb-sw" style="--c:var(${c.c})">${shapeSvg(c)}</span>${esc(c.name)} <small>${n(c.id)}</small></button>`).join('');
  $('#mbDown').setAttribute('aria-pressed', String(st.down));
  const sel = S.find((s) => s.n === st.s);
  $('#mbDetail').innerHTML = detail(sel);
  $$('#mbList [data-s]').forEach((b) => b.classList.toggle('is-sel', b.dataset.s === st.s));
  setParams({ f: st.on.size < CATS.length ? [...st.on].join('') || '-' : null, down: st.down ? 1 : null, s: st.s });
}
function select(name, fly = false) {
  st.s = st.s === name ? null : name;
  const s = D.stations.find((x) => x.n === st.s);
  if (s && fly) map.setView([s.lat, s.lon], Math.max(map.getZoom(), 13));
  draw();
}

function busChart() {
  const B = D.bus;
  const bins = [
    { id: 0, name: '0%', test: (r) => r === 0 },
    { id: 1, name: '1~49%', test: (r) => r > 0 && r < 0.5 },
    { id: 2, name: '50~79%', test: (r) => r >= 0.5 && r < 0.8 },
    { id: 3, name: '80~99%', test: (r) => r >= 0.8 && r < 1 },
    { id: 4, name: '100%', test: (r) => r === 1 },
  ];
  const rows = bins.map((b) => ({ ...b, list: B.filter(([, all, low]) => b.test(low / all)) }));
  const max = Math.max(...rows.map((r) => r.list.length));
  const all = B.reduce((a, b) => a + b[1], 0), low = B.reduce((a, b) => a + b[2], 0);
  const SEQ5 = ['--kr-s1', '--kr-s2', '--kr-s3', '--kr-s4', '--kr-s5'];
  return `<p class="mk-why">서울 시내버스 ${fmt(B.length)}개 노선, ${fmt(all)}대 가운데 저상 버스는 <b>${fmt(low)}대(${fmt((low / all) * 100, 1)}%)</b>입니다.</p>
    <ul class="mb-bus">${rows.map((r, i) => `<li data-tip="${esc(`저상 버스 비율 ${r.name}|${r.list.length}개 노선${r.list.length && r.list.length <= 12 ? '|' + r.list.map((x) => x[0]).join(' · ') : ''}`)}">
      <span class="mb-bk">${r.name}</span><span class="mb-bb"><i style="width:${(r.list.length / max) * 100}%;background:var(${SEQ5[i]})"></i></span><span class="mb-bn">${r.list.length}개</span></li>`).join('')}</ul>
    <p class="mk-note">노선마다 「인가 대수 가운데 저상 버스 대수」로 나눈 비율입니다(서울시, ${esc(D.busDate)} 기준). 버스 노선의 길은 자료에 없어 지도 대신 막대로 보입니다.</p>`;
}

export async function main() {
  await initPage('mobility');
  const [data, gu, Lf] = await Promise.all([fetch('data/maps/mobility/mobility.json').then((r) => r.json()), fetch('data/maps/mobility/seoul-gu.json').then((r) => r.json()), loadLeaflet()]);
  D = data; L = Lf;
  const q = params();
  if (q.get('f')) st.on = new Set(q.get('f').split('').filter((x) => CATS.some((c) => c.id === x)));
  st.down = q.get('down') === '1';
  if (q.get('s') && D.stations.some((s) => s.n === q.get('s'))) st.s = q.get('s');
  const S = D.stations;
  const liftSt = S.filter((s) => s.wl.length).sort((a, b) => b.wl.some((w) => w.tr) - a.wl.some((w) => w.tr) || b.wl.length - a.wl.length || a.n.localeCompare(b.n, 'ko'));
  const nT = S.filter((s) => catOf(s) === 't').length;
  const nLift = S.reduce((a, s) => a + s.wl.length, 0);
  const evDown = S.reduce((a, s) => a + s.evDown, 0);
  const one = S.filter((s) => s.ev === 1 && !s.wl.length);

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--below">
      <figure class="mk-map mb-map mk-tiphost" id="mbMap" role="img" aria-label="서울 지하철 1~8호선 역의 엘리베이터 · 휠체어 리프트 지도"></figure>
      <div class="mb-tools mk-tiphost">
        <div class="mk-tools" id="mbCats" role="group" aria-label="보일 역 고르기"></div>
        <div class="mk-tools">
          <button type="button" class="opt" id="mbDown" aria-pressed="false">내려받은 때 보수 중이던 승강기가 있는 역만</button>
          <button type="button" class="share-btn" id="mbShare">공유</button>
        </div>
      </div>
      <div class="mb-row">
        <section class="mk-panel" aria-live="polite"><h2>고른 역</h2><div id="mbDetail"></div></section>
        <section class="mk-panel mk-tiphost">
          <h2>휠체어 리프트가 남은 역 ${liftSt.length}곳 <small class="mb-sub">리프트 ${nLift}대 · 위에 있는 ${nT}곳은 갈아타는 길에 있음</small></h2>
          <ul class="mb-list" id="mbList">${liftSt.map((s) => `<li><button type="button" data-s="${esc(s.n)}"><span class="mb-sw" style="--c:var(${CATS.find((c) => c.id === catOf(s)).c})">${shapeSvg(CATS.find((c) => c.id === catOf(s)))}</span>
            <b>${esc(s.n)}</b><span>${s.l.split('').join('·')}호선 · 리프트 ${s.wl.length}대</span></button></li>`).join('')}</ul>
        </section>
        <section class="mk-panel mk-tiphost">
          <h2>저상 버스 <small class="mb-sub">노선별 보유 비율</small></h2>
          ${busChart()}
        </section>
      </div>
      <section class="mk-panel mb-why">
        <h2>휠체어 리프트를 따로 센 까닭</h2>
        <div class="mk-why">
          <p>휠체어 리프트는 계단 옆 난간에 붙어 오르내리는 판입니다. 대개 직원을 불러야 움직이고, 엘리베이터보다 느립니다. 그래서 리프트가 남은 자리는 「엘리베이터로 이어진 길이 끊긴 자리」로 읽을 수 있습니다.</p>
          <p>이 자료로 센 서울교통공사 1~8호선 ${fmt(S.length)}개 역에는 엘리베이터 ${fmt(D.count.ev)}대, 휠체어 리프트 ${fmt(D.count.wl)}대가 있습니다. 리프트가 남은 역은 ${liftSt.length}곳이고, 그 가운데 <b>${nT}곳</b>은 다른 호선으로 갈아타는 길에 리프트가 있습니다. 엘리베이터가 있어도 갈아타는 길에서 리프트를 타야 한다면, 그 환승역은 휠체어로 갈아타기 어려운 역입니다.</p>
          <p>「교통약자의 이동편의 증진법」 제3조는 이를 <b>이동권</b>이라 부릅니다. 교통약자(장애인 · 고령자 · 임산부 · 영유아를 동반한 사람 · 어린이 등)도 「교통약자가 아닌 사람들이 이용하는 모든 교통수단, 여객시설 및 도로를 차별 없이 안전하고 편리하게 이용하여 이동할 수 있는 권리」를 가진다는 것입니다.</p>
          <p>내려받은 때(${esc(D.made)}) 엘리베이터 ${evDown}대가 보수 중이었습니다. 엘리베이터가 한 대뿐이고 리프트도 없는 역은 ${one.length}곳(${one.map((s) => esc(s.n)).join(' · ')})입니다.</p>
        </div>
      </section>
    </div>
    <section class="mk-panel mb-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>주황 세모로 표시된 역을 눌러 보세요. 리프트는 몇 호선과 몇 호선 사이에 있나요? 휠체어를 탄 사람은 그 역에서 갈아타는 대신 어떤 길을 고를까요?</li>
        <li>계단 · 에스컬레이터만 있는 길은 휠체어뿐 아니라 누구에게 어려울까요? 큰 짐을 든 사람, 유아차를 미는 사람, 다리를 다친 사람을 떠올려 보세요.</li>
        <li>지하철은 엘리베이터가 거의 모든 역에 있지만, 버스는 노선마다 저상 버스 비율이 다릅니다. 같은 동네라도 어떤 노선을 타느냐에 따라 이동권이 달라진다면 무엇을 먼저 바꿔야 할까요?</li>
        <li>「보수 중이던 승강기가 있는 역만」을 눌러 보세요. 엘리베이터가 한 대뿐인 역에서 그 한 대가 멈추면 휠체어를 탄 사람은 어떻게 이동해야 할까요?</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 서울 열린데이터광장(공공누리 제1유형) — 서울교통공사 「교통약자 이용시설 승강기 가동현황」(OA-15994, 매시 갱신, ${esc(D.made)} 내려받음) ·
      서울특별시 「역사마스터 정보」(OA-21232, 역 위치) · 서울특별시 「저상버스 도입 노선 및 노선별 보유율」(OA-22229, ${esc(D.busDate)} 기준). 법 조문은 국가법령정보센터 「교통약자의 이동편의 증진법」 제2조 · 제3조.</p>
    <p><b>계산 · 한계</b> 서울교통공사가 맡은 1~8호선 구간의 승강기만 들어 있습니다. 9호선 · 신분당선 · 경의중앙선처럼 다른 기관이 맡은 구간의 엘리베이터는 빠져 있어, 그런 노선과 만나는 역은 실제보다 적게 보일 수 있습니다(역을 누르면 알려 줍니다).
      이름이 같은 역은 한 곳으로 묶었습니다. 「갈아타는 길」은 리프트의 설치 위치에 「환승」이나 「2,3호선」처럼 호선을 잇는 말이 있는 경우로 나눴습니다. 엘리베이터가 있다고 해서 지상에서 승강장까지 한 번에 이어진다는 뜻은 아니며, 운행 상태는 내려받은 한 시각의 값입니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .mb-map { height: min(68vh, 640px); min-height: 380px; }
    .mb-tools { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; align-items: center; }
    .mb-ic { background: none; border: 0; }
    .leaflet-tooltip.mb-gulab { background: none; border: 0; box-shadow: none; padding: 0; color: var(--st-label-3); font-size: 11px; font-weight: 600; letter-spacing: var(--track-ko); }
    .leaflet-tooltip.mb-gulab::before { display: none; }
    .mb-map .leaflet-zoom-anim .mb-gulab, .mb-map.mb-far .mb-gulab { opacity: 0 !important; }
    .mb-ic svg { display: block; overflow: visible; fill: var(--c); stroke: var(--st-bedrock); stroke-width: 1.2; }
    .mb-ic.is-sel svg { stroke: var(--st-label); stroke-width: 2.4; }
    .mb-ic:focus-visible { outline: 2px solid var(--st-label); outline-offset: 1px; border-radius: 4px; }
    .mb-down { fill: none; stroke: var(--st-label) !important; stroke-width: 1.6 !important; stroke-dasharray: 3 2; }
    .mb-sw { display: inline-grid; place-items: center; width: 14px; height: 14px; flex-shrink: 0; }
    .mb-sw svg { fill: var(--c); }
    .mb-row { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 1000px) { .mb-row { grid-template-columns: 1fr; } }
    .mb-sub { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .mb-dname { font-size: 18px; font-weight: 700; color: var(--st-label); }
    .mb-dname small { margin-left: 6px; font-size: 12px; font-weight: 500; color: var(--st-label-3); }
    .mb-dcat { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--st-label-2); }
    .mb-dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; }
    .mb-dl div { display: grid; gap: 2px; }
    .mb-dl dt { font-size: 11.5px; color: var(--st-label-3); }
    .mb-dl dd { margin: 0; font-size: 18px; font-weight: 700; color: var(--st-label); font-variant-numeric: tabular-nums; }
    .mb-dl dd small { font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .mb-wl { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 12.5px; }
    .mb-wl b { color: var(--st-label); font-weight: 600; } .mb-wl span { color: var(--st-label-3); }
    .mb-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; max-height: 340px; overflow: auto; }
    .mb-list button { width: 100%; display: grid; grid-template-columns: 16px auto 1fr; gap: 8px; align-items: center; padding: 5px 6px; border-radius: var(--st-r-inner);
      background: none; color: inherit; text-align: left; cursor: pointer; font-size: 12.5px; }
    .mb-list button:hover, .mb-list button.is-sel { background: var(--st-fill-2); }
    .mb-list button:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -2px; }
    .mb-list b { color: var(--st-label); font-weight: 600; } .mb-list span:last-child { color: var(--st-label-3); text-align: right; font-variant-numeric: tabular-nums; }
    .mb-bus { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .mb-bus li { display: grid; grid-template-columns: 58px 1fr 42px; gap: 8px; align-items: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
    .mb-bk { color: var(--st-label-2); } .mb-bn { color: var(--st-label); text-align: right; }
    .mb-bb { height: 12px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .mb-bb i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
    .mb-why, .mb-think { margin-top: 0; }
    .mb-think { margin-top: 16px; }
    .mb-why .mk-why { max-width: 92ch; }
  `;
  document.head.append(style);

  map = L.map('mbMap', { zoomControl: true }).setView([37.555, 126.99], 11);
  darkBase(L, map);
  // 자치구 경계 — 바탕 지도 위 길잡이
  const cs = getComputedStyle(document.documentElement);
  L.geoJSON(gu, { interactive: false, style: { color: cs.getPropertyValue('--st-label').trim() || '#ece8dd', opacity: 0.22, weight: 1, fillColor: cs.getPropertyValue('--st-label').trim() || '#ece8dd', fillOpacity: 0.04 },
    onEachFeature: (f, l) => l.bindTooltip(f.properties.name, { permanent: true, direction: 'center', className: 'mb-gulab', interactive: false }) }).addTo(map);
  layer = L.layerGroup().addTo(map);
  const far = () => $('#mbMap').classList.toggle('mb-far', map.getZoom() < 11);
  map.on('zoomend', far);
  const body = $('#mkBody');
  tips(body);
  $('#mbCats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = b.dataset.c;
    if (st.on.has(c)) st.on.delete(c); else st.on.add(c);
    draw();
  });
  $('#mbDown').addEventListener('click', () => { st.down = !st.down; draw(); });
  $('#mbList').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) select(b.dataset.s, true); });
  shareButton($('#mbShare'), () => location.href, () => (st.s ? `${st.s}역` : '서울 지하철 엘리베이터 · 리프트 지도'));
  draw();
  const pts = S.map((s) => [s.lat, s.lon]);
  map.fitBounds(pts, { padding: [16, 16] });
  if (st.s) { const s = S.find((x) => x.n === st.s); map.setView([s.lat, s.lon], 13); }
  far();
  setTimeout(() => map.invalidateSize(), 50);
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
