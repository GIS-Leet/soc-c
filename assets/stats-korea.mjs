// 통계(stats.html)의 「우리나라 시·도」 — 국가데이터처 KOSIS 시·도 통계를 지도 · 순위 막대 · 표로 본다.
// 자료: data/stats/korea.json (scripts/build-korea-stats.mjs). 고른 지표와 강조한 시·도는 주소(?scope=kr&k=…&u=…)에 담긴다.
// 색: 크기는 파랑 한 가지의 밝기(낮음→높음), 늘고 줆처럼 기준이 있는 지표는 주황(기준보다 작음)과 파랑(큼), 기준 근처는 회색.
import { openShare } from './share-link.mjs?v=53919a56';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let K = null;
const st = { k: 'tfr', u: null };
const SEQ = ['--kr-s1', '--kr-s2', '--kr-s3', '--kr-s4', '--kr-s5'];
const DIV_NEG = ['--kr-n2', '--kr-n1'], DIV_POS = ['--kr-p1', '--kr-p2'];

const num = (v, d) => {
  if (v == null) return '—';
  if (d.unit === '명' && Math.abs(v) >= 1e4) return (v / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 1e6 ? 0 : 1 }) + '만';
  return v.toLocaleString('ko-KR', { minimumFractionDigits: Math.min(d.dp, 1), maximumFractionDigits: d.dp });
};
const withUnit = (v, d) => (v == null ? '—' : num(v, d) + (d.unit === '%' ? '%' : d.unit ? ' ' + d.unit : ''));

// 지표 하나의 줄들 — 광주 · 전남이 비고 통합특별시 값만 있으면 통합특별시 한 줄로
function rows(d) {
  const mergedOnly = d.merged != null && d.values['24'] == null && d.values['36'] == null;
  const list = K.units.filter((u) => !(mergedOnly && K.merged.codes.includes(u.code))).map((u) => ({ code: u.code, name: u.name, short: u.short, v: d.values[u.code] }));
  if (mergedOnly) list.push({ code: 'M', name: K.merged.name, short: '전남광주', v: d.merged });
  return { list: list.filter((r) => r.v != null), mergedOnly };
}
// 색 나누기 — 크기 지표는 다섯 칸(사분위 비슷하게 순위로), 기준이 있는 지표는 기준 위아래 두 칸씩
function classes(d, list) {
  const vals = list.map((r) => r.v).sort((a, b) => a - b);
  if (d.diverging) {
    const mid = d.mid ?? 0;
    const span = Math.max(...vals.map((v) => Math.abs(v - mid))) || 1;
    const of = (v) => {
      const t = (v - mid) / span;
      if (Math.abs(t) < 0.12) return '--kr-mid';
      return t < 0 ? DIV_NEG[t < -0.55 ? 0 : 1] : DIV_POS[t > 0.55 ? 1 : 0];
    };
    return { of, legend: [[DIV_NEG[0], `${num(mid - span, d)} 쪽`], [DIV_NEG[1], ''], ['--kr-mid', `${num(mid, d)} 근처`], [DIV_POS[0], ''], [DIV_POS[1], `${num(mid + span, d)} 쪽`]] };
  }
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const br = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const of = (v) => SEQ[br.filter((b) => v >= b).length];
  const lo = [vals[0], ...br], hi = [...br, vals[vals.length - 1]];
  return { of, legend: SEQ.map((c, i) => [c, i === 0 ? `${num(lo[0], d)}` : i === 4 ? `${num(hi[4], d)}` : '']) };
}

function head(d, list) {
  const sorted = list.slice().sort((a, b) => b.v - a.v);
  const top = sorted[0], bot = sorted[sorted.length - 1];
  return `<div class="wd-head">
      <div class="wd-title"><p class="wd-topic">${esc(K.topics.find((t) => t.id === d.topic).name)} · ${esc(d.year)}</p><h2>${esc(d.name)}</h2></div>
      <dl class="wd-figs">
        <div class="wd-kor"><dt>전국</dt><dd>${d.nation != null ? withUnit(d.nation, d) : '—'}</dd></div>
        <div><dt>가장 높은 곳</dt><dd>${esc(top.short)} ${num(top.v, d)}</dd></div>
        <div><dt>가장 낮은 곳</dt><dd>${esc(bot.short)} ${num(bot.v, d)}</dd></div>
      </dl>
    </div>
    <div class="wd-text"><p class="wd-def">${esc(d.def)}${d.calc ? ` <span class="kr-calc">계산: ${esc(d.calc)}</span>` : ''}</p><p class="wd-read"><span>생각할 것</span>${esc(d.read)}</p></div>`;
}

function mapSvg(d, list, C) {
  const byCode = Object.fromEntries(list.map((r) => [r.code, r]));
  let g = '';
  for (const [code, s] of Object.entries(K.map.shapes)) {
    const r = byCode[code] || (byCode.M && K.merged.codes.includes(code) ? byCode.M : null);
    const key = r ? r.code : code;
    const fill = r ? `var(${C.of(r.v)})` : 'var(--st-fill-2)';
    const sel = st.u && (st.u === key) ? ' is-sel' : '';
    const tip = r ? `${r.name}|${withUnit(r.v, d)}` : `${K.units.find((u) => u.code === code)?.name || ''}|자료 없음`;
    g += `<path class="kr-shape${sel}" d="${s.d}" style="fill:${fill}" data-code="${key}" data-tip="${esc(tip)}"/>`;
  }
  // 이름표 — 경기는 가운데에 서울이 있어 아래로 비켜 놓는다
  const NUDGE = { 31: [8, 30], 23: [-8, 4], 11: [2, -2] };
  for (const u of K.units) {
    const s = K.map.shapes[u.code];
    if (!s) continue;
    const [ox, oy] = NUDGE[u.code] || [0, 0];
    g += `<text class="kr-lab" x="${s.cx + ox}" y="${s.cy + oy}" text-anchor="middle">${esc(u.short)}</text>`;
  }
  const [dx, dy] = K.map.dokdo;
  g += `<g class="kr-dokdo"><circle cx="${dx}" cy="${dy}" r="2.2"/><text x="${dx}" y="${dy - 7}" text-anchor="middle">독도</text></g>`;
  return `<svg class="kr-map" viewBox="0 0 ${K.map.w} ${K.map.h}" role="img" aria-label="${esc(d.name)} 시·도 지도">${g}</svg>`;
}

function barsHtml(d, list, C) {
  const sorted = list.slice().sort((a, b) => b.v - a.v);
  const vals = sorted.map((r) => r.v);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const log = d.log && lo >= 0;
  const L0 = log ? Math.floor(Math.log10(Math.min(...vals.filter((v) => v > 0)))) : 0;
  const L1 = log ? Math.ceil(Math.log10(hi)) : 0;
  const x = (v) => (log ? ((Math.log10(Math.max(v, 10 ** L0)) - L0) / (L1 - L0 || 1)) * 100 : ((v - lo) / (hi - lo || 1)) * 100);
  const zero = log ? 0 : x(0);
  const nat = d.nation != null ? x(d.nation) : null;
  return `<ol class="kr-bars" aria-label="${esc(d.name)} 높은 순">${sorted.map((r, i) => {
    const a = Math.min(zero, x(r.v)), w = Math.max(0.6, Math.abs(x(r.v) - zero));
    return `<li class="${st.u === r.code ? 'is-sel' : ''}" data-code="${r.code}" data-tip="${esc(`${r.name}|${withUnit(r.v, d)}|높은 순 ${i + 1}위`)}">
      <span class="kr-bars__n">${esc(r.short)}</span>
      <span class="kr-bars__t"><i style="left:${a}%;width:${w}%;background:var(${C.of(r.v)})"></i>${nat != null ? `<b style="left:${nat}%"></b>` : ''}</span>
      <span class="kr-bars__v">${num(r.v, d)}</span></li>`;
  }).join('')}</ol>
  <p class="wd-cap">${nat != null ? '세로선은 전국 값 · ' : ''}${log ? '로그 눈금(한 칸마다 10배) · ' : ''}단위: ${esc(d.unit || '—')}</p>`;
}

function tableHtml(d, list) {
  const sorted = list.slice().sort((a, b) => b.v - a.v);
  return `<details class="kr-tablebox"><summary>표로 보기 · ${list.length}곳</summary><div class="wd-tablewrap"><table class="dtable wd-table">
    <thead><tr><th scope="col">순위</th><th scope="col">시·도</th><th scope="col">${esc(d.name)}${d.unit ? ` (${esc(d.unit)})` : ''}</th></tr></thead>
    <tbody>${d.nation != null ? `<tr class="wd-agg"><td></td><td>전국</td><td>${num(d.nation, d)}</td></tr>` : ''}${sorted.map((r, i) => `<tr class="${st.u === r.code ? 'is-hl s1' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${num(r.v, d)}</td></tr>`).join('')}</tbody>
  </table></div></details>`;
}

function draw() {
  const d = K.indicators.find((x) => x.id === st.k) || K.indicators[0];
  st.k = d.id;
  $('#krTopics').innerHTML = K.topics.map((t) => `<button type="button" class="wd-topicbtn${t.id === d.topic ? ' is-on' : ''}" data-ktopic="${t.id}" aria-pressed="${t.id === d.topic}">${esc(t.name)}</button>`).join('');
  $('#krList').innerHTML = K.indicators.filter((x) => x.topic === d.topic).map((x) => {
    const { list } = rows(x);
    return `<li><button type="button" class="wd-ind${x.id === d.id ? ' is-on' : ''}" data-k="${x.id}" aria-current="${x.id === d.id}">
      <span class="wd-ind__n">${esc(x.name)}</span><span class="wd-ind__v"><b>${x.nation != null ? withUnit(x.nation, x) : `${list.length}곳`}</b><small>${esc(x.year)}</small></span></button></li>`;
  }).join('');
  const { list, mergedOnly } = rows(d);
  const C = classes(d, list);
  $('#krHead').innerHTML = head(d, list);
  $('#krBody').innerHTML = `<figure class="cg-wrap kr-mapbox">${mapSvg(d, list, C)}
      <figcaption class="kr-legend">${C.legend.map(([c, t]) => `<span><i style="background:var(${c})"></i>${esc(t)}</span>`).join('')}</figcaption></figure>
    <div class="cg-wrap kr-barbox">${barsHtml(d, list, C)}</div>`;
  $('#krNote').textContent = mergedOnly
    ? `${K.merged.name}(2026년 7월 출범)의 값입니다. 광주와 전남을 함께 칠했습니다.`
    : (d.year < '2026' ? '광주와 전남은 통합(2026년 7월) 전 값이라 따로 보여 줍니다.' : '');
  $('#krTable').innerHTML = tableHtml(d, list);
  $('#krSrc').textContent = `KOSIS 통계표 ${d.src.join(' · ')}`;
  toUrl();
}

function toUrl() {
  const q = new URLSearchParams(location.search);
  for (const k of [...q.keys()]) q.delete(k);
  q.set('scope', 'kr');
  q.set('k', st.k);
  if (st.u) q.set('u', st.u);
  const url = location.pathname.split('/').pop() + '?' + q.toString();
  try { history.replaceState(null, '', url); } catch {}
  return new URL(url, location.href).href;
}

const tip = {
  el: null,
  show(e, lines, host) {
    if (!this.el || this.el.parentNode !== host) { this.el?.remove(); this.el = document.createElement('div'); this.el.className = 'clim-tip'; host.append(this.el); }
    this.el.innerHTML = lines.map((l, i) => (i ? `<span>${esc(l)}</span>` : `<b>${esc(l)}</b>`)).join('');
    const r = host.getBoundingClientRect();
    this.el.style.display = 'grid';
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + this.el.offsetWidth > r.width - 4) x = e.clientX - r.left - this.el.offsetWidth - 14;
    if (y + this.el.offsetHeight > r.height - 4) y = e.clientY - r.top - this.el.offsetHeight - 14;
    this.el.style.transform = `translate(${Math.max(4, x)}px,${Math.max(4, y)}px)`;
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};

function rowsForCopy() {
  const d = K.indicators.find((x) => x.id === st.k);
  const { list } = rows(d);
  const out = [['시·도', `${d.name}${d.unit ? ` (${d.unit})` : ''}`, '시점']];
  if (d.nation != null) out.push(['전국', d.nation, d.year]);
  for (const r of list.slice().sort((a, b) => b.v - a.v)) out.push([r.name, r.v, d.year]);
  out.push([]);
  out.push([`출처: 국가데이터처 국가통계포털(KOSIS) ${d.src.join(', ')}${d.calc ? ` · 계산: ${d.calc}` : ''} · 정리 Leet's Geographia`]);
  return out;
}

export async function initKorea(say) {
  if (K) { draw(); return; }
  K = await fetch('data/stats/korea.json').then((r) => r.json());
  const q = new URLSearchParams(location.search);
  if (K.indicators.some((x) => x.id === q.get('k'))) st.k = q.get('k');
  if (q.get('u')) st.u = q.get('u');
  const host = $('#krView');
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ktopic]');
    if (t) { st.k = K.indicators.find((x) => x.topic === t.dataset.ktopic).id; draw(); return; }
    const b = e.target.closest('[data-k]');
    if (b) { st.k = b.dataset.k; draw(); return; }
    const c = e.target.closest('[data-code]');
    if (c) { st.u = st.u === c.dataset.code ? null : c.dataset.code; draw(); }
  });
  host.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    host.querySelectorAll('.is-hover').forEach((n) => n.classList.remove('is-hover'));
    if (!t) return tip.hide();
    host.querySelectorAll(`[data-code="${t.dataset.code}"]`).forEach((n) => n.classList.add('is-hover'));
    tip.show(e, t.dataset.tip.split('|'), t.closest('.cg-wrap'));
  });
  host.addEventListener('pointerleave', () => tip.hide());
  $('#krShare').addEventListener('click', () => {
    const d = K.indicators.find((x) => x.id === st.k);
    openShare(toUrl(), `우리나라 시·도 · ${d.name}${st.u ? ` · 강조: ${(K.units.find((u) => u.code === st.u) || { name: K.merged.name }).name}` : ''}`);
  });
  $('#krCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(rowsForCopy().map((r) => r.join('\t')).join('\n')); say('표를 복사했습니다. 엑셀이나 한글 표에 붙여 넣으세요.'); }
    catch { say('복사하지 못했습니다. CSV로 받아 주세요.'); }
  });
  $('#krCsv').addEventListener('click', () => {
    const csv = rowsForCopy().map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${K.indicators.find((x) => x.id === st.k).name}_시도_KOSIS.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('CSV 파일을 내려받았습니다.');
  });
  $('#krBuilt').textContent = K.meta.built;
  draw();
}
export const krUrl = () => toUrl();
