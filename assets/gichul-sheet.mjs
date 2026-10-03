// 기출 문제집 인쇄 — 고른 문항을 수업 배포용 A4 문제지(2단·새 번호·출처·이름 칸·정답표)로 묶는 HTML 과 옵션 창. 인쇄는 브라우저(종이·PDF 저장)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CIRCLED = '①②③④⑤';
export const ansMark = a => a >= 1 && a <= 5 ? CIRCLED[a - 1] : '–';
export const DEFAULTS = { title: '기출 문제', cols: 2, nameLine: true, sources: true, answers: false, memos: false, autoPrint: false };

/** items = [{ src(이미지 주소), source(「2026학년도 6월 모평 한국지리 12번」), ans(1~5|null), memo }] → 인쇄용 HTML 문서 */
export function sheetHtml(items, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const fig = (it, i) => `<figure><figcaption><b>${i + 1}</b>${o.sources ? `<span>${esc(it.source)}</span>` : ''}</figcaption><img src="${esc(it.src)}" alt="${i + 1}번 문항"></figure>`;
  const key = !o.answers ? '' : `<section class="key"><h2>정답${o.memos ? '과 풀이 요점' : ''}</h2>` + (o.memos
    ? `<ol class="memos">${items.map(it => `<li><b>${ansMark(it.ans)}</b>${it.memo ? `<span>${esc(it.memo)}</span>` : ''}${o.sources ? `<small>${esc(it.source)}</small>` : ''}</li>`).join('')}</ol>`
    : `<div class="grid">${items.map((it, i) => `<span><i>${i + 1}</i><b>${ansMark(it.ans)}</b></span>`).join('')}</div>`) + `</section>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
@page { size: A4; margin: 13mm 12mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Pretendard, 'Malgun Gothic', -apple-system, sans-serif; color: #111; }
header { display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; margin-bottom: 6mm; }
h1 { margin: 0; font-size: 15pt; font-weight: 700; letter-spacing: -0.02em; }
header .n { font-size: 9pt; color: #666; margin-top: 1mm; }
.who { display: flex; gap: 3mm; font-size: 10pt; white-space: nowrap; align-items: flex-end; }
.who i { display: inline-block; border-bottom: 0.3mm solid #111; height: 5mm; }
.qs { column-count: ${o.cols === 1 ? 1 : 2}; column-gap: 9mm; }
figure { margin: 0 0 7mm; break-inside: avoid; }
figcaption { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1.5mm; }
figcaption b { font-size: 11pt; font-weight: 700; }
figcaption span { font-size: 7.5pt; color: #666; }
img { display: block; width: 100%; max-height: 235mm; object-fit: contain; object-position: left top; }
.qs.c1 img { width: 62%; }
.key { break-before: page; }
.key h2 { margin: 0 0 5mm; font-size: 13pt; font-weight: 700; }
.grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 3mm 2mm; font-size: 11pt; }
.grid span { display: flex; gap: 1.5mm; align-items: baseline; }
.grid i { font-style: normal; font-size: 9pt; color: #666; min-width: 5mm; text-align: right; }
.memos { margin: 0; padding-left: 7mm; font-size: 10pt; line-height: 1.55; }
.memos li { margin-bottom: 2.5mm; break-inside: avoid; }
.memos b { margin-right: 2mm; }
.grid b, .memos b { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-weight: 400; font-size: 13pt; line-height: 1; }
.memos small { display: block; font-size: 7.5pt; color: #666; }
@media screen { body { max-width: 210mm; margin: 0 auto; padding: 13mm 12mm; background: #fff; } }
</style></head><body>
<header><div><h1>${esc(o.title)}</h1><div class="n">${items.length}문항</div></div>${o.nameLine ? `<div class="who">학년 <i style="width:8mm"></i> 반 <i style="width:8mm"></i> 번호 <i style="width:10mm"></i> 이름 <i style="width:28mm"></i></div>` : ''}</header>
<main class="qs${o.cols === 1 ? ' c1' : ''}">${items.map(fig).join('')}</main>${key}${o.autoPrint ? '<script>onload=()=>setTimeout(()=>print(),400)<\/script>' : ''}
</body></html>`;
}

const CSS = `
.gs-modal { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,0.32); }
.gs-modal[hidden] { display: none; }
.gs-modal .panel { width: 100%; max-width: 420px; padding: 22px !important; display: flex; flex-direction: column; gap: 12px; background: var(--st-surface); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 18px 50px rgba(0,0,0,0.22); }
.gs-modal h3 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.gs-modal h3 small { font-size: 12.5px; font-weight: 500; color: var(--st-label-3); margin-left: 6px; }
.gs-modal label.t { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--st-label-2); }
.gs-modal input[type=text] { height: 38px; padding: 0 12px; background: var(--st-fill-2); color: var(--st-label); border: 1px solid transparent; border-radius: var(--st-r-element, 10px); font: inherit; font-size: 14px; outline: none; }
.gs-modal input[type=text]:focus { background: var(--st-surface); border-color: var(--accent); }
.gs-modal label.c { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--st-label); cursor: pointer; line-height: 1.45; }
.gs-modal label.c small { display: block; font-size: 12px; color: var(--st-label-3); }
.gs-modal label.c input { margin-top: 3px; accent-color: var(--st-accent-solid); }
.gs-modal .gs-note { font-size: 12px; color: var(--st-label-3); line-height: 1.55; margin: 0; }
.gs-modal .gs-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.gs-modal .gs-acts button { height: 36px; padding: 0 16px; }
`;
let modal = null;
/** 옵션 창 — 「인쇄」를 누르면 onPrint(옵션) 을 그 클릭 안에서 부른다(팝업 허용을 위해 동기 호출) */
export function openSheetDialog({ title, count, noAnswer = 0, onPrint }) {
  if (!document.getElementById('gs-style')) { const st = document.createElement('style'); st.id = 'gs-style'; st.textContent = CSS; document.head.appendChild(st); }
  if (!modal) {
    modal = document.createElement('div'); modal.className = 'gs-modal'; modal.hidden = true;
    document.body.appendChild(modal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
  }
  const saved = (() => { try { return JSON.parse(localStorage.getItem('desk-gichul-sheet')) || {}; } catch { return {}; } })();
  const o = { ...DEFAULTS, ...saved, title };
  const cb = (k, label, sub) => `<label class="c"><input type="checkbox" data-k="${k}" ${o[k] ? 'checked' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  modal.innerHTML = `<form class="panel" role="dialog" aria-label="문제집 인쇄">
    <h3>문제집 인쇄<small>${count}문항</small></h3>
    <label class="t">제목<input type="text" id="gsTitle" maxlength="60" value="${esc(o.title)}"></label>
    ${cb('two', '2단으로 배치', '시험지처럼 한 쪽에 여러 문항 — 끄면 1단')}
    ${cb('nameLine', '학년·반·번호·이름 칸')}
    ${cb('sources', '출처 표기', '문항마다 「2026학년도 6월 모평 한국지리 12번」')}
    ${cb('answers', '정답표', '마지막 쪽에 따로 — 학생에게 줄 때는 그 쪽만 빼고 인쇄')}
    ${cb('memos', '풀이 요점도 함께', '정답표를 켰을 때만. 분류하며 적은 메모가 그대로 나갑니다')}
    <p class="gs-note">${noAnswer ? `정답이 입력되지 않은 문항 ${noAnswer}개는 정답표에 「–」로 나옵니다. ` : ''}인쇄 창에서 「PDF로 저장」을 고르면 파일로 남습니다. 평가원·교육청 문항이니 수업을 듣는 학생에게만 나눠 주세요.</p>
    <div class="gs-acts"><button type="button" class="btn-sub" data-a="cancel">취소</button><button type="submit" class="btn-solid">인쇄</button></div>
  </form>`;
  const f = modal.querySelector('form'), q = k => f.querySelector(`[data-k="${k}"]`);
  q('two').checked = (saved.cols ?? 2) !== 1;
  const sync = () => { q('memos').disabled = !q('answers').checked; if (!q('answers').checked) q('memos').checked = false; };
  sync(); q('answers').addEventListener('change', sync);
  f.addEventListener('click', e => { if (e.target.closest('[data-a="cancel"]')) modal.hidden = true; });
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
  f.addEventListener('submit', e => {
    e.preventDefault();
    const opts = { title: f.querySelector('#gsTitle').value.trim() || title, cols: q('two').checked ? 2 : 1, nameLine: q('nameLine').checked, sources: q('sources').checked, answers: q('answers').checked, memos: q('memos').checked };
    try { const { title: _t, ...keep } = opts; localStorage.setItem('desk-gichul-sheet', JSON.stringify(keep)); } catch {}
    modal.hidden = true;
    onPrint(opts);
  });
  modal.hidden = false;
  f.querySelector('#gsTitle').select();
}
