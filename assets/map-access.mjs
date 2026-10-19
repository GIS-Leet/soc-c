// 응급실까지 걸리는 시간 — 사람이 사는 곳(약 3km 격자)마다 가장 가까운 응급실까지 자동차 시간을 미리 재 두고,
// 「T분 안에 닿는 곳」(서비스 권역)과 시·군·구별 평균 시간을 지도로 본다(네트워크 분석).
// 자료: data/maps/access/access.json — scripts/build-map-access.py(건강보험심사평가원 2026.6 · WorldPop 2025 · OSRM/OpenStreetMap 도로).
import { $, $$, esc, fmt, tips, quantileClasses, SEQ, legendBar, params, setParams, shareButton, initPage } from './map-kit.mjs?v=affb9c7a';

const TIERS = [
  { id: 1, name: '응급실이 있는 병원', hint: '상급종합 · 종합병원 · 병원 · 보건의료원 가운데 응급실 병상이 있는 곳' },
  { id: 2, name: '종합병원 이상', hint: '상급종합병원 · 종합병원의 응급실' },
  { id: 3, name: '상급종합병원', hint: '중증 환자를 맡는 대형 병원(대학 병원 등)의 응급실' },
];
const st = { tier: 1, T: 30, view: 'unit', u: null };
let A, U;

/** 시·군·구별 — 인구 가중 평균 시간과 T분 넘는 인구 */
function summarize() {
  const k = 3 + st.tier;
  const agg = A.units.map(() => ({ pop: 0, sum: 0, over: 0, none: 0, far: 0, reach: 0 }));
  let pop = 0, over = 0, none = 0, far = 0;
  for (const c of A.cells) {
    const g = agg[c[3]], t = c[k], p = c[2];
    g.pop += p; pop += p;
    if (t < 0) { // c[7] = 1: 다리 없는 섬 · 0: 길에서 3km 넘게 떨어진 곳
      if (c[7]) { g.none += p; none += p; } else { g.far += p; far += p; }
      g.over += p; over += p; continue;
    }
    g.sum += t * p; g.reach += p;
    if (t > st.T) { g.over += p; over += p; }
  }
  U = A.units.map((u, i) => ({ ...u, i, pop: agg[i].pop, mean: agg[i].reach ? agg[i].sum / agg[i].reach : null, over: agg[i].over,
    share: agg[i].pop ? (agg[i].over / agg[i].pop) * 100 : null, none: agg[i].none, far: agg[i].far }));
  return { pop, over, none, far };
}
const man = (v) => fmt(v, 0, { man: true }) + '명';
const SHARE_BR = [5, 20, 40, 70]; // 넘는 사람 비율 단계(%)
const shareCls = (v) => (v == null ? null : SEQ[SHARE_BR.filter((b) => v >= b).length]);

function draw() {
  const { pop, over, none, far } = summarize();
  const k = 3 + st.tier;
  // ── 지도 ──
  let g = '';
  let legend = '';
  if (st.view === 'unit') {
    const C = quantileClasses(U.map((u) => u.mean));
    for (const u of U) {
      const col = u.mean == null ? '--kr-mid' : C.of(u.mean);
      g += `<path class="ac-u${st.u === u.key ? ' is-sel' : ''}" d="${u.d}" style="fill:var(${col})" data-k="${esc(u.key)}"
        data-tip="${esc(`${u.sido} ${u.name}|평균 ${u.mean == null ? '—' : fmt(u.mean, 0) + '분'} · ${st.T}분 넘게 ${fmt(u.share, 0)}%|인구 격자 ${man(u.pop)}`)}"/>`;
    }
    legend = `<p class="ac-legt">시·군·구 사람들이 가장 가까운 ${esc(TIERS[st.tier - 1].name)}까지 자동차로 걸리는 평균 시간(길로 닿는 사람만)</p>${legendBar(SEQ, fmt(C.min, 0) + '분', fmt(C.max, 0) + '분')}
      ${U.some((u) => u.mean == null) ? '<div class="mk-keys"><span><i style="background:var(--kr-mid)"></i>길로 닿는 곳이 없음(다리 없는 섬)</span></div>' : ''}`;
  } else {
    for (const u of U) g += `<path class="ac-u ac-u--bg${st.u === u.key ? ' is-sel' : ''}" d="${u.d}" data-k="${esc(u.key)}" data-tip="${esc(`${u.sido} ${u.name}|${st.T}분 넘게 ${fmt(u.share, 0)}% · ${man(u.over)}`)}"/>`;
    legend = `<div class="mk-keys"><span><i style="background:var(--kr-p1)"></i>${st.T}분 안에 닿음</span><span><i style="background:var(--kr-n2)"></i>${st.T}분 넘게 걸림</span><span><i style="background:var(--kr-mid)"></i>길로 닿지 않음(다리 없는 섬)</span></div>
      <p class="mk-note">칸 하나가 약 3km 격자 안에서 사람이 사는 곳입니다. 칸의 크기는 같고, 사람이 없는 곳은 비워 두었습니다.</p>`;
  }
  // 응급실 점 — 등급에 따라 모양
  let h = '';
  for (const [x, y, t, n, kind, beds] of A.hosp) {
    if (t < st.tier) continue;
    const tip = esc(`${n}|${kind} · 응급실 병상 ${beds}`);
    if (t === 3) h += `<path class="ac-h" d="M${x} ${y - 4.2}L${x + 4.2} ${y}L${x} ${y + 4.2}L${x - 4.2} ${y}Z" data-tip="${tip}"/>`;
    else if (t === 2) h += `<circle class="ac-h" cx="${x}" cy="${y}" r="2.6" data-tip="${tip}"/>`;
    else h += `<rect class="ac-h" x="${x - 1.4}" y="${y - 1.4}" width="2.8" height="2.8" data-tip="${tip}"/>`;
  }
  $('#acMap').innerHTML = `<div class="ac-svgwrap"><svg class="mk-svg" viewBox="0 0 ${A.w} ${A.h}" role="img" aria-label="시·군·구별 응급실까지 자동차 시간 지도">
      <g>${g}</g><g id="acCells"></g><g>${h}</g></svg></div>
    <div class="ac-leg">${legend}
      <div class="mk-keys ac-hkeys">${st.tier <= 3 ? '<span><svg viewBox="0 0 10 10" width="10" height="10"><path class="ac-h" d="M5 .5L9.5 5L5 9.5L.5 5Z"/></svg>상급종합병원</span>' : ''}
        ${st.tier <= 2 ? '<span><svg viewBox="0 0 10 10" width="10" height="10"><circle class="ac-h" cx="5" cy="5" r="3.4"/></svg>종합병원</span>' : ''}
        ${st.tier <= 1 ? '<span><svg viewBox="0 0 10 10" width="10" height="10"><rect class="ac-h" x="2.5" y="2.5" width="5" height="5"/></svg>병원 · 보건의료원</span>' : ''}</div></div>`;
  if (st.view === 'grid') {
    let cg = '';
    for (const c of A.cells) {
      const t = c[k];
      const col = t < 0 ? (c[7] ? '--kr-mid' : '--kr-n2') : t <= st.T ? '--kr-p1' : '--kr-n2';
      cg += `<rect x="${c[0] - 1.1}" y="${c[1] - 1.4}" width="2.2" height="2.8" style="fill:var(${col})"/>`;
    }
    $('#acCells').innerHTML = cg;
  }
  // ── 곁판 ──
  const nH = A.hosp.filter((x) => x[2] >= st.tier).length;
  $('#acTierN').textContent = `${fmt(nH)}곳`;
  $('#acTout').textContent = `${st.T}분`;
  $('#acT').value = st.T;
  $$('#acTier [data-t]').forEach((b) => { const on = Number(b.dataset.t) === st.tier; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $$('#acView [data-v]').forEach((b) => { const on = b.dataset.v === st.view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $('#acSum').innerHTML = `<p>인구 격자 ${man(pop)} 가운데 <b>${man(over)}(${fmt((over / pop) * 100, 1)}%)</b>은 가장 가까운 ${esc(TIERS[st.tier - 1].name)}까지 자동차로 <b>${st.T}분 넘게</b> 걸립니다.</p>
    ${none || far ? `<p class="mk-note">${none ? `이 가운데 ${man(none)}은 다리로 이어지지 않은 섬에 살고, 그 섬 안에는 이 응급실이 없습니다(배 · 헬기로 가야 함).` : ''}${far ? ` 찻길에서 3km 넘게 떨어진 칸 ${man(far)}도 「닿지 않음」으로 셌습니다.` : ''}</p>` : ''}`;
  const ranked = U.filter((u) => u.mean != null).sort((a, b) => b.mean - a.mean);
  const top = ranked.slice(0, 12);
  const maxM = top[0]?.mean || 1;
  $('#acRank').innerHTML = top.map((u, i) => `<li><button type="button" class="ac-r${st.u === u.key ? ' is-sel' : ''}" data-k="${esc(u.key)}" aria-pressed="${st.u === u.key}">
      <span class="ac-rk">${i + 1}</span><span class="ac-rn">${esc(u.sido)} ${esc(u.name)}</span>
      <span class="ac-rb"><i style="width:${(u.mean / maxM) * 100}%"></i></span><span class="ac-rv">${fmt(u.mean, 0)}분</span></button></li>`).join('');
  const sel = U.find((u) => u.key === st.u);
  $('#acSel').innerHTML = sel ? `<p><b>${esc(sel.sido)} ${esc(sel.name)}</b></p>
      <p>평균 ${sel.mean == null ? '— (길로 닿는 곳 없음)' : fmt(sel.mean, 0) + '분'} · ${st.T}분 넘게 걸리는 사람 ${man(sel.over)}(${fmt(sel.share, 0)}%)${sel.none ? ` · 그 가운데 다리 없는 섬 ${man(sel.none)}` : ''}${sel.far ? ` · 찻길에서 3km 넘게 떨어진 칸 ${man(sel.far)}` : ''}</p>`
    : '<p class="mk-note">지도의 시·군·구나 아래 목록을 누르면 그곳의 값이 여기 나옵니다.</p>';
  // 까닭 — 지금 값에서 계산
  const fast = ranked[ranked.length - 1], slow = ranked[0];
  const metro = U.filter((u) => ['서울', '부산', '대구', '인천', '광주', '대전', '울산'].includes(u.sido) && u.mean != null);
  const gun = U.filter((u) => /군$/.test(u.name) && u.mean != null);
  const avg = (list) => { const p = list.reduce((a, u) => a + (u.pop - u.none), 0); return list.reduce((a, u) => a + u.mean * (u.pop - u.none), 0) / (p || 1); };
  $('#acWhy').innerHTML = `<p>평균이 가장 짧은 곳은 ${esc(fast.sido)} ${esc(fast.name)}(${fmt(fast.mean, 0)}분), 가장 긴 곳은 ${esc(slow.sido)} ${esc(slow.name)}(${fmt(slow.mean, 0)}분)입니다.
      특별시 · 광역시의 구 · 군에 사는 사람은 평균 ${fmt(avg(metro), 0)}분, 이름이 「군」인 곳에 사는 사람은 평균 ${fmt(avg(gun), 0)}분이 걸립니다.</p>
    <p>큰 병원이 문을 열고 유지되려면 일정한 수 이상의 환자가 있어야 합니다(최소 요구치). 그래서 큰 병원은 사람이 많이 사는 도시에 모이고, 사람이 적은 곳일수록 응급실이 멀어집니다. 이 차이를 줄이려면 병원을 새로 세우거나 헬기 이송 · 원격 진료를 늘려야 하고, 그 비용을 누가 부담할지도 정해야 합니다.</p>`;
  setParams({ tier: st.tier !== 1 ? st.tier : null, T: st.T !== 30 ? st.T : null, view: st.view !== 'unit' ? st.view : null, u: st.u });
}

export async function main() {
  await initPage('access');
  A = await fetch('data/maps/access/access.json').then((r) => r.json());
  const q = params();
  if ([1, 2, 3].includes(Number(q.get('tier')))) st.tier = Number(q.get('tier'));
  const T = Number(q.get('T'));
  if (T >= 10 && T <= 120) st.T = Math.round(T / 5) * 5;
  if (q.get('view') === 'grid') st.view = 'grid';
  if (q.get('u') && A.units.some((u) => u.key === q.get('u'))) st.u = q.get('u');
  const nTier = (t) => A.hosp.filter((x) => x[2] >= t).length;

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--right">
      <figure class="mk-map mk-tiphost ac-mapbox" id="acMap"></figure>
      <aside class="mk-panel mk-tiphost" aria-label="조건 고르기">
        <h2>응급실 종류</h2>
        <div class="st-segmented ac-seg" id="acTier" role="tablist">${TIERS.map((t) => `<button type="button" class="st-segmented__item" role="tab" data-t="${t.id}" data-tip="${esc(`${t.name}|${t.hint} · ${nTier(t.id)}곳`)}">${esc(t.name)}</button>`).join('')}</div>
        <p class="mk-note">지금 고른 응급실 <b id="acTierN"></b> — 응급실 병상을 신고한 의료 기관(건강보험심사평가원, 2026년 6월)입니다.</p>
        <div class="mk-field">
          <label for="acT"><span>기준 시간</span><output id="acTout"></output></label>
          <input type="range" id="acT" min="10" max="120" step="5">
        </div>
        <div class="mk-why" id="acSum"></div>
        <div class="st-segmented ac-seg" id="acView" role="tablist" aria-label="지도 보기">
          <button type="button" class="st-segmented__item" role="tab" data-v="unit">시·군·구 평균</button>
          <button type="button" class="st-segmented__item" role="tab" data-v="grid">격자로 본 권역</button>
        </div>
        <div class="mk-why ac-sel" id="acSel" aria-live="polite"></div>
        <h2>가장 오래 걸리는 시·군·구 <small class="ac-sub">평균 시간 · 누르면 지도에 표시</small></h2>
        <ol class="ac-rank" id="acRank"></ol>
        <div class="mk-tools"><button type="button" class="share-btn" id="acShare">공유</button></div>
      </aside>
    </div>
    <div class="ac-below">
      <section class="mk-panel"><h2>지역 차이의 까닭</h2><div class="mk-why" id="acWhy"></div></section>
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>「격자로 본 권역」에서 시간을 10분부터 60분까지 늘려 보세요. 주황 칸은 어디에서 가장 늦게까지 남나요? 그곳의 지형(산지 · 섬)을 떠올려 보세요.</li>
          <li>「상급종합병원」을 고르면 평균 시간이 어떻게 바뀌나요? 큰 수술이 필요한 응급 환자에게는 가까운 응급실과 큰 병원 가운데 무엇이 더 중요할까요?</li>
          <li>사는 곳에 따라 응급실까지의 시간이 다른 것은 「불평등」일까요? 사람이 적은 곳에도 큰 병원을 세워야 할까요, 헬기 · 원격 진료처럼 다른 방법이 있을까요?</li>
        </ol>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 응급실: 건강보험심사평가원 「전국 병의원 및 약국 현황 2026.6」(공공데이터포털 · HIRA 보건의료빅데이터개방시스템, 공공누리 제1유형) — 응급실 병상이 1개 이상인 상급종합병원 · 종합병원 · 병원 · 보건의료원 ${fmt(A.hosp.length)}곳.
      인구: WorldPop Global2 R2025A 2025년 100m 격자(CC BY 4.0). 길과 시간: OSRM(OpenStreetMap 기여자, ODbL)으로 ${esc(A.made)}에 한 번 계산. 경계: 옛 통계청(현 국가데이터처) 2018 시·군·구(일반구는 시로 합침).</p>
    <p><b>계산 · 한계</b> 사람이 사는 100m 칸을 약 3km 묶음으로 모으고(시·군·구가 다르면 나눔), 묶음의 인구 가중 중심에서 곧은 거리로 가까운 응급실 몇 곳까지 자동차 시간을 구해 가장 짧은 값을 썼습니다.
      시간은 막힘 없는 도로의 자동차 시간이라, 출동 · 교통 체증 · 병원 사정은 들어 있지 않습니다. 섬에서 뭍으로 가는 길에 배를 타야 하면 「다리로 이어지지 않은 섬」으로 보고 그 섬 안의 응급실만 셌습니다(제주도 포함).
      출발점이 산속 임도 끝에 붙어 시간이 지나치게 길게 나온 칸이 몇 곳 있습니다(사람이 거의 없는 칸).
      응급실 목록은 법으로 지정된 권역 · 지역 응급의료센터 목록이 아니라 응급실 병상을 신고한 기관이고, 「상급종합 · 종합병원」은 응급 의료 등급이 아니라 병원 종류입니다. 시·군·구 경계는 2018년 것입니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .ac-mapbox { padding: 14px; display: grid; gap: 10px; }
    .ac-svgwrap { max-width: 640px; margin: 0 auto; width: 100%; }
    .ac-u { stroke: var(--st-surface); stroke-width: 0.5; cursor: pointer; }
    .ac-u--bg { fill: var(--st-fill-3); }
    .ac-u.is-sel { stroke: var(--st-label); stroke-width: 1.8; }
    .ac-h { fill: var(--st-label); stroke: var(--st-bedrock); stroke-width: 0.8; }
    #acCells { pointer-events: none; }
    .ac-leg { display: grid; gap: 8px; max-width: 640px; margin: 0 auto; width: 100%; }
    .ac-legt { font-size: 12px; color: var(--st-label-2); letter-spacing: var(--track-ko); }
    .ac-hkeys svg { flex-shrink: 0; }
    .ac-seg { display: flex; flex-wrap: wrap; }
    .ac-seg .st-segmented__item { flex: 1 1 auto; }
    .ac-sub { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .ac-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
    .ac-r { width: 100%; display: grid; grid-template-columns: 18px minmax(0, 116px) 1fr 40px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--st-r-inner);
      background: none; color: inherit; text-align: left; cursor: pointer; font-variant-numeric: tabular-nums; }
    .ac-r:hover, .ac-r.is-sel { background: var(--st-fill-2); }
    .ac-r:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -2px; }
    .ac-rk { font-size: 11.5px; color: var(--st-label-3); text-align: right; }
    .ac-rn { font-size: 12.5px; font-weight: 600; color: var(--st-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ac-rb { height: 10px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .ac-rb i { display: block; height: 100%; background: var(--kr-s4); border-radius: 0 4px 4px 0; transition: width 300ms var(--st-ease); }
    .ac-rv { font-size: 12px; color: var(--st-label); text-align: right; }
    .ac-below { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin-top: 16px; align-items: start; }
    @media (max-width: 900px) { .ac-below { grid-template-columns: 1fr; } }
  `;
  document.head.append(style);

  const body = $('#mkBody');
  tips(body);
  body.addEventListener('click', (e) => {
    const t = e.target.closest('#acTier [data-t]');
    if (t) { st.tier = Number(t.dataset.t); draw(); return; }
    const v = e.target.closest('#acView [data-v]');
    if (v) { st.view = v.dataset.v; draw(); return; }
    const u = e.target.closest('[data-k]');
    if (u) { st.u = st.u === u.dataset.k ? null : u.dataset.k; draw(); }
  });
  $('#acT').addEventListener('input', (e) => { st.T = Number(e.target.value); draw(); });
  shareButton($('#acShare'), () => location.href, () => `${TIERS[st.tier - 1].name}까지 ${st.T}분`);
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
