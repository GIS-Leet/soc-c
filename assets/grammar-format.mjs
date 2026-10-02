// 일본어 카드의 문법 설명(g)을 읽기 좋게 그린다 — 데이터는 한 덩어리 글 그대로 두고, 화면에서만 구조를 만든다.
// 1) 문장 단위로 줄을 나눈다(「」·괄호 안의 마침표는 무시)   2) 첫 문장 = 핵심
// 3) 문장 머리말로 꼬리표: N그룹·품사 / 예외 / 암기 / 회화 / 자주 틀림
// 4) 「A→B」는 변화 칩(결과 B에 형광펜 — 외울 것), 그 밖의 「일본어」는 글자 칩
// study.html · desk.html 이 함께 쓴다. textContent 는 원문과 거의 같아 읽기 시간 계산(study-reader)에 영향이 없다.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 「」와 () 바깥에서만 자른다
function splitOutside(text, isCut) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '「' || ch === '(' || ch === '（') depth++;
    else if (ch === '」' || ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    else if (depth === 0) { const n = isCut(text, i); if (n) { out.push(text.slice(start, i + n.keep).trim()); start = i + n.skip; i = start - 1; } }
  }
  const rest = text.slice(start).trim(); if (rest) out.push(rest);
  return out.filter(Boolean);
}
export const sentences = text => splitOutside(String(text || '').trim(), (t, i) => (t[i] === '.' || t[i] === '。') && /\s/.test(t[i + 1] || '') ? { keep: 1, skip: 2 } : null);
// "…, 3그룹은 …" 처럼 한 문장에 여러 그룹 규칙이 이어지면 그룹마다 한 줄로
const groupRows = s => splitOutside(s, (t, i) => t[i] === ',' && /^\s+[123]그룹/.test(t.slice(i + 1, i + 8)) ? { keep: 0, skip: 2 } : null);

const HEAD = /^([123]그룹|[いな]형용사|명사|동사|의문사)(?:은|는|에는|에서는)?\s+/;
export function classify(s, index) {
  if (index === 0) return 'lead';
  if (/^한국인|틀리|실수|헷갈|혼동/.test(s)) return 'warn';
  if (/^(단|다만|반면|반대로)[ ,]|예외/.test(s)) return 'except';
  if (HEAD.test(s)) return 'rule';
  if (/외우|외웁|외워|기억하세요|기억해|암기/.test(s)) return 'memo';
  if (/^(회화에서는?|친구|애니|학원|정중하게는?|요즘)/.test(s)) return 'talk';
  return 'plain';
}
const LABEL = { lead: '핵심', warn: '자주 틀림', except: '예외', memo: '암기', talk: '회화' };

// 문장 안쪽: 「A→B」 변화 칩, 「일본어」 글자 칩, 뒤따르는 (뜻) 은 옅게
function inline(s, reading) {
  const tok = [];   // ['text' | 'ja' | 'pair', 내용]
  const pair = (a, b) => `<span class="jg-pair"><span class="jg-a" lang="ja">${esc(a)}</span><span class="jg-arrow">→</span><mark class="jg-b" lang="ja">${esc(b)}</mark>` +
    (reading ? `<span class="jg-r r">${esc(reading(a))} → ${esc(reading(b))}</span>` : '') + `</span>`;
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('「', i), close = open < 0 ? -1 : s.indexOf('」', open);
    if (close < 0) { tok.push(['text', s.slice(i)]); break; }
    if (open > i) tok.push(['text', s.slice(i, open)]);
    const body = s.slice(open + 1, close), arrow = body.indexOf('→');
    tok.push(arrow > 0 && arrow < body.length - 1 ? ['pair', pair(body.slice(0, arrow).trim(), body.slice(arrow + 1).trim())]
      : ['ja', `<b class="jg-ja" lang="ja">${esc(body)}</b>`]);
    i = close + 1;
  }
  // 이어진 변화 칩은 한 묶음(.jg-pairs)으로 — 문장 아래 한 줄에 표처럼 놓인다
  let html = '', run = '';
  const flush = () => { if (run) { html += `<span class="jg-pairs">${run}</span>`; run = ''; } };
  tok.forEach(([type, v], n) => {
    if (type === 'pair') run += v;
    else if (type === 'text' && run && !v.trim()) return;
    // 칩 묶음 뒤에 남는 「가 됩니다.」 같은 짧은 꼬리는 줄만 차지하므로 가린다(글자는 남겨 읽기 시간 계산은 그대로)
    else if (type === 'text' && run && n === tok.length - 1 && v.trim().length <= 12) { flush(); html += `<span class="jg-tail">${esc(v)}</span>`; }
    else { flush(); html += type === 'text' ? gloss(v) : v; }
  });
  flush();
  return html;
}
const gloss = t => esc(t).replace(/^\(([^()]{1,24})\)/, '<span class="jg-gloss">($1)</span>');

/** g 원문 → HTML. reading(kana) 을 주면 변화 칩 아래에 한글 발음을 붙인다(.r — 「발음 숨기기」에 함께 가려짐). */
export function formatGrammar(text, { reading } = {}) {
  const rows = [];
  sentences(text).forEach((s, i) => {
    const kind = classify(s, i);
    if (kind === 'rule' || /[123]그룹/.test(s) && kind === 'plain') groupRows(s).forEach(r => rows.push(['rule', r]));
    else rows.push([kind, s]);
  });
  return rows.map(([kind, s]) => {
    let label = LABEL[kind] || '', body = s;
    if (kind === 'rule') { const m = HEAD.exec(s); if (m) { label = m[1]; body = s.slice(m[0].length); } else kind = 'plain'; }
    return `<p class="jg-row jg-${kind}">` + (label ? `<span class="jg-tag">${esc(label)}</span>` : '') + `<span class="jg-text">${inline(body, reading)}</span></p>`;
  }).join('');
}

export const GRAMMAR_CSS = `
.jp-g.jg { font-size: 15.5px; line-height: 1.75; padding: 14px 15px; display: grid; gap: 9px; }
.jp-g.jg::before { content: none; }
.jg-row { margin: 0; display: grid; grid-template-columns: 58px minmax(0, 1fr); column-gap: 10px; align-items: baseline; color: var(--st-label-2); }
.jg-row.jg-plain { grid-template-columns: minmax(0, 1fr); padding-left: 68px; }
.jg-tag { justify-self: start; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; padding: 5px 7px; border-radius: var(--st-r-full, 999px);
  background: var(--st-fill-3, rgba(120,120,128,0.16)); color: var(--st-label-2); white-space: nowrap; }
.jg-lead { font-size: 17px; font-weight: 700; line-height: 1.6; color: var(--st-label); padding-bottom: 9px; border-bottom: 1px solid var(--st-separator); }
.jg-lead .jg-tag { background: var(--st-accent-soft); color: var(--st-accent-ink); }
.jg-rule .jg-tag { background: var(--st-label); color: var(--st-surface, #fff); }
.jg-rule .jg-text { color: var(--st-label); }
.jg-memo .jg-tag { background: rgba(255,214,10,0.42); color: var(--st-label); }
.jg-memo .jg-text { color: var(--st-label); font-weight: 600; background: linear-gradient(transparent 62%, rgba(255,214,10,0.42) 0); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.jg-warn { padding: 10px 11px; margin: 2px -4px 0; border-radius: var(--st-r-element); background: var(--st-warning-soft); }
.jg-warn .jg-tag { background: var(--st-warning); color: #fff; }
.jg-warn .jg-text { color: var(--st-label); }
.jg-except .jg-tag { background: var(--st-danger-soft, rgba(255,56,60,0.14)); color: var(--st-danger-ink, #c9252d); }
.jg-except .jg-text { color: var(--st-label); }
.jg-ja { font-weight: 650; color: var(--st-label); background: var(--st-surface, #fff); padding: 1px 6px; margin: 0 1px; border-radius: 6px; white-space: nowrap; }
.jg-warn .jg-ja { background: rgba(255,255,255,0.72); }
.jg-pairs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.jg-tail { display: none; }
.jg-arrow, .jg-r { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif; }   /* 본문 글꼴(Figtree 등)에는 → 글리프가 없어 > 로 보인다 */
.jg-pair { display: inline-grid; grid-template-columns: auto auto auto; justify-content: start; align-items: baseline; column-gap: 5px; padding: 4px 9px; border-radius: 9px;
  background: var(--st-surface, #fff); border: 1px solid var(--st-separator); font-size: 16px; line-height: 1.4; white-space: nowrap; }
.jg-a { color: var(--st-label-2); font-weight: 500; }
.jg-arrow { color: var(--st-label-3); font-size: 13px; }
.jg-b { font-weight: 700; color: var(--st-label); background: rgba(255,214,10,0.55); padding: 0 4px; border-radius: 4px; }
.jg-r { grid-column: 1 / -1; font-size: 11.5px; color: var(--st-label-3); letter-spacing: 0; }
.jg-gloss { color: var(--st-label-3); font-size: 0.92em; }
@media (max-width: 520px) {
  .jg-row { grid-template-columns: minmax(0, 1fr); row-gap: 5px; }
  .jg-row.jg-plain { padding-left: 0; }
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .jg-ja, :root:not([data-theme="light"]) .jg-pair { background: rgba(255,255,255,0.08); } :root:not([data-theme="light"]) .jg-b { color: #1c1c1e; } }
:root[data-theme="dark"] .jg-ja, :root[data-theme="dark"] .jg-pair { background: rgba(255,255,255,0.08); }
:root[data-theme="dark"] .jg-b { color: #1c1c1e; }
`;

/** 요소에 그린다. 스타일은 문서에 한 번만 넣는다. */
export function renderGrammar(el, text, opt) {
  const doc = el.ownerDocument;
  if (!doc.getElementById('jg-style')) { const st = doc.createElement('style'); st.id = 'jg-style'; st.textContent = GRAMMAR_CSS; doc.head.appendChild(st); }
  el.classList.add('jg'); el.innerHTML = formatGrammar(text, opt);
}
