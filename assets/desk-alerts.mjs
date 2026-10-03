// Desk 웹 알림 — 수업 2분 전(무음)·일정 10분 전·아침 7시 오늘 일정·일요일 20시 주간 공부. Desk 앱 ClassAlarm·EventAlarm·WeeklyReport 와 같은 시각.
// 브라우저 알림이라 Desk 탭(또는 미니 창)이 열려 있을 때만 울린다. 켜고 끄기는 기기마다(localStorage).

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WINDOW = 3 * 60000;          // 이만큼 늦어도 울림(백그라운드 탭은 타이머가 1분에 한 번으로 느려진다)
export const PREFS_KEY = 'desk-alerts', FIRED_KEY = 'desk-alerts-fired';

/** 「14:00 회의」「오후 2시 30분 상담」 → {minutes, title}. 시각이 없으면 minutes null (앱 WidgetEvent.split 과 같은 규칙) */
export function splitTime(text) {
  const t = String(text || '').trim();
  let m = /^(\d{1,2}):(\d{2})\s*/.exec(t);
  if (m && +m[1] < 24 && +m[2] < 60) return { minutes: +m[1] * 60 + +m[2], title: t.slice(m[0].length) || t };
  m = /^(오전|오후)\s?(\d{1,2})시(\s?(\d{1,2})분)?\s*/.exec(t);
  if (m) { let h = +m[2] % 12; if (m[1] === '오후') h += 12; return { minutes: h * 60 + (+m[4] || 0), title: t.slice(m[0].length) || t }; }
  return { minutes: null, title: t };
}
/** 오늘 울릴 알림 목록 — fire 는 ms. prefs = {cls, event, weekly} */
export function alertPlan({ table = {}, start = {}, calendar = {}, prefs = {}, weeklyLine = '', now = new Date() }) {
  const out = [], day = keyOf(now), at = mins => new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(mins / 60), mins % 60).getTime();
  const di = now.getDay() - 1;
  if (prefs.cls && di >= 0 && di <= 4) {
    for (const [p, s] of Object.entries(start)) {
      const subj = (table?.[DAYS[di]]?.[p] || '').trim(); if (!subj) continue;
      out.push({ id: `class-${day}-${p}`, fire: at(s - 2), title: '수업 2분 전', body: `${p}교시 ${hm(s)} · ${subj}`, silent: true });
    }
  }
  if (prefs.event) {
    const list = Object.entries(calendar?.[day] || {}).map(([id, e]) => ({ id, ...splitTime(e?.text) })).filter(e => e.title)
      .sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9));
    if (list.length) {
      const lines = list.slice(0, 6).map(e => (e.minutes != null ? hm(e.minutes) + ' ' : '') + e.title).join('\n') + (list.length > 6 ? `\n외 ${list.length - 6}개` : '');
      out.push({ id: `event-day-${day}`, fire: at(7 * 60), title: `오늘 일정 ${list.length}개`, body: lines });
      for (const e of list) if (e.minutes != null) out.push({ id: `event-${day}-${e.id}`, fire: at(e.minutes - 10), title: `10분 뒤 · ${hm(e.minutes)}`, body: e.title });
    }
  }
  if (prefs.weekly && now.getDay() === 0 && weeklyLine) out.push({ id: `weekly-${day}`, fire: at(20 * 60), title: '이번 주 공부', body: weeklyLine });
  return out.sort((a, b) => a.fire - b.fire);
}
/** 지금 울려야 할 것 — 시각이 지났고 WINDOW 안이며 아직 안 울린 것 */
export const dueAlerts = (items, fired, now = Date.now()) => items.filter(i => i.fire <= now && now - i.fire <= WINDOW && !fired[i.id]);

const BELL = '<svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const CSS = `
.al-wrap { position: relative; }
.al-btn.on { color: var(--st-accent-ink); }
.al-pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 120; width: 300px; padding: 16px 16px 14px !important;
  background: var(--st-surface); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 14px 40px rgba(0,0,0,0.18); }
.al-pop[hidden] { display: none; }
.al-pop h4 { margin: 0 0 10px; font-size: 14px; font-weight: 700; }
.al-pop label { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; font-size: 13.5px; color: var(--st-label); cursor: pointer; line-height: 1.45; }
.al-pop label small { display: block; color: var(--st-label-3); font-size: 12px; }
.al-pop input { margin-top: 3px; accent-color: var(--st-accent-solid); }
.al-pop .al-state { font-size: 12px; color: var(--st-label-3); margin: 8px 0 10px; line-height: 1.55; }
.al-pop .al-state.bad { color: var(--st-danger-ink); }
.al-pop .al-acts { display: flex; gap: 6px; flex-wrap: wrap; }
.al-pop .al-acts .btn-sub { height: 30px; padding: 0 12px; font-size: 12.5px; }
`;

export function mountAlerts(host, ctx) {
  if (!document.getElementById('al-style')) { const st = document.createElement('style'); st.id = 'al-style'; st.textContent = CSS; document.head.appendChild(st); }
  const supported = typeof Notification !== 'undefined';
  const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const wrap = document.createElement('span'); wrap.className = 'al-wrap';
  wrap.innerHTML = `<button class="tbtn al-btn" type="button" aria-label="알림 설정" title="알림">${BELL}</button>
    <div class="panel al-pop" hidden role="dialog" aria-label="알림 설정">
      <h4>알림 <small style="font-weight:500;color:var(--st-label-3)">이 기기</small></h4>
      <label><input type="checkbox" data-k="cls"><span>수업 2분 전 <small>시간표 수업마다 · 무음</small></span></label>
      <label><input type="checkbox" data-k="event"><span>일정 <small>시각 있는 일정 10분 전 · 아침 7시 오늘 일정</small></span></label>
      <label><input type="checkbox" data-k="weekly"><span>주간 공부 리포트 <small>일요일 저녁 8시</small></span></label>
      <div class="al-state"></div>
      <div class="al-acts"><button class="btn-sub" data-a="test">시험 알림</button><button class="btn-sub" data-a="mini" title="작은 창 — 위젯처럼 띄워 두기">미니 창 열기</button></div>
    </div>`;
  host.insertBefore(wrap, host.firstChild);
  const btn = wrap.querySelector('.al-btn'), pop = wrap.querySelector('.al-pop'), state = wrap.querySelector('.al-state');
  let prefs = ls.get(PREFS_KEY, {}), timer = null;

  function paint() {
    for (const cb of pop.querySelectorAll('input[data-k]')) cb.checked = !!prefs[cb.dataset.k];
    const any = prefs.cls || prefs.event || prefs.weekly, perm = supported ? Notification.permission : 'unsupported';
    btn.classList.toggle('on', !!any && perm === 'granted');
    state.classList.toggle('bad', perm === 'denied' || perm === 'unsupported');
    state.textContent = perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다.'
      : perm === 'denied' ? '브라우저가 알림을 막았습니다. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꾼 뒤 다시 켜세요.'
      : perm === 'granted' ? 'Desk 탭이나 미니 창이 열려 있을 때 울립니다. 창을 모두 닫으면 울리지 않습니다.'
      : '켜면 브라우저가 알림 허용을 물어봅니다.';
  }
  function notify(it) {
    try {
      const n = new Notification(it.title, { body: it.body, tag: it.id, silent: !!it.silent, icon: 'icons/desk-icon-192.png' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  }
  function tick() {
    if (!supported || Notification.permission !== 'granted' || !ctx.active()) return;
    if (!(prefs.cls || prefs.event || prefs.weekly)) return;
    const items = alertPlan({ table: ctx.table(), start: ctx.start(), calendar: ctx.calendar(), prefs, weeklyLine: prefs.weekly ? ctx.weeklyLine() : '' });
    // 탭이 여러 개면 먼저 본 탭이 기록하고 울린다(같은 tag 라 겹쳐도 하나로 보임)
    const fired = ls.get(FIRED_KEY, {}), due = dueAlerts(items, fired);
    if (!due.length) return;
    const now = Date.now();
    for (const it of due) fired[it.id] = now;
    for (const [k, v] of Object.entries(fired)) if (now - v > 3 * 86400000) delete fired[k];
    ls.set(FIRED_KEY, fired);
    due.forEach(notify);
  }
  btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) paint(); });
  document.addEventListener('click', e => { if (!pop.hidden && !wrap.contains(e.target)) pop.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
  pop.addEventListener('change', async e => {
    const cb = e.target.closest('input[data-k]'); if (!cb) return;
    if (cb.checked && supported && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    prefs = { ...prefs, [cb.dataset.k]: cb.checked }; ls.set(PREFS_KEY, prefs);
    // 켜는 순간 이미 지난 알림이 한꺼번에 울리지 않게, 지금까지의 것은 울린 것으로 친다
    if (cb.checked) { const fired = ls.get(FIRED_KEY, {}); for (const it of alertPlan({ table: ctx.table(), start: ctx.start(), calendar: ctx.calendar(), prefs, weeklyLine: 'x' })) if (it.fire <= Date.now()) fired[it.id] = Date.now(); ls.set(FIRED_KEY, fired); }
    paint();
  });
  pop.addEventListener('click', async e => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'mini') { window.open('desk.html#mini', 'desk-mini', 'popup,width=380,height=760'); pop.hidden = true; return; }
    if (a === 'test') {
      if (!supported) return;
      if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
      paint();
      if (Notification.permission === 'granted') notify({ id: 'test-' + Date.now(), title: 'Desk 알림', body: '알림이 이렇게 보입니다.' });
    }
  });
  window.addEventListener('storage', e => { if (e.key === PREFS_KEY) { prefs = ls.get(PREFS_KEY, {}); paint(); } });
  paint();
  return {
    start() { if (!timer) { timer = setInterval(tick, 15000); tick(); } },
    stop() { clearInterval(timer); timer = null; pop.hidden = true; }
  };
}
