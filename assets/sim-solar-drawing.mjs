import { line, text, arrow, circle } from "./sim-canvas.mjs?v=0a622b13";
const ground = new Image();
ground.src = "assets/sim-textures/ground-color.jpg";
ground.onload = () => document.dispatchEvent(new Event("lab:assets"));
export function drawSolar(ctx, w, h, altitude, slope, illum) {
  const style = getComputedStyle(document.documentElement),
    ink = style.getPropertyValue("--st-label").trim(),
    muted = style.getPropertyValue("--st-label-2").trim(),
    blue = style.getPropertyValue("--st-accent-ink").trim();
  const scale = Math.min(w / 730, h / 475),
    cx = w * 0.46,
    cy = h * 0.61;
  const a = (altitude * Math.PI) / 180,
    b = (slope * Math.PI) / 180,
    dir = [Math.cos(b), Math.sin(b)],
    normal = [Math.sin(b), -Math.cos(b)],
    ray = [-Math.cos(a), Math.sin(a)];
  const project = (u, z, lift = 0) => [
    cx + (dir[0] * u + z * 0.5) * scale,
    cy + (dir[1] * u + z * 0.3 - lift) * scale,
  ];
  const polygon = (points, fill, stroke) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };
  const corners = [
    project(-225, -110),
    project(225, -110),
    project(225, 110),
    project(-225, 110),
  ];
  // The parallelogram is an orthographic surface patch. Its height is defined
  // by the same slope used in the cosine calculation, never by its photograph.
  for (const ids of [
    [1, 2],
    [2, 3],
  ]) {
    const q = ids.map((i) => corners[i]);
    polygon(
      [
        q[0],
        q[1],
        [q[1][0], q[1][1] + 29 * scale],
        [q[0][0], q[0][1] + 29 * scale],
      ],
      ids[0] === 1 ? "#666052" : "#827969",
    );
  }
  ctx.save();
  ctx.transform(
    dir[0] * scale,
    dir[1] * scale,
    0.5 * scale,
    0.3 * scale,
    cx,
    cy,
  );
  ctx.fillStyle =
    ground.complete && ground.naturalWidth
      ? ctx.createPattern(ground, "repeat")
      : "#869177";
  ctx.fillRect(-225, -110, 450, 220);
  ctx.fillStyle = `rgba(15,24,32,${0.15 + (1 - illum.cosine) * 0.23})`;
  ctx.fillRect(-225, -110, 450, 220);
  ctx.restore();
  polygon(corners, "rgba(0,0,0,0)", "#899183");
  const length = 205 * scale,
    sun = [cx + Math.cos(a) * length, cy - Math.sin(a) * length];
  const halfBeam = 16 * scale,
    depth = 55;
  const hit = (offset) => {
    const ox = sun[0] + offset * Math.sin(a),
      oy = sun[1] + offset * Math.cos(a),
      cross = ray[0] * dir[1] - ray[1] * dir[0];
    if (illum.cosine < 1e-8) return null;
    const t = ((cx - ox) * dir[1] - (cy - oy) * dir[0]) / cross;
    return [ox + ray[0] * t, oy + ray[1] * t];
  };
  const hitA = hit(-halfBeam),
    hitB = hit(halfBeam),
    za = [-0.5 * depth * scale, -0.3 * depth * scale],
    zb = [0.5 * depth * scale, 0.3 * depth * scale];
  if (hitA && hitB) {
    const on = (p, z) => [p[0] + z[0], p[1] + z[1]];
    ctx.save();
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    ctx.clip();
    polygon(
      [on(hitA, za), on(hitB, za), on(hitB, zb), on(hitA, zb)],
      "rgba(255,219,135,.65)",
      "#ffe8b0",
    );
    ctx.restore();
    // Clip the drawn beam to the viewport at grazing incidence. The numerical
    // area ratio remains uncapped and becomes null for a non-illuminated face.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const nearA = [
        sun[0] - halfBeam * Math.sin(a),
        sun[1] - halfBeam * Math.cos(a),
      ],
      nearB = [
        sun[0] + halfBeam * Math.sin(a),
        sun[1] + halfBeam * Math.cos(a),
      ];
    polygon([nearA, nearB, hitB, hitA], "rgba(255,205,98,.17)");
    for (let i = -2; i <= 2; i++) {
      const d = (i * halfBeam) / 2,
        p = hit(d);
      arrow(
        ctx,
        sun[0] + d * Math.sin(a),
        sun[1] + d * Math.cos(a),
        p[0],
        p[1],
        "#c58a2a",
        5,
      );
    }
    ctx.restore();
  } else
    for (let i = -1; i <= 1; i++)
      arrow(
        ctx,
        sun[0],
        sun[1] + i * 8,
        cx + ray[0] * 120 * scale,
        cy + ray[1] * 120 * scale + i * 8,
        "#b58a42",
        5,
      );
  const normalEnd = [
    cx + normal[0] * 138 * scale,
    cy + normal[1] * 138 * scale,
  ];
  line(ctx, cx, cy, normalEnd[0], normalEnd[1], blue, 1.5, [5, 5]);
  circle(ctx, cx, cy, 3, blue);
  text(ctx, "법선", normalEnd[0] - 8, normalEnd[1] - 10, 12, blue, "right");
  line(ctx, cx, cy, cx + 85 * scale, cy, muted, 1, [3, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, 49 * scale, -a, 0);
  ctx.strokeStyle = "#b77a26";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, `${altitude}°`, cx + 61 * scale, cy - 7, 13, ink);
  const light = ctx.createRadialGradient(
    sun[0] - 5,
    sun[1] - 5,
    1,
    sun[0],
    sun[1],
    20 * scale,
  );
  light.addColorStop(0, "#fff9dc");
  light.addColorStop(0.7, "#f5d183");
  light.addColorStop(1, "#d59b42");
  circle(ctx, sun[0], sun[1], 20 * scale, light);
  text(ctx, "같은 폭의 평행한 햇빛", w * 0.06, 32, 12, muted);
  text(
    ctx,
    `수광 비율 ${(illum.cosine * 100).toFixed(1)}%`,
    w * 0.06,
    58,
    16,
    ink,
  );
  text(
    ctx,
    illum.footprint === null
      ? "직접 받는 빛 없음"
      : `수직 입사 대비 면적 ${illum.footprint.toFixed(2)}배`,
    w / 2,
    h - 31,
    14,
    ink,
    "center",
  );
  text(
    ctx,
    "질감은 지표 표현 · 빛의 폭과 입사각으로 수광량 계산",
    w / 2,
    h - 10,
    11,
    muted,
    "center",
  );
}
