// 도시 · 인구 변화 실험(ai_dashboard.html) — 두 실험 사이를 고르는 탭. 고른 탭은 주소(?t=pop)에 남긴다.
// 실험마다 처음 열 때 한 번만 자료를 불러 그린다: assets/dashboard-land.mjs · assets/dashboard-pop.mjs
import { $, $$, params } from './map-kit.mjs?v=affb9c7a';

const VIEWS = {
  land: { el: '#landView', load: () => import('./dashboard-land.mjs') },
  pop: { el: '#popView', load: () => import('./dashboard-pop.mjs') },
};
const started = {};

async function show(t, { push = true } = {}) {
  if (!VIEWS[t]) t = 'land';
  $$('#dbTabs [data-t]').forEach((b) => {
    const on = b.dataset.t === t;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  });
  for (const [k, v] of Object.entries(VIEWS)) $(v.el).hidden = k !== t;
  document.body.dataset.tab = t;
  if (push) {
    const q = new URLSearchParams(location.search);
    for (const k of [...q.keys()]) q.delete(k);
    if (t !== 'land') q.set('t', t);
    try { history.replaceState(null, '', location.pathname.split('/').pop() + (q.toString() ? '?' + q : '')); } catch {}
  }
  if (!started[t]) {
    started[t] = VIEWS[t].load().then((m) => m.main($(VIEWS[t].el))).catch((e) => {
      console.error(e);
      $(VIEWS[t].el).innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>';
    });
  } else {
    const m = await VIEWS[t].load();
    m.shown?.();
  }
}

$('#dbTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]');
  if (b) show(b.dataset.t);
});
$('#dbTabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tabs = $$('#dbTabs [data-t]');
  const i = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  n.focus();
  show(n.dataset.t);
});
show(params().get('t') === 'pop' ? 'pop' : 'land', { push: false });
