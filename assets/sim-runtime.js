/* Demand-driven rendering: idle scenes stop; offscreen scenes do no GPU work. */
(() => {
  const loops = new Set();
  Lab.createRenderer = (THREE, options) => {
    try {
      return new THREE.WebGLRenderer(options);
    } catch {
      document.body.dataset.renderer = "2d";
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d");
      let w = 1,
        h = 1;
      const info = document.querySelector(".guide-badge");
      if (info)
        info.textContent =
          "2D 대체 보기 · 조건 변경과 수치 탐구는 계속 사용할 수 있습니다";
      document
        .querySelectorAll('#resetView,#rotateToggle,[data-tool="orbit"]')
        .forEach((el) => (el.disabled = true));
      return {
        isFallback: true,
        domElement: canvas,
        shadowMap: { enabled: false },
        capabilities: { getMaxAnisotropy: () => 1 },
        setPixelRatio() {},
        setSize(width, height) {
          w = width;
          h = height;
          canvas.width = width;
          canvas.height = height;
          canvas.style.width = width + "px";
          canvas.style.height = height + "px";
        },
        render() {
          if (!ctx) return;
          ctx.fillStyle = "#102827";
          ctx.fillRect(0, 0, w, h);
          if (Lab.model?.fallback) Lab.model.fallback(ctx, w, h);
          else if (Lab.model?.profile) {
            const p = Lab.model.profile(),
              values = [...p.y, ...p.baseline],
              min = Math.min(...values),
              max = Math.max(...values) + 1;
            ctx.font = "14px sans-serif";
            ctx.fillStyle = "#e1e6cf";
            ctx.fillText("중앙 단면 · 실선 현재 / 점선 첫 단계", 24, 36);
            for (const [series, color, dash] of [
              [p.baseline, "#adc4ad", [5, 5]],
              [p.y, "#eec28a", []],
            ]) {
              ctx.beginPath();
              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.setLineDash(dash);
              series.forEach((v, i) => {
                const x = 30 + (i / (series.length - 1)) * (w - 60),
                  y = h - 60 - ((v - min) / (max - min)) * (h - 130);
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
              });
              ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.fillText(
              "모형 높이 " + min.toFixed(1) + " ~ " + (max - 1).toFixed(1),
              24,
              h - 25,
            );
          } else {
            ctx.fillStyle = "#dce6ce";
            ctx.font = "16px sans-serif";
            ctx.fillText("수치 모형을 준비하고 있습니다.", 24, 45);
          }
        },
      };
    }
  };
  Lab.invalidate = () => loops.forEach((loop) => loop.invalidate());
  Lab.renderLoop = (
    draw,
    { element, controls, renderer, active = () => false } = {},
  ) => {
    let handle = 0,
      visible = true,
      dirty = true,
      last = 0,
      disposed = false,
      frames = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const schedule = () => {
      if (!handle && !disposed && !document.hidden && visible)
        handle = requestAnimationFrame(tick);
    };
    const invalidate = () => {
      dirty = true;
      schedule();
    };
    const quality = () => {
      if (renderer) {
        renderer.setPixelRatio(
          Math.min(
            devicePixelRatio || 1,
            Lab.quality === "eco" ? 1 : Lab.quality === "high" ? 2 : 1.5,
          ),
        );
        renderer.shadowMap.enabled = Lab.quality !== "eco";
      }
      invalidate();
    };
    const tick = (time) => {
      handle = 0;
      if (disposed || document.hidden || !visible) return;
      const fps = Lab.quality === "eco" ? 20 : Lab.quality === "high" ? 60 : 30;
      if (time - last < 1000 / fps - 0.5) {
        schedule();
        return;
      }
      if (dirty || active()) {
        dirty = false;
        last = time;
        draw(time);
        frames++;
      }
      if (dirty || active()) schedule();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) invalidate();
        else if (handle) {
          cancelAnimationFrame(handle);
          handle = 0;
        }
      },
      { rootMargin: "80px" },
    );
    if (element) observer.observe(element);
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(handle);
        handle = 0;
      } else invalidate();
    };
    const loop = {
      invalidate,
      get frames() {
        return frames;
      },
      dispose() {
        disposed = true;
        cancelAnimationFrame(handle);
        observer.disconnect();
        controls?.removeEventListener("change", invalidate);
        document.removeEventListener("visibilitychange", visibility);
        document.removeEventListener("lab:quality", quality);
        reduced.removeEventListener("change", invalidate);
        loops.delete(loop);
      },
    };
    if (renderer)
      Lab.snapshot = () => {
        draw(performance.now());
        return renderer.domElement;
      };
    loops.add(loop);
    controls?.addEventListener("change", invalidate);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("lab:quality", quality);
    reduced.addEventListener("change", invalidate);
    quality();
    return loop;
  };
  for (const event of ["input", "change", "click", "pointermove", "wheel"])
    document.addEventListener(event, () => Lab.invalidate(), { passive: true });
  window.addEventListener("resize", () => Lab.invalidate());
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) loops.forEach((loop) => loop.dispose());
  });
  window.addEventListener("pageshow", () => Lab.invalidate());
  Lab.renderStats = () => [...loops].map((loop) => ({ frames: loop.frames }));
})();
