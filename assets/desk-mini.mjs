// Desk 미니 창(desk.html#mini) — 앱 위젯 대신 작은 창에 띄워 두는 화면: 지금/다음 수업과 남은 분·미답변 질문·일본어 단어(15분마다 바뀜)·오늘 일정·할 일.
// 오늘 일정·할 일은 대시보드 패널을 그대로 쓰고(체크·추가 가능), 나머지 패널은 숨긴다.

export const isMini = () => location.hash === '#mini';
const pad = n => String(n).padStart(2, '0');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** 지금/다음 수업과 남은 분 */
export function classNow({ table = {}, start = {}, len = 50, now = new Date() }) {
  const di = now.getDay() - 1; if (di < 0 || di > 4) return { kind: 'none' };
  const mins = now.getHours() * 60 + now.getMinutes();
  const slots = Object.entries(start).map(([p, s]) => ({ p: +p, s, subj: (table?.[DAYS[di]]?.[p] || '').trim() })).filter(x => x.subj).sort((a, b) => a.s - b.s);
  if (!slots.length) return { kind: 'none' };
  const cur = slots.find(x => mins >= x.s && mins < x.s + len);
  if (cur) return { kind: 'now', ...cur, left: cur.s + len - mins };
  const next = slots.find(x => x.s > mins);
  return next ? { kind: 'next', ...next, left: next.s - mins } : { kind: 'done' };
}
/** 오늘까지 배운 일본어 단어 [[단어, 뜻]] — 가나 집중 기간(type kana)은 건너뜀 */
export function learnedWords(deck, now = new Date()) {
  if (!deck?.days?.length || !deck.start) return [];
  const t0 = new Date(deck.start + 'T00:00:00'), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upto = Math.min(deck.days.length - 1, Math.max(0, Math.floor((today - t0) / 86400000)));
  const out = [];
  for (const d of deck.days.slice(0, upto + 1)) if (d.type !== 'kana') { for (const [w, , k] of d.v || []) out.push([w, k]); for (const [w, k] of d.w || []) out.push([w, k]); }
  return out;
}
/** 15분 칸마다 하나 — 같은 시각엔 어느 창이든 같은 단어 */
export const wordAt = (words, now = Date.now()) => words.length ? words[Math.floor(now / 900000) % words.length] : null;

const CSS = `
body.mini { overflow: auto; }
body.mini #deskViews, body.mini .desk-bg, body.mini .geo-logo b, body.mini .desk-side label, body.mini #signOutBtn, body.mini .p-today .quick-add { display: none !important; }
body.mini .desk { padding: 10px 10px 14px; }
body.mini .dash { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow: visible; }
body.mini .dash > .panel { display: none; }
body.mini .dash > .p-mini, body.mini .dash > .p-today, body.mini .dash > .p-todo { display: block; grid-column: 1; grid-row: auto; }
body.mini .dash .panel { padding: 14px 16px; }
.p-mini { display: none; }
.p-mini .mn-when { font-size: 12px; font-weight: 700; color: var(--st-accent-ink); }
.p-mini .mn-cls { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--st-label); margin-top: 2px; font-feature-settings: 'tnum' 1; }
.p-mini .mn-left { font-size: 13px; color: var(--st-label-2); margin-top: 2px; font-feature-settings: 'tnum' 1; }
.p-mini .mn-left b { color: var(--st-label); }
.p-mini .mn-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--st-separator); font-size: 13.5px; color: var(--st-label-2); }
.p-mini .mn-row b { font-size: 16px; color: var(--st-label); font-feature-settings: 'tnum' 1; }
.p-mini .mn-jp { font-family: 'Noto Sans JP', inherit; font-size: 20px; font-weight: 700; color: var(--st-label); }
.p-mini .mn-jpk { font-size: 13.5px; color: var(--st-label-2); text-align: right; }
.p-mini button.mn-open { border: 0; background: none; padding: 0; font: inherit; color: var(--st-accent-ink); cursor: pointer; font-size: 12.5px; }
`;

export function mountMini(dash, ctx) {
  if (!isMini()) return { render() {}, active: false };
  if (!document.getElementById('mn-style')) { const st = document.createElement('style'); st.id = 'mn-style'; st.textContent = CSS; document.head.appendChild(st); }
  document.body.classList.add('mini');
  document.title = 'Desk 미니';
  const esc = ctx.escapeHTML;
  const panel = document.createElement('div');
  panel.className = 'panel p-mini';
  dash.insertBefore(panel, dash.firstChild);
  let words = [];
  fetch(new URL('../data/japanese-daily.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(d => { words = learnedWords(d); render(); }).catch(() => {});

  function render() {
    const c = classNow({ table: ctx.table(), start: ctx.start(), len: ctx.len() });
    const hm = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;
    let html = c.kind === 'now' ? `<div class="mn-when">지금 수업</div><div class="mn-cls">${c.p}교시 · ${esc(c.subj)}</div><div class="mn-left">끝까지 <b>${c.left}분</b></div>`
      : c.kind === 'next' ? `<div class="mn-when">다음 수업</div><div class="mn-cls">${c.p}교시 ${hm(c.s)} · ${esc(c.subj)}</div><div class="mn-left"><b>${c.left}분</b> 뒤 시작</div>`
      : c.kind === 'done' ? `<div class="mn-when">수업</div><div class="mn-cls">오늘 수업 끝</div>`
      : `<div class="mn-when">수업</div><div class="mn-cls">오늘은 수업이 없습니다</div>`;
    const open = ctx.openQuestions();
    html += `<div class="mn-row"><span>미답변 질문 <b>${open}</b></span><button class="mn-open" data-a="qa">Desk에서 열기 ↗</button></div>`;
    const w = wordAt(words);
    if (w) html += `<div class="mn-row"><span class="mn-jp" lang="ja">${esc(w[0])}</span><span class="mn-jpk">${esc(w[1])}</span></div>`;
    panel.innerHTML = html;
  }
  panel.addEventListener('click', e => { if (e.target.closest('[data-a="qa"]')) window.open('desk.html', 'desk-main'); });
  setInterval(render, 30000);
  return { render, active: true };
}
