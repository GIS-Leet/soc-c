/* ============================================================================
   GEOGRAPHIA — 2D 캔버스 헬퍼
   ----------------------------------------------------------------------------
   캔버스를 width="700" 처럼 고정 크기로 두면 두 가지가 한꺼번에 나빠진다.
     · 고해상도 화면에서 흐릿하다 (CSS 픽셀 1개를 물리 픽셀 2~3개로 늘려 그림)
     · 컨테이너가 넓어져도 그림은 그대로라 여백만 생긴다

   fitCanvas 는 그림 코드를 고치지 않고 이 둘을 해결한다.
   기존 좌표계(설계 공간)는 그대로 두고, 그 공간을 컨테이너에 맞춰
   확대·축소해서 얹는다. 비율은 유지하고 가운데 정렬한다(contain).

     Geo.fitCanvas(canvas, 700, 450, redraw);   // 한 번 호출해 두면
     Geo.beginFrame(ctx);                        // 매 프레임 맨 앞에서

   ========================================================================== */
(function (global) {
  'use strict';

  var fits = new WeakMap();

  function measure(canvas, dw, dh) {
    var box = canvas.parentElement || canvas;
    var cw = box.clientWidth || dw;
    var ch = box.clientHeight || dh;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    var scale = Math.min(cw / dw, ch / dh);
    fits.set(canvas, {
      dpr: dpr, scale: scale,
      ox: (cw - dw * scale) / 2,
      oy: (ch - dh * scale) / 2,
      dw: dw, dh: dh
    });
  }

  /** 캔버스를 부모에 맞추고, 크기가 바뀌면 다시 맞춘 뒤 redraw 를 부른다 */
  function fitCanvas(canvas, designW, designH, redraw) {
    if (!canvas) return;
    var apply = function () {
      measure(canvas, designW, designH);
      if (typeof redraw === 'function') redraw();
    };
    apply();

    if (global.ResizeObserver) {
      var ro = new ResizeObserver(function () { apply(); });
      ro.observe(canvas.parentElement || canvas);
    } else {
      global.addEventListener('resize', apply);
    }
    return apply;
  }

  /** 매 프레임 시작 — 변환을 걸고 화면을 지운다 */
  function beginFrame(ctx) {
    var canvas = ctx.canvas;
    var f = fits.get(canvas);
    if (!f) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var k = f.dpr * f.scale;
    ctx.setTransform(k, 0, 0, k, f.ox * f.dpr, f.oy * f.dpr);
  }

  /** 현재 테마의 색 토큰을 캔버스에서 쓸 수 있게 꺼내 온다 */
  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || '#000';
  }

  global.Geo = global.Geo || {};
  global.Geo.fitCanvas = fitCanvas;
  global.Geo.beginFrame = beginFrame;
  global.Geo.token = token;
})(window);
