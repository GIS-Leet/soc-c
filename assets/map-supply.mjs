// 스마트폰 부품과 완성품의 무역 흐름 — 부품 → 조립 → 소비의 무역 흐름(OD) 지도.
// 자료: data/maps/supply/trade.json(UN Comtrade Database, scripts/build-map-supply.mjs).
// 흐름 A → B = B 나라가 신고한 「A에서 들여온 액수」(달러). 원 = 단계마다 그 나라의 수출(상대국이 신고한 합) 또는 수입.
// 핵심은 「한 물건이 여러 나라를 거친다」 — 부품을 만드는 나라와 조립하는 나라, 사는 나라가 다르다는 것을 자료로 확인한다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, initPage } from './map-kit.mjs?v=6473793e';

const STAGES = [
  { id: 'parts', name: '부품', long: '① 부품을 만드는 나라' },
  { id: 'phone', name: '조립', long: '② 완성품을 내보내는 나라' },
  { id: 'use', name: '소비', long: '③ 스마트폰을 사 오는 나라' },
];
const st = { s: 'parts', p: '8542', c: null, cp: '8542' };
let D, C, W, T;
const ko = (i) => C[i]?.ko || i;
const usd = (v) => (v == null ? '—' : v >= 1e10 ? `${fmt(Math.round(v / 1e8))}억 달러` : v >= 1e8 ? `${fmt(v / 1e8, 1)}억 달러` : `${fmt(Math.round(v / 1e6))}백만 달러`);
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const EUN = { '8542': '반도체 칩은', '8524': '디스플레이는', '850760': '배터리는', '851713': '스마트폰은' };
const EUL = { '8542': '반도체 칩을', '8524': '디스플레이를', '850760': '배터리를', '851713': '스마트폰을' };
const prod = () => D.products[st.s === 'parts' ? st.p : '851713'];
const measure = (P, iso) => (st.s === 'use' ? P.imp[iso] : P.mirror[iso]) || 0;

// ── 지도 ──
function viewBox(pts) {
  const box = $('#spMap');
  const ar = box.clientWidth / Math.max(1, box.clientHeight);
  let x0, y0, x1, y1;
  if (!pts.length) { x0 = 0; x1 = W.w; y0 = 30; y1 = 420; }
  else {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys);
    const pad = Math.max(50, (x1 - x0) * 0.12);
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    if (x1 - x0 < 260) { const m = (x0 + x1) / 2; x0 = m - 130; x1 = m + 130; }
  }
  let w = x1 - x0, h = y1 - y0;
  if (w / h < ar) { const nw = h * ar; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y0 -= (nh - h) / 2; h = nh; }
  if (w > W.w) { const s = W.w / w; w = W.w; h *= s; }
  x0 = Math.max(0, Math.min(W.w - w, x0));
  y0 = Math.max(0, Math.min(W.h - h, y0));
  return [x0, y0, w, h];
}
function shownFlows(P) {
  const ok = (f) => C[f[0]]?.p && C[f[1]]?.p;
  if (!st.c) return P.flows.filter(ok).slice(0, 32);
  return P.flows.filter((f) => ok(f) && (st.s === 'use' ? f[1] === st.c : f[0] === st.c)).slice(0, 30);
}
function draw() {
  const P = prod();
  const box = $('#spMap');
  const flows = shownFlows(P);
  const sel = st.c;
  const pts = [...(sel ? [C[sel].p] : []), ...flows.flatMap((f) => [C[f[0]].p, C[f[1]].p])];
  const [vx, vy, vw, vh] = viewBox(pts);
  const px = box.clientWidth / vw, u = (p) => p / px;
  const sz = Math.min(1, Math.max(0.55, box.clientWidth / 1000));
  const fmax = P.flows[0][2];
  let g = `<path class="sp-sea" d="${T.sphere}"/>`;
  for (const [iso, d] of Object.entries(D.shapes)) g += `<path class="sp-land${iso === sel ? ' is-sel' : ''}" d="${d}"/>`;
  // 원 — 이 단계의 크기(수출 또는 수입), 넓이가 값에 비례
  const vals = Object.keys(C).map((i) => [i, measure(P, i)]).filter(([i, v]) => v > 0 && C[i].p).sort((a, b) => b[1] - a[1]);
  const vmax = vals[0]?.[1] || 1;
  const rOf = (v) => u(Math.max(2, 24 * Math.sqrt(v / vmax) * sz));
  for (const [i, v] of vals) {
    const [x, y] = C[i].p;
    g += `<circle class="sp-dot${i === sel ? ' is-sel' : ''}" cx="${x}" cy="${y}" r="${rOf(v)}" data-iso="${i}" data-tip="${esc(`${ko(i)}|${st.s === 'use' ? '들여온 액수(자기 신고)' : '이 나라에서 들여왔다고 신고된 액수'} ${usd(v)}`)}"/>`;
  }
  // 흐름 — 굵기는 액수의 제곱근(가장 큰 흐름이 14px)
  g += flows.slice().reverse().map((f) => {
    const [o, a, v] = f;
    const [x0, y0] = C[o].p, [x1, y1] = C[a].p;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const bend = Math.min(0.3, 0.12 + 18 / L);
    const qx = (x0 + x1) / 2 - dy * bend, qy = (y0 + y1) / 2 + dx * bend;
    const wpx = Math.max(1.2, 14 * Math.sqrt(v / fmax)) * sz;
    const ah = u(Math.max(5, wpx * 1.7));
    const tx = x1 - qx, ty = y1 - qy, tl = Math.hypot(tx, ty) || 1;
    const ex = x1 - (tx / tl) * ah, ey = y1 - (ty / tl) * ah, nx = -ty / tl, ny = tx / tl;
    return `<g class="sp-flow" data-tip="${esc(`${ko(o)} → ${ko(a)}|${usd(v)}|${P.ko} · ${ko(a)}가 신고한 수입`)}">
      <path class="sp-hit" d="M${x0},${y0}Q${qx},${qy} ${ex},${ey}" stroke-width="${u(wpx + 10)}"/>
      <path class="sp-line" d="M${x0},${y0}Q${qx},${qy} ${ex},${ey}" stroke-width="${u(wpx)}"/>
      <path class="sp-head" d="M${x1},${y1}L${ex + nx * ah * 0.62},${ey + ny * ah * 0.62}L${ex - nx * ah * 0.62},${ey - ny * ah * 0.62}Z"/></g>`;
  }).join('');
  // 이름 — 큰 원 몇 곳(고른 나라가 있으면 그 나라와 큰 상대)
  const named = sel ? [sel, ...flows.slice(0, 6).map((f) => (st.s === 'use' ? f[0] : f[1]))] : vals.slice(0, 7).map((x) => x[0]);
  const fs = u(12.5), placed = [];
  for (const i of new Set(named)) {
    const p = C[i]?.p;
    if (!p) continue;
    const r = measure(P, i) ? rOf(measure(P, i)) : u(4);
    // 원 위 → 원 아래 → 원 오른쪽 → 원 왼쪽 순서로 빈자리를 찾는다
    const bw = ko(i).length * fs * 0.98;
    const tries = [[p[0], p[1] - r - u(4), 'middle'], [p[0], p[1] + r + fs, 'middle'], [p[0] + r + u(4), p[1] + fs * 0.35, 'start'], [p[0] - r - u(4), p[1] + fs * 0.35, 'end']];
    const box = ([x, y, an]) => { const x0 = an === 'middle' ? x - bw / 2 : an === 'start' ? x : x - bw; return [x0, y - fs, x0 + bw, y + u(2)]; };
    const hit = (bx) => placed.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
    const spot = tries.find((t) => !hit(box(t)));
    if (!spot) continue;
    placed.push(box(spot));
    g += `<text class="sp-lab${i === sel ? ' is-sel' : ''}" x="${spot[0]}" y="${spot[1]}" font-size="${fs}" stroke-width="${u(3)}" text-anchor="${spot[2]}">${esc(ko(i))}</text>`;
  }
  const label = `${P.ko} ${STAGES.find((s) => s.id === st.s).long}${sel ? ` — ${ko(sel)}` : ''} 흐름 지도`;
  box.innerHTML = `<svg class="sp-svg" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="${esc(label)}">${g}</svg>`;
  // 범례의 원 크기는 지금 단계의 값으로
  const ref = [vmax, vmax / 4];
  $('#spKeyDot').innerHTML = `<svg viewBox="0 0 70 34" aria-hidden="true">${ref.map((v, k) => `<circle cx="${k ? 52 : 18}" cy="${34 - 24 * Math.sqrt(v / vmax) * sz * 0.6 - 1}" r="${Math.max(2, 24 * Math.sqrt(v / vmax) * sz * 0.6)}" class="sp-k-dot"/>`).join('')}</svg>
    <span>원 = ${st.s === 'use' ? '들여온 액수' : '이 나라에서 들여왔다고 신고된 액수'}<small>큰 원 ${usd(ref[0])} · 작은 원 ${usd(ref[1])} (지도에서는 넓이 기준)</small></span>`;
  $('#spKeyLine').innerHTML = `<svg viewBox="0 0 40 10" aria-hidden="true"><path d="M2 5H32" class="sp-k-line"/><path d="M38 5L31 1.5V8.5Z" class="sp-k-head"/></svg><span>화살표 = ${esc(P.ko)}의 흐름<small>굵기는 액수의 제곱근 · 가장 굵은 선 ${usd(fmax)}</small></span>`;
  panel(P);
  setParams({ s: st.s === 'parts' ? null : st.s, p: st.s === 'parts' && st.p !== '8542' ? st.p : null, c: st.c });
}

// ── 곁판 ──
function rankOf(P) {
  return Object.keys(C).map((i) => [i, measure(P, i)]).filter(([i, v]) => v > 0 && C[i].p).sort((a, b) => b[1] - a[1]);
}
function panel(P) {
  $$('#spStage .st-segmented__item').forEach((b) => { const on = b.dataset.value === st.s; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  $('#spProd').hidden = st.s !== 'parts';
  $$('#spProd .opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === st.p)));
  const rank = rankOf(P);
  const top3 = rank.slice(0, 3);
  const top3sum = top3.reduce((a, x) => a + x[1], 0);
  const say = $('#spSay');
  if (!st.c) {
    if (st.s === 'use') {
      const hubs = rank.slice(0, 8).filter(([i]) => P.exp[i] && P.imp[i] && P.exp[i] / P.imp[i] >= 0.5);
      say.innerHTML = `<p>${D.year}년에 스마트폰을 가장 많이 들여온 나라는 <b>${esc(top3.map(([i]) => ko(i)).join(' · '))}</b>입니다. 세 나라가 세계 수입액(${usd(P.worldImp)})의 <b>${fmt(pct(top3sum, P.worldImp), 0)}%</b>를 차지합니다.</p>
        ${hubs.length ? `<p>${hubs.map(([i]) => `${esc(ko(i))}는 들여온 액수의 ${fmt(pct(P.exp[i], P.imp[i]), 0)}%`).join(', ')}만큼을 다시 내보냈습니다. 이런 곳은 쓰는 곳이라기보다 거쳐 가는 곳(중계 무역)에 가깝습니다.</p>` : ''}
        <p>원을 눌러 어느 나라에서 사 왔는지 보세요.</p>`;
    } else {
      say.innerHTML = `<p>${D.year}년에 ${EUL[P.code]} 가장 많이 ${st.s === 'parts' ? '판' : '내보낸'} 나라는 <b>${esc(top3.map(([i]) => ko(i)).join(' · '))}</b>입니다. 세 나라에서 나간 것이 세계 수입액(${usd(P.worldImp)})의 <b>${fmt(pct(top3sum, P.worldImp), 0)}%</b>입니다.</p>
        <p>${st.s === 'parts' ? '작고 값비싼 부품은 몇 나라에 모여서 만들어지고, 조립하는 나라로 흩어집니다. 화살표가 어디로 모이는지 보세요.' : '부품이 모이는 곳과 완성품이 떠나는 곳을 견주어 보세요. 「부품」 단계의 화살표 끝과 겹치나요?'}</p>`;
    }
  } else {
    const c = st.c;
    const fl = P.flows.filter((f) => (st.s === 'use' ? f[1] === c : f[0] === c));
    const top = fl.slice(0, 4).map((f) => `${ko(st.s === 'use' ? f[0] : f[1])} ${usd(f[2])}`).join(' · ');
    say.innerHTML = st.s === 'use'
      ? `<p><b>${esc(ko(c))}</b>가 신고한 스마트폰 수입은 <b>${usd(P.imp[c])}</b>입니다.${top ? ` 많이 사 온 곳은 ${esc(top)}입니다.` : ''}</p>
        <p>같은 나라가 신고한 수출은 ${usd(P.exp[c])}입니다.</p>`
      : `<p>다른 나라들이 <b>${esc(ko(c))}</b>에서 들여왔다고 신고한 ${EUN[P.code]} <b>${usd(P.mirror[c])}</b>입니다.${top ? ` 많이 간 곳은 ${esc(top)}입니다.` : ''}</p>
        <p>${esc(ko(c))} 자신이 신고한 수출은 ${usd(P.exp[c])}, 수입은 ${usd(P.imp[c])}입니다. 두 신고가 다른 까닭은 아래 「한계」에 있습니다.</p>`;
  }
  const mx = rank[0]?.[1] || 1;
  $('#spRankH').textContent = st.s === 'use' ? '스마트폰을 많이 들여온 나라' : `${EUL[P.code]} 많이 ${st.s === 'parts' ? '판' : '내보낸'} 나라`;
  $('#spRank').innerHTML = rank.slice(0, 10).map(([i, v], n) => `<li><button type="button" data-pick="${i}" aria-pressed="${i === st.c}">
    <span class="sp-r">${n + 1}</span><span class="sp-n">${esc(ko(i))}</span><span class="sp-bar"><i style="width:${(v / mx) * 100}%"></i></span><span class="sp-v">${usd(v)}</span></button></li>`).join('');
  $('#spBack').hidden = !st.c;
}

// ── 조립국의 부품 출처 ──
function chain() {
  const ch = D.chain, part = D.products[st.cp];
  const rows = ch.assemblers.map((a) => [a, ch.parts[st.cp][a]]).filter(([, r]) => r);
  // 출처 나라마다 같은 색 — 네 조립국을 합친 액수가 큰 순서로 다섯 곳까지
  const agg = {};
  for (const [, r] of rows) for (const [o, v] of r.top) agg[o] = (agg[o] || 0) + v;
  const order = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([o]) => o);
  const col = Object.fromEntries(order.slice(0, 5).map((o, i) => [o, `--s${i + 1}`]));
  const allT = rows.reduce((a, [, r]) => a + r.total, 0);
  const lead = order.slice(0, 2);
  const leadSum = lead.reduce((a, o) => a + (agg[o] || 0), 0);
  $$('#spChainP .opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cp === st.cp)));
  $('#spChainSay').innerHTML = `<p>스마트폰을 가장 많이 내보낸 ${rows.length}곳(${esc(rows.map(([a]) => ko(a)).join(' · '))})이 들여온 ${esc(part.ko)}의 <b>${fmt(pct(leadSum, allT), 0)}%</b>가 ${esc(lead.map(ko).join(' · '))}에서 왔습니다.</p>`;
  $('#spChain').innerHTML = rows.map(([a, r]) => {
    const segs = r.top.slice(0, 3);
    const rest = r.total - segs.reduce((x, s) => x + s[1], 0);
    return `<li><div class="sp-ch-h"><b>${esc(ko(a))}</b><span>들여온 ${esc(part.ko)} ${usd(r.total)}</span></div>
      <div class="sp-ch-bar" role="img" aria-label="${esc(segs.map(([o, v]) => `${ko(o)} ${fmt(pct(v, r.total), 0)}%`).join(', '))}">${segs.map(([o, v]) => `<i style="width:${pct(v, r.total)}%;background:var(${col[o] || '--st-label-4'})" data-tip="${esc(`${ko(o)} → ${ko(a)}|${usd(v)} · ${fmt(pct(v, r.total), 0)}%`)}"></i>`).join('')}<i class="sp-rest" style="width:${pct(rest, r.total)}%"></i></div>
      <p class="sp-ch-k">${segs.map(([o, v]) => `<span><i style="background:var(${col[o] || '--st-label-4'})"></i>${esc(ko(o))} ${fmt(pct(v, r.total), 0)}%</span>`).join('')}<span><i class="sp-rest"></i>그 밖 ${fmt(pct(rest, r.total), 0)}%</span></p>
      ${r.self >= 1e8 ? `<p class="mk-note">자기 나라에서 되들여온 ${usd(r.self)}는 뺐습니다.</p>` : ''}</li>`;
  }).join('');
}

export async function main() {
  await initPage('supply');
  D = await fetch('data/maps/supply/trade.json').then((r) => r.json());
  C = D.countries; W = D.w;
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const Pj = (lon, lat) => {
    const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180, th = Math.asin(M * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
    return [W.w / 2 + ((l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))) * W.s, W.h / 2 - th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) * W.s];
  };
  const edge = [...Array.from({ length: 37 }, (_, i) => Pj(-180, -90 + i * 5)), ...Array.from({ length: 37 }, (_, i) => Pj(180, 90 - i * 5))];
  T = { sphere: 'M' + edge.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z' };
  const parts = ['8542', '8524', '850760'].map((k) => D.products[k]).filter(Boolean);
  const q = params();
  if (STAGES.some((s) => s.id === q.get('s'))) st.s = q.get('s');
  if (D.products[q.get('p')]?.stage === 'parts') st.p = st.cp = q.get('p');
  if (q.get('c') && C[q.get('c')]?.p) st.c = q.get('c');
  const phone = D.products['851713'];
  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--below">
      <div class="sp-top">
        <div class="st-segmented sp-stage" id="spStage" role="tablist" aria-label="단계">
          ${STAGES.map((s) => `<button type="button" class="st-segmented__item" role="tab" data-value="${s.id}">${esc(s.long)}</button>`).join('')}
        </div>
        <div class="mk-tools" id="spProd" role="group" aria-label="부품 고르기">${parts.map((p) => `<button type="button" class="opt" data-p="${p.code}">${esc(p.ko)}</button>`).join('')}</div>
      </div>
      <figure class="mk-map mk-tiphost sp-mapbox"><div id="spMap" class="sp-map"></div>
        <figcaption class="sp-key"><span id="spKeyLine" class="sp-key-i"></span><span id="spKeyDot" class="sp-key-i"></span></figcaption>
      </figure>
      <div class="sp-under">
        <section class="mk-panel" aria-label="지금 지도 읽기">
          <h2>지금 지도에서</h2>
          <div class="mk-why" id="spSay"></div>
          <h2 id="spRankH"></h2>
          <ol class="sp-rank" id="spRank"></ol>
          <p class="mk-note">이름이나 지도의 원을 누르면 그 나라의 흐름만 봅니다.</p>
          <div class="mk-tools"><button type="button" class="opt" id="spBack" hidden>세계 전체로</button><button type="button" class="share-btn" id="spShare">공유</button></div>
        </section>
        <section class="mk-panel mk-tiphost sp-chainbox" aria-label="조립국의 부품 출처">
          <h2>조립하는 나라의 부품은 어디서 왔나</h2>
          <div class="mk-tools" id="spChainP" role="group" aria-label="부품 고르기">${parts.map((p) => `<button type="button" class="opt" data-cp="${p.code}">${esc(p.ko)}</button>`).join('')}</div>
          <div class="mk-why" id="spChainSay"></div>
          <ol class="sp-chain" id="spChain"></ol>
          <p class="mk-note">조립국 = 다른 나라들이 「이 나라에서 스마트폰을 들여왔다」고 신고한 액수가 세계 스마트폰 수입의 5%를 넘는 ${D.chain.assemblers.length}곳(네덜란드처럼 들여와서 다시 나눠 보내는 유통 거점은 몇 %에 그쳐 빠집니다). 막대는 그 나라가 신고한 부품 수입을 원산지별로 나눈 것입니다.</p>
        </section>
      </div>
    </div>
    <section class="mk-panel sp-think">
      <h2>생각해 볼 것</h2>
      <ol class="mk-steps">
        <li>세 단계를 차례로 눌러 보세요. 부품을 많이 판 나라, 완성품을 많이 내보낸 나라, 많이 사 온 나라가 같은가요? 왜 한 나라에서 다 만들지 않을까요?</li>
        <li>「조립하는 나라의 부품은 어디서 왔나」를 보세요. 조립국이 부품을 이웃 나라에서 들여오는 까닭은 무엇일까요? 기술, 임금, 거리를 함께 떠올려 보세요.</li>
        <li>대한민국을 눌러 보세요. 우리나라는 이 사슬의 어느 단계에 강한가요? 한 단계에 몰려 있으면 어떤 점이 좋고, 어떤 점이 위험할까요?</li>
        <li>휴대 전화 한 대 값이 어느 나라에 얼마씩 돌아가는지는 이 지도로 알 수 없습니다. 무엇을 더 알아야 할까요?</li>
      </ol>
    </section>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> UN Comtrade Database(국제연합 통계처 무역 통계, <a href="${D.url}">comtradeplus.un.org</a>) 공개 API, ${D.year}년 연간 자료, ${D.fetched} 받음. 품목: ${Object.values(D.products).map((p) => p.full).join(' · ')}. 나라 경계와 수도 위치는 Natural Earth(공공 저작물).</p>
    <p><b>계산</b> 화살표 A → B는 B 나라가 「A에서 들여왔다」고 신고한 액수입니다(대개 원산지 기준, 운임 · 보험료가 붙은 값). 「판 나라」 · 「내보낸 나라」의 크기는 이런 수입 신고를 나라별로 더한 값이고, 조사한 수출국 후보(수출 신고 상위 15곳과 주요 생산국)만 들어 있습니다. 「사 오는 나라」의 크기는 그 나라가 신고한 수입 총액입니다. ${D.year}년을 쓴 까닭은, 그 뒤의 해에는 베트남 · 대만 같은 주요국의 신고가 아직 실리지 않았기 때문입니다.</p>
    <p><b>한계</b> 같은 거래라도 수출국이 신고한 값과 수입국이 신고한 값이 다릅니다(운임 · 보험료, 신고 시점, 원산지와 마지막 출발지의 차이). 홍콩처럼 들여와서 다시 내보내는 곳(재수출)은 수출 신고만 보면 많이 만드는 곳처럼 보입니다. 유엔 통계에서 대만은 「Other Asia, nes(기타 아시아)」라는 이름으로 실리며, 지도에서는 대만 자리에 두었습니다. 반도체 칩 · 디스플레이 · 배터리는 스마트폰에만 쓰이지 않으므로(자동차 · 컴퓨터 · 가전), 이 흐름이 모두 스마트폰 부품은 아닙니다. 금액은 달러 기준이고 물가는 고치지 않았습니다. 백만 달러보다 작은 흐름은 뺐습니다. 수입을 신고하지 않은 나라로 간 흐름은 빠져 있습니다. 이 자료는 무역액이지 이익이 어디로 가는지(설계 · 상표 · 특허)를 보여 주지 않습니다.</p>`;
  const style = document.createElement('style');
  style.textContent = `
    .sp-top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
    .sp-stage { display: flex; flex-wrap: wrap; max-width: 100%; }
    @media (max-width: 600px) { .sp-stage { width: 100%; } .sp-stage .st-segmented__item { flex: 1; padding-inline: 6px; white-space: normal; font-size: 12px; } }
    .sp-mapbox { padding: 0; min-height: 0; }
    .sp-map { width: 100%; aspect-ratio: 2.4 / 1; }
    @media (max-width: 700px) { .sp-map { aspect-ratio: 1.3 / 1; } }
    .sp-svg { display: block; width: 100%; height: 100%; }
    .sp-sea { fill: var(--map-sea); }
    .sp-land { fill: var(--map-land); stroke: var(--st-surface); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
    .sp-land.is-sel { fill: var(--st-label-4); }
    .sp-dot { fill: var(--kr-s4); fill-opacity: 0.55; stroke: var(--kr-s5); stroke-width: 1; vector-effect: non-scaling-stroke; cursor: pointer; }
    .sp-dot:hover, .sp-dot.is-sel { fill-opacity: 0.8; stroke: var(--st-label); stroke-width: 1.6; }
    .sp-flow .sp-line { fill: none; stroke: var(--s2); stroke-opacity: 0.9; }
    .sp-flow .sp-head { fill: var(--s2); }
    .sp-flow .sp-hit { fill: none; stroke: transparent; pointer-events: stroke; }
    .sp-lab { fill: var(--st-label); stroke: var(--st-bedrock); paint-order: stroke; font-weight: 600; pointer-events: none; }
    .sp-lab.is-sel { font-weight: 700; }
    .sp-key { display: flex; flex-wrap: wrap; gap: 8px 28px; padding: 10px 14px 12px; font-size: 12px; color: var(--st-label-2); letter-spacing: var(--track-ko); }
    .sp-key-i { display: inline-flex; align-items: center; gap: 9px; }
    .sp-key-i span { display: grid; gap: 1px; } .sp-key-i small { font-size: 11px; color: var(--st-label-3); font-variant-numeric: tabular-nums; }
    #spKeyLine svg { width: 40px; height: 10px; flex-shrink: 0; } #spKeyDot svg { width: 70px; height: 34px; flex-shrink: 0; }
    .sp-k-line { stroke: var(--s2); stroke-width: 3; } .sp-k-head { fill: var(--s2); }
    .sp-k-dot { fill: var(--kr-s4); fill-opacity: 0.55; stroke: var(--kr-s5); }
    .sp-under { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); align-items: start; }
    @media (max-width: 900px) { .sp-under { grid-template-columns: 1fr; } }
    .sp-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
    .sp-rank button { width: 100%; display: grid; grid-template-columns: 18px minmax(0, 6.5em) 1fr 92px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--st-r-inner); text-align: left; font-variant-numeric: tabular-nums; }
    .sp-rank button:hover, .sp-rank button:focus-visible, .sp-rank button[aria-pressed="true"] { background: var(--st-fill-2); }
    .sp-r { font-size: 11.5px; color: var(--st-label-3); text-align: right; }
    .sp-n { font-size: 13px; font-weight: 600; color: var(--st-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sp-bar { height: 10px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .sp-bar i { display: block; height: 100%; background: var(--kr-s3); border-radius: 0 4px 4px 0; }
    .sp-v { font-size: 12px; color: var(--st-label); text-align: right; }
    .sp-chain { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
    .sp-ch-h { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; margin-bottom: 6px; }
    .sp-ch-h b { font-size: 13.5px; color: var(--st-label); } .sp-ch-h span { font-size: 12px; color: var(--st-label-3); font-variant-numeric: tabular-nums; }
    .sp-ch-bar { display: flex; gap: 2px; height: 16px; border-radius: 4px; overflow: hidden; }
    .sp-ch-bar i { display: block; height: 100%; }
    .sp-rest { background: var(--st-fill); }
    .sp-ch-k { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 12px; color: var(--st-label-2); font-variant-numeric: tabular-nums; }
    .sp-ch-k span { display: inline-flex; align-items: center; gap: 6px; }
    .sp-ch-k i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .sp-think { margin-top: 16px; }
  `;
  document.head.append(style);
  const body = $('#mkBody');
  const tip = tips(body);
  body.addEventListener('click', (e) => {
    const fl = e.target.closest('.sp-flow, .sp-ch-bar i[data-tip]');
    if (fl) { tip.show(e, fl.dataset.tip.split('|'), fl.closest('.mk-tiphost')); return; }
    const dot = e.target.closest('.sp-dot, [data-pick]');
    if (dot) { const i = dot.dataset.iso || dot.dataset.pick; st.c = st.c === i ? null : i; draw(); return; }
    const p = e.target.closest('#spProd [data-p]');
    if (p) { st.p = p.dataset.p; st.cp = st.p; chain(); draw(); return; }
    const cp = e.target.closest('#spChainP [data-cp]');
    if (cp) { st.cp = cp.dataset.cp; chain(); }
  });
  $('#spBack').addEventListener('click', () => { st.c = null; draw(); });
  const seg = $('#spStage');
  $$('.st-segmented__item', seg).forEach((b) => b.classList.toggle('is-on', b.dataset.value === st.s));
  const onStage = (v) => { if (v === st.s) return; st.s = v; if (st.c && !measure(prod(), st.c)) st.c = null; draw(); };
  if (window.Stratum?.segmented) window.Stratum.segmented(seg, onStage);
  else seg.addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b) onStage(b.dataset.value); });
  shareButton($('#spShare'), () => location.href, () => `${prod().ko} · ${STAGES.find((s) => s.id === st.s).long}${st.c ? ` · ${ko(st.c)}` : ''}`);
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  chain();
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
