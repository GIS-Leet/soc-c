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

  /* ── 상단바 드롭다운 ────────────────────────────────────────────────
     상단 메뉴에 마우스를 올리면 그 아래로 카테고리가 펼쳐진다(애플 방식).
     목록은 아래 한 곳에만 적으면 되고, .geo-nav 가 있는 모든 페이지가
     같은 것을 쓴다 — 페이지마다 메뉴를 복사해 두면 반드시 어긋난다.
     키는 링크의 파일 이름. 없는 항목은 그냥 평범한 링크로 남는다. */
  const NAV_DROP = {
    'library.html': {
      cols: [
        { title: '자료 폴더', items: [
          { label: '자료실 전체', href: 'library.html', desc: '수업에 쓴 모든 파일' },
          { label: '학습지',     href: 'library.html#학습지' },
          { label: 'PPT',        href: 'library.html#PPT' },
          { label: '참고자료',   href: 'library.html#참고자료' }
        ]},
        { title: '수행평가', items: [
          { label: '지역 탐구 프로젝트', href: 'project_guide.html', desc: '주제 선정부터 발표까지' },
          { label: '질문 아카이브 목록', href: 'https://script.google.com/macros/s/AKfycbypib8sHxEek7DxJcFNizTKbm17yammTCOBRmAvVM16WbgxsNKvcMzePFEBEcZ4HGlL/exec', desc: '제출한 질문 확인', ext: true }
        ]},
        { title: '함께 보기', items: [
          { label: '진도표',       href: 'progress.html', desc: '어느 자료를 볼 차례인지' },
          { label: 'Q&A 게시판',   href: 'qna.html', desc: '자료를 보다 막혔다면' },
          { label: '시뮬레이터',   href: 'simulators.html', desc: '눈으로 확인하기' }
        ]}
      ]
    },
    'progress.html': {
      cols: [
        { title: '수업 진도', items: [
          { label: '반별 진도 현황', href: 'progress.html', desc: '우리 반은 어디까지' },
          { label: '전체 수업 계획', href: 'progress.html', desc: '단원별 차시와 학습 목표' },
          { label: '시험 범위',      href: 'progress.html', desc: '몇 차시부터 몇 차시까지' }
        ]},
        { title: '함께 보기', items: [
          { label: '자료실',      href: 'library.html', desc: '차시별 학습지 · PPT' },
          { label: '시뮬레이터',  href: 'simulators.html', desc: '눈으로 확인하기' }
        ]},
        { title: '막혔다면', items: [
          { label: 'Q&A 게시판', href: 'qna.html', desc: '수업 내용 질문' },
          { label: '건의함',      href: 'feedback.html', desc: '수업 · 홈페이지 의견' }
        ]}
      ]
    },
    'qna.html': {
      cols: [
        { title: '질문과 답변', items: [
          { label: 'Q&A 게시판',    href: 'qna.html', desc: '질문하고 답변 확인하기' },
          { label: '질문 아카이브',  href: 'https://script.google.com/macros/s/AKfycbypib8sHxEek7DxJcFNizTKbm17yammTCOBRmAvVM16WbgxsNKvcMzePFEBEcZ4HGlL/exec', desc: '수행평가 제출 목록', ext: true }
        ]},
        { title: '더 빠른 길', items: [
          { label: '카카오 오픈채팅', href: 'https://open.kakao.com/o/siXWPozi', desc: '정말 급한 질문만', ext: true },
          { label: '교무실 방문',     href: 'qna.html', desc: '평일 08:00 – 16:00' }
        ]},
        { title: '문의 · 건의', items: [
          { label: '건의함',          href: 'feedback.html', desc: '수업 · 홈페이지 의견' },
          { label: '정보화 기기 문의', href: 'support.html', desc: '기기 고장 · 기술 지원' }
        ]}
      ]
    },
    'simulators.html': {
      cols: [
        { title: '3.1 기후 환경', items: [
          { label: '지구 공전과 계절',   href: 'climate_3d.html' },
          { label: '적도 수렴대 이동',   href: 'climate_itcz.html' },
          { label: '태양 고도와 입사각', href: 'climate_solar.html' }
        ]},
        { title: '3.2 지형 변화', items: [
          { label: '지형의 형성 과정',   href: 'terrain.html' },
          { label: '지형 형성 작용',     href: 'dynamic_earth.html' },
          { label: '지형 탐구 시뮬레이터', href: 'world_landforms.html' }
        ]},
        { title: '3.3 도시 공간', items: [
          { label: '서울 대도시권 팽창', href: 'seoul.html' },
          { label: 'AI 분석 대시보드',   href: 'ai_dashboard.html', desc: '식생 · 열섬 · 인구' }
        ]}
      ],
      foot: { text: '단원별로 정리된 전체 목록', link: { label: '시뮬레이터 전체 보기', href: 'simulators.html' } }
    },
    'feedback.html': {
      cols: [
        { title: '의견 보내기', items: [
          { label: '건의함',           href: 'feedback.html', desc: '수업 · 홈페이지에 바라는 점' },
          { label: '정보화 기기 문의',  href: 'support.html', desc: '기기 고장 · 기술 지원' }
        ]},
        { title: '질문이라면', items: [
          { label: 'Q&A 게시판',      href: 'qna.html', desc: '수업 내용 질문' },
          { label: '카카오 오픈채팅',  href: 'https://open.kakao.com/o/siXWPozi', desc: '정말 급한 질문만', ext: true }
        ]}
      ]
    }
  };

  navDrop();
  function navDrop() {
    const bar = document.querySelector('header.st-bar');
    const nav = bar && bar.querySelector('.geo-nav');
    if (!nav) return;
    /* 터치 기기에는 '떠 있는 상태'가 없다. 첫 탭이 메뉴를 열고 두 번째가
       이동하는 방식은 늘 헷갈리므로, 여기서는 아예 켜지 않는다(버거 메뉴가 있다). */
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const fileOf = (href) => {
      try { return new URL(href, location.href).pathname.split('/').pop() || 'index.html'; }
      catch (err) { return ''; }
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const links = Array.prototype.filter.call(
      nav.querySelectorAll('a[href]'), (a) => NAV_DROP[fileOf(a.getAttribute('href'))]);
    if (!links.length) return;

    const drop = document.createElement('div');
    drop.className = 'geo-drop';
    const stage = document.createElement('div');
    stage.className = 'geo-drop__stage';
    drop.appendChild(stage);

    const built = {};
    links.forEach((a) => {
      const id = fileOf(a.getAttribute('href'));
      a.dataset.drop = id;
      if (built[id]) return;
      built[id] = true;
      const cfg = NAV_DROP[id];
      let d = 0;
      const cols = cfg.cols.map((c) =>
        '<div class="geo-drop__col">' +
        `<div class="geo-drop__cap" style="--d:${d++}">${esc(c.title)}</div>` +
        c.items.map((it) =>
          `<a class="geo-drop__link" style="--d:${d++}" href="${esc(it.href)}"` +
          (it.ext ? ' target="_blank" rel="noopener"' : '') + '>' +
          `<span>${esc(it.label)}${it.ext ? '<i></i>' : ''}</span>` +
          (it.desc ? `<small>${esc(it.desc)}</small>` : '') + '</a>').join('') +
        '</div>').join('');
      const foot = cfg.foot
        ? `<div class="geo-drop__foot"><span>${esc(cfg.foot.text)}</span>` +
          `<a class="lg" href="${esc(cfg.foot.link.href)}">${esc(cfg.foot.link.label)} →</a></div>`
        : '';
      const panel = document.createElement('div');
      panel.className = 'geo-drop__panel';
      panel.dataset.for = id;
      panel.style.setProperty('--cols', cfg.cols.length);
      panel.innerHTML = cols + foot;
      stage.appendChild(panel);
    });

    bar.appendChild(drop);
    const panels = Array.prototype.slice.call(stage.children);
    panels.forEach((p) => { p.inert = true; });
    drop.inert = true;

    let openId = null, tOpen = null, tClose = null;

    function show(id) {
      clearTimeout(tClose);
      const panel = stage.querySelector('[data-for="' + id + '"]');
      if (!panel || openId === id) return;
      panels.forEach((p) => {
        const on = p === panel;
        p.classList.toggle('is-on', on);
        p.inert = !on;
      });
      drop.inert = false;
      drop.classList.add('is-open');
      drop.style.height = panel.offsetHeight + 'px';
      links.forEach((a) => a.classList.toggle('is-open', a.dataset.drop === id));
      openId = id;
    }

    function hide() {
      if (openId === null) return;
      drop.classList.remove('is-open');
      drop.style.height = '0px';
      drop.inert = true;
      panels.forEach((p) => { p.classList.remove('is-on'); p.inert = true; });
      links.forEach((a) => a.classList.remove('is-open'));
      openId = null;
    }

    const later = (fn, ms) => setTimeout(fn, ms);
    function scheduleHide() { clearTimeout(tOpen); clearTimeout(tClose); tClose = later(hide, 190); }

    links.forEach((a) => {
      a.addEventListener('mouseenter', () => {
        clearTimeout(tClose); clearTimeout(tOpen);
        /* 이미 다른 판이 열려 있으면 즉시 갈아 끼운다. 처음 여는 순간에만
           110ms를 기다린다 — 바를 가로질러 지나가는 손을 붙잡지 않기 위해. */
        tOpen = later(() => show(a.dataset.drop), openId ? 0 : 110);
      });
      a.addEventListener('focus', () => show(a.dataset.drop));
      a.addEventListener('click', hide);
    });
    nav.addEventListener('mouseleave', scheduleHide);
    bar.addEventListener('mouseleave', scheduleHide);
    drop.addEventListener('mouseenter', () => { clearTimeout(tClose); });
    drop.addEventListener('mouseleave', scheduleHide);
    drop.addEventListener('click', hide);
    drop.addEventListener('focusout', (e) => {
      if (!drop.contains(e.relatedTarget) && !nav.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    addEventListener('resize', () => {
      if (openId === null) return;
      const panel = stage.querySelector('[data-for="' + openId + '"]');
      if (panel) drop.style.height = panel.offsetHeight + 'px';
    });
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
