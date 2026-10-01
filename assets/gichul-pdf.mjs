// 기출 PDF 브라우저 처리 — pdf.js 로 글자 위치·흑백 비트맵을 뽑아 분할(gichul.mjs)에 넘기고, 문항 조각을 캔버스에 그림
import { detectMeta, split, groupLines } from './gichul.mjs?v=1c013acc';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38';
let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import(PDFJS + '/build/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = PDFJS + '/build/pdf.worker.min.mjs';
  }
  return lib;
}
/** 바이트 → pdf.js 문서(한글 CID 글꼴용 cMap 포함) */
export async function openPdf(bytes) {
  const L = await pdfjs();
  return L.getDocument({ data: bytes.slice ? bytes.slice(0) : bytes, cMapUrl: PDFJS + '/cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + '/standard_fonts/' }).promise;
}

const RASTER = 2;
/** 쪽 → { w, h, items, raster } — 좌표는 쪽 왼쪽 위 기준 pt */
export async function pageData(pdf, pno) {
  const page = await pdf.getPage(pno + 1);
  const [vx0, vy0, vx1, vy1] = page.view, W = vx1 - vx0, H = vy1 - vy0;
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const [, , c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || it.height || 10;
    const base = H - (f - vy0);
    items.push({ str: it.str, x: e - vx0, y: base - size * 0.86, w: it.width, size });
  }
  const vp = page.getViewport({ scale: RASTER });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const rgba = ctx.getImageData(0, 0, cv.width, cv.height).data, px = new Uint8Array(cv.width * cv.height);
  for (let i = 0, j = 0; j < px.length; i += 4, j++) px[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  page.cleanup();
  return { w: W, h: H, items, raster: { w: cv.width, h: cv.height, scale: RASTER, px } };
}

/** 파일 → { meta, found, pages, bytes, pdf } */
export async function prepare(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await openPdf(bytes);
  const pages = [];
  for (let i = 0; i < pdf.numPages; i++) pages.push(await pageData(pdf, i));
  // pdf.js 는 글자를 저장 순서로 주므로 위에서 아래 줄 순서로 다시 모아 표지 머리를 만든다
  const cover = pages[0] ? groupLines(pages[0].items).map(l => l.text).join('\n') : '';
  return { meta: detectMeta(cover, file.name), found: split(pages), pages: pdf.numPages, bytes, pdf };
}

// ── 조각 그리기 — 쪽을 한 번 그려 두고 잘라 붙임 ──
const pageCache = new Map();   // pdf → Map(pno@scale → canvas)
async function pageCanvas(pdf, pno, scale) {
  let m = pageCache.get(pdf); if (!m) { m = new Map(); pageCache.set(pdf, m); }
  const key = pno + '@' + scale;
  if (!m.has(key)) m.set(key, (async () => {
    const page = await pdf.getPage(pno + 1), vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  })());
  return m.get(key);
}
export const GAP = 12;
/** 조각들을 세로로 이어 붙인 캔버스 */
export async function renderParts(pdf, parts, scale = 2) {
  const W = Math.max(...parts.map(p => p.w)), H = parts.reduce((s, p) => s + p.h, 0) + GAP * (parts.length - 1);
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  let y = 0;
  for (const p of parts) {
    const src = await pageCanvas(pdf, p.p, scale);
    ctx.drawImage(src, p.x * scale, p.y * scale, p.w * scale, p.h * scale, 0, y * scale, p.w * scale, p.h * scale);
    y += p.h + GAP;
  }
  return cv;
}
export function forget(pdf) { pageCache.delete(pdf); }
