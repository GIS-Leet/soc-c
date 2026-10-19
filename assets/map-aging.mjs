// 시·군·구별 고령화와 인구 감소 — 시·군·구의 고령 인구 비율과 인구 증가율을 따로, 또 겹쳐서 본다(단계 구분도 · 이변량 중첩).
// 자료: data/maps/aging/aging.json (scripts/build-map-aging.mjs, 국가데이터처 KOSIS). 「겹쳐 보기」는 학생이 정한 두 기준으로
// 시·군·구를 네 무리로 나눈다: 고령 · 감소 / 고령 · 증가 / 젊음 · 감소 / 젊음 · 증가.
import { $, $$, esc, fmt, tips, quantileClasses, divergingClasses, SEQ, DIV, legendBar, params, setParams, shareButton, initPage } from './map-kit.mjs?v=affb9c7a';

const VIEWS = { aged: '고령 인구 비율', growth: '인구 증가율', both: '겹쳐 보기' };
// 네 무리 — 색은 기준이 있는 값의 색(주황 = 늙고 줄어드는 쪽, 파랑 = 젊고 느는 쪽), 진하기는 두 기준을 모두 넘었는지
const GROUPS = [
  { id: 'ad', name: '고령 · 감소', color: '--kr-n2', mark: '●' },
  { id: 'ag', name: '고령 · 증가', color: '--kr-n1', mark: '▲' },
  { id: 'yd', name: '젊음 · 감소', color: '--kr-p1', mark: '■' },
  { id: 'yg', name: '젊음 · 증가', color: '--kr-p2', mark: '◆' },
];
const st = { v: 'both', at: 30, gt: 0, sel: null };
let D;
const label = (f) => (f.sido === '세종' ? '세종' : `${f.sido} ${f.name}`);
const groupOf = (f) => (f.aged == null || f.growth == null ? null : `${f.aged >= st.at ? 'a' : 'y'}${f.growth < st.gt ? 'd' : 'g'}`);

function mapSvg() {
  const fs = D.features;
  let fill;
  let legend = '';
  if (st.v === 'aged') {
    const C = quantileClasses(fs.map((f) => f.aged));
    fill = (f) => C.of(f.aged);
    legend = legendBar(SEQ, `${fmt(C.min, 1)}%`, `${fmt(C.max, 1)}%`);
  } else if (st.v === 'growth') {
    const C = divergingClasses(fs.map((f) => f.growth), 0);
    fill = (f) => C.of(f.growth);
    legend = legendBar(DIV, `−${fmt(C.span, 1)}%`, `+${fmt(C.span, 1)}%`, '0%');
  } else {
    fill = (f) => GROUPS.find((g) => g.id === groupOf(f))?.color;
    legend = `<div class="mk-keys">${GROUPS.map((g) => `<span><i style="background:var(${g.color})"></i>${esc(g.name)} <b class="ag-n">${fs.filter((f) => groupOf(f) === g.id).length}</b></span>`).join('')}</div>`;
  }
  let g = '';
  for (const f of fs) {
    const c = fill(f);
    const tip = `${label(f)}|고령 인구 비율 ${fmt(f.aged, 1)}% (${D.meta.aged.when})|인구 증가율 ${f.growth == null ? '—' : (f.growth > 0 ? '+' : '') + fmt(f.growth, 2) + '%'} (${D.meta.growth.when})`;
    g += `<path class="ag-shape${st.sel === f.key ? ' is-sel' : ''}" d="${f.d}" style="fill:${c ? `var(${c})` : 'var(--st-fill-2)'}" data-key="${esc(f.key)}" data-tip="${esc(tip)}"/>`;
  }
  return `<svg class="mk-svg ag-map" viewBox="0 0 ${D.w} ${D.h}" role="img" aria-label="시·군·구 ${esc(VIEWS[st.v])} 지도">${g}</svg>${legend}`;
}

// 흩어짐 그림 — 가로 고령 비율, 세로 인구 증가율. 기준선 두 개가 네 무리를 가른다
function scatter() {
  const W = 520, H = 340, l = 46, r = 14, t = 14, b = 36;
  const fs = D.features.filter((f) => f.aged != null && f.growth != null);
  const xs = fs.map((f) => f.aged), ys = fs.map((f) => f.growth);
  const x0 = Math.floor(Math.min(...xs) / 5) * 5, x1 = Math.ceil(Math.max(...xs) / 5) * 5;
  const yAbs = Math.ceil(Math.max(...ys.map(Math.abs)));
  const X = (v) => l + ((v - x0) / (x1 - x0)) * (W - l - r);
  const Y = (v) => t + ((yAbs - v) / (2 * yAbs)) * (H - t - b);
  let g = '';
  for (let v = x0; v <= x1; v += 10) g += `<line class="cg-grid" x1="${X(v)}" x2="${X(v)}" y1="${t}" y2="${H - b}"/><text class="cg-tick" x="${X(v)}" y="${H - b + 16}" text-anchor="middle">${v}%</text>`;
  const step = yAbs > 6 ? 4 : 2;
  for (let v = -Math.floor(yAbs / step) * step; v <= yAbs; v += step) g += `<line class="cg-grid${v === 0 ? ' cg-zero' : ''}" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="cg-tick" x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>`;
  g += `<line class="ag-th" x1="${X(st.at)}" x2="${X(st.at)}" y1="${t}" y2="${H - b}"/><line class="ag-th" x1="${l}" x2="${W - r}" y1="${Y(st.gt)}" y2="${Y(st.gt)}"/>`;
  g += `<text class="cg-unit" x="${W - r}" y="${H - 4}" text-anchor="end">고령 인구 비율 →</text><text class="cg-unit" x="${l}" y="${t - 2}">↑ 인구 증가율(%)</text>`;
  for (const f of fs) {
    const grp = GROUPS.find((x) => x.id === groupOf(f));
    g += `<circle class="ag-dot${st.sel === f.key ? ' is-sel' : ''}" cx="${X(f.aged).toFixed(1)}" cy="${Y(f.growth).toFixed(1)}" r="${st.sel === f.key ? 6 : 3.6}" style="fill:var(${grp.color})" data-key="${esc(f.key)}" data-tip="${esc(`${label(f)}|고령 ${fmt(f.aged, 1)}% · 증가율 ${(f.growth > 0 ? '+' : '') + fmt(f.growth, 2)}%`)}"/>`;
  }
  return `<svg class="mk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="고령 인구 비율과 인구 증가율의 흩어짐 그림">${g}</svg>`;
}

function lists() {
  const fs = D.features.filter((f) => f.aged != null);
  const top = fs.slice().sort((a, b) => b.aged - a.aged).slice(0, 8);
  const yng = fs.slice().sort((a, b) => a.aged - b.aged).slice(0, 8);
  const row = (f) => `<li data-key="${esc(f.key)}" class="${st.sel === f.key ? 'is-sel' : ''}"><span>${esc(label(f))}</span><b>${fmt(f.aged, 1)}%</b></li>`;
  return `<div class="ag-lists"><div><h3>고령 인구 비율이 높은 곳</h3><ol>${top.map(row).join('')}</ol></div><div><h3>낮은 곳</h3><ol>${yng.map(row).join('')}</ol></div></div>`;
}

function say() {
  const fs = D.features.filter((f) => f.aged != null);
  const n = fs.length;
  const super20 = fs.filter((f) => f.aged >= 20).length;
  const over40 = fs.filter((f) => f.aged >= 40).length;
  const dec = D.features.filter((f) => f.growth != null && f.growth < 0).length;
  const ad = D.features.filter((f) => groupOf(f) === 'ad').length;
  return `<p>시·군·구 ${n}곳 가운데 <b>${super20}곳</b>이 65세 이상이 20%를 넘는 초고령 지역이고, <b>${over40}곳</b>은 40%를 넘습니다(${esc(D.meta.aged.when)}).</p>
    <p>2025년 한 해 동안 인구가 줄어든 곳은 <b>${dec}곳</b>입니다. 지금 기준(고령 ${st.at}% 이상 · 증가율 ${st.gt}% 미만)으로 「고령 · 감소」에 드는 곳은 <b>${ad}곳</b>입니다.</p>`;
}

function draw() {
  $('#agMap').innerHTML = mapSvg();
  $('#agScatter').innerHTML = scatter();
  $('#agLists').innerHTML = lists();
  $('#agSay').innerHTML = say();
  $$('#agView .st-segmented__item').forEach((b) => { const on = b.dataset.v === st.v; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $('#agTh').hidden = st.v !== 'both';
  $('#oAt').textContent = `${st.at}%`;
  $('#oGt').textContent = `${st.gt > 0 ? '+' : ''}${st.gt}%`;
  const f = D.features.find((x) => x.key === st.sel);
  $('#agPick').innerHTML = f
    ? `<b>${esc(label(f))}</b> — 고령 인구 비율 ${fmt(f.aged, 1)}%, 인구 ${fmt(f.pop, 0, { man: true })}명, 2025년 인구 증가율 ${f.growth == null ? '—' : (f.growth > 0 ? '+' : '') + fmt(f.growth, 2) + '%'}`
    : '지도나 그림의 한 곳을 누르면 여기에 그 곳의 값이 나옵니다.';
  setParams({ v: st.v !== 'both' ? st.v : null, at: st.at !== 30 ? st.at : null, gt: st.gt !== 0 ? st.gt : null, s: st.sel });
}

async function main() {
  await initPage('aging');
  D = await fetch('data/maps/aging/aging.json').then((r) => r.json());
  const q = params();
  if (VIEWS[q.get('v')]) st.v = q.get('v');
  if (q.get('at')) st.at = Number(q.get('at'));
  if (q.get('gt')) st.gt = Number(q.get('gt'));
  if (q.get('s')) st.sel = q.get('s');
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left">
      <aside class="mk-panel" aria-label="보기와 기준">
        <div class="st-segmented" id="agView" role="tablist" aria-label="보기">${Object.entries(VIEWS).map(([k, v]) => `<button type="button" class="st-segmented__item" data-v="${k}" role="tab">${v}</button>`).join('')}</div>
        <div id="agTh" class="ag-th-box">
          <div class="mk-field"><label for="at"><span>「고령」으로 볼 기준 — 65세 이상 비율</span><output id="oAt"></output></label><input type="range" id="at" min="15" max="45" step="1"></div>
          <div class="mk-field"><label for="gt"><span>「감소」로 볼 기준 — 한 해 인구 증가율</span><output id="oGt"></output></label><input type="range" id="gt" min="-3" max="2" step="0.5"></div>
        </div>
        <div class="mk-why" id="agSay"></div>
        <p class="mk-note" id="agPick"></p>
        <div class="mk-tools"><button type="button" class="share-btn" id="agShare">공유</button></div>
      </aside>
      <div class="ag-right">
        <figure class="mk-map mk-tiphost ag-mapbox" id="agMap"></figure>
        <div class="ag-under">
          <figure class="mk-panel mk-tiphost ag-scat"><h2>고령 인구 비율과 인구 증가율</h2><div id="agScatter"></div><p class="mk-note">점 하나가 시·군·구 하나입니다. 세로선과 가로선이 지금 고른 두 기준입니다.</p></figure>
          <div class="mk-panel" id="agLists"></div>
        </div>
      </div>
    </div>
    <section class="mk-panel ag-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>고령 인구 비율이 높은 곳은 지도에서 어디에 모여 있나요? 산지 · 해안 · 대도시와 견주어 보세요.</li>
        <li>젊은 사람들이 떠나면 남은 인구는 어떻게 바뀌고, 태어나는 아이 수는 어떻게 될까요? 고령화와 인구 감소가 서로를 부추기는 고리를 그려 보세요.</li>
        <li>「고령 · 증가」에 드는 곳도 있습니다. 나이 든 사람이 많은데도 인구가 늘어난 까닭은 무엇일까요? 그 곳의 산업 단지 · 신도시 · 귀농 귀촌 같은 변화를 찾아보세요.</li>
        <li>대도시 안에서도 원도심(예: 부산 중구 · 영도구)과 새로 개발된 곳의 차이를 찾아보세요.</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 국가데이터처(옛 통계청) 국가통계포털(KOSIS) — 고령 인구 비율 ${esc(D.meta.aged.when)}(${esc(D.meta.aged.src)}), 인구 증가율 ${esc(D.meta.growth.when)}(${esc(D.meta.growth.src)}). 통계표 화면의 시·군·구 값을 옮겼습니다(${esc(D.meta.built)}).</p>
    <p><b>지도</b> ${esc(D.meta.map)} 고령 비율은 2026년 7월의 광주 · 전남 통합과 인천 행정 체제 개편 바로 전인 6월 값을 써서 지도 경계와 맞췄습니다.</p>
    <p><b>읽을 때</b> 두 값은 시점이 다르고(2026년 6월 · 2025년), 인구 증가율은 외국인을 포함한 총인구 기준입니다. 한 해의 증감은 아파트 입주 같은 일로 크게 출렁일 수 있습니다.</p>`;
  const style = document.createElement('style');
  style.textContent = `
    .ag-right { display: grid; gap: 16px; min-width: 0; }
    .ag-mapbox { padding: 14px; }
    .ag-mapbox .mk-keys, .ag-mapbox .mk-legend { margin-top: 10px; }
    .ag-n { font-weight: 700; color: var(--st-label); font-variant-numeric: tabular-nums; }
    .ag-shape { stroke: var(--st-surface); stroke-width: 0.5; cursor: pointer; }
    .ag-shape.is-sel { stroke: var(--st-label); stroke-width: 2; }
    .ag-under { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1000px) { .ag-under { grid-template-columns: 1fr; } }
    .ag-scat { margin: 0; }
    .ag-dot { stroke: var(--st-surface); stroke-width: 1; cursor: pointer; }
    .ag-dot.is-sel { stroke: var(--st-label); stroke-width: 2; }
    .ag-th { stroke: var(--st-label-2); stroke-width: 1.2; stroke-dasharray: 4 3; }
    .ag-th-box { display: grid; gap: 12px; }
    .ag-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .ag-lists h3 { font-size: 12.5px; font-weight: 700; color: var(--st-label); margin-bottom: 6px; }
    .ag-lists ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
    .ag-lists li { display: flex; justify-content: space-between; gap: 6px; padding: 4px 6px; border-radius: var(--st-r-inner); font-size: 12.5px; color: var(--st-label-2); cursor: pointer; }
    .ag-lists li:hover, .ag-lists li.is-sel { background: var(--st-fill-2); color: var(--st-label); }
    .ag-lists b { font-weight: 600; color: var(--st-label); font-variant-numeric: tabular-nums; }
    .ag-think { margin-top: 16px; }
  `;
  document.head.append(style);
  const body = $('#mkBody');
  tips(body);
  $('#at').value = st.at;
  $('#gt').value = st.gt;
  body.addEventListener('input', (e) => {
    if (e.target.id === 'at') st.at = Number(e.target.value);
    if (e.target.id === 'gt') st.gt = Number(e.target.value);
    draw();
  });
  body.addEventListener('click', (e) => {
    const v = e.target.closest('#agView [data-v]');
    if (v) { st.v = v.dataset.v; draw(); return; }
    const k = e.target.closest('[data-key]');
    if (k) { st.sel = st.sel === k.dataset.key ? null : k.dataset.key; draw(); }
  });
  shareButton($('#agShare'), () => location.href, () => `${VIEWS[st.v]}${st.v === 'both' ? ` · 고령 ${st.at}% · 증가율 ${st.gt}%` : ''}`);
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
