// 기후 그래프 그리기 — SVG 문자열을 돌려준다. 색은 CSS 변수(--clim-temp · --clim-rain · --s1~s6)가 정하고,
// 마우스를 올렸을 때 보여 줄 값은 data-tip 에 적어 둔다(climate.mjs 가 읽어 말풍선으로 띄움).
//
// 카드의 기후 그래프만 축이 둘이다(왼쪽 기온 · 오른쪽 강수량). 시험과 교과서가 쓰는 꼴이라 학생이 읽을 줄 알아야
// 하므로 일부러 남겼다. 고른 곳끼리는 같은 눈금을 써서 그래프 모양을 바로 견줄 수 있게 한다.
// 비교 그래프는 축이 하나씩(기온 따로, 강수량 따로)이다.
import { shiftHalfYear } from './climate-koppen.mjs?v=d1b47990';

const W = 560, H = 300;
const M = { l: 44, r: 52, t: 18, b: 30 };
const PW = W - M.l - M.r, PH = H - M.t - M.b;
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => r1(v).toLocaleString('ko-KR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const niceStep = (raw) => {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

export const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
// 남반구 맞춤을 켰을 때 남반구 자료는 7월부터 시작한다
export function view(st, south) {
  const flip = south && st.lat < 0;
  const f = (a) => (a ? (flip ? shiftHalfYear(a) : a.slice()) : undefined);
  const order = flip ? [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return { t: f(st.t), p: f(st.p), tx: f(st.tx), tn: f(st.tn), order, flip };
}

/** 고른 곳 모두에 같은 눈금 */
export function sharedScale(list) {
  const temps = list.flatMap((s) => [...s.t, ...(s.tx || []), ...(s.tn || [])]);
  const lo = Math.min(-10, Math.floor((Math.min(...temps) - 1) / 10) * 10);
  const hi = Math.max(30, Math.ceil((Math.max(...temps) + 1) / 10) * 10);
  const n = (hi - lo) / 10;
  const pmax = Math.max(100, ...list.flatMap((s) => s.p));
  const pstep = niceStep(pmax / n);
  return { lo, hi, n, pstep, ptop: pstep * n };
}

const yT = (v, s) => M.t + PH - ((v - s.lo) / (s.hi - s.lo)) * PH;
const yP = (v, s) => M.t + PH - (v / s.ptop) * PH;
const xM = (i) => M.l + (i + 0.5) * (PW / 12);

/** 카드 하나의 기후 그래프(기온 선 + 최고·최저 띠 + 강수 막대) */
export function climograph(st, s, { south = false, hidden = false } = {}) {
  const v = view(st, south);
  const bw = Math.min(24, PW / 12 - 8);
  let g = '';
  // 눈금선 — 기온 10℃마다. 강수 눈금은 같은 높이에 맞춰 오른쪽에
  for (let k = 0; k <= s.n; k++) {
    const y = M.t + PH - (k / s.n) * PH;
    const tv = s.lo + k * 10;
    g += `<line class="cg-grid${tv === 0 ? ' cg-zero' : ''}" x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}"/>`;
    g += `<text class="cg-tick" x="${M.l - 8}" y="${y + 4}" text-anchor="end">${tv}</text>`;
    g += `<text class="cg-tick" x="${W - M.r + 8}" y="${y + 4}">${fmt(k * s.pstep)}</text>`;
  }
  g += `<text class="cg-unit" x="${M.l - 8}" y="${M.t - 6}" text-anchor="end">℃</text>`;
  g += `<text class="cg-unit" x="${W - M.r + 8}" y="${M.t - 6}">mm</text>`;
  // 강수 막대 — 아래는 각지고 위만 둥글게(4px)
  v.p.forEach((p, i) => {
    const x = xM(i) - bw / 2, y = yP(p, s), h = M.t + PH - y;
    if (h <= 0) return;
    const r = Math.min(4, h, bw / 2);
    g += `<path class="cg-rain" d="M${x},${M.t + PH}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${M.t + PH}Z"/>`;
  });
  // 최고·최저 기온 띠(있는 관측소만)
  if (v.tx && v.tn) {
    const up = v.tx.map((t, i) => `${xM(i)},${yT(t, s)}`).join('L');
    const dn = v.tn.map((t, i) => `${xM(i)},${yT(t, s)}`).reverse().join('L');
    g += `<path class="cg-band" d="M${up}L${dn}Z"/>`;
  }
  g += `<path class="cg-temp" d="M${v.t.map((t, i) => `${xM(i)},${yT(t, s)}`).join('L')}"/>`;
  v.t.forEach((t, i) => (g += `<circle class="cg-dot" cx="${xM(i)}" cy="${yT(t, s)}" r="4"/>`));
  // 달 이름과 마우스 영역
  v.order.forEach((m, i) => {
    g += `<text class="cg-month" x="${xM(i)}" y="${H - 10}" text-anchor="middle">${m + 1}</text>`;
    const tip = `${MONTHS[m]}|기온 ${fmt(v.t[i])}℃${v.tx ? ` (최고 ${fmt(v.tx[i])} · 최저 ${fmt(v.tn[i])})` : ''}|강수량 ${fmt(v.p[i])}mm`;
    g += `<rect class="cg-hit" x="${M.l + i * (PW / 12)}" y="${M.t}" width="${PW / 12}" height="${PH}" data-tip="${esc(tip)}" data-i="${i}"/>`;
  });
  const label = hidden ? '이름을 가린 곳의 기후 그래프' : `${st.name}의 월평균 기온과 월강수량`;
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}${v.flip ? `<text class="cg-flag" x="${W - M.r}" y="${M.t + 12}" text-anchor="end">7월부터</text>` : ''}</svg>`;
}

// 비교 그래프 표식 — 색에만 기대지 않도록 곳마다 모양도 다르게
const SHAPES = [
  (x, y) => `<circle cx="${x}" cy="${y}" r="4.2"/>`,
  (x, y) => `<rect x="${x - 3.8}" y="${y - 3.8}" width="7.6" height="7.6" rx="1"/>`,
  (x, y) => `<path d="M${x},${y - 5}L${x + 4.6},${y + 3.4}H${x - 4.6}Z"/>`,
  (x, y) => `<path d="M${x},${y - 5}L${x + 5},${y}L${x},${y + 5}L${x - 5},${y}Z"/>`,
  (x, y) => `<path d="M${x - 4.6},${y - 1.5}H${x - 1.5}V${y - 4.6}H${x + 1.5}V${y - 1.5}H${x + 4.6}V${y + 1.5}H${x + 1.5}V${y + 4.6}H${x - 1.5}V${y + 1.5}H${x - 4.6}Z"/>`,
  (x, y) => `<path d="M${x},${y + 5}L${x + 4.6},${y - 3.4}H${x - 4.6}Z"/>`,
];
export const marker = (i, x, y) => SHAPES[i % SHAPES.length](x, y);
export const legendMark = (i) => `<svg class="cmp-key s${i + 1}" viewBox="0 0 22 12" aria-hidden="true"><line x1="1" x2="21" y1="6" y2="6"/>${marker(i, 11, 6)}</svg>`;

/** 고른 곳을 한 축에 겹친 선그래프. key: 't' 기온 | 'p' 강수량 */
export function compareLines(list, key, { south = false, cumulative = false, names, slots = list.map((_, i) => i) } = {}) {
  const series = list.map((st) => {
    const v = view(st, south)[key];
    if (!cumulative) return v;
    let acc = 0;
    return v.map((x) => (acc += x));
  });
  const all = series.flat();
  let lo, hi, step;
  if (key === 't') {
    lo = Math.min(-10, Math.floor((Math.min(...all) - 1) / 10) * 10);
    hi = Math.max(30, Math.ceil((Math.max(...all) + 1) / 10) * 10);
    step = 10;
  } else {
    lo = 0;
    step = niceStep(Math.max(...all, 50) / 5);
    hi = Math.ceil(Math.max(...all, 50) / step) * step;
  }
  const y = (v) => M.t + PH - ((v - lo) / (hi - lo)) * PH;
  const R = 22; // 비교 그래프는 오른쪽 축이 없다
  const pw = W - M.l - R;
  const x = (i) => M.l + (i + 0.5) * (pw / 12);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    g += `<line class="cg-grid${v === 0 && key === 't' ? ' cg-zero' : ''}" x1="${M.l}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="cg-tick" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  g += `<text class="cg-unit" x="${M.l - 8}" y="${M.t - 6}" text-anchor="end">${key === 't' ? '℃' : 'mm'}</text>`;
  series.forEach((sr, k) => {
    g += `<g class="cmp s${slots[k] + 1}"><path class="cmp-line" d="M${sr.map((v, i) => `${x(i)},${y(v)}`).join('L')}"/>`;
    g += sr.map((v, i) => marker(slots[k], x(i), y(v))).join('') + '</g>';
  });
  const southAny = south && list.some((s) => s.lat < 0);
  for (let i = 0; i < 12; i++) {
    g += `<text class="cg-month" x="${x(i)}" y="${H - 10}" text-anchor="middle">${southAny ? `${i + 1}·${((i + 6) % 12) + 1}` : i + 1}</text>`;
    const unit = key === 't' ? '℃' : 'mm';
    const rows = series.map((sr, k) => `${names[k]} ${fmt(sr[i])}${unit}`).join('|');
    g += `<rect class="cg-hit" x="${M.l + i * (pw / 12)}" y="${M.t}" width="${pw / 12}" height="${PH}" data-tip="${esc(`${southAny ? `북 ${i + 1}월 · 남 ${((i + 6) % 12) + 1}월` : MONTHS[i]}|${rows}`)}" data-i="${i}"/>`;
  }
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${key === 't' ? '월평균 기온 비교' : cumulative ? '누적 강수량 비교' : '월강수량 비교'}">${g}</svg>`;
}

/** 기온–강수 순환 그래프: 가로 강수량, 세로 기온. 열두 달을 이으면 기후마다 고유한 고리 모양이 된다 */
export function hythergraph(list, { names, slots = list.map((_, i) => i) } = {}) {
  const S = 360, m = { l: 44, r: 18, t: 18, b: 38 };
  const pw = S * 1.4 - m.l - m.r, ph = S - m.t - m.b;
  const temps = list.flatMap((s) => s.t);
  const lo = Math.min(-10, Math.floor((Math.min(...temps) - 1) / 10) * 10);
  const hi = Math.max(30, Math.ceil((Math.max(...temps) + 1) / 10) * 10);
  const pmax = Math.max(100, ...list.flatMap((s) => s.p));
  const pstep = niceStep(pmax / 5), ptop = Math.ceil(pmax / pstep) * pstep;
  const x = (p) => m.l + (p / ptop) * pw;
  const y = (t) => m.t + ph - ((t - lo) / (hi - lo)) * ph;
  let g = '';
  for (let t = lo; t <= hi; t += 10) {
    g += `<line class="cg-grid${t === 0 ? ' cg-zero' : ''}" x1="${m.l}" x2="${m.l + pw}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="cg-tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
  }
  for (let p = 0; p <= ptop + 1e-9; p += pstep) g += `<text class="cg-tick" x="${x(p)}" y="${m.t + ph + 18}" text-anchor="middle">${fmt(p)}</text>`;
  g += `<text class="cg-unit" x="${m.l - 8}" y="${m.t - 6}" text-anchor="end">℃</text>`;
  g += `<text class="cg-unit" x="${m.l + pw}" y="${m.t + ph + 32}" text-anchor="end">월강수량 mm</text>`;
  list.forEach((st, k) => {
    const pts = st.t.map((t, i) => [x(st.p[i]), y(t)]);
    g += `<g class="cmp s${slots[k] + 1}"><path class="cmp-line" d="M${pts.map((q) => q.join(',')).join('L')}Z"/>`;
    g += pts.map(([a, b]) => marker(slots[k], a, b)).join('');
    // 1월과 7월만 이름표 — 고리가 어느 쪽으로 도는지 보이게
    for (const i of [0, 6]) g += `<text class="hy-month" x="${pts[i][0] + 7}" y="${pts[i][1] - 6}">${i + 1}월</text>`;
    g += '</g>';
    st.t.forEach((t, i) => (g += `<circle class="cg-hitdot" cx="${pts[i][0]}" cy="${pts[i][1]}" r="10" data-tip="${esc(`${names[k]} ${MONTHS[i]}|기온 ${fmt(t)}℃|강수량 ${fmt(st.p[i])}mm`)}"/>`));
  });
  return `<svg class="cg hy" viewBox="0 0 ${S * 1.4} ${S}" role="img" aria-label="기온과 강수량의 열두 달 고리">${g}</svg>`;
}
