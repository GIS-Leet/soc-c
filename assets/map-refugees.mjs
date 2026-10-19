// 난민은 어디서 어디로 — 출신국 → 비호국 흐름 지도.
// 자료: data/maps/refugees/flows.json(UNHCR Refugee Population Statistics Database, scripts/build-map-refugees.mjs).
// 흐름 = 그해 말 남의 나라에 있는 난민 · 비호 신청자 · 그 밖의 국제 보호가 필요한 사람(출신국 × 비호국 쌍).
// 핵심은 「대부분은 멀리 가지 못한다」 — 국경을 맞댄 이웃 나라로 간 비율과 거리를 자료에서 계산해 보여 준다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, initPage } from './map-kit.mjs?v=d3b6045c';

const st = { m: 'out', c: null };
let D, C, W, T;
const HIDE = new Set(['UNK', 'XXA', 'TIB']); // 지도에 점이 없는 출신(출신 불명 · 무국적 · 티베트인)
const sum = (f) => f[2] + f[3] + f[4];
const ko = (i) => C[i]?.ko || i;
const isNb = (o, a) => !!C[o]?.nb?.includes(a);
const man = (v) => (v >= 1e4 ? fmt(v, 0, { man: true }) : fmt(v));
function km(o, a) {
  const [l1, p1] = C[o].ll, [l2, p2] = C[a].ll, r = Math.PI / 180;
  const h = Math.sin(((p2 - p1) * r) / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin(((l2 - l1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** 사람 수로 무게를 준 거리의 중앙값 — 「절반은 몇 km 안에 있나」 */
function medianKm(flows) {
  const xs = flows.filter((f) => C[f[0]]?.ll && C[f[1]]?.ll).map((f) => [km(f[0], f[1]), sum(f)]).sort((a, b) => a[0] - b[0]);
  const half = xs.reduce((a, x) => a + x[1], 0) / 2;
  let acc = 0;
  for (const [d, w] of xs) if ((acc += w) >= half) return d;
  return null;
}
/** 한 묶음의 흐름 — 합계, 이웃 비율, 세 갈래 합 */
function stats(flows) {
  const known = flows.filter((f) => !HIDE.has(f[0]));
  const all = known.reduce((a, f) => a + sum(f), 0);
  const nb = known.reduce((a, f) => a + (isNb(f[0], f[1]) ? sum(f) : 0), 0);
  return { all, nb, share: all ? (nb / all) * 100 : null, med: medianKm(known),
    ref: flows.reduce((a, f) => a + f[2], 0), asy: flows.reduce((a, f) => a + f[3], 0), oip: flows.reduce((a, f) => a + f[4], 0), raw: flows.reduce((a, f) => a + sum(f), 0) };
}
const byO = {}, byA = {};

// ── 지도 ──
const VMAX = () => sum(D.flows[0]);
function viewBox(pts) {
  const box = $('#rfMap');
  const ar = box.clientWidth / Math.max(1, box.clientHeight); // 틀의 가로세로 비
  let x0, y0, x1, y1;
  if (!pts.length) { x0 = 0; x1 = W.w; y0 = 22; y1 = 432; }
  else {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys);
    const pad = Math.max(40, (x1 - x0) * 0.12);
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    if (x1 - x0 < 220) { const m = (x0 + x1) / 2; x0 = m - 110; x1 = m + 110; }
  }
  let w = x1 - x0, h = y1 - y0;
  if (w / h < ar) { const nw = h * ar; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y0 -= (nh - h) / 2; h = nh; }
  if (w > W.w) { const s = W.w / w; w = W.w; h *= s; }
  x0 = Math.max(0, Math.min(W.w - w, x0));
  y0 = Math.max(0, Math.min(W.h - h, y0));
  return [x0, y0, w, h];
}
function shown() {
  if (!st.c) return D.flows.filter((f) => C[f[0]]?.p && C[f[1]]?.p).slice(0, 70);
  const list = (st.m === 'out' ? byO[st.c] : byA[st.c]) || [];
  const t = list.reduce((a, f) => a + sum(f), 0);
  return list.filter((f) => C[f[0]]?.p && C[f[1]]?.p && sum(f) >= Math.max(300, t * 0.002)).slice(0, 45);
}
function draw() {
  const box = $('#rfMap');
  const flows = shown();
  const sel = st.c;
  const partners = new Set(flows.map((f) => (st.m === 'out' ? f[1] : f[0])));
  const pts = sel ? [C[sel].p, ...flows.flatMap((f) => [C[f[0]].p, C[f[1]].p])] : [];
  const [vx, vy, vw, vh] = viewBox(pts);
  const px = box.clientWidth / vw;                       // 화면 1px = 지도 단위 1/px
  const sz = Math.min(1, Math.max(0.55, box.clientWidth / 1000));
  const u = (p) => p / px;                               // 화면 px → 지도 단위
  let g = `<path class="rf-sea" d="${T.sphere}"/>`;
  for (const [iso, d] of Object.entries(D.shapes)) {
    const cls = iso === sel ? ' is-sel' : partners.has(iso) && sel ? ' is-pt' : '';
    const c = C[iso];
    g += `<path class="rf-land${cls}" d="${d}" data-iso="${iso}" data-tip="${esc(`${ko(iso)}|떠난 사람 ${man(c?.out || 0)} · 받은 사람 ${man(c?.in || 0)}`)}"/>`;
  }
  // 흐름 — 굵기는 사람 수의 제곱근(가장 큰 흐름이 16px)
  const lines = flows.slice().reverse().map((f) => {
    const [o, a] = f, v = sum(f), nb = isNb(o, a);
    const [x0, y0] = C[o].p, [x1, y1] = C[a].p;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const bend = Math.min(0.3, 0.12 + 18 / L);
    const qx = (x0 + x1) / 2 - dy * bend, qy = (y0 + y1) / 2 + dx * bend;
    const wpx = Math.max(1.3, 16 * Math.sqrt(v / VMAX())) * sz;
    const w = u(wpx), ah = u(Math.max(5, wpx * 1.7));
    const tx = x1 - qx, ty = y1 - qy, tl = Math.hypot(tx, ty) || 1;
    const ex = x1 - (tx / tl) * ah, ey = y1 - (ty / tl) * ah;
    const nx = -ty / tl, ny = tx / tl;
    const tip = esc(`${ko(o)} → ${ko(a)}|${fmt(v)}명|난민 ${fmt(f[2])} · 비호 신청자 ${fmt(f[3])} · 그 밖 ${fmt(f[4])}|${nb ? '국경을 맞댄 이웃 나라' : '이웃 나라 아님'} · 수도 사이 약 ${fmt(Math.round(km(o, a) / 10) * 10)}km`);
    const dash = nb ? '' : ` stroke-dasharray="${u(Math.max(4, wpx * 1.4))} ${u(Math.max(3, wpx * 0.9))}"`;
    return `<g class="rf-flow ${nb ? 'is-nb' : 'is-far'}" data-tip="${tip}">
      <path class="rf-hit" d="M${x0},${y0}Q${qx},${qy} ${ex},${ey}" stroke-width="${u(wpx + 10)}"/>
      <path class="rf-line" d="M${x0},${y0}Q${qx},${qy} ${ex},${ey}" stroke-width="${w}"${dash}/>
      <path class="rf-head" d="M${x1},${y1}L${ex + nx * ah * 0.62},${ey + ny * ah * 0.62}L${ex - nx * ah * 0.62},${ey - ny * ah * 0.62}Z"/></g>`;
  });
  g += lines.join('');
  // 이름 — 고른 나라와 큰 상대 몇 곳(전체 보기에서는 큰 출신국 · 비호국)
  const named = sel ? [sel, ...flows.slice(0, 7).map((f) => (st.m === 'out' ? f[1] : f[0]))]
    : rankList().slice(0, 8).map((x) => x[0]);
  const fs = u(12.5);
  const placed = []; // 이름이 겹치면 뒤의 것(작은 흐름)은 쓰지 않는다
  for (const iso of new Set(named)) {
    const p = C[iso]?.p;
    if (!p) continue;
    const bw = ko(iso).length * fs * 0.98, bx = [p[0] - bw / 2, p[1] - u(7) - fs, p[0] + bw / 2, p[1] - u(7) + u(2)];
    if (placed.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
    placed.push(bx);
    g += `<text class="rf-lab${iso === sel ? ' is-sel' : ''}" x="${p[0]}" y="${p[1] - u(7)}" font-size="${iso === sel ? fs * 1.12 : fs}" stroke-width="${u(3)}" text-anchor="middle">${esc(ko(iso))}</text>`;
  }
  const label = sel ? `${ko(sel)}${st.m === 'out' ? '에서 떠난' : '으로 온'} 사람의 흐름 지도` : '나라 밖으로 피한 사람의 큰 흐름 70개 지도';
  box.innerHTML = `<svg class="rf-svg" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="${esc(label)}">${g}</svg>`;
  panel();
  setParams({ m: st.m === 'in' ? 'in' : null, c: st.c });
}

// ── 곁판 ──
function rankList() {
  const k = st.m === 'out' ? 'out' : 'in';
  return Object.entries(C).filter(([i, c]) => c[k] > 0 && c.p && !HIDE.has(i)).sort((a, b) => b[1][k] - a[1][k]);
}
const yr = () => `${D.year}년 말`;
function panel() {
  const k = st.m === 'out' ? 'out' : 'in';
  // 고른 나라 선택 상자
  const opts = Object.entries(C).filter(([i, c]) => c[k] > 0 && c.p && !HIDE.has(i)).sort((a, b) => a[1].ko.localeCompare(b[1].ko, 'ko'));
  $('#rfPick').innerHTML = `<option value="">세계 전체</option>${opts.map(([i, c]) => `<option value="${i}"${i === st.c ? ' selected' : ''}>${esc(c.ko)}</option>`).join('')}`;
  $('#rfPickL').textContent = st.m === 'out' ? '출신국 고르기' : '비호국 고르기';
  $$('#rfMode .st-segmented__item').forEach((b) => { const on = b.dataset.value === st.m; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  // 요약
  const say = $('#rfSay');
  if (!st.c) {
    const s = G;
    const top = rankList().slice(0, 3).map(([i]) => ko(i)).join(' · ');
    say.innerHTML = `<p>${yr()}, 나라 밖으로 피해 다른 나라에 있는 사람은 <b>${man(s.raw)} 명</b>입니다. 난민 ${man(s.ref)} · 비호 신청자 ${man(s.asy)} · 그 밖의 국제 보호가 필요한 사람 ${man(s.oip)}입니다.</p>
      <p>출신을 아는 사람 가운데 <b>${fmt(s.share, 0)}%</b>는 국경을 맞댄 이웃 나라에 있습니다. 수도 사이 거리로 재면 절반이 <b>${fmt(Math.round(s.med / 10) * 10)}km</b> 안에 있습니다.</p>
      <p>${st.m === 'out' ? `가장 많이 떠난 나라는 ${esc(top)}입니다.` : `가장 많이 받은 나라는 ${esc(top)}입니다. 받은 사람의 <b>${fmt(INC, 0)}%</b>는 고소득 나라가 아닌 곳에 있습니다.`}</p>`;
  } else {
    const list = (st.m === 'out' ? byO[st.c] : byA[st.c]) || [];
    const s = stats(list);
    const c = C[st.c];
    const nbTop = list.filter((f) => isNb(f[0], f[1])).slice(0, 3).map((f) => ko(st.m === 'out' ? f[1] : f[0]));
    say.innerHTML = st.m === 'out'
      ? `<p><b>${esc(c.ko)}</b>에서 나라 밖으로 피한 사람은 <b>${fmt(s.raw)}명</b>입니다(난민 ${man(s.ref)} · 비호 신청자 ${man(s.asy)} · 그 밖 ${man(s.oip)}).</p>
        <p>이 가운데 <b>${fmt(s.share ?? 0, 0)}%</b>가 국경을 맞댄 이웃 나라${nbTop.length ? `(${esc(nbTop.join(' · '))})` : ''}에 있습니다.${s.med != null ? ` 절반은 수도 사이 <b>${fmt(Math.round(s.med / 10) * 10)}km</b> 안에 있습니다.` : ''}</p>
        ${c.idp ? `<p>나라 안에서 집을 떠나 떠도는 사람(국내 실향민)도 <b>${man(c.idp)}</b> 명입니다. 국경을 넘지 않아 지도에는 선이 없습니다.</p>` : ''}`
      : `<p><b>${esc(c.ko)}</b>에 있는 사람은 <b>${fmt(s.raw)}명</b>입니다(난민 ${man(s.ref)} · 비호 신청자 ${man(s.asy)} · 그 밖 ${man(s.oip)}).</p>
        <p>이 가운데 <b>${fmt(s.share ?? 0, 0)}%</b>가 국경을 맞댄 이웃 나라${nbTop.length ? `(${esc(nbTop.join(' · '))})` : ''}에서 왔습니다.${s.med != null ? ` 절반은 수도 사이 <b>${fmt(Math.round(s.med / 10) * 10)}km</b> 안에서 왔습니다.` : ''}</p>`;
  }
  // 순위 — 전체 보기면 나라 순위, 나라를 골랐으면 그 나라의 상대
  const max = (rows) => Math.max(...rows.map((r) => r[1]), 1);
  let rows, head;
  if (!st.c) {
    rows = rankList().slice(0, 12).map(([i, c]) => [i, c[k], null]);
    head = st.m === 'out' ? '가장 많이 떠난 나라' : '가장 많이 받은 나라';
  } else {
    const list = (st.m === 'out' ? byO[st.c] : byA[st.c]) || [];
    rows = list.slice(0, 10).map((f) => [st.m === 'out' ? f[1] : f[0], sum(f), isNb(f[0], f[1])]);
    head = st.m === 'out' ? `${ko(st.c)} 사람이 간 곳` : `${ko(st.c)}에 온 사람의 출신`;
  }
  const mx = max(rows);
  $('#rfRankH').textContent = head;
  $('#rfRank').innerHTML = rows.map(([i, v, nb], n) => `<li><button type="button" data-pick="${i}" data-mode="${st.c ? (st.m === 'out' ? 'in' : 'out') : st.m}" ${C[i]?.p ? '' : 'disabled'}>
      <span class="rf-r">${n + 1}</span><span class="rf-n">${esc(ko(i))}${nb === true ? ' <small>이웃</small>' : ''}</span>
      <span class="rf-bar"><i style="width:${(v / mx) * 100}%"></i></span><span class="rf-v">${man(v)}</span></button></li>`).join('');
  $('#rfRankNote').textContent = st.c ? '이름을 누르면 그 나라 쪽에서 다시 봅니다.' : '이름을 누르면 그 나라의 흐름만 봅니다.';
  $('#rfBack').hidden = !st.c;
  $('#rfKorLine').hidden = st.c === 'KOR';
}

let G, INC;
export async function main() {
  await initPage('refugees');
  D = await fetch('data/maps/refugees/flows.json').then((r) => r.json());
  C = D.countries; W = D.w;
  for (const f of D.flows) { (byO[f[0]] ||= []).push(f); (byA[f[1]] ||= []).push(f); }
  G = stats(D.flows);
  const hic = Object.values(C).reduce((a, c) => a + (c.inc === 'HIC' ? c.in : 0), 0);
  const withInc = Object.values(C).reduce((a, c) => a + (c.inc ? c.in : 0), 0);
  INC = ((withInc - hic) / withInc) * 100;
  // 바다(Equal Earth 테두리)
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const P = (lon, lat) => {
    const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180, th = Math.asin(M * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
    return [W.w / 2 + ((l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))) * W.s, W.h / 2 - th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) * W.s];
  };
  const edge = [...Array.from({ length: 37 }, (_, i) => P(-180, -90 + i * 5)), ...Array.from({ length: 37 }, (_, i) => P(180, 90 - i * 5))];
  T = { sphere: 'M' + edge.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z' };

  const q = params();
  if (q.get('m') === 'in') st.m = 'in';
  if (q.get('c') && C[q.get('c')]?.p) st.c = q.get('c');
  const kor = C.KOR, korS = stats(byA.KOR || []);
  const korRank = Object.values(C).filter((c) => c.in > kor.in).length + 1;
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--left">
      <div class="rf-main">
      <figure class="mk-map mk-tiphost rf-mapbox"><div id="rfMap" class="rf-map"></div>
        <figcaption class="rf-key">
          <span><svg viewBox="0 0 40 10" aria-hidden="true"><path d="M2 5H32" class="rf-k-nb"/><path d="M38 5L31 1.5V8.5Z" class="rf-k-nbh"/></svg>국경을 맞댄 이웃 나라로</span>
          <span><svg viewBox="0 0 40 10" aria-hidden="true"><path d="M2 5H32" class="rf-k-far"/><path d="M38 5L31 1.5V8.5Z" class="rf-k-farh"/></svg>더 먼 나라로(점선)</span>
          <span class="rf-w">굵기 = 사람 수 <svg viewBox="0 0 120 18" aria-hidden="true">${[1e5, 5e5, 2e6].map((v, i) => `<line x1="${4 + i * 40}" x2="${30 + i * 40}" y1="9" y2="9" stroke-width="${Math.max(0.8, 16 * Math.sqrt(v / sum(D.flows[0])))}"/>`).join('')}</svg><small>10만 · 50만 · 200만</small></span>
        </figcaption>
      </figure>
      <section class="mk-panel rf-rankbox"><h2 id="rfRankH"></h2><ol class="rf-rank" id="rfRank"></ol><p class="mk-note" id="rfRankNote"></p></section>
      </div>
      <aside class="mk-panel rf-side" aria-label="흐름 고르기">
        <h2>누구의 길을 볼까요?</h2>
        <div class="st-segmented rf-mode" id="rfMode" role="tablist" aria-label="보는 쪽">
          <button type="button" class="st-segmented__item" role="tab" data-value="out">떠난 나라(출신국)</button>
          <button type="button" class="st-segmented__item" role="tab" data-value="in">받은 나라(비호국)</button>
        </div>
        <div class="mk-field"><label for="rfPick" id="rfPickL">출신국 고르기</label><select id="rfPick" class="st-field rf-pick"></select></div>
        <div class="mk-why" id="rfSay"></div>
        <div class="mk-why rf-kor" id="rfKorLine"><p>대한민국에 있는 사람은 <b>${fmt(korS.raw)}명</b>입니다(난민 ${fmt(korS.ref)} · 비호 신청자 ${fmt(korS.asy)}). 받은 나라 가운데 ${korRank}번째입니다.</p></div>
        <div class="mk-tools"><button type="button" class="opt" id="rfKor">대한민국 보기</button><button type="button" class="opt" id="rfBack" hidden>세계 전체로</button><button type="button" class="share-btn" id="rfShare">공유</button></div>
      </aside>
    </div>
    <section class="mk-panel rf-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>시리아 · 남수단 · 미얀마를 차례로 골라 보세요. 이웃 나라로 간 비율이 높은 까닭은 무엇일까요? 급히 떠나는 사람에게 돈 · 서류 · 교통이 어떤 차이를 만들까요?</li>
        <li>베네수엘라 · 우크라이나는 이웃 나라 비율이 낮은 편입니다. 점선이 향하는 나라들은 어떤 공통점이 있나요? 같은 언어, 먼저 간 가족, 이동의 자유 같은 것을 떠올려 보세요.</li>
        <li>「받은 나라」로 바꾸어 보세요. 가장 많이 받은 나라들은 부유한 나라일까요? 난민을 받는 부담은 누가 지고 있나요?</li>
        <li>대한민국에 있는 사람의 ${fmt((korS.asy / korS.raw) * 100, 0)}%는 아직 심사를 기다리는 비호 신청자입니다. 우리나라는 난민을 얼마나, 어떻게 받아야 할까요?</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> UNHCR Refugee Population Statistics Database(유엔난민기구 난민 통계, <a href="${D.url}">Refugee Data Finder</a>), ${D.year}년 말 기준, ${D.fetched} 받음. CC BY 4.0 — <a href="${D.terms}">이용 약관</a>. 나라 경계와 수도 위치는 Natural Earth(공공 저작물), 소득 분류는 세계은행(<a href="stats.html">통계로 보는 세계</a>와 같은 자료).</p>
    <p><b>계산</b> 흐름 하나 = 출신국 × 비호국 한 쌍에 있는 난민 + 비호 신청자 + 그 밖의 국제 보호가 필요한 사람입니다. 이웃 나라는 땅으로 국경을 맞댄 나라(해외 영토 포함)이고, 거리는 두 나라 수도 사이의 대권 거리입니다. 「절반은 몇 km 안」은 사람 수로 무게를 준 거리의 중앙값입니다.</p>
    <p><b>한계</b> 그해에 새로 떠난 사람이 아니라 그해 말에 남의 나라에 머물던 사람의 수이고, 오래전에 떠난 사람도 들어 있습니다. 유엔 팔레스타인 난민 구호 기구(UNRWA)가 맡는 팔레스타인 난민과, 국경을 넘지 않은 국내 실향민(UNHCR 집계 ${man(D.total.idps)} 명)은 선에 없습니다. 출신 불명 · 무국적인 사람은 합계에만 들어 있습니다. 나라마다 세는 방법이 달라 추정값이 섞여 있습니다. 수도 사이 거리는 실제로 걸은 길이 아닙니다.</p>`;
  const style = document.createElement('style');
  style.textContent = `
    .rf-mapbox { padding: 0; min-height: 0; }
    .rf-map { width: 100%; aspect-ratio: 2.05 / 1; }
    @media (max-width: 700px) { .rf-map { aspect-ratio: 1.25 / 1; } }
    .rf-svg { display: block; width: 100%; height: 100%; }
    .rf-sea { fill: var(--map-sea); }
    .rf-land { fill: var(--map-land); stroke: var(--st-surface); stroke-width: 0.6; vector-effect: non-scaling-stroke; cursor: pointer; }
    .rf-land:hover { fill: var(--st-fill); }
    .rf-land.is-pt { fill: var(--st-fill); }
    .rf-land.is-sel { fill: var(--st-label-4); stroke: var(--st-label); stroke-width: 1.4; }
    .rf-flow .rf-line { fill: none; stroke-linecap: butt; stroke-opacity: 0.88; }
    .rf-flow .rf-hit { fill: none; stroke: transparent; pointer-events: stroke; }
    .rf-flow.is-nb .rf-line { stroke: var(--s2); } .rf-flow.is-nb .rf-head { fill: var(--s2); }
    .rf-flow.is-far .rf-line { stroke: var(--s1); } .rf-flow.is-far .rf-head { fill: var(--s1); }
    .rf-flow:hover .rf-line { stroke-opacity: 1; }
    .rf-lab { fill: var(--st-label); stroke: var(--st-bedrock); paint-order: stroke; font-weight: 600; pointer-events: none; }
    .rf-lab.is-sel { font-weight: 700; }
    .rf-key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding: 10px 14px 12px; font-size: 12px; color: var(--st-label-2); letter-spacing: var(--track-ko); }
    .rf-key span { display: inline-flex; align-items: center; gap: 7px; }
    .rf-key svg { width: 40px; height: 10px; flex-shrink: 0; }
    .rf-k-nb { stroke: var(--s2); stroke-width: 3; } .rf-k-nbh { fill: var(--s2); }
    .rf-k-far { stroke: var(--s1); stroke-width: 3; stroke-dasharray: 5 3; } .rf-k-farh { fill: var(--s1); }
    .rf-w svg { width: 120px; height: 18px; } .rf-w line { stroke: var(--st-label-3); }
    .rf-w small { font-size: 11px; color: var(--st-label-3); font-variant-numeric: tabular-nums; }
    .rf-mode { display: flex; } .rf-mode .st-segmented__item { flex: 1; }
    .rf-pick { height: 38px; font-size: 13.5px; }
    .rf-main { display: grid; gap: 16px; min-width: 0; }
    @media (max-width: 900px) { .rf-main { display: contents; } .rf-mapbox { order: 0; } .rf-side { order: 1; } .rf-rankbox { order: 2; } }
    .rf-rankbox { gap: 8px; }
    .rf-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px 28px; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; grid-template-rows: repeat(6, auto); }
    @media (max-width: 700px) { .rf-rank { grid-template-columns: 1fr; grid-auto-flow: row; grid-template-rows: none; } }
    .rf-rank button { width: 100%; display: grid; grid-template-columns: 18px minmax(0, 7.5em) 1fr 46px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--st-r-inner); text-align: left; font-variant-numeric: tabular-nums; }
    .rf-rank button:hover, .rf-rank button:focus-visible { background: var(--st-fill-2); }
    .rf-r { font-size: 11.5px; color: var(--st-label-3); text-align: right; }
    .rf-n { font-size: 13px; font-weight: 600; color: var(--st-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rf-n small { font-size: 10.5px; font-weight: 500; color: var(--st-label-3); }
    .rf-bar { height: 10px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .rf-bar i { display: block; height: 100%; background: var(--kr-s3); border-radius: 0 4px 4px 0; }
    .rf-v { font-size: 12px; color: var(--st-label); text-align: right; }
    .rf-kor { font-size: 13px; color: var(--st-label-2); }
    .rf-think { margin-top: 16px; }
  `;
  document.head.append(style);
  const body = $('#mkBody');
  const tip = tips(body);
  // 흐름은 탭으로도 말풍선이 뜬다(터치에는 마우스 이동이 없다)
  body.addEventListener('click', (e) => {
    const fl = e.target.closest('.rf-flow');
    if (fl) { tip.show(e, fl.dataset.tip.split('|'), fl.closest('.mk-tiphost')); return; }
    const land = e.target.closest('.rf-land');
    if (land) {
      const iso = land.dataset.iso;
      if (!C[iso]?.p || !(C[iso][st.m === 'out' ? 'out' : 'in'] > 0)) return;
      st.c = st.c === iso ? null : iso; draw(); return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) { st.c = pick.dataset.pick; st.m = pick.dataset.mode; draw(); return; }
  });
  $('#rfPick').addEventListener('change', (e) => { st.c = e.target.value || null; draw(); });
  $('#rfKor').addEventListener('click', () => { st.m = 'in'; st.c = 'KOR'; draw(); });
  $('#rfBack').addEventListener('click', () => { st.c = null; draw(); });
  const seg = $('#rfMode');
  $$('.st-segmented__item', seg).forEach((b) => b.classList.toggle('is-on', b.dataset.value === st.m));
  const onMode = (v) => { if (v === st.m) return; st.m = v; if (st.c && !(C[st.c][v === 'out' ? 'out' : 'in'] > 0)) st.c = null; draw(); };
  if (window.Stratum?.segmented) window.Stratum.segmented(seg, onMode);
  else seg.addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b) onMode(b.dataset.value); });
  shareButton($('#rfShare'), () => location.href, () => (st.c ? `${ko(st.c)} — ${st.m === 'out' ? '떠난 사람이 간 곳' : '온 사람의 출신'}` : '난민은 어디서 어디로'));
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
