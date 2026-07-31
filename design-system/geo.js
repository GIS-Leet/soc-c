/* ============================================================================
   GEOGRAPHIA — 사이트 공통 동작
   전체 메뉴 · 테마 전환 · 페이지 전환. stratum.js 다음에 불러온다.
   ========================================================================== */
(function () {
  'use strict';

  /* ── 전체 메뉴 ─────────────────────────────────────────────────────── */
  const menu = document.getElementById('geoMenu');
  const burger = document.getElementById('geoBurger');
  const close = document.getElementById('geoClose');
  if (menu && burger && close) {
    const set = (on) => {
      menu.classList.toggle('open', on);
      burger.setAttribute('aria-expanded', String(on));
      document.body.style.overflow = on ? 'hidden' : '';
      (on ? close : burger).focus({ preventScroll: true });
    };
    burger.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) set(false);
    });
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  }

  /* ── 테마 (기존 geo-theme 키 유지) ─────────────────────────────────── */
  const themeBtn = document.getElementById('geoTheme');
  if (themeBtn && window.Stratum) {
    const sync = () => {
      const dark = Stratum.theme.get() === 'dark';
      const m = themeBtn.querySelector('.moon'), s = themeBtn.querySelector('.sun');
      if (m) m.style.display = dark ? 'none' : '';
      if (s) s.style.display = dark ? '' : 'none';
    };
    themeBtn.addEventListener('click', () => { Stratum.theme.toggle(); sync(); });
    sync();
  }

  /* ── 페이지 전환 — 누른 링크 자리에서 화면이 열린다 ──────────────────
     macOS에서 아이콘을 눌러 앱이 열리는 그 느낌. clip-path만 애니메이션해
     레이아웃을 건드리지 않는다. */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.dataset.noLaunch !== undefined) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.hash && url.pathname === location.pathname) return;   // 같은 페이지 앵커
    e.preventDefault();
    open(a, url.href);
  });

  function open(el, href) {
    if (reduce) { location.href = href; return; }
    const r = el.getBoundingClientRect();
    const veil = document.createElement('div');
    veil.className = 'launch';
    veil.innerHTML = '<i></i>';
    veil.style.clipPath =
      `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px` +
      ` round ${Math.min(r.height / 2, 40)}px)`;
    document.body.appendChild(veil);
    document.body.classList.add('is-launching');

    let gone = false;
    const go = () => { if (!gone) { gone = true; location.href = href; } };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      veil.style.transition = 'clip-path 620ms var(--st-spring-smooth)';
      veil.style.clipPath = 'inset(0px 0px 0px 0px round 0px)';
    }));
    veil.addEventListener('transitionend', go);
    setTimeout(go, 900);   // 애니메이션이 돌지 않아도 반드시 이동
  }
})();
