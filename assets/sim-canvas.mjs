export function fitCanvas(canvas, draw) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  let width = 0,
    height = 0;
  const render = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
  };
  new ResizeObserver(render).observe(canvas);
  document.addEventListener("lab:theme", render);
  document.addEventListener("lab:assets", render);
  document.fonts?.ready.then(render);
  return render;
}
export function line(
  ctx,
  x1,
  y1,
  x2,
  y2,
  color = "#769b89",
  width = 1,
  dash = [],
) {
  if (
    document.body.dataset.design === "stratum" &&
    !ctx.canvas.closest(".stage")
  ) {
    const styles = getComputedStyle(document.documentElement);
    color = styles
      .getPropertyValue(
        ["#bc5634", "#b85635"].includes(color)
          ? "--st-accent-ink"
          : "--st-label-3",
      )
      .trim();
  }
  if (
    !ctx.canvas.closest(".stage") &&
    document.documentElement.dataset.theme === "dark" &&
    ["#bc5634", "#b85635"].includes(color)
  )
    color = "#efa884";
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}
export function text(
  ctx,
  label,
  x,
  y,
  size = 11,
  color = "#b9cdba",
  align = "left",
) {
  if (
    document.body.dataset.design === "stratum" &&
    !ctx.canvas.closest(".stage")
  ) {
    color = getComputedStyle(document.documentElement)
      .getPropertyValue("--st-label-3")
      .trim();
    size = Math.max(12, size);
  }
  if (
    !ctx.canvas.closest(".stage") &&
    ["#6d806f", "#738073", "#7a887a"].includes(color)
  )
    color =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--muted")
        .trim() || color;
  ctx.font = `${size}px "Space Grotesk","Pretendard Variable",sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(label, x, y);
}
export function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
export function arrow(ctx, x1, y1, x2, y2, color = "#dabb88", size = 6) {
  line(ctx, x1, y1, x2, y2, color);
  const a = Math.atan2(y2 - y1, x2 - x1);
  line(
    ctx,
    x2,
    y2,
    x2 - size * Math.cos(a - 0.5),
    y2 - size * Math.sin(a - 0.5),
    color,
  );
  line(
    ctx,
    x2,
    y2,
    x2 - size * Math.cos(a + 0.5),
    y2 - size * Math.sin(a + 0.5),
    color,
  );
}
