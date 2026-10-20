// 기출 「학생용 공개」 — Desk 기출 뷰에서 교사가 누르면, 검증까지 끝난 통합사회 지리 단원 문항을 그림으로 그려
// 공개 저장소(soc-c)의 data/gichul/ 에 커밋 하나로 올린다. 학생 화면은 gichul.html(assets/gichul-student.mjs).
// 학생에게 가는 것: 문항 그림 · 시험 이름 · 번호 · 배점 · 정답 · 분류(개념 · 자료 · 오답) · 메모 가운데 「핵심」「함정」 줄.
// 가지 않는 것: 기타 태그(x), 이름표 없는 메모(수업용 메모), PDF 원본, 비공개 저장소 경로.
import * as G from './gichul.mjs?v=7adfbb60';

export const SUBJECT = '통합사회';
export const DIR = 'data/gichul';
export const INDEX = DIR + '/index.json';
/** 공개하는 단원 — 지리 단원만(2026-10-20 사용자: 「지리 관련 문제만 공개」, 범위는 단원 통째로).
 *  문항의 개념 분류 가운데 하나라도 이 단원(또는 그 세부)에 들면 공개. 이름은 data/gichul-taxonomy.json 의 「약칭 단원이름」 */
export const GEO_UNITS = ['통사1 Ⅲ 자연환경과 인간', '통사1 Ⅳ 문화와 다양성', '통사1 Ⅴ 생활공간과 사회', '통사2 Ⅳ 세계화와 평화', '통사2 Ⅴ 미래와 지속가능한 삶'];
export const isGeo = (it) => (it.tags?.c || it.c || []).some((t) => GEO_UNITS.includes(G.unitOf(t)));
/** 메모 이름표 → 학생 화면의 이름(2026-10-20 사용자: 「요점 · 함정」 대신 담백한 낱말) */
export const NOTE_LABEL = { 핵심: '풀이', 함정: '주의할 점' };

/** 학생에게 보여 줄 메모 줄만 — 이름표 없는 수업용 메모는 뺀다 */
export function publicNotes(it) {
  return G.memoLines(it).filter((l) => NOTE_LABEL[l.label]).map((l) => ({ k: NOTE_LABEL[l.label], t: l.text }));
}

/** 그림이 바뀌었는지 가리는 표지 — 원본 PDF 경로와 자른 조각이 같으면 같은 그림 */
export function signature(exam, it) {
  const s = JSON.stringify([exam.pdf, it.parts]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
/** 공개 그림 파일 이름 — 문항 id 와 표지에서. 주소에 한글 · 비공개 경로가 드러나지 않게 */
export function imageName(it, sig) {
  const s = it.id + '|' + sig;
  let a = 5381, b = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = (Math.imul(a, 33) ^ c) >>> 0; b = (Math.imul(b, 31) + c) >>> 0; }
  return a.toString(36) + b.toString(36) + '.webp';
}

/** 공개할 목록(그림 경로까지). 순서는 학년도(최근) › 시행 › 번호 */
export function buildPublic(data) {
  const exams = data.exams.filter((e) => e.meta.subject === SUBJECT);
  const ids = new Map(exams.map((e) => [e.id, e]));
  const rank = (e) => { const i = G.SESSION_ORDER.indexOf(e.meta.exam); return i < 0 ? G.SESSION_ORDER.length : i; };
  const items = data.items
    .filter((it) => ids.has(it.examId) && G.verified(it) && it.parts.length && (it.tags.c || []).length)
    .filter((it) => !(it.tags.c || []).includes(G.OUT_OF_SCOPE) && isGeo(it))
    .sort((a, b) => { const x = ids.get(a.examId), y = ids.get(b.examId);
      return y.meta.year - x.meta.year || rank(x) - rank(y) || (a.examId < b.examId ? -1 : a.examId > b.examId ? 1 : 0) || a.number - b.number; });
  const used = [...new Set(items.map((it) => it.examId))].map((id) => ids.get(id));
  const ex = new Map(used.map((e, i) => [e.id, i]));
  return {
    exams: used.map((e) => ({ title: e.title, year: e.meta.year, exam: e.meta.exam, grade: e.meta.grade })),
    items: items.map((it) => {
      const e = ids.get(it.examId), sig = signature(e, it);
      const out = { id: it.id, e: ex.get(it.examId), n: it.number, c: it.tags.c, sig, img: imageName(it, sig) };
      if (it.pts != null) out.pts = it.pts;
      if (it.ans != null) out.ans = it.ans;
      if (it.tags.d?.length) out.d = it.tags.d;
      if (it.tags.o?.length) out.o = it.tags.o;
      const notes = publicNotes(it);
      if (notes.length) out.notes = notes;
      return out;
    }),
  };
}

/** 확인 창에 보일 내역 — 무엇이 몇 문항 올라가고, 왜 빠지는지 */
export function summary(data) {
  const exams = new Set(data.exams.filter((e) => e.meta.subject === SUBJECT).map((e) => e.id));
  const all = data.items.filter((it) => exams.has(it.examId));
  const pub = buildPublic(data).items;
  const byUnit = GEO_UNITS.map((u) => [u, pub.filter((it) => it.c.some((t) => G.unitOf(t) === u)).length]);
  const checked = all.filter((it) => G.verified(it) && (it.tags.c || []).length);
  return {
    total: all.length, unchecked: all.length - checked.length,
    outOfScope: checked.filter((it) => it.tags.c.includes(G.OUT_OF_SCOPE)).length,
    notGeo: checked.filter((it) => !it.tags.c.includes(G.OUT_OF_SCOPE) && !isGeo(it)).length,
    n: pub.length, byUnit,
  };
}

// ── GitHub 에 올리기(Git Data API — 그림 여러 장과 목록을 커밋 하나로) ──
const api = (repo, path) => `https://api.github.com/repos/${repo}/${path}`;
async function gh(token, url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) } });
  if (r.status === 404 && !opt.method) return null;
  if (!r.ok) {
    const why = r.status === 403 || r.status === 404 ? ' — Desk 에 넣은 GitHub 토큰에 공개 저장소(soc-c) 쓰기 권한이 있어야 합니다'
      : r.status === 422 ? ' — 그사이 저장소에 새 커밋이 올라왔습니다. 한 번 더 눌러 주세요' : '';
    throw new Error(`GitHub ${r.status}${why}`);
  }
  return r.status === 204 ? null : r.json();
}
const toB64 = (blob) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.onerror = no; f.readAsDataURL(blob); });
const canvasBlob = (cv) => new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('그림을 만들지 못했습니다'))), 'image/webp', 0.86));

/**
 * 올리기. deps: { data, token, repo, pdfOf(exam) → pdf, renderParts(pdf, parts, scale) → canvas, onProgress(msg) }
 * 돌려줌: { items, rendered, reused, removed, commit }
 */
export async function publish({ data, token, repo = 'GIS-Leet/soc-c', branch = 'main', pdfOf, renderParts, onProgress = () => {} }) {
  const pub = buildPublic(data);
  if (!pub.items.length) throw new Error('공개할 문항이 없습니다 — 통합사회 시험의 지리 단원에서 개념 분류까지 확인(저장)한 문항만 올라갑니다.');
  onProgress('지금 공개된 목록을 확인하는 중…');
  const ref = await gh(token, api(repo, `git/ref/heads/${branch}`));
  const head = await gh(token, api(repo, `git/commits/${ref.object.sha}`));
  let old = { items: [] };
  const oldFile = await gh(token, api(repo, `contents/${INDEX}?ref=${branch}`));
  if (oldFile?.content) try { old = JSON.parse(decodeURIComponent(escape(atob(oldFile.content.replace(/\n/g, ''))))); } catch { /* 깨진 목록은 새로 */ }
  const had = new Set((old.items || []).map((i) => i.img));
  const sizeOf = new Map((old.items || []).filter((i) => i.w && i.h).map((i) => [i.img, [i.w, i.h]]));   // 그림 크기 — 학생 화면이 불러오기 전에 자리를 잡게

  const tree = [];
  let rendered = 0, reused = 0;
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const exams = new Map(data.exams.map((e) => [e.id, e]));
  for (const [k, it] of pub.items.entries()) {
    if (had.has(it.img) && sizeOf.has(it.img)) { [it.w, it.h] = sizeOf.get(it.img); reused++; continue; }   // 같은 그림이 이미 올라가 있음
    onProgress(`문항 그림 만드는 중 ${k + 1} / ${pub.items.length}`);
    const src = byId.get(it.id);
    const cv = await renderParts(await pdfOf(exams.get(src.examId)), src.parts, 2.6);
    it.w = cv.width; it.h = cv.height;
    const blob = await gh(token, api(repo, 'git/blobs'), { method: 'POST', body: JSON.stringify({ content: await toB64(await canvasBlob(cv)), encoding: 'base64' }) });
    tree.push({ path: `${DIR}/img/${it.img}`, mode: '100644', type: 'blob', sha: blob.sha });
    rendered++;
  }
  const keep = new Set(pub.items.map((i) => i.img));
  const gone = [...had].filter((n) => !keep.has(n));
  for (const n of gone) tree.push({ path: `${DIR}/img/${n}`, mode: '100644', type: 'blob', sha: null });
  const index = { made: new Date().toISOString(), subject: SUBJECT, exams: pub.exams, items: pub.items.map(({ sig, ...rest }) => rest) };
  tree.push({ path: INDEX, mode: '100644', type: 'blob', content: JSON.stringify(index) + '\n' });

  onProgress('저장소에 올리는 중…');
  const t = await gh(token, api(repo, 'git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const c = await gh(token, api(repo, 'git/commits'), { method: 'POST', body: JSON.stringify({
    message: `기출 문항 학생용 공개: 통합사회 지리 단원 ${pub.items.length}문항(새 그림 ${rendered} · 지움 ${gone.length})`, tree: t.sha, parents: [head.sha] }) });
  await gh(token, api(repo, `git/refs/heads/${branch}`), { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  return { items: pub.items.length, rendered, reused, removed: gone.length, commit: c.sha };
}
