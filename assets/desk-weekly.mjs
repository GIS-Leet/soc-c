// Desk 공부 탭 「이번 주」 리포트 — 공부한 날·시간·시험 정답률·약한 문제(다음 주에 먼저 나옴). Desk 앱 WeeklyReport 와 같은 계산.
// 일요일 20:00 알림은 assets/desk-alerts.mjs 가 이 요약으로 띄운다.

const num = v => Number(v) || 0;
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 이번 주 월요일 0시 */
export function weekStart(now = new Date()) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; }

/** sessions = desk/study/sessions, quizlog = desk/study/quizlog */
export function weekSummary({ sessions = {}, quizlog = {}, now = new Date() } = {}) {
  const ws = weekStart(now), keys = new Set(Array.from({ length: 7 }, (_, i) => keyOf(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i))));
  const byDay = {};
  for (const s of Object.values(sessions || {})) {
    if (!s || !keys.has(s.date) || s.subject === '스트릭 프리즈') continue;
    byDay[s.date] = (byDay[s.date] || 0) + num(s.min);
  }
  const minutes = Object.values(byDay).reduce((a, b) => a + b, 0), days = Object.values(byDay).filter(m => m > 0).length;
  let right = 0, wrong = 0; const weak = [];
  for (const [id, e] of Object.entries(quizlog || {})) {
    if (!e || num(e.last) < ws.getTime()) continue;
    const r = num(e.right), w = num(e.wrong); right += r; wrong += w;
    if (w > 0 && num(e.streak) < 2) weak.push([id, w]);
  }
  weak.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { minutes, days, right, wrong, accuracy: right + wrong ? Math.floor(right / (right + wrong) * 100) : null, weak: weak.map(([id]) => id), weakTop: weak.slice(0, 3).map(([id]) => id) };
}

/** 알림·한 줄 요약 문구 — 앱 알림과 같은 모양 */
export function summaryLine(s) {
  let t = `${s.days}일 · ${s.minutes}분`;
  if (s.accuracy != null) t += ` · 정답률 ${s.accuracy}%`;
  if (s.weak.length) t += ` · 약한 문제 ${s.weak.length}개 — 다음 주에 먼저 나옵니다`;
  return t;
}

/** 출제 id → 사람이 읽는 이름. decks = {geo, jp} (data/*.json) */
export function labelOf(id, decks = {}) {
  const [kind, a, b] = String(id).split(':');
  if (kind === 'geo') {
    const c = decks.geo?.days?.[Number(a)]; if (!c) return `통합사회 Day ${Number(a) + 1}`;
    const m = /^m?term(\d+)$/.exec(b || ''), k = m && c.k?.[Number(m[1])];
    return k ? `${k[0]} — ${c.t}` : c.t;
  }
  if (kind === 'jp') {
    const c = decks.jp?.days?.[Number(a)]; if (!c) return `일본어 Day ${Number(a) + 1}`;
    const words = [...(c.v || []).map(([w, , k]) => [w, k]), ...(c.w || [])];
    const m = /^(?:k2w|w2k|mk2w)(\d+)$/.exec(b || ''), w = m && words[Number(m[1])];
    return w ? `${w[0]} — ${w[1]}` : (c.s ? `${c.s}${c.m ? ' — ' + c.m : ''}` : `일본어 Day ${Number(a) + 1}`);
  }
  if (kind === 'kana') return `가나 ${a}`;
  return String(id);
}

const CSS = `
.wk-rep { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--st-separator); }
.wk-rep .wk-line { font-size: 14px; color: var(--st-label-2); font-feature-settings: 'tnum' 1; line-height: 1.6; }
.wk-rep .wk-line b { color: var(--st-label); font-weight: 700; }
.wk-rep .wk-cap { font-size: 12px; font-weight: 650; color: var(--st-label-3); margin: 10px 0 4px; }
.wk-rep .wk-weak { list-style: none; margin: 0; padding: 0; }
.wk-rep .wk-weak li { font-size: 14px; color: var(--st-label); padding: 3px 0; line-height: 1.5; word-break: keep-all; }
.wk-rep .wk-weak li small { color: var(--st-label-3); font-size: 12px; margin-left: 4px; }
`;

export function mountWeekly(el, ctx) {
  if (!document.getElementById('wk-style')) { const st = document.createElement('style'); st.id = 'wk-style'; st.textContent = CSS; document.head.appendChild(st); }
  const esc = ctx.escapeHTML;
  let decks = null, loadingDecks = false;
  async function loadDecks() {
    if (decks || loadingDecks) return; loadingDecks = true;
    const get = async p => { try { const r = await fetch(new URL(`../${p}`, import.meta.url)); return r.ok ? await r.json() : null; } catch { return null; } };
    const [geo, jp] = await Promise.all([get('data/geography-daily.json'), get('data/japanese-daily.json')]);
    decks = { geo, jp }; loadingDecks = false; render();
  }
  function render() {
    const st = ctx.study() || {};
    const s = weekSummary({ sessions: st.sessions, quizlog: st.quizlog });
    if (!s.minutes && s.accuracy == null) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const tries = s.right + s.wrong;
    let html = `<div class="wk-line">공부한 날 <b>${s.days}</b>일` + (s.accuracy != null ? ` · 시험 정답률 <b>${s.accuracy}%</b> (${s.right}/${tries})` : ' · 이번 주 시험 기록 없음') + `</div>`;
    if (s.weakTop.length) {
      if (!decks) loadDecks();
      const qlog = st.quizlog || {};
      html += `<div class="wk-cap">약한 문제 ${s.weak.length}개 — 다음 주 시험에 먼저 나옵니다</div><ul class="wk-weak">` +
        s.weakTop.map(id => `<li>${esc(labelOf(id, decks || {}))}<small>틀림 ${num(qlog[id]?.wrong)}</small></li>`).join('') + `</ul>`;
    }
    el.innerHTML = html;
  }
  return { render, summary: () => { const st = ctx.study() || {}; return weekSummary({ sessions: st.sessions, quizlog: st.quizlog }); } };
}
