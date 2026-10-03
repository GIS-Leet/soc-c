/* Static globe plate drawn locally from Natural Earth coastlines. */
(() => {
  const canvas = document.getElementById("heroCanvas");
  if (!canvas || !window.Geo) return;
  const texture = Geo.earthTexture({ width: 1024, height: 512 }),
    pixels = texture.getContext("2d").getImageData(0, 0, 1024, 512).data;
  const globe = document.createElement("canvas");
  globe.width = globe.height = 500;
  const gc = globe.getContext("2d"),
    img = gc.createImageData(500, 500),
    r = 240;
  for (let y = 0; y < 500; y++)
    for (let x = 0; x < 500; x++) {
      const nx = (x - 250) / r,
        ny = (250 - y) / r,
        rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr),
        latitude = Math.asin(ny),
        longitude = Math.atan2(nx, nz) + 1.7;
      const u = Math.floor(((longitude / (2 * Math.PI) + 0.5) % 1) * 1024),
        v = Math.floor((0.5 - latitude / Math.PI) * 511),
        src = (v * 1024 + u) * 4,
        i = (y * 500 + x) * 4,
        light = 0.35 + 0.65 * Math.max(0, -nx * 0.3 + ny * 0.4 + nz * 0.8);
      const luminance =
        pixels[src] * 0.25 + pixels[src + 1] * 0.6 + pixels[src + 2] * 0.15;
      img.data[i] = (luminance * 0.85 + 15) * light;
      img.data[i + 1] = (luminance * 0.98 + 33) * light;
      img.data[i + 2] = (luminance * 0.7 + 20) * light;
      img.data[i + 3] = 255;
    }
  gc.putImageData(img, 0, 0);
  function render() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * d;
    canvas.height = h * d;
    const c = canvas.getContext("2d");
    c.scale(d, d);
    const cx = w * 0.55,
      cy = h * 0.53,
      rr = Math.min(h * 0.4, w * 0.36);
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.ellipse(
        cx,
        cy,
        rr * (1.1 + i * 0.16),
        rr * (0.46 + i * 0.1),
        -0.45,
        0,
        Math.PI * 2,
      );
      c.strokeStyle = "#c5d8b5" + (i < 2 ? "30" : "10");
      c.stroke();
    }
    c.drawImage(globe, cx - rr, cy - rr, rr * 2, rr * 2);
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.4);
    c.strokeStyle = "#e8dfab55";
    c.lineWidth = 0.6;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.ellipse(
        0,
        i * rr * 0.3,
        rr * Math.sqrt(1 - (i * 0.3) ** 2),
        rr * 0.15,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    for (let i = 1; i <= 3; i++) {
      c.beginPath();
      c.ellipse(0, 0, (rr * i) / 4, rr, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, -rr - 20);
    c.lineTo(0, rr + 20);
    c.stroke();
    c.restore();
    c.fillStyle = "#e5bc87";
    c.beginPath();
    c.arc(cx + rr * 0.43, cy - rr * 0.45, 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e5bc8788";
    c.beginPath();
    c.moveTo(cx + rr * 0.43, cy - rr * 0.45);
    c.lineTo(cx + rr * 0.8, cy - rr * 0.78);
    c.lineTo(Math.min(w - 25, cx + rr * 1.2), cy - rr * 0.78);
    c.stroke();
    c.font = '9px "Space Grotesk",monospace';
    c.fillStyle = "#b8caaa";
    c.fillText(
      "OUR PLANET",
      Math.min(w - 100, cx + rr * 0.85),
      cy - rr * 0.78 - 9,
    );
  }
  new ResizeObserver(render).observe(canvas);
  render();
  Lab.ready();
})();
