import { earthImage } from "./sim-earth-image.mjs?v=9051904f";
import { cloudField } from "./sim-cloud-field.mjs?v=b501d35c";
import { line, text, arrow } from "./sim-canvas.mjs?v=0a622b13";
let earth = null;
const cloudImage = cloudField();
earthImage.then((image) => {
  earth = image;
  document.dispatchEvent(new Event("lab:assets"));
});
export function drawConvergence(ctx, w, h, center, lat, month, fallback) {
  const styles = getComputedStyle(document.documentElement),
    ink = styles.getPropertyValue("--st-label").trim(),
    muted = styles.getPropertyValue("--st-label-2").trim(),
    blue = styles.getPropertyValue("--st-accent-ink").trim();
  const left = w < 500 ? 34 : 48,
    right = w - 20,
    width = right - left,
    top = 58,
    mh = width / 3,
    bottom = top + mh,
    y = (v) => top + ((60 - v) / 120) * mh;
  text(
    ctx,
    `${Math.floor(month)}월 · 수렴대 중심 ${Math.abs(center).toFixed(1)}°${center >= 0 ? "N" : "S"}`,
    left,
    30,
    14,
    ink,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, mh);
  ctx.clip();
  const map = earth || fallback;
  ctx.drawImage(
    map,
    0,
    map.height / 6,
    map.width,
    (map.height * 2) / 3,
    left,
    top,
    width,
    mh,
  );
  ctx.fillStyle = "rgba(8,23,39,.16)";
  ctx.fillRect(left, top, width, mh);
  for (const v of [-30, 0, 30])
    line(ctx, left, y(v), right, y(v), "#ffffff80", 1, v === 0 ? [5, 4] : []);
  // Procedural clouds illustrate convergence only; no observed cloud product
  // or longitudinal variation is implied by their decorative small-scale shape.
  const bandHeight = Math.max(15, mh * 0.14);
  ctx.drawImage(
    cloudImage,
    left,
    y(center) - bandHeight / 2,
    width,
    bandHeight,
  );
  line(ctx, left, y(center), right, y(center), "#fff3c1", 1.5, [5, 4]);
  for (let i = 0; i < 6; i++) {
    const x = left + ((i + 0.5) / 6) * width;
    arrow(ctx, x + 12, y(center + 24), x, y(center + 7), "#fff", 5);
    arrow(ctx, x + 12, y(center - 24), x, y(center - 7), "#fff", 5);
  }
  line(ctx, left, y(lat), right, y(lat), "#8cdaff", 2, [2, 4]);
  ctx.restore();
  for (const v of [-30, 0, 30])
    text(
      ctx,
      v === 0 ? "0°" : `${Math.abs(v)}°${v > 0 ? "N" : "S"}`,
      left - 6,
      y(v) + 4,
      11,
      muted,
      "right",
    );
  text(
    ctx,
    `관찰 위도 ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`,
    right,
    bottom + 22,
    12,
    blue,
    "right",
  );
  text(ctx, "구름: 개념 표현", left, bottom + 22, 11, muted);
  // A separate latitude section keeps vertical ascent legible on small screens.
  const base = h - 51,
    cx = left + width / 2,
    cy = Math.max(bottom + 72, h - 133),
    spread = Math.min(115, width * 0.27);
  line(ctx, left, base, right, base, muted, 1);
  arrow(ctx, cx - spread, base - 12, cx - 12, base - 12, blue, 6);
  arrow(ctx, cx + spread, base - 12, cx + 12, base - 12, blue, 6);
  arrow(ctx, cx, base - 14, cx, cy - 12, blue, 6);
  ctx.drawImage(cloudImage, 260, 0, 330, 128, cx - 68, cy - 22, 136, 44);
  text(ctx, "상승", cx + 32, base - 24, 12, ink);
  text(ctx, "지표에서 수렴 → 상승 · 응결", cx, base + 23, 12, ink, "center");
  text(
    ctx,
    "NASA 지표 합성 영상 · 바람과 구름은 단순화한 모형",
    w / 2,
    h - 9,
    11,
    muted,
    "center",
  );
}
