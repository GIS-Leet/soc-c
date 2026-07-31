/* ============================================================================
   STRATUM Motion Runtime  v1.0
   ----------------------------------------------------------------------------
   Apple 「Designing Fluid Interfaces」의 원리를 웹으로 옮긴 최소 런타임.
   의존성 없음. 어떤 페이지에도 <script src="design-system/stratum.js"> 로 붙는다.

   핵심 4가지
     1. 응답    — 피드백은 pointerdown 순간에. 떼는 순간이 아니다.
     2. 직접조작 — 드래그 중에는 손가락과 1:1. 잡은 지점의 오프셋을 존중.
     3. 중단가능 — 움직이는 도중에도 다시 잡을 수 있다. 현재 화면값에서 이어간다.
     4. 속도인계 — 손을 뗀 속도로 애니메이션이 이어지고, 도착점은 '투사'로 정한다.
   ========================================================================== */
(function (global) {
  'use strict';

  const reduceMotion = () =>
    global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────────────────────────────────────────────────────────────
     Spring — 감쇠비(damping ratio)와 response(초)로 기술하는 스프링.
     Apple이 mass/stiffness/damping 대신 쓰는 두 개의 파라미터 그대로.
     항상 '현재 화면값'에서 시작하므로 중단·역전에도 튐이 없다.
     ────────────────────────────────────────────────────────────────────── */
  class Spring {
    /** @param {{damping?:number, response?:number, onUpdate:Function, onRest?:Function}} o */
    constructor(o) {
      this.zeta = o.damping ?? 1.0;
      this.response = o.response ?? 0.4;
      this.onUpdate = o.onUpdate;
      this.onRest = o.onRest || null;
      this.value = o.from ?? 0;
      this.velocity = 0;
      this.target = this.value;
      /* 정지 판정은 '값의 크기'에 비례해야 한다.
         px 단위(0~400)와 정규화 단위(0~1)를 같은 절대 허용오차로 재면
         후자는 목표에 닿기 한참 전에 멈춘 것으로 오판한다. */
      this.precision = o.precision ?? null;   // 지정하면 절대 허용오차로 고정
      this._scale = 1;
      this._raf = null;
      this._last = 0;
    }
    get isAnimating() { return this._raf !== null; }

    /** 새 목표로 재조준. 진행 중이면 현재 속도를 그대로 이어받는다(브릭월 방지). */
    animateTo(target, velocity) {
      // 이번 애니메이션이 다루는 값의 규모. 정지 허용오차의 기준이 된다
      this._scale = Math.max(Math.abs(target - this.value), Math.abs(target), Math.abs(this.value), 1e-4);
      this.target = target;
      if (velocity !== undefined) this.velocity = velocity;
      if (reduceMotion()) { this.stop(); this.value = target; this.velocity = 0; this.onUpdate(this.value); this.onRest && this.onRest(); return; }
      if (!this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); }
    }

    /** 애니메이션을 멈추고 현재 값에서 손으로 넘긴다(드래그 시작 시). */
    stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } return this.value; }

    /** 드래그 중 직접 세팅. 속도도 함께 넣어두면 놓았을 때 자연스럽다. */
    set(value, velocity) { this.stop(); this.value = value; if (velocity !== undefined) this.velocity = velocity; this.onUpdate(this.value); }

    _tick = (now) => {
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 1 / 30) dt = 1 / 30;              // 탭 전환 등으로 큰 dt가 오면 잘라낸다
      const w0 = (2 * Math.PI) / this.response;   // 고유 진동수
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {           // 안정성을 위해 240Hz로 세분 적분
        const a = -w0 * w0 * (this.value - this.target) - 2 * this.zeta * w0 * this.velocity;
        this.velocity += a * h;
        this.value += this.velocity * h;
      }
      this.onUpdate(this.value);
      const posTol = this.precision ?? this._scale * 0.002;
      const velTol = this.precision ? this.precision * 10 : this._scale * 0.05;
      const settled = Math.abs(this.value - this.target) < posTol && Math.abs(this.velocity) < velTol;
      if (settled) {
        this.value = this.target; this.velocity = 0;
        this.onUpdate(this.value);
        this._raf = null;
        this.onRest && this.onRest();
      } else {
        this._raf = requestAnimationFrame(this._tick);
      }
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
     project — 던진 손가락이 '어디로 갈 뻔했는지'를 계산.
     교과서의 v²/2a가 아니라 Apple 샘플 코드의 지수 감쇠 형태를 쓴다.
     ────────────────────────────────────────────────────────────────────── */
  function project(velocity, decelerationRate = 0.998) {
    return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
  }

  /** 투사 지점에서 가장 가까운 스냅 포인트 */
  function nearestSnap(projected, points) {
    return points.reduce((best, p) =>
      Math.abs(p - projected) < Math.abs(best - projected) ? p : best, points[0]);
  }

  /* ──────────────────────────────────────────────────────────────────────
     rubberband — 경계를 넘어가면 딱 멈추는 게 아니라 점점 저항한다.
     ────────────────────────────────────────────────────────────────────── */
  function rubberband(overshoot, dimension, constant = 0.55) {
    return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
  }

  /* ──────────────────────────────────────────────────────────────────────
     Tracker — 최근 포인터 이력으로 속도를 낸다. 마지막 두 점만 쓰면 튄다.
     ────────────────────────────────────────────────────────────────────── */
  const MAX_VELOCITY = 6000;   // px/s — 사람이 낼 수 있는 플릭의 현실적 상한

  class Tracker {
    constructor(window = 100) { this.window = window; this.samples = []; }
    add(value) {
      const t = performance.now();
      this.samples.push({ t, value });
      while (this.samples.length > 2 && t - this.samples[0].t > this.window) this.samples.shift();
    }
    /** px/s. 두 샘플 간격이 지나치게 짧으면 속도가 폭발하므로 상한을 둔다 */
    velocity() {
      if (this.samples.length < 2) return 0;
      const a = this.samples[0], b = this.samples[this.samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt < 0.004) return 0;                       // 4ms 미만은 신뢰할 수 없는 표본
      const v = (b.value - a.value) / dt;
      return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
    }
    reset() { this.samples.length = 0; }
  }

  /* ──────────────────────────────────────────────────────────────────────
     Sheet — 아래에서 올라오고, 끌어내려 닫는 시트.
     드래그 중 1:1 · 위로는 고무줄 · 놓으면 속도 투사로 열지 닫을지 결정.
     ────────────────────────────────────────────────────────────────────── */
  class Sheet {
    constructor(el, opts = {}) {
      this.el = typeof el === 'string' ? document.querySelector(el) : el;
      if (!this.el) return;
      this.scrim = opts.scrim ? (typeof opts.scrim === 'string' ? document.querySelector(opts.scrim) : opts.scrim) : null;
      this.onClose = opts.onClose || null;
      this.isOpen = false;
      this._h = 0;
      this._tracker = new Tracker();
      this._dragging = false;
      this._spring = new Spring({
        damping: 0.8, response: 0.4, from: 1,
        onUpdate: (v) => { this.el.style.setProperty('--st-y', (v * 100).toFixed(3) + '%'); },
        onRest: () => { if (!this.isOpen) this.el.classList.remove('is-open'); }
      });

      this._onDown = this._onDown.bind(this);
      this._onMove = this._onMove.bind(this);
      this._onUp = this._onUp.bind(this);
      this._onKey = this._onKey.bind(this);

      this.el.addEventListener('pointerdown', this._onDown);
      this.scrim && this.scrim.addEventListener('click', () => this.close());
      document.addEventListener('keydown', this._onKey);
    }

    open() {
      this.isOpen = true;
      this._h = this.el.offsetHeight || 1;
      this.el.classList.add('is-open');
      this.scrim && this.scrim.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this._spring.animateTo(0);
      const focusable = this.el.querySelector('button, [href], input, textarea, [tabindex]');
      focusable && focusable.focus({ preventScroll: true });
    }

    close(velocity = 0) {
      this.isOpen = false;
      this.scrim && this.scrim.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this._spring.animateTo(1, velocity / (this._h || 1));
      this.onClose && this.onClose();
    }

    _onKey(e) { if (e.key === 'Escape' && this.isOpen) this.close(); }

    _onDown(e) {
      // 본문을 스크롤 중인 손가락은 가로채지 않는다
      const body = e.target.closest('.st-sheet__body');
      if (body && body.scrollTop > 0) return;
      if (e.target.closest('button, a, input, textarea, select')) return;

      this._h = this.el.offsetHeight || 1;
      // 포인터가 이미 놓였거나 캡처가 불가한 경우에도 드래그 자체는 이어져야 한다
      try { this.el.setPointerCapture(e.pointerId); } catch (err) {}
      this.el.classList.add('is-dragging');
      this._dragging = true;
      // 움직이는 중이었어도 '지금 화면에 보이는 값'에서 이어받는다
      this._startValue = this._spring.stop();
      this._startY = e.clientY;
      this._tracker.reset();
      this._tracker.add(e.clientY);

      this.el.addEventListener('pointermove', this._onMove);
      this.el.addEventListener('pointerup', this._onUp);
      this.el.addEventListener('pointercancel', this._onUp);
    }

    _onMove(e) {
      if (!this._dragging) return;
      this._tracker.add(e.clientY);
      let dy = e.clientY - this._startY;
      // 위로 끌면(음수) 고무줄 저항
      if (this._startValue * this._h + dy < 0) {
        const over = this._startValue * this._h + dy;
        dy = -this._startValue * this._h + rubberband(over, this._h);
      }
      this._spring.set(this._startValue + dy / this._h);
    }

    _onUp(e) {
      if (!this._dragging) return;
      this._dragging = false;
      this.el.classList.remove('is-dragging');
      this.el.removeEventListener('pointermove', this._onMove);
      this.el.removeEventListener('pointerup', this._onUp);
      this.el.removeEventListener('pointercancel', this._onUp);

      const v = this._tracker.velocity();                       // px/s (아래가 +)
      const current = this._spring.value * this._h;             // px
      const projected = current + project(v);                   // 관성으로 갈 지점
      const target = nearestSnap(projected, [0, this._h]);      // 열림(0) or 닫힘(h)

      if (target === 0) {
        this.isOpen = true;
        this._spring.animateTo(0, v / this._h);
      } else {
        this.close(v);
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     Segmented — 인디케이터가 스프링으로 미끄러지는 세그먼티드 컨트롤
     ────────────────────────────────────────────────────────────────────── */
  function segmented(root, onChange) {
    const el = typeof root === 'string' ? document.querySelector(root) : root;
    if (!el) return;
    let thumb = el.querySelector('.st-segmented__thumb');
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'st-segmented__thumb';
      el.prepend(thumb);
    }
    const items = [...el.querySelectorAll('.st-segmented__item')];
    const move = (item) => {
      thumb.style.width = item.offsetWidth + 'px';
      thumb.style.transform = `translateX(${item.offsetLeft - 3}px)`;
    };
    const select = (item) => {
      items.forEach((i) => { i.classList.toggle('is-on', i === item); i.setAttribute('aria-selected', i === item); });
      move(item);
      onChange && onChange(item.dataset.value ?? item.textContent.trim(), item);
    };
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.st-segmented__item');
      if (item) select(item);
    });
    // 키보드: 좌우 화살표로 이동
    el.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
        next.focus(); select(next);
      }
    });
    const initial = items.find((i) => i.classList.contains('is-on')) || items[0];
    requestAnimationFrame(() => { if (initial) { thumb.style.transition = 'none'; move(initial); requestAnimationFrame(() => thumb.style.transition = ''); } });
    global.addEventListener('resize', () => {
      const on = items.find((i) => i.classList.contains('is-on'));
      if (on) { thumb.style.transition = 'none'; move(on); requestAnimationFrame(() => thumb.style.transition = ''); }
    });
    return { select, items };
  }

  /* ──────────────────────────────────────────────────────────────────────
     reveal — 스크롤 진입 시 한 번만. 반복하지 않는다.
     ────────────────────────────────────────────────────────────────────── */
  function reveal(selector = '.st-reveal', stagger = 55) {
    const els = [...document.querySelectorAll(selector)];
    if (!els.length) return;
    if (reduceMotion() || !('IntersectionObserver' in global)) {
      els.forEach((el) => el.classList.add('is-in')); return;
    }
    const io = new IntersectionObserver((entries) => {
      const hits = entries.filter((e) => e.isIntersecting);
      hits.forEach((entry, i) => {
        setTimeout(() => entry.target.classList.add('is-in'), i * stagger);
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  /* ──────────────────────────────────────────────────────────────────────
     theme — 기존 사이트의 'geo-theme' 키를 그대로 쓴다(호환).
     ────────────────────────────────────────────────────────────────────── */
  const theme = {
    get() { return document.documentElement.dataset.theme || (global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); },
    set(mode) {
      const root = document.documentElement;
      if (mode === 'dark') root.dataset.theme = 'dark';
      else root.dataset.theme = 'light';
      try { localStorage.setItem('geo-theme', mode); } catch (e) {}
      root.dispatchEvent(new CustomEvent('stratum:theme', { detail: mode }));
    },
    toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
    /** <head>에서 먼저 실행하면 첫 페인트의 깜빡임(FOUC)이 없다 */
    restore() {
      try {
        const saved = localStorage.getItem('geo-theme');
        if (saved) document.documentElement.dataset.theme = saved;
      } catch (e) {}
    }
  };

  /* ──────────────────────────────────────────────────────────────────────
     press — 눌린 순간의 피드백. CSS :active로 안 되는 곳(커스텀 요소)용.
     포인터가 벗어나면 취소하고, 돌아오면 다시 눌린다.
     ────────────────────────────────────────────────────────────────────── */
  function press(selector = '[data-st-press]', scale = 0.97) {
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(selector);
      if (!el) return;
      el.style.transition = `transform var(--st-dur-instant) var(--st-ease)`;
      el.style.transform = `scale(${scale})`;
      const release = () => {
        el.style.transform = '';
        el.style.transition = `transform var(--st-spring-snappy-dur) var(--st-spring-snappy)`;
        document.removeEventListener('pointerup', release);
        document.removeEventListener('pointercancel', release);
      };
      document.addEventListener('pointerup', release);
      document.addEventListener('pointercancel', release);
    }, { passive: true });
  }

  /* ──────────────────────────────────────────────────────────────────────
     autoInit — data-* 속성만으로 동작하게
     ────────────────────────────────────────────────────────────────────── */
  function init() {
    press();
    reveal();
    document.querySelectorAll('[data-st-segmented]').forEach((el) => segmented(el));
    document.querySelectorAll('[data-st-theme-toggle]').forEach((btn) =>
      btn.addEventListener('click', () => theme.toggle()));
  }

  global.Stratum = { Spring, Sheet, Tracker, project, nearestSnap, rubberband, segmented, reveal, theme, press, init, reduceMotion };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
