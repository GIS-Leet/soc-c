// 도시 · 인구 변화 실험 — 「미래 인구 실험」. 합계 출산율 · 기대 수명 · 순이동을 정하면 2023년 인구에서 2073년까지 한 해씩 계산한다.
// 계산: assets/dashboard-cohort.mjs(코호트 요인법). 자료: data/dashboard/pop.json(유엔 WPP 2024, scripts/build-dashboard-pop.py).
// 견주는 선: 같은 WPP 2024의 중위 추계(점선)와 1960~2022 추정 인구(흐린 선).
import { $, $$, esc, fmt, tips, params, setParams, shareButton } from './map-kit.mjs?v=affb9c7a';
import { project, lifeTable, fiveYear } from './dashboard-cohort.mjs?v=df93c970';

const SERIES = [
  { i: 0, name: '총인구', col: '--s1' },
  { i: 2, name: '15~64세', col: '--s3' },
  { i: 3, name: '65세 이상', col: '--s2' },
  { i: 1, name: '0~14세', col: '--s4' },
];
let D, root, run, e0Base;
const st = { tfr: 0, e0: 0, mig: 0, y: 2050 };
const man = (v) => fmt(v / 10, Math.abs(v) >= 1000 ? 0 : 1); // 천 명 → 만 명
const share = (g, i) => (g[i] / g[0]) * 100;
/** 그림 너비 = 담는 칸의 너비(작은 화면에서 글자가 작아지지 않게) */
const fit = (sel, lo, hi) => Math.max(lo, Math.min(hi, Math.round($(sel)?.clientWidth || hi)));

function presets() {
  return [
    { id: 'base', name: '2023년 그대로', v: { tfr: D.tfr, e0: e0Base, mig: Math.round(D.netmig) } },
    { id: 'tfr13', name: '합계 출산율 1.3명', v: { tfr: 1.3, e0: e0Base, mig: Math.round(D.netmig) } },
    { id: 'tfr21', name: '합계 출산율 2.1명', v: { tfr: 2.1, e0: e0Base, mig: Math.round(D.netmig) } },
    { id: 'mig0', name: '순이동 0명', v: { tfr: D.tfr, e0: e0Base, mig: 0 } },
  ];
}

function lineChart() {
  const W = fit('#ppLine', 340, 760), H = W < 520 ? 300 : 350, l = 54, r = 82, t = 28, b = 30;
  const x0 = D.past[0].y, x1 = D.end_year;
  const all = [...D.past.map((p) => p.g[0]), ...D.wpp.map((p) => p.g[0]), ...run.map((p) => p.g[0])];
  const max = Math.ceil(Math.max(...all) / 10000) * 10000;
  const X = (y) => l + ((y - x0) / (x1 - x0)) * (W - l - r);
  const Y = (v) => t + (H - t - b) * (1 - v / max);
  let g = '';
  for (let v = 0; v <= max; v += 10000) g += `<line class="cg-grid${v === 0 ? ' cg-zero' : ''}" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="cg-tick" x="${l - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v / 10)}</text>`;
  for (let y = 1960; y <= x1; y += W < 520 ? 20 : 10) g += `<text class="cg-tick" x="${X(y)}" y="${H - 9}" text-anchor="middle">${y}</text>`;
  g += `<text class="cg-unit" x="${l - 8}" y="${t - 16}" text-anchor="end">만 명</text>`;
  g += `<rect class="pp-future" x="${X(D.base_year)}" y="${t}" width="${X(x1) - X(D.base_year)}" height="${H - t - b}"/>`;
  g += `<line class="pp-now" x1="${X(D.base_year)}" x2="${X(D.base_year)}" y1="${t}" y2="${H - b}"/><text class="cg-flag" x="${X(D.base_year) - 6}" y="${t + 12}" text-anchor="end">${D.base_year} 추정</text>`;
  g += `<line class="pp-sel" x1="${X(st.y)}" x2="${X(st.y)}" y1="${t}" y2="${H - b}"/>`;
  const path = (rows, i) => rows.map((p, k) => `${k ? 'L' : 'M'}${X(p.y).toFixed(1)},${Y(p.g[i]).toFixed(1)}`).join('');
  const past = [...D.past, { y: D.base_year, g: run[0].g }];
  const ends = [];
  for (const s of SERIES) {
    g += `<path class="pp-past" style="stroke:var(${s.col})" d="${path(past, s.i)}"/>`;
    g += `<path class="pp-wpp" style="stroke:var(${s.col})" d="${path(D.wpp, s.i)}"/>`;
    g += `<path class="pp-run" style="stroke:var(${s.col})" d="${path(run, s.i)}"/>`;
    ends.push({ s, y: Y(run.at(-1).g[s.i]) });
  }
  // 끝 이름 — 겹치면 아래로 민다
  ends.sort((a, c) => a.y - c.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  for (const e of ends) g += `<text class="pp-end" x="${X(x1) + 6}" y="${e.y + 4}">${e.s.name}</text>`;
  // 선택한 해의 점
  const sel = run.find((p) => p.y === st.y);
  for (const s of SERIES) g += `<circle class="pp-dot" cx="${X(st.y)}" cy="${Y(sel.g[s.i])}" r="4.5" style="fill:var(${s.col})"/>`;
  // 해마다 가리키는 칸
  const rows = [...D.past.map((p) => ({ y: p.y, g: p.g, kind: 'past' })), ...run.map((p, k) => ({ y: p.y, g: p.g, w: D.wpp[k]?.g, kind: k ? 'run' : 'base' }))];
  const bw = (W - l - r) / (x1 - x0);
  for (const p of rows) {
    const lines = [p.kind === 'past' ? `${p.y}년 (추정)` : p.kind === 'base' ? `${p.y}년 (계산의 시작)` : `${p.y}년 — 이 실험`];
    for (const s of SERIES) lines.push(`${s.name} ${man(p.g[s.i])}만 명${p.kind === 'run' && p.w ? ` (유엔 중위 ${man(p.w[s.i])}만)` : ''}`);
    g += `<rect class="cg-hit pp-hit" x="${X(p.y) - bw / 2}" y="${t}" width="${bw}" height="${H - t - b}" data-y="${p.y}" data-tip="${esc(lines.join('|'))}"/>`;
  }
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="나이 무리별 인구 1960~${x1}">${g}</svg>`;
}

function pyramid() {
  const a = run[0], z = run.find((p) => p.y === st.y);
  const g5 = (p, s) => fiveYear(p.pop[s]);
  const A = { m: g5(a, 'm'), f: g5(a, 'f') }, Z = { m: g5(z, 'm'), f: g5(z, 'f') };
  const max = Math.ceil(Math.max(...A.m, ...A.f, ...Z.m, ...Z.f) / 500) * 500;
  const W = fit('#ppPyr', 320, 520), rowH = 15, t = 8, b = 28, mid = 30, H = t + b + 21 * rowH;
  const half = (W - mid * 2) / 2;
  const XL = (v) => W / 2 - mid - (v / max) * (half - 10), XR = (v) => W / 2 + mid + (v / max) * (half - 10);
  let g = '';
  for (let v = 0; v <= max; v += max / 2) {
    g += `<line class="cg-grid" x1="${XL(v)}" x2="${XL(v)}" y1="${t}" y2="${H - b}"/><line class="cg-grid" x1="${XR(v)}" x2="${XR(v)}" y1="${t}" y2="${H - b}"/>`;
    g += `<text class="cg-tick" x="${XL(v)}" y="${H - 10}" text-anchor="middle">${fmt(v / 10)}</text><text class="cg-tick" x="${XR(v)}" y="${H - 10}" text-anchor="middle">${fmt(v / 10)}</text>`;
  }
  for (let k = 0; k < 21; k++) {
    const y = t + (20 - k) * rowH;
    const age = k === 20 ? '100+' : `${k * 5}~${k * 5 + 4}`;
    if (k % 2 === 0) g += `<text class="cg-tick" x="${W / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle">${k === 20 ? '100+' : k * 5}</text>`;
    const tip = `${age}세|${st.y}년 남 ${man(Z.m[k])}만 · 여 ${man(Z.f[k])}만|${D.base_year}년 남 ${man(A.m[k])}만 · 여 ${man(A.f[k])}만`;
    g += `<g data-tip="${esc(tip)}"><rect class="cg-hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
      <rect class="pp-m" x="${XL(Z.m[k])}" y="${y + 1.5}" width="${XL(0) - XL(Z.m[k])}" height="${rowH - 3}" rx="2"/>
      <rect class="pp-f" x="${XR(0)}" y="${y + 1.5}" width="${XR(Z.f[k]) - XR(0)}" height="${rowH - 3}" rx="2"/>
      <rect class="pp-base" x="${XL(A.m[k])}" y="${y + 1.5}" width="${XL(0) - XL(A.m[k])}" height="${rowH - 3}"/>
      <rect class="pp-base" x="${XR(0)}" y="${y + 1.5}" width="${XR(A.f[k]) - XR(0)}" height="${rowH - 3}"/></g>`;
  }
  g += `<text class="cg-unit" x="${W / 2}" y="${H - 10}" text-anchor="middle">만 명</text>`;
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${D.base_year}년과 ${st.y}년 인구 피라미드">${g}</svg>
    <div class="mk-keys"><span><i style="background:var(--s1)"></i>남자 ${st.y}년</span><span><i style="background:var(--s5)"></i>여자 ${st.y}년</span><span><i class="pp-key-base"></i>${D.base_year}년(테두리)</span></div>`;
}

function table() {
  const a = run[0], z = run.find((p) => p.y === st.y), w = D.wpp.find((p) => p.y === st.y);
  const dep = (g) => (g[3] / g[2]) * 100;
  const rows = [
    ['총인구', (g) => `${man(g[0])}만 명`],
    ['0~14세', (g) => `${fmt(share(g, 1), 1)}%`],
    ['15~64세', (g) => `${fmt(share(g, 2), 1)}%`],
    ['65세 이상', (g) => `${fmt(share(g, 3), 1)}%`],
    ['노년 부양비', (g) => fmt(dep(g), 1)],
  ];
  return `<div class="db-tablewrap"><table class="db-table pp-table"><thead><tr><th scope="col"></th><th scope="col">${D.base_year}년</th><th scope="col">${st.y}년 이 실험</th><th scope="col">${st.y}년 유엔 중위</th></tr></thead><tbody>
    ${rows.map(([n, f]) => `<tr><th scope="row">${n}</th><td>${f(a.g)}</td><td class="pp-now-td">${f(z.g)}</td><td>${f(w.g)}</td></tr>`).join('')}
    <tr><th scope="row">한 해 출생아</th><td>${man(D.births)}만 명</td><td class="pp-now-td">${man(z.births)}만 명</td><td>${man(w.births)}만 명</td></tr>
    </tbody></table></div>
    <p class="mk-note">노년 부양비 = 15~64세 100명당 65세 이상 인구. 출생아는 이 실험에서는 앞 1년(7월~이듬해 6월), 유엔 값과 ${D.base_year}년 값은 그해 1~12월입니다.</p>`;
}

function why() {
  const a = run[0], z = run.find((p) => p.y === st.y);
  const d = z.g[0] - a.g[0];
  const old = share(z.g, 3);
  const notes = [];
  notes.push(`<p>이 가정으로 ${st.y}년 총인구는 <b>${man(z.g[0])}만 명</b>으로, ${D.base_year}년보다 ${man(Math.abs(d))}만 명 ${d < 0 ? '적습니다' : '많습니다'}. 65세 이상이 <b>${fmt(old, 1)}%</b>입니다.</p>`);
  if (st.tfr < 2.05) notes.push('<p>합계 출산율이 2.1명보다 낮으면 아이 세대가 부모 세대보다 적습니다. 이 차이는 해마다 한 살씩 위로 올라가, 15년 뒤에는 15~64세를, 65년 뒤에는 65세 이상을 줄입니다.</p>');
  else notes.push('<p>합계 출산율이 2.1명 안팎이면 아이 세대가 부모 세대를 대신할 만큼 태어납니다. 그래도 지금 많은 40~60대가 65세 이상이 되는 동안은 고령 인구 비율이 오릅니다.</p>');
  if (st.y - D.base_year < 15) notes.push(`<p>${st.y}년의 15세 이상은 모두 ${D.base_year}년에 이미 태어난 사람입니다. 출산율을 바꿔도 이 해에는 0~14세만 달라집니다.</p>`);
  return notes.join('');
}

function draw() {
  run = project(D, { tfr: st.tfr, e0End: st.e0, netmig: st.mig });
  $('#ppLine').innerHTML = lineChart();
  $('#ppPyr').innerHTML = pyramid();
  $('#ppPyrH').textContent = `인구 피라미드 — ${D.base_year}년과 ${st.y}년`;
  $('#ppTable').innerHTML = table();
  $('#ppWhy').innerHTML = why();
  $('#ppTfr').value = st.tfr; $('#ppTfrO').textContent = fmt(st.tfr, 2) + '명';
  $('#ppE0').value = st.e0; $('#ppE0O').textContent = fmt(st.e0, 1) + '세';
  $('#ppMig').value = st.mig; $('#ppMigO').textContent = `${st.mig > 0 ? '+' : ''}${fmt(st.mig / 10, 1)}만 명`;
  $('#ppY').value = st.y; $('#ppYO').textContent = st.y + '년';
  const p = presets().find((x) => Math.abs(x.v.tfr - st.tfr) < 1e-9 && Math.abs(x.v.e0 - st.e0) < 1e-9 && x.v.mig === st.mig);
  $$('#ppPresets [data-p]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p?.id)));
  syncUrl();
}
function syncUrl() {
  if (document.body.dataset.tab !== 'pop') return;
  const b = presets()[0].v;
  setParams({ t: 'pop', tfr: Math.abs(st.tfr - b.tfr) > 1e-9 ? st.tfr : null, e0: Math.abs(st.e0 - b.e0) > 1e-9 ? st.e0 : null, mig: st.mig !== b.mig ? st.mig : null, y: st.y !== 2050 ? st.y : null });
}
export function shown() { if (D) draw(); else syncUrl(); }

export async function main(el) {
  root = el;
  D = await fetch('data/dashboard/pop.json').then((r) => r.json());
  e0Base = Math.round(((lifeTable(D.life.m).e0 + lifeTable(D.life.f).e0) / 2) * 10) / 10;
  Object.assign(st, presets()[0].v);
  const q = params();
  const num = (k, lo, hi) => { const v = Number(q.get(k)); return q.get(k) !== null && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  st.tfr = num('tfr', 0.5, 2.5) ?? st.tfr;
  st.e0 = num('e0', 75, 95) ?? st.e0;
  st.mig = num('mig', -100, 400) ?? st.mig;
  st.y = num('y', D.base_year + 1, D.end_year) ?? st.y;
  const wEnd = D.wpp.at(-1);
  el.innerHTML = `
    <p class="db-lead">합계 출산율 · 기대 수명 · 순이동을 정하면 ${D.base_year}년 인구에서 시작해 ${D.end_year}년까지 한 해씩 계산합니다.
      <small>미래를 맞히는 예측이 아니라, 정한 가정이 그대로 이어질 때 나오는 결과입니다.</small></p>
    <div class="mk-stage mk-stage--right">
      <section class="mk-panel mk-tiphost">
        <h2>나이 무리별 인구 ${D.past[0].y}~${D.end_year}</h2>
        <div id="ppLine"></div>
        <div class="mk-keys pp-keys"><span><i class="pp-k pp-k--run"></i>이 실험</span><span><i class="pp-k pp-k--wpp"></i>유엔 WPP 2024 중위 추계</span><span><i class="pp-k pp-k--past"></i>1960~2022 추정</span></div>
        <p class="mk-note">유엔 중위 추계는 합계 출산율이 ${wEnd.y}년 ${fmt(wEnd.tfr, 2)}명까지 서서히 오르고, 기대 수명이 ${fmt(wEnd.e0, 1)}세까지 늘며, 순이동이 ${D.base_year}년 ${fmt(D.netmig / 10, 1)}만 명에서 ${wEnd.y}년 ${fmt(wEnd.netmig / 10, 1)}만 명으로 준다고 가정합니다. 그래프에서 해를 누르면 아래 피라미드와 표가 그 해로 바뀝니다.</p>
      </section>
      <aside class="mk-panel" aria-label="가정 정하기">
        <h2>가정</h2>
        <div class="mk-tools" id="ppPresets">${presets().map((p) => `<button type="button" class="opt" data-p="${p.id}">${esc(p.name)}</button>`).join('')}</div>
        <div class="mk-field"><label for="ppTfr"><span>합계 출산율 <small class="pp-hint">${D.base_year}년 ${fmt(D.tfr, 2)}명 · 해마다 같음</small></span><output id="ppTfrO"></output></label><input type="range" id="ppTfr" min="0.5" max="2.5" step="0.01"></div>
        <div class="mk-field"><label for="ppE0"><span>${D.end_year}년 기대 수명 <small class="pp-hint">${D.base_year}년 남녀 평균 ${fmt(e0Base, 1)}세 · 고르게 바뀜</small></span><output id="ppE0O"></output></label><input type="range" id="ppE0" min="75" max="95" step="0.1"></div>
        <div class="mk-field"><label for="ppMig"><span>한 해 순이동 <small class="pp-hint">들어온 사람 − 나간 사람 · ${D.base_year}년 ${fmt(D.netmig / 10, 1)}만 명</small></span><output id="ppMigO"></output></label><input type="range" id="ppMig" min="-100" max="400" step="1"></div>
        <div class="mk-field"><label for="ppY"><span>볼 해</span><output id="ppYO"></output></label><input type="range" id="ppY" min="${D.base_year + 1}" max="${D.end_year}" step="1"></div>
        <div class="mk-why" id="ppWhy" aria-live="polite"></div>
        <div class="mk-tools"><button type="button" class="share-btn" id="ppShare">공유</button></div>
      </aside>
    </div>
    <div class="db-row db-row--2 pp-row">
      <section class="mk-panel mk-tiphost"><h2 id="ppPyrH"></h2><div id="ppPyr"></div></section>
      <section class="mk-panel"><h2>나이 구조 견주기</h2><div id="ppTable"></div></section>
    </div>
    <section class="mk-panel db-row">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>다른 값은 그대로 두고 합계 출산율만 ${fmt(D.tfr, 2)}명에서 1.3명으로 바꾸어 보세요. 2050년의 총인구와 65세 이상 인구는 각각 얼마나 달라지나요? 65세 이상이 거의 그대로인 까닭은 무엇인가요?</li>
        <li>순이동을 0명과 +30만 명으로 놓고 15~64세 인구를 견주어 보세요. 이동해 오는 사람은 주로 몇 살인가요?</li>
        <li>기대 수명만 늘리면 피라미드의 어느 부분이 넓어지나요? 그래도 총인구가 계속 줄어드는 까닭은 무엇인가요?</li>
        <li>점선(유엔 중위 추계)과 이 실험의 선이 벌어지는 까닭을 두 계산의 가정으로 설명해 보세요.</li>
      </ol>
    </section>
    <footer class="mk-source">
      <p><b>자료</b> 국제연합(UN) 경제사회국 인구부, 「세계 인구 전망 2024(World Population Prospects 2024)」, CC BY 3.0 IGO — 대한민국 ${D.base_year}년 7월 1일 한 살 · 성별 인구, ${D.base_year}년 남녀 생명표, ${D.base_year}년 나이별 출산 몫, 출생 성비(여아 100명당 남아 ${fmt(D.srb, 1)}명), 비교용 중위 추계와 1960~2022년 추정 인구. 2026년 10월 20일에 받았습니다.</p>
      <p><b>계산</b> 코호트 요인법입니다. 해마다 ① 나이마다 인구에 생명표의 생존율을 곱해 한 살 올리고, ② 15~49세 여성 수에 나이별 출산율(합계 출산율 × ${D.base_year}년 나이별 몫)을 곱해 출생아를 구한 뒤 출생 성비로 남녀를 나누고, ③ 순이동을 나이 · 성별로 나누어 더합니다. 기대 수명은 ${D.base_year}년 생명표의 사망 확률을 같은 비율로 낮추거나 높여 맞춥니다. 순이동의 나이 · 성별 몫은 WPP 추정 인구에서 ${D.mig_years[0]}~${D.mig_years.at(-1)}년에 생존만으로 설명되지 않는 차이를 평균해 얻었습니다(20대가 가장 많음). 기준 그대로 한 해를 계산한 ${D.base_year + 1}년 총인구는 유엔 중위 추계와 0.1% 안에서 맞습니다. 만든 방법: scripts/build-dashboard-pop.py, 계산: assets/dashboard-cohort.mjs.</p>
      <p><b>한계</b> 유엔 인구는 우리나라에 사는 외국인까지 넣은 7월 1일 인구라, 국가데이터처의 주민등록 인구 · 장래인구추계와 값이 다릅니다. 출산율 · 순이동은 해마다 같고, 나이별 출산 몫과 이동하는 사람의 나이는 바뀌지 않는다고 가정했습니다. 실제로는 경제 · 정책 · 결혼과 같은 변화에 따라 세 값이 해마다 달라집니다.</p>
    </footer>`;
  injectStyle();
  tips(el);
  el.addEventListener('input', (e) => {
    const id = e.target.id, v = Number(e.target.value);
    if (id === 'ppTfr') st.tfr = v; else if (id === 'ppE0') st.e0 = v; else if (id === 'ppMig') st.mig = v; else if (id === 'ppY') st.y = v; else return;
    draw();
  });
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    if (p) { Object.assign(st, presets().find((x) => x.id === p.dataset.p).v); draw(); return; }
    const h = e.target.closest('.pp-hit');
    if (h && Number(h.dataset.y) > D.base_year) { st.y = Number(h.dataset.y); draw(); }
  });
  shareButton($('#ppShare'), () => location.href, () => `합계 출산율 ${fmt(st.tfr, 2)}명 · ${D.end_year}년 기대 수명 ${fmt(st.e0, 1)}세 · 순이동 ${fmt(st.mig / 10, 1)}만 명`);
  draw();
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!root.hidden) draw(); }, 160); });
  document.body.dataset.ready = 'true';
}

function injectStyle() {
  const s = document.createElement('style');
  s.textContent = `
    .pp-future { fill: var(--st-fill-3); opacity: 0.5; }
    .pp-now { stroke: var(--st-separator-strong); stroke-width: 1; }
    .pp-sel { stroke: var(--st-label-3); stroke-width: 1; stroke-dasharray: 3 3; }
    .pp-run, .pp-wpp, .pp-past { fill: none; stroke-linejoin: round; stroke-linecap: round; }
    .pp-run { stroke-width: 2.4; }
    .pp-wpp { stroke-width: 1.5; stroke-dasharray: 4 4; opacity: 0.85; }
    .pp-past { stroke-width: 2; opacity: 0.45; }
    .pp-dot { stroke: var(--st-surface); stroke-width: 2; }
    .pp-end { fill: var(--st-label-2); font-size: 12px; }
    .pp-hit { cursor: pointer; }
    .pp-hit:hover { fill: var(--st-fill-3); }
    .pp-m { fill: var(--s1); } .pp-f { fill: var(--s5); }
    .pp-base { fill: none; stroke: var(--st-label); stroke-width: 1.2; opacity: 0.75; }
    .pp-key-base { background: none !important; outline: 1.2px solid var(--st-label); outline-offset: -1.2px; opacity: 0.75; }
    .pp-keys .pp-k { width: 22px; height: 0; border-radius: 0; background: none; border-top: 2.4px solid var(--st-label-2); }
    .pp-keys .pp-k--wpp { border-top: 1.5px dashed var(--st-label-2); }
    .pp-keys .pp-k--past { border-top-width: 2px; opacity: 0.45; }
    .pp-hint { display: block; font-size: 11px; font-weight: 400; color: var(--st-label-3); }
    .pp-table { min-width: 420px; }
    .pp-table td.pp-now-td { color: var(--st-label); font-weight: 600; }
    .pp-table tbody tr { cursor: default; }
    .pp-table tbody tr:hover { background: none; }
    .pp-row { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); }
    @media (max-width: 900px) { .pp-row { grid-template-columns: 1fr; } }
  `;
  document.head.append(s);
}
