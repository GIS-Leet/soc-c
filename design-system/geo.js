/* ============================================================================
   GEOGRAPHIA — 사이트 공통 동작
   전체 메뉴 · 테마 전환 · 페이지 전환. stratum.js 다음에 불러온다.
   ========================================================================== */
(function () {
  'use strict';

  // 메뉴와 게시판 대화상자의 초점·배경 비활성화를 같은 규칙으로 처리함.
  window.GeographiaDialog = function(root, initialFocus) {
    let opened=false, previous=null, overflow='';
    const backgrounds=new Map();
    const focusables=()=>[...root.querySelectorAll('a[href],button,input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    function closeDialog() {
      if(!opened)return;opened=false;
      for(const [el,inert]of backgrounds)el.inert=inert;backgrounds.clear();
      document.body.style.overflow=overflow;root.inert=true;
      if(previous?.isConnected)previous.focus({preventScroll:true});
    }
    document.addEventListener('keydown',event=>{
      if(!opened||event.key!=='Tab')return;
      const items=focusables(),first=items[0],last=items.at(-1);if(!first)return;
      if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
    });
    document.addEventListener('focusin',event=>{if(opened&&!root.contains(event.target))(initialFocus?.()||focusables()[0])?.focus();});
    return {
      open(returnFocus){
        if(opened)return;opened=true;previous=returnFocus||document.activeElement;overflow=document.body.style.overflow;
        root.inert=false;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
        let branch=root;
        while(branch.parentElement){for(const sibling of branch.parentElement.children)if(sibling!==branch&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){backgrounds.set(sibling,sibling.inert);sibling.inert=true;}if(branch.parentElement===document.body)break;branch=branch.parentElement;}
        document.body.style.overflow='hidden';(initialFocus?.()||focusables()[0])?.focus({preventScroll:true});
      },close:closeDialog
    };
  };

  /* ── 전체 메뉴 ─────────────────────────────────────────────────────── */
  const menu = document.getElementById('geoMenu');
  const burger = document.getElementById('geoBurger');
  const close = document.getElementById('geoClose');
  if (menu && burger && close) {
    menu.inert=true;
    const dialog=window.GeographiaDialog(menu,()=>close);
    const set = (on) => {
      menu.classList.toggle('open', on);
      burger.setAttribute('aria-expanded', String(on));
      on?dialog.open():dialog.close();
    };
    burger.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    document.addEventListener('keydown', event => { if(event.key==='Escape'&&menu.classList.contains('open')){event.preventDefault();set(false);} });
    menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>set(false)));
  }

  /* ── 상단바 드롭다운 ────────────────────────────────────────────────
     상단 메뉴에 마우스를 올리면 그 아래로 카테고리가 펼쳐진다(애플 방식).
     목록은 아래 한 곳에만 적으면 되고, .geo-nav 가 있는 모든 페이지가
     같은 것을 쓴다 — 페이지마다 메뉴를 복사해 두면 반드시 어긋난다.
     키는 링크의 파일 이름. 없는 항목은 그냥 평범한 링크로 남는다. */
  /* site-nav:drop — scripts/site-map.mjs 에서 만든다. 여기를 직접 고치지 말 것 */
  const NAV_DROP = {
    'library.html': {
      cols: [
        { title: '공부 자료', items: [{ label: '자료실', href: 'library.html', desc: '학습지, PPT, 참고자료' }, { label: '통합사회 기출 문항', href: 'gichul.html', desc: '단원별, 시험별 풀이' }] }
      ]
    },
    'simulators.html': {
      cols: [
        { title: '3.1 기후 환경', items: [{ label: '지구 공전과 계절', href: 'climate_3d.html' }, { label: '적도 수렴대의 이동', href: 'climate_itcz.html' }, { label: '태양 고도와 일사량', href: 'climate_solar.html' }] },
        { title: '3.2 지형 변화', items: [{ label: '지형 만들기 스튜디오', href: 'terrain.html' }, { label: '지형 형성 작용', href: 'dynamic_earth.html' }, { label: '세계 지형 탐구', href: 'world_landforms.html' }] },
        { title: '3.3 도시 공간', items: [{ label: '서울 대도시권의 확장', href: 'seoul.html' }, { label: '도시와 인구 변화 실험', href: 'ai_dashboard.html', desc: '녹지, 열섬, 인구' }] },
        { title: '지도와 통계', items: [{ label: '통합사회 GIS 지도', href: 'maps.html', desc: '단원마다 지도 하나' }, { label: '기후 그래프', href: 'climate.html', desc: '관측소 223곳, 쾨펜 기후' }, { label: '통계로 보는 세계', href: 'stats.html', desc: '세계 217개국, 우리나라 시·도' }] }
      ],
      foot: { text: '단원별로 정리된 전체 목록', link: { label: '시뮬레이터 전체 보기', href: 'simulators.html' } }
    }
  };
  /* /site-nav:drop */

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
          `<a class="lg" href="${esc(cfg.foot.link.href)}">${esc(cfg.foot.link.label)}</a></div>`
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
