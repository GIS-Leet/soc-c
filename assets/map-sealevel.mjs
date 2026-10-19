// 해수면 상승과 해안 침수 — 수치 표고 모델(DEM)로 해수면이 오를 때 바다와 이어져 잠기는 땅을 찾는다.
// 자료: data/maps/sealevel/(scripts/build-map-sealevel.py 가 Copernicus DEM GLO-30 에서 만든 겹침 그림과 넓이).
// 겹침 그림의 회색 값 v = 40f + 6d — f: 처음 바다와 이어져 잠기는 단계(1~5), d: 처음 그 높이 아래가 되는 단계.
// 핵심은 「높이만이 아니라 이어짐」 — 낮아도 바다와 떨어진 땅은 잠기지 않고, 막고 있던 둑을 넘으면 한꺼번에 잠긴다.
import { $, $$, esc, fmt, params, setParams, shareButton, loadLeaflet, darkBase, initPage } from './map-kit.mjs?v=6473793e';

// 단계 색 — 먼저 잠길수록(위험이 클수록) 밝게. 낮지만 떨어진 땅은 기준 아래 색(--kr-n2) 빗금
const LV_COL = ['--kr-s5', '--kr-s4', '--kr-s3', '--kr-s2', '--kr-s1'];
const CUT_COL = '--kr-n2';
const st = { s: 'busan', k: 2, m: 'conn' }; // k: 0 지금, 1~5 단계 / m: conn 이어진 곳만 · height 높이만
let D, L, map, overlay, frame, pick = null;
const cache = new Map(); // 곳 → { w, h, v(Uint8Array) }
const urls = new Map(); // 곳|k|m → blob url

const site = () => D.sites.find((x) => x.id === st.s);
const hOf = (k) => (k ? D.levels[k - 1] : 0);
const hTxt = (k) => (k ? `${fmt(hOf(k), 1)}m` : '지금');
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(v) {
  const s = css(v);
  const m = s.match(/^#([0-9a-f]{6})$/i);
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)] : [128, 128, 128];
}
const decode = (v) => { const f = Math.floor((v + 5) / 40); return [f, Math.round((v - 40 * f) / 6)]; };

async function raster(id) {
  if (cache.has(id)) return cache.get(id);
  const s = D.sites.find((x) => x.id === id);
  const img = new Image();
  img.src = s.img;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const v = new Uint8Array(c.width * c.height);
  for (let i = 0; i < v.length; i++) v[i] = px[i * 4];
  const r = { w: c.width, h: c.height, v };
  cache.set(id, r);
  return r;
}

// 지금 단계 · 방법으로 칠한 그림
async function paint() {
  const key = `${st.s}|${st.k}|${st.m}`;
  if (urls.has(key)) return urls.get(key);
  const R = await raster(st.s);
  const c = document.createElement('canvas');
  c.width = R.w; c.height = R.h;
  const g = c.getContext('2d');
  const out = g.createImageData(R.w, R.h);
  const o = out.data;
  const lv = LV_COL.map(rgb), cut = rgb(CUT_COL);
  for (let i = 0; i < R.v.length; i++) {
    const v = R.v[i];
    if (!v || !st.k) continue;
    const [f, d] = decode(v);
    let col = null;
    if (f && f <= st.k) col = lv[f - 1];
    else if (st.m === 'height' && d && d <= st.k) {
      const x = i % R.w, y = (i / R.w) | 0;
      if ((x + y) % 5 < 2) col = cut; // 빗금
    }
    if (!col) continue;
    const j = i * 4;
    o[j] = col[0]; o[j + 1] = col[1]; o[j + 2] = col[2]; o[j + 3] = 225;
  }
  g.putImageData(out, 0, 0);
  const url = await new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), 'image/png'));
  urls.set(key, url);
  return url;
}

// 누른 곳의 칸 값
function cellAt(ll) {
  const s = site(), R = cache.get(s.id);
  if (!R) return null;
  const [[la0, lo0], [la1, lo1]] = s.bounds;
  const my = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  const x = Math.floor(((ll.lng - lo0) / (lo1 - lo0)) * R.w);
  const y = Math.floor(((my(la1) - my(ll.lat)) / (my(la1) - my(la0))) * R.h);
  if (x < 0 || y < 0 || x >= R.w || y >= R.h) return { out: true };
  return { v: R.v[y * R.w + x] };
}
function pickText() {
  if (!pick) return '지도를 누르면 그 자리가 몇 m에서 잠기는지 알려 줍니다.';
  const c = cellAt(pick);
  if (!c) return '';
  if (c.out) return '계산한 범위(점선 사각형) 밖입니다.';
  if (!c.v) return '누른 곳: 바다 · 강 · 호수이거나, 5m까지 올라도 잠기지 않는 땅입니다.';
  const [f, d] = decode(c.v);
  if (f && f === d) return `누른 곳: 해수면이 ${hTxt(f)} 오르면 바다와 이어져 잠깁니다.`;
  if (f) return `누른 곳: 높이는 ${hTxt(d)} 아래지만 그때는 바다와 떨어져 있고, ${hTxt(f)}에서 바다와 이어져 잠깁니다.`;
  return `누른 곳: 높이는 ${hTxt(d)} 아래지만 5m까지 올려도 바다와 이어지지 않습니다.`;
}

function numbers() {
  const s = site();
  const r = st.k ? s.rows[st.k - 1] : { flood: 0, cut: 0, joined: 0 };
  const a = st.m === 'height' ? r.flood + r.cut : r.flood;
  return { s, r, a };
}

async function draw() {
  const { s, r, a } = numbers();
  // 지도
  const url = await paint();
  if (!overlay) overlay = L.imageOverlay(url, s.bounds, { className: 'sl-ov', interactive: false }).addTo(map);
  else { overlay.setUrl(url); overlay.setBounds(L.latLngBounds(s.bounds)); }
  frame.setBounds(L.latLngBounds([s.bbox[1], s.bbox[0]], [s.bbox[3], s.bbox[2]]));
  $('#slPick').textContent = pickText();
  // 조작판
  $$('#slSites .opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === st.s)));
  $$('#slMode .st-segmented__item').forEach((b) => { const on = b.dataset.m === st.m; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $('#slLevel').value = st.k;
  $('#slLevelOut').textContent = st.k ? `+${hTxt(st.k)}` : '지금';
  $('#slLevel').setAttribute('aria-valuetext', st.k ? `해수면 ${hTxt(st.k)} 상승` : '지금 해수면');
  $('#slArea').innerHTML = `<b>${fmt(a, a < 10 ? 1 : 0)}</b><span>km²</span>`;
  $('#slAreaCap').textContent = st.m === 'height'
    ? `높이만 보고 칠한 넓이 · 그중 ${fmt(r.cut, 1)} km²는 바다와 이어지지 않은 땅`
    : `바다와 이어져 잠기는 땅 · 사각형 안 땅 ${fmt(s.land, 0)} km²의 ${fmt((a / s.land) * 100, 1)}%`;
  // 단계별 막대
  const max = Math.max(...s.rows.map((x) => x.flood + (st.m === 'height' ? x.cut : 0)));
  $('#slBars').innerHTML = s.rows.map((x, i) => {
    const k = i + 1, on = k <= st.k;
    const w1 = (x.flood / max) * 100, w2 = st.m === 'height' ? (x.cut / max) * 100 : 0;
    const val = x.flood + (st.m === 'height' ? x.cut : 0);
    return `<li class="${k === st.k ? 'is-cur' : ''}${on ? '' : ' is-off'}" data-k="${k}" role="button" tabindex="0" aria-label="${esc(`${hTxt(k)} 상승: ${fmt(val, 1)} 제곱킬로미터`)}">
      <span class="sl-bl">+${esc(hTxt(k))}</span>
      <span class="sl-bt"><i style="width:${w1}%;background:var(${LV_COL[i]})"></i>${w2 ? `<i class="sl-hatch" style="width:${w2}%"></i>` : ''}</span>
      <span class="sl-bv">${fmt(val, val < 10 ? 1 : 0)}</span></li>`;
  }).join('');
  // 까닭
  $('#slSay').innerHTML = say(s, r, a);
  setParams({ s: st.s, h: st.k ? hOf(st.k) : '0', m: st.m === 'height' ? 'height' : null });
}

function say(s, r, a) {
  if (!st.k) return `<p>지금 해수면입니다. 손잡이를 올려 보세요. 칠해지는 곳은 그 높이보다 낮으면서 <b>바다와 이어진</b> 땅입니다.</p>`;
  const p = [];
  if (st.m === 'height') {
    p.push(`<p>높이만 보면 ${fmt(a, 1)} km²가 바다보다 낮습니다. 그러나 그중 <b>${fmt(r.cut, 1)} km²</b>(빗금)는 둘레가 더 높아 바닷물이 들어갈 길이 없습니다.</p>`);
    p.push(`<p>물은 높이가 낮은 곳이 아니라, 낮은 곳을 따라 <b>이어진</b> 곳으로만 들어옵니다. 「이어진 곳만」으로 바꿔 견주어 보세요.</p>`);
    return p.join('');
  }
  p.push(`<p>해수면이 ${hTxt(st.k)} 오르면 ${esc(s.name)}에서 바다와 이어져 잠기는 땅은 <b>${fmt(a, 1)} km²</b>입니다.</p>`);
  if (r.joined >= 3 && st.k > 1) {
    const prev = s.rows[st.k - 2];
    p.push(`<p>이 가운데 ${fmt(r.joined, 1)} km²는 ${hTxt(st.k - 1)}일 때 이미 높이가 그 아래였는데도 바다와 떨어져 있던 땅입니다. 둑이나 도로처럼 조금 높은 줄이 물길을 막고 있다가, 물이 그 높이를 넘자 한꺼번에 이어졌습니다(${hTxt(st.k - 1)}에서 ${fmt(prev.flood, 1)} km² → ${hTxt(st.k)}에서 ${fmt(r.flood, 1)} km²).</p>`);
  }
  let big = 0, bi = 1;
  s.rows.forEach((x, i) => { const inc = x.flood - (i ? s.rows[i - 1].flood : 0); if (inc > big) { big = inc; bi = i + 1; } });
  p.push(`<p>이곳은 해수면이 ${bi > 1 ? `${hTxt(bi - 1)}에서 ${hTxt(bi)}로` : `${hTxt(1)}까지`} 오를 때 잠기는 땅이 가장 많이 늘어납니다(${fmt(big, 1)} km²). 곳마다 이 높이가 다른 것은 들판의 높이와 둑의 높이가 다르기 때문입니다.</p>`);
  if (s.note) p.push(`<p class="sl-note">${esc(s.note)}</p>`);
  return p.join('');
}

const NOTES = {
  saemangeum: '새만금 방조제 안쪽은 이 높이 자료를 찍던 2010~2015년에 아직 갯벌을 메우는 중이었습니다. 그 뒤 흙을 쌓아 높인 곳은 이 지도에 반영되지 않았습니다.',
};

export async function main() {
  await initPage('sealevel');
  D = await fetch('data/maps/sealevel/sites.json').then((r) => r.json());
  D.sites.forEach((s) => (s.note = NOTES[s.id] || ''));
  const q = params();
  if (D.sites.some((s) => s.id === q.get('s'))) st.s = q.get('s');
  if (q.has('h')) { const h = Number(q.get('h')); st.k = h === 0 ? 0 : Math.max(0, D.levels.indexOf(h) + 1) || st.k; }
  if (q.get('m') === 'height') st.m = 'height';

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left">
      <div class="sl-mapcol">
        <figure class="mk-map mk-map--tall sl-map"><div class="sl-leaf" id="slMap" role="region" aria-label="해수면이 오를 때 바다와 이어져 잠기는 땅을 칠한 지도"></div></figure>
        <p class="mk-note sl-pick" id="slPick" aria-live="polite"></p>
      </div>
      <aside class="mk-panel sl-panel" aria-label="곳과 높이 고르기">
        <h2>해안 고르기</h2>
        <div class="mk-tools" id="slSites">${D.sites.map((s) => `<button type="button" class="opt" data-s="${s.id}" title="${esc(s.towns)}">${esc(s.name)}</button>`).join('')}</div>
        <div class="mk-field">
          <label for="slLevel"><span>해수면이 오른 높이</span><output id="slLevelOut"></output></label>
          <input type="range" id="slLevel" min="0" max="${D.levels.length}" step="1">
          <div class="sl-ticks" aria-hidden="true"><span>지금</span>${D.levels.map((h) => `<span>${fmt(h, 1)}</span>`).join('')}</div>
        </div>
        <div class="mk-field">
          <span class="mk-l"><span>칠하는 방법</span></span>
          <div class="st-segmented sl-mode" id="slMode" role="tablist" aria-label="칠하는 방법">
            <button type="button" class="st-segmented__item" role="tab" data-m="conn">바다와 이어진 곳만</button>
            <button type="button" class="st-segmented__item" role="tab" data-m="height">높이만 보기</button>
          </div>
        </div>
        <div class="sl-num" aria-live="polite"><p class="sl-area" id="slArea"></p><p class="mk-note" id="slAreaCap"></p></div>
        <ol class="sl-bars" id="slBars" aria-label="높이별 잠기는 넓이(km²)"></ol>
        <div class="mk-keys sl-keys">
          ${D.levels.map((h, i) => `<span><i style="background:var(${LV_COL[i]})"></i>${fmt(h, 1)}m에서</span>`).join('')}
          <span><i class="sl-hatch"></i>낮지만 바다와 떨어진 땅</span>
          <span><i class="sl-frame"></i>계산한 범위</span>
        </div>
        <div class="mk-why" id="slSay"></div>
        <div class="mk-tools"><button type="button" class="share-btn" id="slShare">공유</button></div>
      </aside>
    </div>
    <div class="sl-after">
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>낙동강 하구에서 「바다와 이어진 곳만」과 「높이만 보기」를 번갈아 눌러 보세요. 2m에서 두 넓이가 크게 다른 까닭은 무엇일까요? 3m가 되면 무슨 일이 일어나나요?</li>
          <li>칠해지는 땅은 바탕 지도에서 어떤 곳인가요? 큰 강의 하구, 바다를 막아 만든 들, 갯벌과 어떤 관계가 있는지 찾아보세요.</li>
          <li>같은 1m라도 곳마다 잠기는 넓이가 다릅니다. 대비할 돈과 시간이 한정되어 있다면 어디부터, 무엇을 지켜야 할까요? 그것은 누가 정해야 할까요?</li>
          <li>이 지도에는 밀물 · 태풍 해일 · 둑이 무너지는 경우가 빠져 있습니다. 이것들을 넣으면 결과는 어떻게 달라질까요?</li>
        </ol>
      </section>
      <section class="mk-panel">
        <h2>계산과 한계</h2>
        <div class="mk-why sl-limits">
          <p>30m 칸마다 높이를 읽고, 바다 칸에서 출발해 「그 높이보다 낮은 칸」을 위아래 · 좌우로 따라가며 닿는 칸만 칠했습니다(연결성 분석). 넓이는 칠한 땅 칸의 넓이를 더한 값이며, 해안선 바깥 갯벌은 OpenStreetMap 육지 경계로 걸러 땅에서 뺐습니다.</p>
          <p><b>표면 높이입니다.</b> 이 자료(DSM)는 건물 지붕과 나무 꼭대기의 높이까지 담고 있어, 도시와 숲은 실제 땅보다 높게 잡힙니다. 그만큼 덜 잠기는 것처럼 보일 수 있습니다.</p>
          <p><b>둑을 따로 다루지 않았습니다.</b> 30m 칸에 잡힐 만큼 넓은 둑과 도로는 물을 막는 것으로 계산되고, 좁은 둑 · 수문 · 배수 펌프는 반영되지 않습니다. 둑이 넘치거나 무너지는 경우도 따지지 않은 개념 실험입니다.</p>
          <p><b>기준이 되는 바다 높이가 실제와 다릅니다.</b> 높이는 EGM2008 지오이드에서 잰 값인데, 실제 그 바다의 평균 해수면은 해류 · 바람 · 수온 때문에 지오이드와 조금씩 어긋납니다. 특히 서해안은 밀물과 썰물의 차가 커서, 밀물 때 바닷물은 평균보다 훨씬 높이 올라옵니다. 0.5m처럼 작은 값은 오차 안에 들 수 있습니다.</p>
          <p><b>예측이 아닙니다.</b> 「언제 몇 m 오른다」가 아니라 「만약 몇 m 오르면」을 계산한 지도입니다. 높이 자료는 2010~2015년 위성 관측으로 만들어, 그 뒤 생긴 매립지 · 둑은 들어 있지 않습니다.</p>
          <p class="sl-link"><a href="terrain.html">지형 시뮬레이터</a>에서 해수면을 올리면 낮은 땅부터 잠기는 원리를 보았습니다. 이 지도는 그 원리를 실제 우리 해안의 높이 자료에 그대로 옮겨 본 것입니다.</p>
        </div>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> Copernicus DEM GLO-30 Public(30m, 2026-10-20 받음, <a href="https://registry.opendata.aws/copernicus-dem/">AWS 공개 자료</a>) — produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. 물 가림(바다 · 강 · 호수)은 같은 자료의 WBM 층.</p>
    <p><b>육지 경계</b> OpenStreetMap 육지 다각형(osmdata.openstreetmap.de, 2026-10-19판) © OpenStreetMap contributors, ODbL. <b>바탕 지도</b> © OpenStreetMap contributors(어둡게 바꿔 보여 줌).</p>
    <p><b>계산</b> 해수면 상승 0.5 · 1 · 2 · 3 · 5m마다, 높이(EGM2008 기준)가 그 값 이하인 칸 가운데 열린 바다와 위아래 · 좌우로 이어진 땅 칸만 셌습니다. 칸 넓이는 위도에 따라 줄어드는 것을 반영했습니다. 만드는 과정은 scripts/build-map-sealevel.py.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .sl-map { min-height: 480px; isolation: isolate; z-index: 0; }
    .sl-leaf { position: absolute; inset: 0; }
    .sl-ov { image-rendering: pixelated; }
    .sl-panel { align-content: start; }
    .sl-ticks { display: flex; justify-content: space-between; font-size: 11px; color: var(--st-label-3); font-variant-numeric: tabular-nums; padding: 0 2px; }
    .sl-mode { display: flex; }
    .sl-mode .st-segmented__item { flex: 1; }
    .sl-mode .st-segmented__item.is-on { background: var(--st-surface-raised); }
    .sl-num { display: grid; gap: 2px; }
    .sl-area { display: flex; align-items: baseline; gap: 6px; color: var(--st-label); font-variant-numeric: tabular-nums; }
    .sl-area b { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
    .sl-area span { font-size: 14px; color: var(--st-label-2); }
    .sl-bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
    .sl-bars li { display: grid; grid-template-columns: 44px 1fr 46px; gap: 8px; align-items: center; padding: 3px 6px; border-radius: var(--st-r-inner); cursor: pointer; font-variant-numeric: tabular-nums; }
    .sl-bars li:hover, .sl-bars li:focus-visible, .sl-bars li.is-cur { background: var(--st-fill-2); }
    .sl-bars li.is-off .sl-bt i { opacity: 0.35; }
    .sl-bl { font-size: 12px; color: var(--st-label-2); }
    .sl-bv { font-size: 12.5px; color: var(--st-label); text-align: right; }
    .sl-bt { display: flex; height: 12px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .sl-bt i { display: block; height: 100%; transition: width 320ms var(--st-ease); }
    .sl-hatch { background: repeating-linear-gradient(135deg, var(${CUT_COL}) 0 2px, transparent 2px 5px); }
    .sl-keys i.sl-hatch { width: 12px; height: 12px; }
    .sl-keys i.sl-frame { width: 12px; height: 10px; border: 1px dashed var(--st-label-3); border-radius: 0; background: none; }
    .sl-note { color: var(--st-label-2); }
    .sl-pick { margin-top: 8px; min-height: 1.6em; }
    .sl-after { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); margin-top: 16px; align-items: start; }
    @media (max-width: 900px) { .sl-after { grid-template-columns: 1fr; } .sl-map.mk-map--tall { height: 62vh; min-height: 360px; } }
    .sl-limits { font-size: 13px; color: var(--st-label-2); }
    .sl-limits b { color: var(--st-label); font-weight: 600; }
    .sl-link a { color: var(--st-label); text-decoration: underline; text-underline-offset: 2px; }
  `;
  document.head.append(style);

  L = await loadLeaflet();
  map = L.map('slMap', { attributionControl: true });
  darkBase(L, map);
  map.attributionControl.addAttribution('Copernicus WorldDEM-30 © DLR, Airbus (Copernicus · ESA)');
  frame = L.rectangle([[0, 0], [0, 0]], { color: css('--st-label-3') || '#999', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(map);
  const fit = () => { const s = site(); map.fitBounds([[s.bbox[1], s.bbox[0]], [s.bbox[3], s.bbox[2]]], { padding: [6, 6] }); };
  fit();
  map.on('click', (e) => { pick = e.latlng; $('#slPick').textContent = pickText(); });

  const body = $('#mkBody');
  $('#slLevel').addEventListener('input', (e) => { st.k = Number(e.target.value); draw(); });
  body.addEventListener('click', (e) => {
    const s = e.target.closest('#slSites [data-s]');
    if (s) { st.s = s.dataset.s; pick = null; fit(); draw(); return; }
    const m = e.target.closest('#slMode [data-m]');
    if (m) { st.m = m.dataset.m; draw(); return; }
    const b = e.target.closest('#slBars [data-k]');
    if (b) { st.k = Number(b.dataset.k); draw(); }
  });
  body.addEventListener('keydown', (e) => {
    const b = e.target.closest('#slBars [data-k]');
    if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.k = Number(b.dataset.k); draw().then(() => $(`#slBars [data-k="${st.k}"]`)?.focus()); }
  });
  shareButton($('#slShare'), () => location.href, () => `${site().name} · 해수면 ${st.k ? '+' + hTxt(st.k) : '지금'}${st.m === 'height' ? ' · 높이만 보기' : ''}`);
  await draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
