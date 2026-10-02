// 통합사회 개념 카드의 긴 글(a 핵심 정리 · x 더 깊이 · d 자세한 설명)을 읽기 좋게 그린다 — 데이터는 그대로 두고 화면에서만 구조를 만든다.
// 1) 문장마다 한 줄   2) 핵심 용어(k)는 처음 나올 때 형광펜, 학자(연도)·『저작』은 굵게 — 외울 것
// 3) 문장 머리말로 꼬리표: 첫째·둘째… / 단서(그러나·다만) / 대비(반면·한편) / 논쟁(반박·비판…)
// 4) d 는 세 문단에 「교과서 · 심화 · 연결」 제목을 달고, 끝의 「포인트: …」는 따로 떼어 눈에 띄는 상자로
// study.html · desk.html 이 함께 쓴다. grammar-format.mjs 와 같은 방식이지만 서로 의존하지 않는다(자산 스탬프를 단순하게).

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 괄호·낫표 바깥의 마침표에서만 자른다. 영문 머리글자(C. W. Mills) 뒤에서는 자르지 않는다. */
export function sentences(text) {
  const t = String(text || '').trim(), out = []; let depth = 0, start = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if ('(（『「'.includes(ch)) depth++;
    else if (')）』」'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === '.' && /\s/.test(t[i + 1] || '') && !/(^|[^A-Za-z])[A-Z]$/.test(t.slice(Math.max(0, i - 2), i))) {
      out.push(t.slice(start, i + 1).trim()); start = i + 2; i = start - 1;
    }
  }
  const rest = t.slice(start).trim(); if (rest) out.push(rest);
  return out.filter(Boolean);
}

const ORDINAL = /^(첫째|둘째|셋째|넷째|다섯째)[,는]?\s*/;
export function classify(s) {
  const o = ORDINAL.exec(s); if (o) return { kind: 'ord', tag: o[1], body: s.slice(o[0].length) };
  if (/^(그러나|다만|하지만)[ ,]/.test(s)) return { kind: 'but', tag: '단서', body: s };
  if (/^(반면|한편|반대로)[ ,]/.test(s)) return { kind: 'vs', tag: '대비', body: s };
  if (/논쟁|반박|비판|반론|맞서|엇갈/.test(s)) return { kind: 'debate', tag: '논쟁', body: s };
  return { kind: 'plain', tag: '', body: s };
}

// 문장 안쪽: 핵심 용어(처음 한 번) 형광펜, 『저작』·학자(연도) 굵게
function inline(s, terms, seen) {
  let html = esc(s);
  for (const term of terms) {
    if (seen.has(term)) continue;
    const at = html.indexOf(esc(term)); if (at < 0) continue;
    seen.add(term);
    html = html.slice(0, at) + `<mark class="cf-term">${esc(term)}</mark>` + html.slice(at + esc(term).length);
  }
  return html.replace(/『[^『』]{1,60}』/g, m => `<b class="cf-book">${m}</b>`)
    .replace(/([가-힣A-Za-z]+(?:·[가-힣A-Za-z]+)*(?: 등| 외)?)\((\d{4}[^()<>]{0,16})\)/g, (m, who, year) => /^(mark|b|span)$/.test(who) ? m : `<b class="cf-ref">${who}(${year})</b>`);
}

const row = (c, html) => `<p class="cf-row cf-${c.kind}">` + (c.tag ? `<span class="cf-tag">${esc(c.tag)}</span>` : '') + html + `</p>`;

/** 한 문단 글 → 문장별 줄. terms: 형광펜을 칠할 핵심 용어, seen: 이미 칠한 용어(여러 영역이 공유해 한 카드에서 한 번만 칠한다) */
export function formatProse(text, { terms = [], seen = new Set(), lead = false } = {}) {
  const sorted = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  return sentences(text).map((s, i) => { const c = classify(s); if (lead && i === 0) c.kind = 'lead'; return row(c, inline(c.body, sorted, seen)); }).join('');
}

/** d 원문 → { body: 문단들, point: 「포인트: …」 뒤의 글 } */
export function splitDetail(d) {
  const text = String(d || ''), at = text.lastIndexOf('포인트:');
  return at < 0 ? { body: text.trim(), point: '' } : { body: text.slice(0, at).trim(), point: text.slice(at + 4).trim() };
}
const SECTION = ['교과서', '심화', '연결'];
export function formatDetail(body, opt = {}) {
  const paras = String(body || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const seen = opt.seen || new Set();
  return paras.map((p, i) => `<section class="cf-sec">` + (paras.length === 3 ? `<h4 class="cf-h">${SECTION[i]}</h4>` : '') + formatProse(p, { terms: opt.terms, seen }) + `</section>`).join('');
}
export const formatPoint = (point, opt = {}) => point ? `<span class="cf-tag">포인트</span>` + sentences(point).map(s => `<span class="cf-pt">${inline(s, [], new Set())}</span>`).join(' ') : '';

export const CONCEPT_CSS = `
.cf { display: grid; gap: 7px; }
.cf-row { margin: 0; }
.cf-tag { display: inline-block; vertical-align: 1px; margin-right: 7px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; padding: 4px 7px; border-radius: var(--st-r-full, 999px);
  background: var(--st-fill-3, rgba(120,120,128,0.16)); color: var(--st-label-2); white-space: nowrap; }
.cf-ord .cf-tag { background: var(--st-label); color: var(--st-surface, #fff); }
.cf-but .cf-tag { background: var(--st-danger-soft, rgba(255,56,60,0.14)); color: var(--st-danger-ink, #c9252d); }
.cf-vs .cf-tag { background: var(--st-accent-soft); color: var(--st-accent-ink); }
.cf-debate .cf-tag { background: var(--st-warning-soft); color: var(--st-warning-ink); }
.cf-lead { font-weight: 650; color: var(--st-label); }
.cf-term { font-weight: 700; color: var(--st-label); background: linear-gradient(transparent 58%, rgba(255,214,10,0.55) 0); padding: 0 1px; }
.cf-ref, .cf-book { font-weight: 650; color: var(--st-label); }
.geo-a.cf { font-size: 16px; line-height: 1.75; }
.geo-x.cf { font-size: 15px; line-height: 1.75; padding: 13px 14px; }
.geo-x.cf::before { display: block; margin: 0; font-size: 11px; }
.geo-d-body.cf { white-space: normal; font-size: 15px; line-height: 1.75; gap: 14px; }
.cf-sec { display: grid; gap: 6px; }
.cf-h { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: var(--st-label); padding-bottom: 5px; border-bottom: 1px solid var(--st-separator); }
.geo-p { margin-top: 12px; padding: 12px 14px; border-radius: var(--st-r-element); background: var(--st-warning-soft); font-size: 15.5px; line-height: 1.7; color: var(--st-label); font-weight: 600; word-break: keep-all; }
.geo-p[hidden], .geo-p:empty { display: none; }
.geo-p .cf-tag { background: var(--st-warning); color: #fff; }
:root[data-theme="dark"] .cf-term { color: #fff; background: linear-gradient(transparent 58%, rgba(255,214,10,0.38) 0); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cf-term { color: #fff; background: linear-gradient(transparent 58%, rgba(255,214,10,0.38) 0); } }
`;

/**
 * 카드 한 장을 그린다. els: { a, x, dBody, p } 요소(없는 것은 건너뜀), card: { t, a, x, d, k }.
 * 스타일은 문서에 한 번만 넣는다.
 */
export function renderConcept(els, card) {
  const doc = (els.a || els.x || els.dBody).ownerDocument;
  if (!doc.getElementById('cf-style')) { const st = doc.createElement('style'); st.id = 'cf-style'; st.textContent = CONCEPT_CSS; doc.head.appendChild(st); }
  const terms = (card.k || []).map(([w]) => w), seen = new Set();
  const put = (el, html) => { if (el) { el.classList.add('cf'); el.innerHTML = html; } };
  put(els.a, formatProse(card.a, { terms, seen, lead: true }));   // 첫 문장 = 그 개념의 요지
  put(els.x, formatProse(card.x, { terms, seen }));
  const { body, point } = splitDetail(card.d);
  put(els.dBody, formatDetail(els.p ? body : card.d || '', { terms, seen }));
  if (els.p) { els.p.innerHTML = formatPoint(point); els.p.hidden = !point; }
}
