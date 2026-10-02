// Desk 「영상」 뷰 — 강의 영상(YouTube 일부 공개) 목록·추가·편집·삭제와 학생 시청 현황. Desk 앱 「강의 영상」과 같은 데이터(videos·views·roster·members)
// 학생 쪽 재생·기록은 lecture.html(assets/lecture.mjs). 명단(roster) 게시는 앱에서만 한다 — 여기서는 읽기만.

/** URL·공유 텍스트·ID 자체에서 11자 영상 ID — YouTube 가 아니면 null (앱 YouTubeID.parse 와 같은 규칙) */
export function youTubeId(s) {
  const t = String(s ?? '').trim(), isId = x => /^[A-Za-z0-9_-]{11}$/.test(x || '');
  if (isId(t)) return t;
  const m = /https?:\/\/[^\s<>"']+/.exec(t); if (!m) return null;
  let u; try { u = new URL(m[0]); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!(host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com'))) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const cand = host === 'youtu.be' ? parts[0] : u.searchParams.get('v') || (parts.length >= 2 && ['shorts', 'live', 'embed', 'v'].includes(parts[0]) ? parts[1] : null);
  return isId(cand) ? cand : null;
}
const num = v => Number(v) || 0;
export function parseVideos(raw) {
  return Object.entries(raw || {}).filter(([, d]) => d && typeof d.yt === 'string')
    .map(([id, d]) => ({ id, yt: d.yt, title: d.title || '', unit: d.unit || '', date: d.date || '', order: num(d.order), note: d.note || '', createdAt: num(d.createdAt) }))
    .sort((a, b) => a.order !== b.order ? a.order - b.order : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
/** 단원별 묶음 — 처음 나온 순서 그대로 */
export function groupByUnit(videos) {
  const order = [], by = {};
  for (const v of videos) { const u = v.unit || '단원 없음'; if (!by[u]) { by[u] = []; order.push(u); } by[u].push(v); }
  return order.map(u => ({ unit: u, videos: by[u] }));
}
/** 시청 기록 하나의 비율 — progressVersion 2 는 실제 본 구간(watchedSec), 이전 기록은 재생 위치(sec) */
export function recPct(r) { const dur = num(r?.dur); if (!dur) return 0; return Math.min(1, Math.max(0, (r.progressVersion === 2 ? num(r.watchedSec) : num(r.sec)) / dur)); }
/** 한 학생이 여러 uid 로 인증했으면: 완료한 기록 > 실측 기록 > 나머지 중 가장 많이 본 것 */
export function bestRec(recs) {
  const done = recs.filter(r => r.done), measured = recs.filter(r => r.progressVersion === 2);
  const pool = done.length ? done : measured.length ? measured : recs;
  return pool.reduce((best, r) => !best || recPct(r) > recPct(best) || (recPct(r) === recPct(best) && num(r.at) > num(best.at)) ? r : best, null);
}
/** 명단 전체(학번 순) × 이 영상 기록 */
export function watchers(videoId, { roster = {}, members = {}, views = {} }) {
  const recs = views[videoId] || {};
  return Object.entries(roster).filter(([, e]) => e && e.sid && e.name)
    .map(([h, e]) => ({ h, sid: String(e.sid), name: String(e.name), rec: bestRec(Object.entries(members).filter(([, m]) => m?.h === h).map(([uid]) => recs[uid]).filter(Boolean)) }))
    .sort((a, b) => a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0);
}

const CSS = `
.lv-grid .rail-top .btn-solid { height: 36px; padding: 0 14px; white-space: nowrap; }
.lv-unit { padding: 14px 16px 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: var(--st-label-3); border-top: 1px solid var(--st-separator); }
.lv-item { display: flex; gap: 12px; align-items: center; border-top: 0 !important; }
.lv-item img, .lv-thumb-blank { width: 88px; height: 50px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--st-fill-2); }
.lv-item .lv-txt { min-width: 0; flex: 1; }
.lv-item .t { white-space: normal !important; display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.lv-body { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 18px 20px 24px; }
.lv-player { position: relative; width: 100%; max-width: 880px; aspect-ratio: 16 / 9; background: #000; border-radius: var(--st-r-element, 10px); overflow: hidden; }
.lv-player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.lv-info { margin: 14px 0 22px; max-width: 880px; }
.lv-info h2 { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; color: var(--st-label); }
.lv-info .lv-sub { font-size: 12.5px; color: var(--st-label-3); font-feature-settings: 'tnum' 1; }
.lv-info .lv-note { font-size: 13.5px; color: var(--st-label-2); margin-top: 8px; white-space: pre-wrap; line-height: 1.6; }
.lv-w { max-width: 880px; }
.lv-w-row { display: grid; grid-template-columns: 64px 72px minmax(0, 1fr) 48px 52px; align-items: center; gap: 10px; padding: 7px 2px; font-size: 13.5px; }
.lv-w-row .sid { font-feature-settings: 'tnum' 1; color: var(--st-label-3); font-size: 12.5px; }
.lv-w-row .pc { text-align: right; font-feature-settings: 'tnum' 1; font-size: 12.5px; color: var(--st-label-2); }
.lv-w-row .at { text-align: right; font-size: 11.5px; color: var(--st-label-3); font-feature-settings: 'tnum' 1; }
.lv-w-row.none .pc, .lv-w-row.none .nm { color: var(--st-label-3); }
.lv-bar { height: 6px; border-radius: 3px; background: var(--st-fill-2); overflow: hidden; }
.lv-bar i { display: block; height: 100%; border-radius: 3px; background: var(--st-accent-solid); }
.lv-bar i.done { background: var(--st-success, #3a7d44); }
.lv-foot { font-size: 12px; color: var(--st-label-3); line-height: 1.6; margin-top: 12px; max-width: 880px; }
.lv-modal { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,0.32); }
.lv-modal[hidden] { display: none; }
.lv-modal .panel { width: 100%; max-width: 440px; padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 10px;
  background: var(--st-surface); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 18px 50px rgba(0,0,0,0.22); }
.lv-modal h3 { margin: 0 0 4px; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.lv-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--st-label-2); }
.lv-modal input, .lv-modal textarea { height: 38px; padding: 0 12px; background: var(--st-fill-2); color: var(--st-label); border: 1px solid transparent; border-radius: var(--st-r-element, 10px); font: inherit; font-size: 14px; outline: none; }
.lv-modal textarea { height: 76px; padding: 9px 12px; resize: vertical; }
.lv-modal input:focus, .lv-modal textarea:focus { background: var(--st-surface); border-color: var(--accent); }
.lv-modal .lv-hint { font-size: 12px; color: var(--st-label-3); min-height: 1em; }
.lv-modal .lv-hint.bad { color: var(--st-danger-ink); }
.lv-modal .lv-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.lv-modal .lv-acts button { height: 36px; padding: 0 16px; }
`;

export function mountLectures(root, fb) {
  const { db, ref, set, update, remove, push, onValue, escapeHTML: esc, showUndo } = fb;
  if (!document.getElementById('lv-style')) { const st = document.createElement('style'); st.id = 'lv-style'; st.textContent = CSS; document.head.appendChild(st); }
  const S = { videos: [], roster: {}, members: {}, views: {}, cur: null, editing: null, attached: false, loaded: false };
  root.classList.add('class-grid', 'lv-grid');
  root.innerHTML = `
    <aside class="panel note-rail">
      <div class="rail-top"><input type="text" id="lvSearch" placeholder="영상 검색" autocomplete="off"><button class="btn-solid" id="lvAdd">+ 영상</button></div>
      <div class="note-list" id="lvList"><div class="rail-empty">불러오는 중…</div></div>
    </aside>
    <section class="panel note-pane">
      <div class="pane-top">
        <button class="btn-sub back-btn" id="lvBack">← 목록</button>
        <span class="stu-head" id="lvHead"></span>
        <span style="flex:1"></span>
        <button class="btn-sub" id="lvEdit" hidden>편집</button>
        <button class="btn-sub del-btn" id="lvDel" hidden>삭제</button>
      </div>
      <div class="lv-body" id="lvBody" hidden></div>
      <div class="pane-blank" id="lvBlank">왼쪽에서 영상을 고르거나 「+ 영상」으로 YouTube 링크를 추가하세요.<br>등록한 영상은 홈페이지 강의 페이지에서 학번 인증을 마친 학생에게 보입니다.</div>
    </section>
    <div class="lv-modal" id="lvModal" hidden>
      <form class="panel" id="lvForm">
        <h3 id="lvFormTitle">영상 추가</h3>
        <label id="lvLinkWrap">YouTube 링크<input type="text" id="lvLink" placeholder="https://youtu.be/…" autocomplete="off"></label>
        <span class="lv-hint" id="lvLinkHint">일부 공개로 올린 영상의 공유 링크를 넣으세요.</span>
        <label>제목<input type="text" id="lvTitle" maxlength="120"></label>
        <label>단원<input type="text" id="lvUnit" placeholder="예: 3.1 기후 환경" maxlength="60"></label>
        <label>날짜<input type="date" id="lvDate"></label>
        <label>메모<textarea id="lvNote" maxlength="1000"></textarea></label>
        <div class="lv-acts"><button type="button" class="btn-sub" id="lvCancel">취소</button><button type="submit" class="btn-solid" id="lvSave">저장</button></div>
      </form>
    </div>`;
  const $ = id => root.querySelector('#' + id);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shortDay = at => { const d = new Date(at); return `${d.getMonth() + 1}.${d.getDate()}`; };

  function renderList() {
    if (!S.loaded) return;
    const q = $('lvSearch').value.trim().toLowerCase();
    const list = q ? S.videos.filter(v => (v.title + ' ' + v.unit + ' ' + v.note).toLowerCase().includes(q)) : S.videos;
    if (!list.length) { $('lvList').innerHTML = `<div class="rail-empty">${S.videos.length ? '검색 결과가 없습니다.' : '강의 영상이 없습니다.<br>「+ 영상」으로 시작하세요.'}</div>`; return; }
    $('lvList').innerHTML = groupByUnit(list).map(g => `<div class="lv-unit">${esc(g.unit)}</div>` + g.videos.map(v => {
      const w = watchers(v.id, S), seen = w.filter(x => x.rec).length;
      const sub = [v.date, w.length ? `시청 ${seen}/${w.length}명` : ''].filter(Boolean).join(' · ');
      return `<button class="note-item lv-item${v.id === S.cur ? ' on' : ''}" data-id="${esc(v.id)}">` +
        `<img src="https://i.ytimg.com/vi/${esc(v.yt)}/mqdefault.jpg" alt="" loading="lazy">` +
        `<span class="lv-txt"><span class="t">${esc(v.title || v.yt)}</span><span class="d">${esc(sub)}</span></span></button>`;
    }).join('')).join('');
  }
  function renderDetail() {
    const v = S.videos.find(x => x.id === S.cur);
    if (!v) { closeDetail(); return; }
    $('lvHead').textContent = v.title || v.yt;
    const w = watchers(v.id, S), seen = w.filter(x => x.rec).length, done = w.filter(x => x.rec?.done).length;
    const body = $('lvBody');
    // 재생 중인 영상이 같으면 iframe 을 다시 만들지 않는다(데이터가 바뀔 때마다 재생이 끊기지 않게)
    let player = body.querySelector('.lv-player');
    if (!player || player.dataset.yt !== v.yt) {
      body.innerHTML = `<div class="lv-player" data-yt="${esc(v.yt)}"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.yt)}?rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(v.title)}"></iframe></div><div id="lvMeta"></div>`;
    }
    const rows = w.length ? w.map(x => {
      if (!x.rec) return `<div class="lv-w-row none"><span class="sid">${esc(x.sid)}</span><span class="nm">${esc(x.name)}</span><span class="lv-bar"></span><span class="pc">—</span><span class="at"></span></div>`;
      const p = Math.round(recPct(x.rec) * 100), legacy = x.rec.progressVersion !== 2;
      return `<div class="lv-w-row"><span class="sid">${esc(x.sid)}</span><span class="nm">${esc(x.name)}</span>` +
        `<span class="lv-bar"><i class="${x.rec.done ? 'done' : ''}" style="width:${p}%"></i></span>` +
        `<span class="pc" title="${legacy ? '재생 위치로 계산한 이전 기록' : '실제로 재생한 구간'}">${p}%${legacy ? '*' : ''}</span><span class="at">${x.rec.at ? shortDay(x.rec.at) : ''}</span></div>`;
    }).join('') : '<div class="ev-empty">홈페이지 명단이 비어 있습니다. Desk 앱 「홈페이지 명단」에서 학번·이름을 게시하면 시청 현황이 여기 나옵니다.</div>';
    body.querySelector('#lvMeta').innerHTML =
      `<div class="lv-info"><h2>${esc(v.title || v.yt)}</h2><div class="lv-sub">${esc([v.unit, v.date].filter(Boolean).join(' · '))}</div>${v.note ? `<div class="lv-note">${esc(v.note)}</div>` : ''}</div>` +
      `<div class="lv-w"><div class="dash-h">${w.length ? `시청 ${seen} / 명단 ${w.length} · 완료 ${done}` : '시청 현황'}</div>${rows}</div>` +
      `<p class="lv-foot">새 기록은 실제 재생한 구간을 합산합니다. *는 재생 위치로 계산한 이전 기록입니다. 90% 이상 보면 완료로 칩니다. 이 기록은 출결이나 본인 인증을 증명하지 않습니다.</p>`;
  }
  function openDetail(id) {
    S.cur = id;
    $('lvBody').hidden = false; $('lvBlank').hidden = true; $('lvEdit').hidden = false; $('lvDel').hidden = false;
    root.classList.add('editing');
    renderDetail(); renderList();
  }
  function closeDetail() {
    S.cur = null;
    $('lvBody').hidden = true; $('lvBody').replaceChildren(); $('lvBlank').hidden = false;
    $('lvEdit').hidden = true; $('lvDel').hidden = true; $('lvHead').textContent = '';
    root.classList.remove('editing');
  }

  // ── 추가·편집 시트 ──
  function openForm(v) {
    S.editing = v || null;
    $('lvFormTitle').textContent = v ? '영상 편집' : '영상 추가';
    $('lvLinkWrap').hidden = !!v; $('lvLinkHint').hidden = !!v;
    $('lvLink').value = ''; $('lvTitle').value = v?.title || ''; $('lvUnit').value = v?.unit || ''; $('lvDate').value = v?.date || today(); $('lvNote').value = v?.note || '';
    linkHint(); $('lvModal').hidden = false;
    (v ? $('lvTitle') : $('lvLink')).focus();
  }
  const closeForm = () => { $('lvModal').hidden = true; S.editing = null; };
  function linkHint() {
    const s = $('lvLink').value.trim(), id = youTubeId(s), h = $('lvLinkHint');
    h.classList.toggle('bad', !!s && !id);
    h.textContent = !s ? '일부 공개로 올린 영상의 공유 링크를 넣으세요.' : id ? `영상 ID ${id}` : 'YouTube 링크가 아닙니다.';
    $('lvSave').disabled = !S.editing && !id;
  }
  $('lvLink').addEventListener('input', linkHint);
  $('lvCancel').addEventListener('click', closeForm);
  $('lvModal').addEventListener('click', e => { if (e.target === $('lvModal')) closeForm(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lvModal').hidden) closeForm(); });
  $('lvForm').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('lvTitle').value.trim(), unit = $('lvUnit').value.trim(), date = $('lvDate').value || today(), note = $('lvNote').value.trim();
    $('lvSave').disabled = true;
    try {
      if (S.editing) await update(ref(db, `videos/${S.editing.id}`), { title, unit, date, note, yt: S.editing.yt });
      else {
        const yt = youTubeId($('lvLink').value); if (!yt) return;
        // 앱과 같이 맨 위에 오도록 지금 가장 작은 order 보다 1 작게
        const order = (S.videos.length ? Math.min(...S.videos.map(v => v.order)) : 0) - 1;
        const r = await push(ref(db, 'videos'), { yt, title, unit, date, order, note, createdAt: Date.now() });
        S.cur = r.key;
      }
      closeForm();
      if (S.cur) openDetail(S.cur);
    } catch (err) { alert('저장하지 못했습니다: ' + (err.message || err)); }
    finally { $('lvSave').disabled = false; }
  });

  $('lvAdd').addEventListener('click', () => openForm(null));
  $('lvEdit').addEventListener('click', () => { const v = S.videos.find(x => x.id === S.cur); if (v) openForm(v); });
  $('lvDel').addEventListener('click', async () => {
    const v = S.videos.find(x => x.id === S.cur); if (!v) return;
    if (!confirm(`「${v.title || v.yt}」 영상을 목록에서 삭제할까요?\n학생 강의 페이지에서도 사라집니다.`)) return;
    const saved = { yt: v.yt, title: v.title, unit: v.unit, date: v.date, order: v.order, note: v.note, createdAt: v.createdAt };
    closeDetail();
    try { await remove(ref(db, `videos/${v.id}`)); showUndo?.('영상을 삭제했습니다', () => set(ref(db, `videos/${v.id}`), saved)); }
    catch (err) { alert('삭제하지 못했습니다: ' + (err.message || err)); }
  });
  $('lvList').addEventListener('click', e => { const b = e.target.closest('.lv-item'); if (b) openDetail(b.dataset.id); });
  $('lvBack').addEventListener('click', () => root.classList.remove('editing'));
  $('lvSearch').addEventListener('input', renderList);

  const refresh = () => { renderList(); if (S.cur) renderDetail(); };
  return {
    open() {
      if (S.attached) return;
      S.attached = true;
      const fail = path => () => { if (path === 'videos') $('lvList').innerHTML = '<div class="rail-empty">영상 목록을 읽지 못했습니다. DB 보안 규칙을 확인하세요.</div>'; };
      onValue(ref(db, 'videos'), s => { S.videos = parseVideos(s.val()); S.loaded = true; refresh(); }, fail('videos'));
      onValue(ref(db, 'roster'), s => { S.roster = s.val() || {}; refresh(); }, fail('roster'));
      onValue(ref(db, 'members'), s => { S.members = s.val() || {}; refresh(); }, fail('members'));
      onValue(ref(db, 'views'), s => { S.views = s.val() || {}; refresh(); }, fail('views'));
    },
    reset() {
      Object.assign(S, { videos: [], roster: {}, members: {}, views: {}, attached: false, loaded: false });
      closeForm(); closeDetail();
      $('lvList').innerHTML = '<div class="rail-empty">불러오는 중…</div>';
    }
  };
}
