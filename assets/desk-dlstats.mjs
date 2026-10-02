// Desk 「자료 통계」 — 홈페이지 자료실에서 학생이 파일을 연·받은 횟수(stats/downloads/{날짜}/{파일}/{view|download}). 누가는 없고 몇 번만.
// Desk 앱 「자료 통계」와 같은 계산. 기록하는 쪽은 assets/download-stats.mjs

const n = v => Math.max(0, Math.round(Number(v) || 0));
const pad = x => String(x).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 오늘 포함 최근 k일의 첫 날짜 키 */
export const startKey = (k, now = new Date()) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (k - 1)));
/** 파일 키 「폴더｜이름·pdf」 → 화면 이름 */
export function fileLabel(key) {
  const parts = String(key).split('｜');
  // 기록할 때 점을 「·」로 바꿨다 — 「자연재해·환경」 같은 진짜 가운뎃점은 두고 확장자 앞 것만 되돌린다
  return { name: parts.at(-1).replace(/·([A-Za-z0-9]{2,5})$/, '.$1'), folder: parts.length > 1 ? parts.slice(0, -1).join(' › ') : '' };
}
/** 스냅샷 → { days: {날짜: 합계}, files: [{key, views, downloads, total}] (from 이후만, 많은 순) } */
export function parseStats(raw, from = null) {
  const days = {}, by = {};
  for (const [day, files] of Object.entries(raw || {})) {
    if (!files || typeof files !== 'object') continue;
    let sum = 0;
    for (const [key, c] of Object.entries(files)) {
      const views = n(c?.view), downloads = n(c?.download);
      sum += views + downloads;
      if (!from || day >= from) { const f = by[key] ??= { key, views: 0, downloads: 0 }; f.views += views; f.downloads += downloads; }
    }
    days[day] = sum;
  }
  const files = Object.values(by).map(f => ({ ...f, total: f.views + f.downloads }))
    .sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : 1));
  return { days, files };
}
export const totalSince = (days, from) => Object.entries(days).reduce((s, [d, v]) => s + (!from || d >= from ? v : 0), 0);

const CSS = `
.ds-modal { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,0.32); }
.ds-modal[hidden] { display: none; }
.ds-sheet { width: 100%; max-width: 760px; max-height: calc(100vh - 40px); display: flex; flex-direction: column; padding: 0 !important; overflow: hidden;
  background: var(--st-surface); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 18px 50px rgba(0,0,0,0.22); }
.ds-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--st-separator); }
.ds-head h3 { margin: 0; flex: 1; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.ds-head .btn-sub { height: 32px; padding: 0 12px; }
.ds-body { overflow-y: auto; scrollbar-width: thin; padding: 16px 20px 22px; }
.ds-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 6px; }
.ds-tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; }
.ds-tile + .ds-tile { border-left: 1px solid var(--st-separator); }
.ds-tile b { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: var(--st-label); font-feature-settings: 'tnum' 1; }
.ds-tile span { font-size: 11px; font-weight: 600; color: var(--st-label-3); letter-spacing: 0.04em; }
.ds-note { font-size: 12px; color: var(--st-label-3); margin: 0 0 22px; text-align: center; }
.ds-sec { margin-top: 22px; }
.ds-sec .dash-h { margin-bottom: 8px; }
.ds-range { display: inline-flex !important; }
.ds-range button { padding: 4px 12px !important; font-size: 12px !important; }
.ds-days { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 2px; align-items: end; height: 120px; }
.ds-day { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; cursor: default; }
.ds-day i { position: relative; display: block; width: min(70%, 22px); background: var(--st-accent-solid); border-radius: 4px 4px 0 0; min-height: 0; }
.ds-day.zero i { height: 1px !important; background: var(--st-separator-strong, var(--st-separator)); border-radius: 0; }
.ds-day .tip { font-style: normal; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: var(--st-label); color: var(--st-surface); opacity: 0; transition: opacity 120ms; z-index: 2; }
.ds-day:hover .tip { opacity: 1; }
.ds-day:hover i { filter: brightness(1.12); }
.ds-axis { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 2px; margin-top: 4px; border-top: 1px solid var(--st-separator); padding-top: 4px; }
.ds-axis span { font-size: 10.5px; color: var(--st-label-3); text-align: center; font-feature-settings: 'tnum' 1; }
.ds-axis span.today { color: var(--st-label); font-weight: 700; }
.ds-file { display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 2px 12px; padding: 8px 0; }
.ds-file .fn { font-size: 13.5px; color: var(--st-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds-file .tt { grid-row: span 2; align-self: center; text-align: right; font-size: 15px; font-weight: 700; color: var(--st-label); font-feature-settings: 'tnum' 1; }
.ds-file .meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ds-file .bar { flex: 1; height: 6px; min-width: 40px; }
.ds-file .bar i { display: block; height: 100%; background: var(--st-accent-solid); border-radius: 0 4px 4px 0; }
.ds-file .sub { font-size: 11.5px; color: var(--st-label-3); white-space: nowrap; font-feature-settings: 'tnum' 1; }
@media (max-width: 560px) { .ds-tiles { grid-template-columns: repeat(2, 1fr); } .ds-tile:nth-child(3) { border-left: 0; } .ds-file .sub .fd { display: none; } }
`;

export function mountDownloadStats(fb) {
  const { db, ref, get, escapeHTML: esc } = fb;
  if (!document.getElementById('ds-style')) { const st = document.createElement('style'); st.id = 'ds-style'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'ds-modal'; el.hidden = true;
  el.innerHTML = `<section class="panel ds-sheet" role="dialog" aria-label="자료 통계">
    <div class="ds-head"><h3>자료 통계</h3><button class="btn-sub" data-act="reload">새로고침</button><button class="btn-sub" data-act="close">닫기</button></div>
    <div class="ds-body"><div class="ev-empty">불러오는 중…</div></div></section>`;
  document.body.appendChild(el);
  const body = el.querySelector('.ds-body');
  let raw = null, range = 30, loading = false;

  function render() {
    const all = parseStats(raw), total = totalSince(all.days);
    if (!total) { body.innerHTML = '<div class="ev-empty">아직 기록이 없습니다. 홈페이지 자료실에서 학생이 파일을 열거나 받으면 여기에 횟수가 쌓입니다.</div>'; return; }
    const tiles = [['오늘', startKey(1)], ['7일', startKey(7)], ['30일', startKey(30)], ['전체', null]]
      .map(([l, from]) => `<div class="ds-tile"><b>${totalSince(all.days, from).toLocaleString()}</b><span>${l}</span></div>`).join('');
    // 날짜별 14일 막대 — 한 계열이라 범례 없음, 값은 마우스를 올리면
    const now = new Date(), days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); days.push({ d, k: dayKey(d), v: all.days[dayKey(d)] || 0 }); }
    const max = Math.max(1, ...days.map(x => x.v)), WD = ['일', '월', '화', '수', '목', '금', '토'];
    const cols = days.map(x => `<div class="ds-day${x.v ? '' : ' zero'}"><i style="height:${(x.v / max * 100).toFixed(1)}%"><span class="tip">${x.d.getMonth() + 1}/${x.d.getDate()}(${WD[x.d.getDay()]}) ${x.v.toLocaleString()}회</span></i></div>`).join('');
    const axis = days.map((x, i) => `<span class="${i === 13 ? 'today' : ''}">${i === 13 ? '오늘' : x.d.getDate()}</span>`).join('');
    const files = parseStats(raw, range ? startKey(range) : null).files.slice(0, 30), fmax = Math.max(1, files[0]?.total || 1);
    const rows = files.length ? files.map(f => {
      const { name, folder } = fileLabel(f.key);
      return `<div class="ds-file" title="${esc(folder ? folder + ' › ' + name : name)}"><span class="fn">${esc(name)}</span><span class="tt">${f.total.toLocaleString()}</span>` +
        `<span class="meta"><span class="bar"><i style="width:${(f.total / fmax * 100).toFixed(1)}%"></i></span><span class="sub"><span class="fd">${folder ? esc(folder) + ' · ' : ''}</span>열람 ${f.views} · 받기 ${f.downloads}</span></span></div>`;
    }).join('') : '<div class="ev-empty">이 기간에는 기록이 없습니다.</div>';
    body.innerHTML = `<div class="ds-tiles">${tiles}</div><p class="ds-note">열람과 내려받기를 합친 횟수입니다. 같은 학생이 여러 번 열면 여러 번으로 셉니다.</p>` +
      `<div class="ds-sec"><div class="dash-h">날짜별 <b>최근 14일</b></div><div class="ds-days">${cols}</div><div class="ds-axis">${axis}</div></div>` +
      `<div class="ds-sec"><div class="dash-h">파일별 <nav class="desk-views ds-range">${[[7, '7일'], [30, '30일'], [0, '전체']].map(([v, l]) => `<button data-range="${v}" class="${v === range ? 'on' : ''}">${l}</button>`).join('')}</nav></div>${rows}</div>`;
  }
  async function load() {
    if (loading) return; loading = true;
    if (raw === null) body.innerHTML = '<div class="ev-empty">불러오는 중…</div>';
    try { raw = (await get(ref(db, 'stats/downloads'))).val() || {}; render(); }
    catch (e) { body.innerHTML = `<div class="ev-empty">통계를 불러오지 못했습니다 (${esc(e.message || String(e))})</div>`; }
    finally { loading = false; }
  }
  const close = () => { el.hidden = true; };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'close') close();
    else if (b.dataset.act === 'reload') load();
    else if (b.dataset.range != null) { range = Number(b.dataset.range); render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
  return {
    open() { el.hidden = false; load(); },
    reset() { close(); raw = null; body.innerHTML = '<div class="ev-empty">불러오는 중…</div>'; }
  };
}
