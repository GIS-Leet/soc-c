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
