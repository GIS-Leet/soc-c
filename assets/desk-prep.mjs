// Desk 대시보드 「수업 준비」 — 시간표의 지금/다음 수업 → 교실 번호로 반 → 진도의 다음 차시 → 이름이 맞는 자료 추천 + 보기·발표.
// Desk 앱 LessonPrep 과 같은 규칙. 발표: 이 화면 전체 화면, 또는 새 창(프로젝터 화면으로 끌어 놓고 F11)

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const VIEWABLE = new Set(['pdf', 'html', 'htm']);
const MATERIAL = /\.(pdf|html?|hwpx?|pptx?|docx?|md)$/i;

/** 「103 통사2C」 → 교실 「103」 */
export const roomOf = subject => String(subject || '').trim().split(/\s+/)[0] || '';
/** 교실 세 자리 → 반 번호(끝 두 자리) */
export const classNumber = room => /^\d{3}$/.test(room) ? Number(room) % 100 : null;
/** 진도표 반 이름의 숫자가 교실의 반 번호와 같은 반 → [id, 반] */
export function progressClass(room, classes) {
  const n = classNumber(room); if (n == null) return null;
  return Object.entries(classes || {}).find(([, c]) => Number(String(c?.name || '').replace(/\D/g, '')) === n) || null;
}
/** 제목·단원 낱말(두 글자 이상) */
export const tokens = s => String(s || '').replace(/[①②③④⑤⑥⑦⑧⑨⑩()[\]·,:/]/g, ' ').split(/[\s\-_]+/).filter(w => w.length >= 2);
/** 차시 제목·단원 낱말이 파일 이름에 들어 있는 정도로 점수 — 상위 limit 개 */
export function matchFiles(lesson, files, limit = 3) {
  if (!lesson) return [];
  const t = tokens(lesson.title);
  const keys = [...new Set([...t, ...tokens(lesson.unit), ...t.flatMap(w => w.length >= 4 ? [w.slice(0, 2), w.slice(-2)] : [])])].map(k => k.toLowerCase());
  return files.map(f => {
    const name = f.name.toLowerCase(); let sc = 0;
    for (const k of keys) if (name.includes(k)) sc += k.length >= 3 ? 3 : 1;
    if (name.includes('-필기')) sc -= 1;
    return [f, sc];
  }).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1] || (a[0].name < b[0].name ? -1 : 1)).slice(0, limit).map(([f]) => f);
}
const dayIdx = d => { const i = d.getDay() - 1; return i >= 0 && i <= 4 ? i : -1; };
function slotsOn(table, d, start) {
  const i = dayIdx(d); if (i < 0) return [];
  return Object.keys(start).map(Number).sort((a, b) => a - b).map(p => ({ period: p, start: start[p], subject: (table?.[DAYS[i]]?.[p] || '').trim() || null }));
}
/** 지금 수업 중이면 그 수업, 아니면 오늘 다음 수업, 오늘 끝났으면(주말 포함) 다음 평일 첫 수업 */
export function plan({ table, start, len = 50, lessons = [], classes = {}, files = [], now = new Date() }) {
  const mins = now.getHours() * 60 + now.getMinutes();
  let date = now, shifted = false;
  const today = slotsOn(table, now, start).filter(s => s.subject);
  const end = today.length ? today.at(-1).start + len : 16 * 60;
  if (dayIdx(now) < 0 || mins >= end) {
    shifted = true; date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    do date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); while (dayIdx(date) < 0);
  }
  const slots = slotsOn(table, date, start).filter(s => s.subject);
  let slot = null, isNow = false;
  if (shifted) slot = slots[0] || null;
  else { slot = slots.find(s => mins >= s.start && mins < s.start + len) || null; isNow = !!slot; if (!slot) slot = slots.find(s => s.start > mins) || null; }
  if (!slot) return null;
  const room = roomOf(slot.subject), cls = progressClass(room, classes);
  const done = cls ? Math.max(0, Math.min(lessons.length, Number(cls[1].done) || 0)) : 0;
  const lesson = cls && done < lessons.length ? { ...lessons[done], no: done + 1 } : null;
  return { slot, date, isNow, shifted, room, classId: cls?.[0] || null, className: cls?.[1].name || room, lesson, done, total: lessons.length, files: matchFiles(lesson, files) };
}

const CSS = `
.p-prep .pp-when { font-size: 12px; font-weight: 700; color: var(--st-accent-ink); letter-spacing: 0.02em; }
.p-prep .pp-slot { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; color: var(--st-label); margin: 2px 0 10px; font-feature-settings: 'tnum' 1; }
.p-prep .pp-lesson { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 14px; color: var(--st-label); margin-bottom: 12px; line-height: 1.5; }
.p-prep .pp-lesson .no { font-weight: 700; font-feature-settings: 'tnum' 1; white-space: nowrap; }
.p-prep .pp-lesson .unit { font-size: 12px; color: var(--st-label-3); }
.p-prep .pp-lesson .btn-sub { height: 28px; padding: 0 10px; font-size: 12px; margin-left: auto; }
.p-prep .pp-muted { font-size: 13px; color: var(--st-label-3); line-height: 1.6; }
.pp-file { display: flex; align-items: center; gap: 10px; padding: 8px 0; min-width: 0; }
.pp-file .ext { flex-shrink: 0; width: 42px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--st-label-3); }
.pp-file .fn { flex: 1; min-width: 0; font-size: 13.5px; color: var(--st-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-file .op { display: flex; gap: 4px; flex-shrink: 0; }
.pp-file .op button { border: 0; background: var(--st-fill-2); color: var(--st-label-2); font: inherit; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--st-r-full); cursor: pointer; }
.pp-file .op button:hover { background: var(--st-accent-soft); color: var(--st-accent-ink); }
.pp-file .op button.main { background: var(--st-accent-solid); color: #fff; }
.pp-file .op button.main:hover { background: var(--st-accent-hover, var(--st-accent-solid)); color: #fff; }
.pp-show { position: fixed; inset: 0; z-index: 300; display: flex; flex-direction: column; background: #000; }
.pp-show[hidden] { display: none; }
.pp-show .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--st-surface); border-bottom: 1px solid var(--st-separator); }
.pp-show .bar .nm { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--st-label); }
.pp-show .bar .btn-sub { height: 30px; padding: 0 12px; }
.pp-show iframe { flex: 1; width: 100%; border: 0; background: #fff; }
.pp-show .msg { flex: 1; display: grid; place-items: center; color: #bbb; font-size: 14px; }
.pp-show:fullscreen .bar { display: none; }
.pp-show .exit { position: absolute; left: 10px; bottom: 10px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer; display: none; }
.pp-show:fullscreen .exit { display: block; }
`;

export function mountPrep(panel, ctx) {
  const { escapeHTML: esc } = ctx;
  if (!document.getElementById('pp-style')) { const st = document.createElement('style'); st.id = 'pp-style'; st.textContent = CSS; document.head.appendChild(st); }
  const body = panel.querySelector('.pp-body');
  const show = document.createElement('div');
  show.className = 'pp-show'; show.hidden = true;
  show.innerHTML = `<div class="bar"><span class="nm"></span><button class="btn-sub" data-a="full">전체 화면</button><button class="btn-sub" data-a="win" title="프로젝터 화면으로 끌어 놓고 F11">새 창</button><button class="btn-sub" data-a="close">닫기 ✕</button></div>
    <div class="msg">자료를 여는 중…</div><iframe title="수업 자료" sandbox="allow-scripts allow-downloads" referrerpolicy="no-referrer" hidden></iframe><button class="exit" data-a="exitfs" aria-label="발표 끝내기">✕</button>`;
  document.body.appendChild(show);
  let files = null, filesAt = 0, filesFor = '', loadingFiles = false, last = null, blobUrl = null, blobExt = '', req = 0;

  // ── 자료 목록: 비공개 저장소 전체 트리(5분 캐시) ──
  async function loadFiles(force) {
    const gh = await ctx.github();
    if (!gh?.token) { files = null; return; }
    if (!force && files && filesFor === gh.repo && Date.now() - filesAt < 300000) return;
    if (loadingFiles) return; loadingFiles = true;
    try {
      const res = await fetch(`https://api.github.com/repos/${gh.repo}/git/trees/HEAD?recursive=1`, { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      files = (j.tree || []).filter(t => t.type === 'blob' && MATERIAL.test(t.path) && !t.path.startsWith('기출/')).map(t => ({ path: t.path, name: t.path.split('/').pop(), size: t.size }));
      filesAt = Date.now(); filesFor = gh.repo;
    } catch { files = files || []; }
    finally { loadingFiles = false; render(); }
  }

  function render() {
    const p = plan({ table: ctx.table(), start: ctx.start(), len: ctx.len(), lessons: ctx.lessons(), classes: ctx.classes(), files: files || [] });
    last = p;
    if (!p) { body.innerHTML = '<div class="pp-muted">시간표에 수업이 없습니다. 아래 주간 시간표 칸에 「103 통사2C」처럼 교실 번호와 과목을 넣으면 여기서 다음 수업을 준비합니다.</div>'; return; }
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const when = p.isNow ? '지금 수업' : !p.shifted ? '다음 수업' : (p.date.toDateString() === tomorrow.toDateString() ? `내일 (${WD[p.date.getDay()]})` : `${WD[p.date.getDay()]}요일`);
    const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    let html = `<div class="pp-when">${when}</div><div class="pp-slot">${p.slot.period}교시 ${hm(p.slot.start)} · ${esc(p.slot.subject)}</div>`;
    if (!p.classId) html += `<div class="pp-muted">「${esc(p.room)}」에 맞는 반을 진도표에서 찾지 못했습니다. 교실이 세 자리(예: 103 → 3반)이고 진도표 반 이름에 같은 숫자가 있어야 이어집니다.</div>`;
    else if (!p.lesson) html += `<div class="pp-lesson"><span class="no">${esc(p.className)}</span><span>진도를 모두 마쳤습니다.</span></div>`;
    else {
      html += `<div class="pp-lesson"><span class="no">${esc(p.className)} · ${p.lesson.no}차시</span><span>${esc(p.lesson.title || '')}${p.lesson.unit ? ` <span class="unit">${esc(p.lesson.unit)}</span>` : ''}</span>` +
        `<button class="btn-sub" data-done="${esc(p.classId)}" title="이 반 진도를 한 차시 넘깁니다 (${p.done} → ${p.done + 1})">수업 끝 · 진도 +1</button></div>`;
      if (files === null) html += `<div class="pp-muted">${ctx.hasGithub?.() === false ? '자료 탭에서 비공개 자료함을 연결하면 이 차시에 맞는 자료를 추천합니다.' : '자료를 찾는 중…'}</div>`;
      else if (!p.files.length) html += '<div class="pp-muted">이 차시 이름과 맞는 자료가 자료함에 없습니다.</div>';
      else html += p.files.map(f => {
        const ext = (f.name.split('.').pop() || '').toLowerCase(), can = VIEWABLE.has(ext);
        return `<div class="pp-file" title="${esc(f.path)}"><span class="ext">${esc(ext)}</span><span class="fn">${esc(f.name)}</span><span class="op">` +
          (can ? `<button data-open="${esc(f.path)}">보기</button><button class="main" data-present="${esc(f.path)}">발표</button>` : `<button data-get="${esc(f.path)}">받기</button>`) + `</span></div>`;
      }).join('');
    }
    body.innerHTML = html;
  }

  // ── 열기·발표 ──
  async function fetchBlob(path) {
    const gh = await ctx.github();
    const res = await fetch(`https://api.github.com/repos/${gh.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.raw' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ext = (path.split('.').pop() || '').toLowerCase();
    const raw = await res.blob();
    return new Blob([raw], { type: ext === 'pdf' ? 'application/pdf' : ['html', 'htm'].includes(ext) ? 'text/html;charset=utf-8' : raw.type || 'application/octet-stream' });
  }
  async function present(path, full) {
    const r = ++req, name = path.split('/').pop();
    show.querySelector('.nm').textContent = name;
    show.querySelector('.msg').hidden = false; show.querySelector('.msg').textContent = '자료를 여는 중…';
    const frame = show.querySelector('iframe'); frame.hidden = true; frame.src = 'about:blank';
    show.hidden = false;
    if (full) show.requestFullscreen?.().catch(() => {});   // 클릭 직후 동기로 요청해야 허용된다
    try {
      const blob = await fetchBlob(path);
      if (r !== req) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob); blobExt = (name.split('.').pop() || '').toLowerCase();
      frame.src = blobUrl; frame.hidden = false; show.querySelector('.msg').hidden = true;
      frame.focus();
    } catch (e) { if (r === req) show.querySelector('.msg').textContent = '열지 못했습니다: ' + e.message; }
  }
  function closeShow() {
    req++;
    if (document.fullscreenElement === show) document.exitFullscreen().catch(() => {});
    show.hidden = true; show.querySelector('iframe').src = 'about:blank';
    // 새 창이 아직 이 Blob 을 보고 있을 수 있어 바로 지우지 않는다 — 다음에 열 때 교체
  }
  show.addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'close') closeShow();
    else if (a === 'full') show.requestFullscreen?.().catch(() => {});
    else if (a === 'exitfs') document.exitFullscreen?.().catch(() => {});
    else if (a === 'win' && blobUrl) window.open(ctx.previewLocation(blobUrl, blobExt), 'desk-present', 'popup,width=1280,height=760');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !show.hidden && !document.fullscreenElement) closeShow(); });

  body.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.open) present(b.dataset.open, false);
    else if (b.dataset.present) present(b.dataset.present, true);
    else if (b.dataset.get) {
      b.disabled = true;
      try { const url = URL.createObjectURL(await fetchBlob(b.dataset.get)); const a = document.createElement('a'); a.href = url; a.download = b.dataset.get.split('/').pop(); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
      catch (err) { alert('받지 못했습니다: ' + err.message); }
      b.disabled = false;
    } else if (b.dataset.done && last?.classId === b.dataset.done) {
      b.disabled = true;
      try { await ctx.completeLesson(last.classId, last.done); } catch (err) { alert('진도를 저장하지 못했습니다: ' + err.message); }
      b.disabled = false;
    }
  });

  return {
    render() { render(); if (ctx.active() && (files === null || Date.now() - filesAt > 300000)) loadFiles(); },
    refreshFiles() { loadFiles(true); },
    async listFiles() { if (ctx.active()) await loadFiles(); return files || []; },
    reset() { closeShow(); files = null; filesAt = 0; filesFor = ''; last = null; if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null; body.innerHTML = ''; }
  };
}
