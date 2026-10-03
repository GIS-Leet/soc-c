// Deterministic illustrative cloud opacity, independent of weather calculations.
export function cloudField() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext("2d"),
    data = ctx.createImageData(c.width, c.height);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    return (
      (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) +
      (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v
    );
  };
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const field =
        noise(x / 25, y / 19) * 0.6 +
        noise(x / 9, y / 8) * 0.27 +
        noise(x / 3, y / 3) * 0.13;
      const envelope = Math.exp(-(((y - 64) / 35) ** 2)),
        alpha = Math.max(0, Math.min(1, (field * envelope - 0.15) * 2.2));
      const shade = Math.max(
        0,
        Math.min(
          1,
          0.82 +
            (noise(x / 25, (y - 5) / 19) - noise(x / 25, (y + 5) / 19)) * 0.9,
        ),
      );
      const k = (y * c.width + x) * 4;
      data.data[k] = 220 + shade * 35;
      data.data[k + 1] = 225 + shade * 30;
      data.data[k + 2] = 233 + shade * 22;
      data.data[k + 3] = alpha * 255;
    }
  ctx.putImageData(data, 0, 0);
  return c;
}
