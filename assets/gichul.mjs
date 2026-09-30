// 기출 분류 공용 로직 — 표지 인식·문항 분할(글자 위치 + 흑백 비트맵)·데이터 파싱·진도·검색·통계. Desk 앱 Study/Gichul 의 Swift 규칙과 같게 유지할 것
export const SUBJECTS = ['통합사회', '한국지리', '세계지리', '생활과 윤리', '윤리와 사상', '사회·문화', '정치와 법', '경제',
  '동아시아사', '세계사', '한국사', '여행지리', '도시의 미래 탐구', '기후변화와 지속가능한 세계', '세계시민과 지리'];
export const EXAMS = ['수능', '6월 모평', '9월 모평', '3월 학평', '4월 학평', '5월 학평', '6월 학평', '7월 학평', '9월 학평', '10월 학평', '11월 학평', '예시문항', '기타'];
export const GRADES = ['고1', '고2', '고3', ''];
export const AXES = [['c', '개념'], ['d', '자료'], ['o', '오답'], ['x', '기타']];
export const GOAL = 1200, DAILY = 10;

// ── 시험 정보 ──
export const isMock = m => m.exam === '수능' || m.exam.endsWith('모평');
export function metaTitle(m) {
  const head = `${m.year}학년도`;
  if (m.exam.endsWith('학평') && m.grade) return `${head} ${m.exam.replace(' 학평', '')} ${m.grade} 학평 ${m.subject}`;
  return `${head} ${m.exam} ${m.subject}`;
}
export function metaId(m) {
  return [m.year + '학년도', m.exam, m.grade, m.subject].filter(Boolean).join('_').replace(/[.#$\[\]\/· ]/g, '_');
}
export const expectedCount = subject => subject === '통합사회' ? 25 : 20;

export function detectMeta(text, fileName) {
  // 표지 머리만(문제 본문의 낱말을 과목으로 오인하지 않게). pdf.js 는 제목을 글자마다 띄어 주므로 공백을 빼고 판정
  const t = String(text || '').replace(/\s+/g, '').slice(0, 300);
  const all = t + ' ' + fileName;
  const first = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };
  const year = Number(first(/(\d{4})\s*학년도/, all) ?? first(/(20\d{2})\s*년/, all) ?? first(/(20\d{2})/, fileName) ?? new Date().getFullYear());
  const month = first(/(\d{1,2})\s*월/, all);
  let exam = '기타';
  if (t.includes('예시문항') || fileName.includes('예시')) exam = '예시문항';
  else if (t.includes('모의평가') || fileName.includes('모평') || fileName.includes('모의평가')) exam = (month ? `${month}월` : '6월') + ' 모평';
  else if (t.includes('학력평가') || fileName.includes('학평')) exam = ((month ? `${month}월` : '') + ' 학평').trim();
  else if (t.includes('대학수학능력시험') || fileName.includes('수능')) exam = '수능';
  let grade = first(/고\s*([123])/, all); grade = grade ? '고' + grade : (first(/([123])\s*학년/, all) ? '고' + first(/([123])\s*학년/, all) : '');
  if (exam === '수능' || exam.endsWith('모평')) grade = '고3';
  const norm = s => s.replace(/[\s·・ㆍ∙•‧･]/g, '');   // 가운뎃점은 문제지마다 다른 글자
  const known = s => { const n = norm(s); return SUBJECTS.find(x => n.includes(norm(x))) ?? null; };
  const paren = first(/영역\s*\(\s*([^)]+?)\s*\)/, t);
  const subject = (paren && known(paren)) ?? known(t) ?? known(fileName) ?? '';
  return { year, exam, grade, subject };
}

// ── 문항 분할 ──
// page = { w, h, items: [{str, x, y, w, size}] (y = 글자 위쪽, 쪽 왼쪽 위 기준 pt), raster: {w, h, scale, px: Uint8Array 흑백} }
export const PAD = 4;
const QNUM = /^\s*(\d{1,2})\s*\./;
const POINTS = /\[\s*(\d(?:\.\d)?)\s*점\s*\]/;
const HEADER_WORDS = ['학년도', '영역', '교시', '━', '성명', '수험번호', '학력평가', '문제지', '모의평가'];
export const isHeader = s => { const t = s.trim(); return HEADER_WORDS.some(w => t.includes(w)) || /^[\d ()]*$/.test(t); };

/** 글자 조각을 줄로 묶음 — 기준선이 가까운 조각끼리, 왼쪽부터 */
export function groupLines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const base = it.y + it.size;
    const line = lines.find(l => Math.abs(l.base - base) < Math.max(2, it.size * 0.45));
    if (line) line.items.push(it); else lines.push({ base, items: [it] });
  }
  return lines.map(l => {
    const its = l.items.sort((a, b) => a.x - b.x);
    let text = '';
    its.forEach((it, i) => { if (i && it.x - (its[i - 1].x + its[i - 1].w) > it.size * 0.2 && !text.endsWith(' ')) text += ' '; text += it.str; });
    return { text, x0: Math.min(...its.map(i => i.x)), y0: Math.min(...its.map(i => i.y)), x1: Math.max(...its.map(i => i.x + i.w)), y1: Math.max(...its.map(i => i.y + i.size * 1.18)) };
  }).filter(l => l.text.trim()).sort((a, b) => a.y0 - b.y0);
}
const inRect = (it, r) => it.x < r.x + r.w && it.x + it.w > r.x && it.y < r.y + r.h && it.y + it.size > r.y;

export function separator(r) {
  const v = (x, y) => r.px[y * r.w + x];
  let best = { len: 0, x: 0, a: 0, b: 0 };
  for (let cx = Math.floor(r.w * 0.4); cx <= Math.floor(r.w * 0.6); cx++) {
    let start = -1, last = -1;
    for (let y = 0; y < r.h; y++) {
      if (v(cx, y) < 160) {
        if (start < 0 || y - last > 3) start = y;
        last = y;
        if (last - start > best.len) best = { len: last - start, x: cx, a: start, b: last };
      }
    }
  }
  return best.len > r.h * 0.4 ? { x: best.x / r.scale, top: best.a / r.scale, bottom: best.b / r.scale } : null;
}
export function lastInk(r, rect) {
  const s = r.scale;
  const x0 = Math.max(0, Math.floor(rect.x * s) + 1), x1 = Math.min(r.w - 1, Math.floor((rect.x + rect.w) * s) - 1);
  const y0 = Math.max(0, Math.floor(rect.y * s)), y1 = Math.min(r.h - 1, Math.floor((rect.y + rect.h) * s));
  if (x0 >= x1 || y0 >= y1) return null;
  for (let y = y1; y >= y0; y--) { const row = y * r.w; for (let x = x0; x <= x1; x++) if (r.px[row + x] < 200) return (y + 1) / s; }
  return null;
}
const trim = (rect, r) => { const y = lastInk(r, rect); return y == null ? null : { ...rect, h: Math.min(rect.y + rect.h, y + PAD) - rect.y }; };

export function headerBottom(page) {
  const top = groupLines(page.items.filter(i => i.y < page.h * 0.22));
  const firstQ = Math.min(...top.filter(l => QNUM.test(l.text)).map(l => l.y0), Infinity);
  const hs = top.filter(l => l.y0 < firstQ && isHeader(l.text)).map(l => l.y1);
  return (hs.length ? Math.max(...hs) : 0) + 2;
}
export function columns(page) {
  const { w: W, h: H } = page;
  const s = separator(page.raster), hb = headerBottom(page);
  const mid = s ? s.x : W / 2, top = s ? Math.max(s.top, hb) : Math.max(H * 0.08, hb), bottom = s ? s.bottom : H * 0.95;
  const band = page.items.filter(i => i.y >= top - PAD && i.y <= bottom + PAD);
  const left = groupLines(band.filter(i => i.x < mid)), right = groupLines(band.filter(i => i.x >= mid));
  const lx0 = (left.length ? Math.min(...left.map(l => l.x0)) : W * 0.08) - 8;
  const rx1 = (right.length ? Math.max(...right.map(l => l.x1)) : W * 0.92) + 8;
  return [{ x0: Math.max(0, lx0), x1: mid - 2, top, bottom, side: 0, mid }, { x0: mid + 2, x1: Math.min(W, rx1), top, bottom, side: 1, mid }];
}
const round = v => Math.round(v * 10) / 10;
const part = (p, r) => ({ p, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) });

/** 문항 목록 [{number, parts:[{p,x,y,w,h}], points, text}] */
export function split(pages) {
  const out = []; let last = 0;
  pages.forEach((page, pno) => {
    for (const col of columns(page)) {
      const colItems = page.items.filter(i => (col.side === 0 ? i.x < col.mid : i.x >= col.mid) && i.y >= col.top - PAD && i.y <= col.bottom);
      const ls = groupLines(colItems).filter(l => l.x0 >= col.x0 - 1 && l.x0 < col.x1);
      let bottom = col.bottom;
      for (const l of ls) if (l.text.trim().startsWith('※') && l.text.includes('확인')) bottom = Math.min(bottom, l.y0 - PAD);
      const leftEdge = ls.length ? Math.min(...ls.map(l => l.x0)) : col.x0;
      const starts = [];
      for (const l of ls) {
        if (l.x0 - leftEdge >= 15 || l.y0 >= bottom) continue;
        const m = QNUM.exec(l.text); if (!m) continue;
        const n = Number(m[1]);
        if (n > last && n <= last + 3) { starts.push({ n, y: l.y0 }); last = n; }
      }
      const firstY = starts.length ? starts[0].y : bottom;
      const above = ls.filter(l => l.y0 < firstY - 2 && !isHeader(l.text));
      if (out.length && firstY - col.top > 20 && above.length) {
        const seg = trim({ x: col.x0, y: col.top - PAD, w: col.x1 - col.x0, h: firstY - col.top }, page.raster);
        if (seg) out[out.length - 1].parts.push(part(pno, seg));
      }
      starts.forEach((s, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].y : bottom;
        const r = { x: col.x0, y: s.y - PAD, w: col.x1 - col.x0, h: end - s.y };
        out.push({ number: s.n, parts: [part(pno, trim(r, page.raster) ?? r)], points: null, text: '' });
      });
    }
  });
  for (const q of out) {
    q.text = q.parts.map(pt => groupLines(pages[pt.p].items.filter(i => inRect(i, pt))).map(l => l.text).join('\n')).join('\n');
    const m = POINTS.exec(q.text); if (m) q.points = Number(m[1]);
  }
  return out;
}

// ── 데이터(desk/gichul) ──
const num = v => typeof v === 'number' ? v : (typeof v === 'string' && v.trim() && !isNaN(v) ? Number(v) : null);
const arr = v => Array.isArray(v) ? v.filter(x => x != null) : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
export const itemKey = n => String(n).padStart(2, '0');

export function parseData(root) {
  const d = root || {};
  const exams = Object.entries(d.exams || {}).filter(([, v]) => v && v.pdf).map(([id, v]) => {
    const meta = { year: num(v.year) ?? 0, exam: v.exam || '기타', grade: v.grade || '', subject: v.subject || '' };
    return { id, title: v.title || metaTitle(meta), meta, pdf: v.pdf, pages: num(v.pages) ?? 0, count: num(v.count) ?? 0, createdAt: num(v.createdAt) ?? 0 };
  }).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const order = new Map(exams.map((e, i) => [e.id, i]));
  const items = [];
  for (const [eid, byNo] of Object.entries(d.items || {})) {
    if (!order.has(eid)) continue;
    for (const [k, v] of Object.entries(byNo || {})) {
      if (!v || isNaN(Number(k))) continue;
      const it = { examId: eid, number: Number(k), id: `${eid}/${itemKey(k)}`,
        parts: arr(v.parts).map(p => ({ p: num(p.p), x: num(p.x), y: num(p.y), w: num(p.w), h: num(p.h) })).filter(p => [p.p, p.x, p.y, p.w, p.h].every(x => x != null)),
        pts: num(v.pts), ans: num(v.ans), tags: {}, memo: v.memo || '', at: num(v.at) };
      for (const [a] of AXES) { const t = arr(v[a]).filter(x => typeof x === 'string'); if (t.length) it.tags[a] = t; }
      items.push(it);
    }
  }
  items.sort((a, b) => order.get(a.examId) - order.get(b.examId) || a.number - b.number);
  return { exams, items };
}
export const tagged = it => Object.values(it.tags).some(t => t.length);
export const allTags = it => AXES.flatMap(([a]) => it.tags[a] || []);
export function itemRecord(it) {
  const r = { parts: it.parts };
  if (it.pts != null) r.pts = it.pts;
  if (it.ans != null) r.ans = it.ans;
  for (const [a] of AXES) if (it.tags[a]?.length) r[a] = it.tags[a];
  if (it.memo) r.memo = it.memo;
  if (it.at != null) r.at = it.at;
  return r;
}
export const examRecord = e => ({ title: e.title, year: e.meta.year, exam: e.meta.exam, grade: e.meta.grade, subject: e.meta.subject, pdf: e.pdf, pages: e.pages, count: e.count, createdAt: e.createdAt });
/** 처음 태그가 붙는 순간 시각(오늘 N/10), 태그를 다 떼면 시각도 지움 */
export function stamp(it, now = Date.now()) {
  const x = { ...it, tags: { ...it.tags } };
  if (tagged(x) && x.at == null) x.at = now;
  if (!tagged(x)) x.at = null;
  return x;
}
/** 같은 시험을 다시 넣을 때 — 조각·배점만 새로, 태그·정답·메모·시각은 유지 */
export function mergeFound(examId, meta, found, old = []) {
  const byNo = new Map(old.map(i => [i.number, i]));
  const out = {};
  for (const f of found) {
    const prev = byNo.get(f.number) || { examId, number: f.number, parts: [], pts: null, ans: null, tags: {}, memo: '', at: null };
    out[itemKey(f.number)] = itemRecord({ ...prev, parts: f.parts, pts: f.points ?? (isMock(meta) ? 2 : prev.pts) });   // 수능·모평은 [3점] 만 표시
  }
  return out;
}

export const exam = (d, id) => d.exams.find(e => e.id === id);
export const itemsOf = (d, id) => d.items.filter(i => i.examId === id);
export const taggedCount = d => d.items.filter(tagged).length;
export function todayCount(d, now = new Date()) {
  const same = ms => { const x = new Date(ms); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() && x.getDate() === now.getDate(); };
  return d.items.filter(i => tagged(i) && i.at != null && same(i.at)).length;
}
export function nextUntagged(d, after = null) {
  const i = after ? d.items.findIndex(x => x.id === after) + 1 : 0;
  return [...d.items.slice(i), ...d.items.slice(0, i)].find(x => !tagged(x) && x.id !== after) ?? null;
}
export function search(d, { subject = null, tags = [] } = {}) {
  const subj = subject ? new Set(d.exams.filter(e => e.meta.subject === subject).map(e => e.id)) : null;
  return d.items.filter(i => (!subj || subj.has(i.examId)) && tags.every(t => allTags(i).some(x => x === t || x.startsWith(t + ' > '))));
}
export const unitOf = t => t.split(' > ')[0];
export const leafOf = t => t.split(' > ').pop();
export function frequency(d, axis) {
  const c = new Map();
  for (const i of d.items) for (const t of new Set((i.tags[axis] || []).map(x => axis === 'c' ? unitOf(x) : x))) c.set(t, (c.get(t) || 0) + 1);
  return [...c].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || (a.tag < b.tag ? -1 : 1));
}
export function cross(d) {
  const m = {};
  for (const i of d.items) for (const u of new Set((i.tags.c || []).map(unitOf))) for (const t of new Set(i.tags.d || [])) { m[u] ??= {}; m[u][t] = (m[u][t] || 0) + 1; }
  return m;
}

// ── 분류표(앱과 같은 JSON) ──
export function parseTaxonomy(j) {
  const concepts = (j['개념'] || []).map(s => {
    const short = s['약칭'] || s['과목'];
    return { name: s['과목'] || short, short, units: (s['단원'] || []).map(u => { const tag = short + ' ' + u['이름']; return { tag, subs: (u['세부'] || []).map(x => tag + ' > ' + x) }; }) };
  });
  return { concepts, data: j['자료'] || [], errors: j['오답'] || [] };
}
export function conceptOrder(tax, subject) {
  const first = tax.concepts.filter(c => subject === '통합사회' ? c.name.startsWith('통합사회') : c.name === subject);
  return [...first, ...tax.concepts.filter(c => !first.includes(c))];
}
