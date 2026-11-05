// Desk 「시안」 탭 — 비공개 저장소에 둔 한 파일짜리 화면 시안을 탭 안에서 연다.
// 무엇이 있는지는 비공개 저장소 맨 위의 desk-pages.json 이 정한다(이 공개 저장소에는 시안의 이름도 내용도 없다). 모양은 desk-apps.json 과 같다.
// 시안은 격리된 틀(sandbox, 출처 없음)에서 돈다. 암기장과 달리 남길 기록이 없어 Desk 와 주고받는 말이 없고, 바깥 주소는 새 탭으로만 연다.

import { parseManifest, rawUrl } from './desk-apps.mjs?v=cf3f574f';

// allow-same-origin 을 넣지 않는다 — 넣으면 틀 안의 글이 Desk 의 로그인과 토큰에 닿는다
export const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

const CSS = `
.pg-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.pg-list { display: flex; flex-wrap: wrap; gap: 8px; }
.pg-list .btn-sub { height: 34px; padding: 0 14px; font-size: 14px; }
.pg-list .btn-sub.on { background: var(--st-fill); }
.pg-msg { font-size: 15px; color: var(--st-label-2); padding: 18px 2px; }
.pg-frame { flex: 1; min-height: 0; width: 100%; border: 1px solid var(--st-separator-strong); border-radius: 10px; background: #fff; }
@media (max-width: 860px) { .pg-wrap { height: calc(100dvh - 170px); } }
`;

/** el = 빈 뷰. deps: github() → {token, repo}|null, active(), escapeHTML */
export function mountPages(el, deps) {
  if (!document.getElementById('desk-pages-css')) { const s = document.createElement('style'); s.id = 'desk-pages-css'; s.textContent = CSS; document.head.append(s); }
  let pages = [], gh = null, loaded = false, url = null, cur = null;
  const list = document.createElement('div'); list.className = 'pg-list';
  const msg = document.createElement('p'); msg.className = 'pg-msg'; msg.hidden = true;
  const frame = document.createElement('iframe');
  frame.className = 'pg-frame'; frame.title = '시안'; frame.hidden = true;
  frame.setAttribute('sandbox', SANDBOX); frame.setAttribute('referrerpolicy', 'no-referrer');
  el.append(list, msg, frame);

  const say = t => { msg.textContent = t; msg.hidden = !t; frame.hidden = !!t; };
  const fetchRaw = async path => {
    const res = await fetch(rawUrl(gh.repo, path), { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.raw' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.blob();
  };
  function render() {
    list.hidden = pages.length < 2;
    list.innerHTML = pages.map(p => `<button class="btn-sub${p.id === cur ? ' on' : ''}" type="button" data-page="${deps.escapeHTML(p.id)}">${deps.escapeHTML(p.title)}</button>`).join('');
  }
  async function show(id) {
    const p = pages.find(x => x.id === id); if (!p) return;
    cur = id; render(); say('여는 중…');
    try {
      const html = await fetchRaw(p.path);
      if (cur !== id) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      frame.src = url; say('');
    } catch (e) { if (cur === id) say('열지 못했습니다 (' + e.message + ')'); }
  }
  /** 탭을 처음 열 때 목록을 받고 첫 시안을 연다 */
  async function open() {
    if (loaded || !deps.active()) return;
    say('불러오는 중…');
    try {
      gh = await deps.github();
      if (!gh) { say('자료 탭에서 GitHub 저장소를 연결하면 열립니다.'); return; }
      pages = parseManifest(await (await fetchRaw('desk-pages.json')).text());
    } catch { say('시안 목록을 읽지 못했습니다.'); return; }
    loaded = true;
    if (!pages.length) { say('올려 둔 시안이 없습니다.'); return; }
    await show(pages[0].id);
  }
  list.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) show(b.dataset.page); });
  return { open };
}
