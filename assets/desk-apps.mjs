// Desk 공부 탭 「암기장」 — 비공개 저장소에 둔 한 파일짜리 학습 앱을 Desk 안에서 연다.
// 무엇이 있는지는 비공개 저장소 맨 위의 desk-apps.json 이 정한다(이 공개 저장소에는 앱의 이름도 내용도 없다).
//   [{ "id": "memo-geo", "title": "…", "path": "폴더/desk/앱.html", "base": "폴더", "note": "…" }]
// 앱은 격리된 틀(sandbox, 출처 없음)에서 돌고 Desk 와는 postMessage 로만 말한다:
//   앱 → Desk  {t:'app:ready',id} · {t:'app:save',id,json} · {t:'app:file',id,n,path}
//   Desk → 앱  {t:'app:state',json|fail} · {t:'app:file',n,blob}
// 기록은 desk/apps/{id} = {json, at} 에 둔다(소유자만 읽고 쓰는 desk/* 아래).

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const IMG_RE = /\.(?:webp|png|jpe?g|gif)$/i;
export const MAX_STATE = 1500000;   // 기록 JSON 글자 수 상한 — 이보다 크면 저장하지 않는다

/** 저장소 안 경로로 써도 되는 모양인지(상위 폴더 · 절대 경로 · 역슬래시 없음) */
export function cleanPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300 || /[\\\0]/.test(p) || p.startsWith('/')) return null;
  const parts = p.split('/');
  if (parts.some(s => !s || s === '.' || s === '..')) return null;
  return parts.join('/');
}

/** 앱이 달라는 그림의 저장소 경로 — base 폴더 아래의 그림 파일만 내준다 */
export function filePath(base, rel) {
  const b = cleanPath(base), r = cleanPath(rel);
  return b && r && IMG_RE.test(r) ? b + '/' + r : null;
}

/** desk-apps.json → 쓸 수 있는 항목만 */
export function parseManifest(text) {
  let list; try { list = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || !ID_RE.test(a.id || '') || seen.has(a.id)) continue;
    const path = cleanPath(a.path), base = cleanPath(a.base);
    if (!path || !/\.html?$/i.test(path) || !base || typeof a.title !== 'string' || !a.title.trim()) continue;
    seen.add(a.id);
    out.push({ id: a.id, title: a.title.trim().slice(0, 60), note: typeof a.note === 'string' ? a.note.slice(0, 120) : '', path, base });
  }
  return out;
}

const rawUrl = (repo, path) => `https://api.github.com/repos/${repo}/contents/` + path.split('/').map(encodeURIComponent).join('/');

/**
 * 틀 하나와 주고받는 일을 맡는다(화면 없음 — 시험할 수 있게 떼어 둠).
 * deps: post(msg) · loadState() → json|null · saveState(json) · loadFile(path) → Blob|null · onStatus(text) · delay(ms)
 */
export function createBridge(app, deps) {
  let synced = false, pending = null, timer = null, closed = false;
  const status = t => deps.onStatus?.(t);
  async function write() {
    timer = null; if (pending == null) return;
    const json = pending; pending = null;
    try { await deps.saveState(json); status('저장됨'); }
    catch { if (pending == null) pending = json; status('저장 실패 — 다음에 다시 보냄'); }
  }
  return {
    async handle(d) {
      if (closed || !d || d.id !== app.id) return;
      if (d.t === 'app:ready') {
        try { const json = await deps.loadState(); if (closed) return; synced = true; deps.post({ t: 'app:state', json: typeof json === 'string' ? json : null }); status('기록을 불러옴'); }
        catch { if (!closed) { deps.post({ t: 'app:state', fail: true }); status('기록을 불러오지 못함'); } }
      } else if (d.t === 'app:save') {
        // 기록을 건네주기 전에 온 저장은 빈 기록일 수 있으니 받지 않는다
        if (!synced || typeof d.json !== 'string' || d.json.length > MAX_STATE) return;
        pending = d.json; status('저장 중…');
        if (!timer) timer = setTimeout(write, deps.delay ?? 1200);
      } else if (d.t === 'app:file') {
        const path = filePath(app.base, d.path); let blob = null;
        if (path) { try { blob = await deps.loadFile(path); } catch { blob = null; } }
        if (!closed) deps.post({ t: 'app:file', n: d.n, blob });
      }
    },
    /** 닫을 때 — 밀린 저장을 바로 보낸다 */
    async close() { if (timer) { clearTimeout(timer); timer = null; } await write(); closed = true; }
  };
}

const CSS = `
.p-apps[hidden] { display: none; }   /* 자리(grid-row)는 desk.html 의 공부 탭 배치와 함께 둔다 */
.apps-list { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: baseline; }
.apps-list .btn-sub { height: 38px; padding: 0 16px; font-size: 15px; }
.apps-note { font-size: 13px; color: var(--st-label-3); }
.apps-viewer__state { font-size: 12.5px; color: var(--st-label-3); margin-right: 6px; font-feature-settings: 'tnum' 1; }
`;

/** el = 공부 탭의 빈 패널. deps: db, ref, get, set, github() → {token, repo}|null, active(), escapeHTML */
export function mountApps(el, deps) {
  const { db, ref, get, set, escapeHTML } = deps;
  if (!document.getElementById('desk-apps-css')) { const s = document.createElement('style'); s.id = 'desk-apps-css'; s.textContent = CSS; document.head.append(s); }
  let apps = [], gh = null, loaded = false, bridge = null, frameUrl = null;

  const viewer = document.createElement('div');
  viewer.className = 'mat-viewer'; viewer.hidden = true;
  viewer.innerHTML = '<div class="mat-viewer__bar"><span class="mat-viewer__name"></span><span class="mat-viewer__ops"><span class="apps-viewer__state" role="status"></span><button class="btn-sub" type="button">닫기 ✕</button></span></div>' +
    '<iframe title="암기장" sandbox="allow-scripts allow-downloads allow-modals" referrerpolicy="no-referrer"></iframe>';
  document.body.append(viewer);
  const frame = viewer.querySelector('iframe'), nameEl = viewer.querySelector('.mat-viewer__name'), stateEl = viewer.querySelector('.apps-viewer__state');
  const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  const fetchRaw = async path => {
    const res = await fetch(rawUrl(gh.repo, path), { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.raw' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.blob();
  };

  function render() {
    el.hidden = !apps.length;
    if (!apps.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="dash-h">암기장</div><div class="apps-list">' +
      apps.map(a => `<button class="btn-sub" type="button" data-app="${escapeHTML(a.id)}">${escapeHTML(a.title)}</button>`).join('') +
      (apps[0].note ? `<span class="apps-note">${escapeHTML(apps[0].note)}</span>` : '') + '</div>';
  }

  async function refresh() {
    if (!deps.active()) return;
    try {
      gh = await deps.github(); if (!gh) { apps = []; render(); return; }
      apps = parseManifest(await (await fetchRaw('desk-apps.json')).text());
    } catch { apps = []; }
    loaded = true; render();
  }

  async function close() {
    if (viewer.hidden) return;
    const b = bridge; bridge = null;
    viewer.hidden = true; frame.src = 'about:blank';
    if (frameUrl) { URL.revokeObjectURL(frameUrl); frameUrl = null; }
    if (b) await b.close();
  }

  async function open(id) {
    const app = apps.find(a => a.id === id); if (!app || !deps.active()) return;
    await close();
    nameEl.textContent = app.title; stateEl.textContent = '여는 중…'; viewer.hidden = false;
    const node = ref(db, 'desk/apps/' + app.id);
    const mine = bridge = createBridge(app, {
      post: msg => { if (bridge === mine) frame.contentWindow?.postMessage(msg, '*'); },   // 틀의 출처가 없어 대상 출처를 정할 수 없다 — 받는 쪽은 e.source 로 가린다
      loadState: async () => (await get(node)).val()?.json ?? null,
      saveState: json => set(node, { json, at: Date.now() }),
      loadFile: fetchRaw,
      onStatus: t => { if (bridge === mine) stateEl.textContent = t === '저장됨' ? '저장됨 ' + hm() : t; }
    });
    try {
      const html = await fetchRaw(app.path);
      if (bridge !== mine) return;
      frameUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      frame.src = frameUrl;
    } catch (e) { if (bridge === mine) stateEl.textContent = '열지 못함 (' + e.message + ')'; }
  }

  window.addEventListener('message', e => { if (bridge && e.source === frame.contentWindow && deps.active()) bridge.handle(e.data); });
  window.addEventListener('pagehide', () => { bridge?.close(); });
  viewer.querySelector('button').addEventListener('click', close);
  el.addEventListener('click', e => { const b = e.target.closest('[data-app]'); if (b) open(b.dataset.app); });

  return { refresh, open, close, loaded: () => loaded };
}
