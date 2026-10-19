// 살기 좋은 곳의 기준과 시·도 순위 — 시·도 지표 여덟 개에 가중치를 주어 합친 점수로 지도를 칠한다(다기준 평가).
// 자료: data/stats/korea.json(국가데이터처 KOSIS). 지표마다 0~1로 맞춘 뒤(최솟값 0 · 최댓값 1) 가중 평균한다.
// 핵심은 「기준이 바뀌면 순위가 바뀐다」 — 같은 자료로도 무엇을 중요하게 보느냐에 따라 답이 달라진다.
import { $, $$, esc, fmt, tips, quantileClasses, SEQ, legendBar, params, setParams, shareButton, initPage } from './map-kit.mjs?v=6473793e';

// 기준 — dir: +1 클수록 좋음, -1 작을수록 좋음, 0 학생이 고름(density: 북적임/한적함)
const CRIT = [
  { id: 'doctor', label: '의료', hint: '인구 천 명당 의사', dir: 1 },
  { id: 'culture', label: '문화', hint: '인구 10만 명당 문화 기반 시설', dir: 1 },
  { id: 'income', label: '소득', hint: '1인당 개인 소득', dir: 1 },
  { id: 'fiscal', label: '지방 재정', hint: '재정 자립도', dir: 1 },
  { id: 'vacant', label: '빈집 비율', hint: '빈집 비율(낮을수록 좋음)', dir: -1 },
  { id: 'waste', label: '생활 폐기물', hint: '1인당 생활 폐기물(적을수록 좋음)', dir: -1 },
  { id: 'density', label: '인구 밀도', hint: '높은 쪽과 낮은 쪽 가운데 고름', dir: 0, log: true },
  { id: 'temp', label: '기온', hint: '연평균 기온', dir: 1 },
];
const PRESETS = [
  { id: 'equal', name: '모두 같게', w: { doctor: 1, culture: 1, income: 1, fiscal: 1, vacant: 1, waste: 1, density: 1, temp: 1 }, dense: 1 },
  { id: 'care', name: '의료 중시', w: { doctor: 3, culture: 0, income: 1, fiscal: 0, vacant: 1, waste: 0, density: 1, temp: 1 }, dense: 1 },
  { id: 'young', name: '문화 · 소득 중시', w: { doctor: 1, culture: 2, income: 3, fiscal: 2, vacant: 0, waste: 0, density: 2, temp: 0 }, dense: 1 },
  { id: 'quiet', name: '쾌적한 환경 중시', w: { doctor: 0, culture: 2, income: 0, fiscal: 0, vacant: 0, waste: 2, density: 3, temp: 2 }, dense: -1 },
];
const st = { w: { ...PRESETS[0].w }, dense: 1, u: null, preset: 'equal' };
let K;

function score(w = st.w, dense = st.dense) {
  const units = K.units;
  const norm = {};
  for (const c of CRIT) {
    const d = K.indicators.find((x) => x.id === c.id);
    const raw = units.map((u) => d.values[u.code]);
    const t = raw.map((v) => (v == null ? null : c.log ? Math.log10(v) : v));
    const lo = Math.min(...t.filter((v) => v != null)), hi = Math.max(...t.filter((v) => v != null));
    const dir = c.dir || dense;
    norm[c.id] = t.map((v) => (v == null ? null : dir > 0 ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)));
  }
  const sumW = CRIT.reduce((a, c) => a + (w[c.id] || 0), 0) || 1;
  return units.map((u, i) => {
    const parts = CRIT.map((c) => ({ id: c.id, v: norm[c.id][i], w: w[c.id] || 0 }));
    const s = parts.reduce((a, p) => a + (p.v ?? 0) * p.w, 0) / sumW;
    return { ...u, s: Math.round(s * 1000) / 10, parts };
  });
}
const rankOf = (list) => Object.fromEntries(list.slice().sort((a, b) => b.s - a.s).map((r, i) => [r.code, i + 1]));

function draw() {
  const list = score();
  const base = rankOf(score(PRESETS[0].w, 1));
  const rank = rankOf(list);
  const C = quantileClasses(list.map((r) => r.s));
  // 지도
  let g = '';
  for (const r of list) {
    const s = K.map.shapes[r.code];
    if (!s) continue;
    g += `<path class="lv-shape${st.u === r.code ? ' is-sel' : ''}" d="${s.d}" style="fill:var(${C.of(r.s)})" data-code="${r.code}" data-tip="${esc(`${r.name}|점수 ${fmt(r.s, 1)} · ${rank[r.code]}위`)}"/>`;
  }
  const NUDGE = { 31: [8, 30], 23: [-8, 4], 11: [2, -2] };
  for (const r of list) {
    const s = K.map.shapes[r.code];
    const [ox, oy] = NUDGE[r.code] || [0, 0];
    g += `<text class="lv-lab" x="${s.cx + ox}" y="${s.cy + oy}" text-anchor="middle">${esc(r.short)}</text>`;
  }
  $('#lvMap').innerHTML = `<svg class="mk-svg" viewBox="0 0 ${K.map.w} ${K.map.h}" role="img" aria-label="살기 좋은 정도 점수 지도">${g}</svg>${legendBar(SEQ, fmt(C.min, 1) + '점', fmt(C.max, 1) + '점')}`;
  // 순위 — 기본(모두 같게)과 비교한 오르내림
  const sorted = list.slice().sort((a, b) => b.s - a.s);
  $('#lvRank').innerHTML = sorted.map((r) => {
    const d = base[r.code] - rank[r.code];
    const move = d > 0 ? `<em class="up">▲${d}</em>` : d < 0 ? `<em class="down">▼${-d}</em>` : '<em>–</em>';
    const top = r.parts.filter((p) => p.w > 0).sort((a, b) => b.v * b.w - a.v * a.w).slice(0, 2).map((p) => CRIT.find((c) => c.id === p.id).label).join(' · ');
    return `<li class="${st.u === r.code ? 'is-sel' : ''}" data-code="${r.code}" data-tip="${esc(`${r.name}|점수 ${fmt(r.s, 1)}|점수를 끌어올린 기준: ${top || '—'}`)}">
      <span class="lv-r">${rank[r.code]}</span><span class="lv-n">${esc(r.short)}</span>
      <span class="lv-bar"><i style="width:${r.s}%;background:var(${C.of(r.s)})"></i></span><span class="lv-s">${fmt(r.s, 1)}</span>${move}</li>`;
  }).join('');
  // 조작판 값
  for (const c of CRIT) {
    const inp = $(`#w-${c.id}`);
    if (inp) { inp.value = st.w[c.id]; $(`#o-${c.id}`).textContent = st.w[c.id]; }
  }
  $$('#lvPresets .opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === st.preset)));
  $$('#lvDense .st-segmented__item').forEach((b) => { const on = Number(b.dataset.v) === st.dense; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  const top3 = sorted.slice(0, 3).map((r) => r.short).join(' · ');
  const bot = sorted[sorted.length - 1].short;
  const moved = sorted.filter((r) => Math.abs(base[r.code] - rank[r.code]) >= 3).length;
  $('#lvSay').innerHTML = `<p>지금 기준으로는 <b>${esc(top3)}</b>이 위, <b>${esc(bot)}</b>이 맨 아래입니다.</p>
    <p>${st.preset === 'equal' && st.dense === 1 ? '기준의 무게를 바꾸면 같은 자료로 순위를 다시 계산합니다.' : `모두 같게 놓았을 때보다 세 계단 넘게 움직인 곳이 <b>${moved}곳</b>입니다.`}</p>`;
  setParams({ p: st.preset !== 'custom' ? st.preset : null, w: st.preset === 'custom' ? CRIT.map((c) => st.w[c.id]).join('') : null, d: st.dense === -1 ? 'quiet' : null, u: st.u });
}

export async function main() {
  await initPage('livability');
  K = await fetch('data/stats/korea.json').then((r) => r.json());
  const q = params();
  const p = PRESETS.find((x) => x.id === q.get('p'));
  if (p) { st.w = { ...p.w }; st.dense = p.dense; st.preset = p.id; }
  if (/^[0-3]{8}$/.test(q.get('w') || '')) { CRIT.forEach((c, i) => (st.w[c.id] = Number(q.get('w')[i]))); st.preset = 'custom'; }
  if (q.get('d') === 'quiet') st.dense = -1;
  if (q.get('u')) st.u = q.get('u');
  const ind = (id) => K.indicators.find((x) => x.id === id);
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--right">
      <div class="lv-main">
        <figure class="mk-map mk-tiphost lv-mapbox" id="lvMap"></figure>
        <section class="mk-panel lv-rankbox mk-tiphost"><h2>순위 <small>괄호 안 화살표는 「모두 같게」와 견준 오르내림</small></h2><ol class="lv-rank" id="lvRank"></ol></section>
      </div>
      <aside class="mk-panel" aria-label="기준 고르기">
        <h2>기준과 무게</h2>
        <div class="mk-tools" id="lvPresets">${PRESETS.map((x) => `<button type="button" class="opt" data-p="${x.id}">${esc(x.name)}</button>`).join('')}</div>
        ${CRIT.map((c) => `<div class="mk-field">
          <label for="w-${c.id}"><span>${esc(c.label)} <small class="lv-hint">${esc(c.hint)} · ${esc(ind(c.id).year)}</small></span><output id="o-${c.id}"></output></label>
          ${c.dir === 0 ? `<div class="st-segmented lv-dense" id="lvDense"><button type="button" class="st-segmented__item" data-v="1">높을수록 좋음</button><button type="button" class="st-segmented__item" data-v="-1">낮을수록 좋음</button></div>` : ''}
          <input type="range" id="w-${c.id}" min="0" max="3" step="1" data-c="${c.id}" aria-describedby="lvHelp"></div>`).join('')}
        <p class="mk-note" id="lvHelp">0이면 그 기준을 보지 않고, 3이면 가장 무겁게 봅니다.</p>
        <div class="mk-why" id="lvSay"></div>
        <div class="mk-tools"><button type="button" class="share-btn" id="lvShare">공유</button></div>
      </aside>
    </div>
    <section class="mk-panel lv-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>「모두 같게」에서 1위인 곳은 어떤 기준 덕분일까요? 순위 줄에 마우스를 올려 보세요.</li>
        <li>「의료 중시」와 「쾌적한 환경 중시」를 번갈아 눌러 보세요. 서울과 제주 · 강원의 자리가 어떻게 바뀌나요?</li>
        <li>점수에 들어가지 않은 것(일자리의 종류, 집값, 가족과 친구, 학교)은 무엇일까요? 행복의 기준이 사람마다 다르다는 것은 지도에서 어떻게 드러나나요?</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 국가데이터처(옛 통계청) 국가통계포털(KOSIS) — ${CRIT.map((c) => `${ind(c.id).name} ${ind(c.id).year}`).join(' · ')}. 자세한 값은 <a href="stats.html?scope=kr">통계로 보는 세계 · 우리나라 시·도</a>.</p>
    <p><b>계산</b> 기준마다 17개 시·도 가운데 가장 나은 곳을 1, 가장 못한 곳을 0으로 맞춘 뒤(인구 밀도는 로그 눈금), 고른 무게로 평균해 100점으로 바꿨습니다. 지표마다 해가 다르고, 점수는 상대적인 위치일 뿐 실제 삶의 만족을 잰 값이 아닙니다.</p>`;
  const style = document.createElement('style');
  style.textContent = `
    .lv-main { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 1100px) { .lv-main { grid-template-columns: 1fr; } }
    .lv-mapbox { padding: 14px; }
    .lv-shape { stroke: var(--st-surface); stroke-width: 1.2; cursor: pointer; }
    .lv-shape.is-sel { stroke: var(--st-label); stroke-width: 2.4; }
    .lv-lab { fill: var(--st-label); stroke: var(--st-bedrock); stroke-width: 3; paint-order: stroke; font-size: 12px; font-weight: 600; pointer-events: none; }
    .lv-rankbox h2 small { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: var(--st-label-3); }
    .lv-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .lv-rank li { display: grid; grid-template-columns: 22px 44px 1fr 44px 34px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--st-r-inner); cursor: pointer; font-variant-numeric: tabular-nums; }
    .lv-rank li:hover, .lv-rank li.is-sel { background: var(--st-fill-2); }
    .lv-r { font-size: 12px; color: var(--st-label-3); text-align: right; }
    .lv-n { font-size: 13px; font-weight: 600; color: var(--st-label); }
    .lv-bar { height: 12px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .lv-bar i { display: block; height: 100%; border-radius: 0 4px 4px 0; transition: width 380ms var(--st-ease); }
    .lv-s { font-size: 12.5px; color: var(--st-label); text-align: right; }
    .lv-rank em { font-style: normal; font-size: 11px; color: var(--st-label-4); text-align: right; }
    .lv-rank em.up { color: var(--st-label); } .lv-rank em.down { color: var(--st-label-3); }
    .lv-hint { font-size: 11px; color: var(--st-label-3); font-weight: 400; }
    .lv-dense { margin-bottom: 4px; }
    .lv-think { margin-top: 16px; }
  `;
  document.head.append(style);
  // 이벤트
  const body = $('#mkBody');
  tips(body);
  body.addEventListener('input', (e) => {
    const c = e.target.dataset.c;
    if (!c) return;
    st.w[c] = Number(e.target.value);
    st.preset = PRESETS.find((p) => CRIT.every((k) => p.w[k.id] === st.w[k.id]) && p.dense === st.dense)?.id || 'custom';
    draw();
  });
  body.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    if (p) { const x = PRESETS.find((y) => y.id === p.dataset.p); st.w = { ...x.w }; st.dense = x.dense; st.preset = x.id; draw(); return; }
    const d = e.target.closest('#lvDense [data-v]');
    if (d) { st.dense = Number(d.dataset.v); st.preset = PRESETS.find((y) => CRIT.every((k) => y.w[k.id] === st.w[k.id]) && y.dense === st.dense)?.id || 'custom'; draw(); return; }
    const u = e.target.closest('[data-code]');
    if (u) { st.u = st.u === u.dataset.code ? null : u.dataset.code; draw(); }
  });
  shareButton($('#lvShare'), () => location.href, () => `기준: ${st.preset === 'custom' ? '직접 고른 무게' : PRESETS.find((x) => x.id === st.preset).name}`);
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
