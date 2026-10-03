// 기출 문제집 인쇄 — 고른 문항을 수업 배포용 A4 문제지로 묶는 HTML 과 옵션 창. 틀은 통사2 학습지·수능형 문항지와 같은 인쇄 문법
// (러닝 헤더 + 눈금자 틱 · 시험 머리 · 가운데 헤어라인 2단 · 바닥 쪽 번호). 인쇄 창에서 문항 높이를 재어 단·쪽에 차례로 채운다.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CIRCLED = '①②③④⑤';
export const ansMark = a => a >= 1 && a <= 5 ? CIRCLED[a - 1] : '–';
export const DEFAULTS = { title: '기출 문제', cols: 2, nameLine: true, sources: true, answers: false, memos: false, autoPrint: false };

/** 높이 목록을 단·쪽에 차례로 채움 → [쪽][단][문항 번호]. avail = [첫 쪽 단 높이, 나머지 쪽 단 높이]. 단에 안 들어가면 다음 단·다음 쪽 */
export function paginate(heights, avail, gap, cols) {
  const pages = [[[]]]; let used = 0;
  const cap = () => pages.length === 1 ? avail[0] : avail[1];
  for (let i = 0; i < heights.length; i++) {
    for (;;) {
      const page = pages[pages.length - 1], col = page[page.length - 1];
      const need = (col.length ? gap : 0) + heights[i];
      if (used + need <= cap() + 0.5) { col.push(i); used += need; break; }
      if (page.every(c => !c.length)) { col.push(i); used += need; break; }   // 빈 쪽에도 안 들어가는 문항 — 그대로 두고 그리는 쪽에서 줄임(제목만 있는 빈 쪽 방지)
      if (page.length < cols) page.push([]); else pages.push([[]]);
      used = 0;
    }
  }
  while (pages.length > 1 && pages[pages.length - 1].every(c => !c.length)) pages.pop();
  return pages;
}

/** 머리의 과목·출처 요약 — items 의 subject·year·exam 에서 */
export function summary(items) {
  const uniq = k => [...new Set(items.map(i => i[k]).filter(Boolean))];
  const subjects = uniq('subject'), years = uniq('year').map(Number).filter(Boolean).sort((a, b) => a - b);
  const kinds = [];
  if (items.some(i => i.exam === '수능')) kinds.push('수능');
  if (items.some(i => /모평$/.test(i.exam || ''))) kinds.push('모평');
  if (items.some(i => /학평$/.test(i.exam || ''))) kinds.push('학평');
  if (items.some(i => i.exam && !/^수능$|모평$|학평$/.test(i.exam))) kinds.push('기타');
  const owners = [];
  if (kinds.includes('수능') || kinds.includes('모평')) owners.push('한국교육과정평가원');
  if (kinds.includes('학평')) owners.push('시도교육청');
  return {
    subject: subjects.length === 1 ? subjects[0] : '',
    range: (years.length ? (years[0] === years.at(-1) ? `${years[0]}학년도` : `${years[0]}~${years.at(-1)}학년도`) : '') + (kinds.length ? ' ' + kinds.join(' · ') : ''),
    owners: owners.join(' · ')
  };
}

const CSS = `
@font-face { font-family: 'Arrow Fix'; src: local('Pretendard'), local('Pretendard Variable'), local('Malgun Gothic'), local('맑은 고딕'), local('Apple SD Gothic Neo'); unicode-range: U+2192; }
:root { --ink: #0A1317; --sub: #4E606F; --faint: #A4B0BC; --line: rgba(5, 54, 89, .10); --line-em: #CCD3DB;
  --font: 'Arrow Fix', 'Figtree', 'SUIT Variable', 'SUIT', 'Pretendard', 'Malgun Gothic', -apple-system, sans-serif; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
html { background: #DDE3E9 }
body { font-family: var(--font); color: var(--ink); word-break: keep-all; line-height: 1.7; font-feature-settings: "tnum"; }
.page { width: 210mm; height: 297mm; background: #fff; margin: 10mm auto; box-shadow: 0 2px 16px rgba(10, 19, 23, .14);
  padding: 12mm 12mm 10mm 14mm; display: flex; flex-direction: column; overflow: hidden; position: relative; }
@page { size: A4 portrait; margin: 0 }
@media print { html { background: #fff } .page { margin: 0; box-shadow: none; page-break-after: always } .page:last-child { page-break-after: auto } .wait { display: none } }
.rh { display: flex; align-items: baseline; gap: 3.5mm; position: relative; padding-bottom: 2mm; border-bottom: 1px solid var(--ink); margin-bottom: 5.5mm; flex: none; }
.rh::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1.6mm; height: 1.2mm;
  background: repeating-linear-gradient(to right, var(--line-em) 0, var(--line-em) .3mm, transparent .3mm, transparent 4mm); }
.rh .unit { font-size: 8pt; font-weight: 700; letter-spacing: .03em }
.rh .lesson { font-size: 7.5pt; color: var(--sub) }
.rh .type { margin-left: auto; font-size: 7.5pt; font-weight: 700; letter-spacing: .22em; color: var(--sub) }
.rf { display: flex; align-items: baseline; margin-top: auto; flex: none; padding-top: 2.2mm; border-top: 1px solid var(--line-em); font-size: 7.5pt; color: var(--sub); }
.rf .pno { margin-left: auto; font-weight: 700; color: var(--ink); font-size: 9pt }
.nameline { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 8mm; flex: none; margin-bottom: 5mm }
.nameline .f { font-size: 7pt; font-weight: 800; letter-spacing: .24em; color: var(--sub) }
.nameline .v { border-bottom: 1px solid var(--ink); height: 6mm; margin-top: 1mm }
.exam-head { flex: none; margin-bottom: 4.5mm }
.exam-head h1 { font-size: 16pt; font-weight: 800; letter-spacing: -.01em; line-height: 1.3; }
.exam-meta { display: flex; gap: 6mm; margin-top: 2.2mm; padding: 2.2mm 0 2.6mm; border-top: 1px solid var(--line-em); border-bottom: 1px solid var(--line-em); font-size: 8.5pt; color: var(--sub); }
.exam-meta b { color: var(--ink); font-weight: 700; margin-right: 1.4mm }
.qgrid { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; align-items: start; margin-bottom: 3mm }
.qgrid.c1 { grid-template-columns: 1fr }
.qcol { min-width: 0; height: 100% }
.qgrid:not(.c1) .qcol:first-child { padding-right: 6mm }
.qcol + .qcol { border-left: 1px solid var(--line-em); padding-left: 6mm }
.q + .q, .ex + .ex { margin-top: var(--gap) }
.q .cap { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1.4mm; line-height: 1.4 }
.q .no { font-size: 10pt; font-weight: 800 }
.q .ref { font-size: 7.4pt; font-weight: 600; color: var(--sub) }
.q img { display: block; max-width: 100%; object-fit: contain; object-position: left top }
table.key { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 5mm; flex: none }
.key th, .key td { text-align: center; padding: 1.2mm 0; border-bottom: 1px solid var(--line); width: 10% }
.key tr.n th { border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--ink); font-weight: 700; font-size: 8.4pt }
.key tr.a td { font-weight: 500; font-size: 11.5pt; border-bottom: 1.5px solid var(--ink); font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', var(--font) }
.ex { font-size: 8.7pt; line-height: 1.66 }
.ex .hd { display: flex; align-items: baseline; gap: 2mm; font-weight: 700; font-size: 9pt }
.ex .hd .no { font-weight: 800 }
.ex .hd .ans { font-weight: 500; font-size: 11pt; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', var(--font) }
.ex .hd .ref { margin-left: auto; font-size: 7.4pt; font-weight: 600; color: var(--sub) }
.ex p { margin-top: .6mm; white-space: pre-wrap }
#lab { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none }
#lab .page { margin: 0 }
.wait { font: 14px/1.6 var(--font); padding: 24px; color: var(--sub) }
`;

/** 인쇄 창 안에서 도는 조판 — 높이를 재어 쪽을 만든다(브라우저 전용, 문자열로 심어 넣음) */
function layout(paginate, opt) {
  const $ = (s, r = document) => r.querySelector(s), all = (s, r = document) => [...r.querySelectorAll(s)];
  const ready = Promise.all([document.fonts ? document.fonts.ready : null, ...all('#bank img').map(i => i.decode ? i.decode().catch(() => {}) : null)]);
  return ready.then(() => {
    const mm = $('#ruler').getBoundingClientRect().width / 100, gap = 6 * mm, cols = opt.cols === 1 ? 1 : 2;
    const height = sel => $(sel + ' .qgrid').getBoundingClientRect().height;
    const first = height('#sk-first'), rest = height('#sk-rest');
    const qs = all('#bank .q');
    // 한 단보다 긴 문항은 단 높이에 맞춰 줄임
    for (const q of qs) { const img = $('img', q); img.style.maxHeight = Math.floor(rest - $('.cap', q).getBoundingClientRect().height - 2 * mm) + 'px'; }
    const build = (pages, blocks, firstId, restId) => pages.map((page, pi) => {
      const el = $('#' + (pi === 0 ? firstId : restId)).cloneNode(true); el.removeAttribute('id');
      const cs = all('.qcol', el); page.forEach((col, ci) => col.forEach(i => cs[ci].appendChild(blocks[i])));
      return el;
    });
    const hs = qs.map(q => q.getBoundingClientRect().height), qp = paginate(hs, [first, rest], gap, cols);
    // 첫 쪽에 혼자 놓였는데 첫 쪽 단보다 긴 문항은 그 높이에 맞춤
    for (const col of qp[0]) if (col.length === 1 && hs[col[0]] > first) { const q = qs[col[0]]; $('img', q).style.maxHeight = Math.floor(first - $('.cap', q).getBoundingClientRect().height - 2 * mm) + 'px'; }
    const out = build(qp, qs, 'sk-first', 'sk-rest');
    if ($('#sk-key')) {
      const exs = all('#bank2 .ex');
      if (!exs.length) { const el = $('#sk-key').cloneNode(true); el.removeAttribute('id'); out.push(el); }
      else out.push(...build(paginate(exs.map(e => e.getBoundingClientRect().height), [height('#sk-key'), height('#sk-keyrest')], gap, 2), exs, 'sk-key', 'sk-keyrest'));
    }
    out.forEach((el, i) => { $('.pno', el).textContent = (i + 1) + ' / ' + out.length; document.body.appendChild(el); });
    $('#lab').remove(); const w = $('.wait'); if (w) w.remove();
    document.documentElement.dataset.pages = out.length;
    if (opt.autoPrint) setTimeout(() => print(), 300);
  });
}

/** items = [{ src, source(「2026학년도 6월 모평 한국지리 12번」), ans, memo, w(자른 폭 pt), subject, year, exam }] → 인쇄용 HTML 문서 */
export function sheetHtml(items, options = {}) {
  const o = { ...DEFAULTS, ...options }, one = o.cols === 1, s = summary(items);
  const rh = type => `<div class="rh"><span class="unit">${esc(s.subject || '기출 문항')}</span><span class="lesson">${esc(o.title)}</span><span class="type">${type}</span></div>`;
  const rf = `<div class="rf"><span>${esc(o.title)} · 기출 문항${s.owners ? `<br>문항 저작권 ${esc(s.owners)} · 수업용 배포` : ''}</span><span class="pno"></span></div>`;
  const grid = `<div class="qgrid${one ? ' c1' : ''}"><div class="qcol"></div>${one ? '' : '<div class="qcol"></div>'}</div>`;
  const grid2 = `<div class="qgrid"><div class="qcol"></div><div class="qcol"></div></div>`;
  const nameline = o.nameLine ? `<div class="nameline"><div><div class="f">학년 · 반</div><div class="v"></div></div><div><div class="f">번호</div><div class="v"></div></div><div><div class="f">이름</div><div class="v"></div></div></div>` : '';
  const head = `<div class="exam-head"><h1>${esc(o.title)} — 기출 문항</h1><div class="exam-meta"><span><b>구성</b>5지선다 ${items.length}문항</span>${s.range ? `<span><b>출처</b>${esc(s.range)}</span>` : ''}</div></div>`;
  // 자른 폭(pt)을 실제 크기에 가깝게 — 시험지 한 단(약 250pt)이 이 문제지 한 단을 채움. 1단일 때는 조금 키움
  const width = it => { const w = Number(it.w) || 0; if (!w) return one ? 62 : 100; return Math.min(100, Math.round(w / (one ? 400 : 250) * 1000) / 10); };
  const q = (it, i) => `<div class="q"><div class="cap"><span class="no">${i + 1}</span>${o.sources ? `<span class="ref">${esc(it.source)}</span>` : ''}</div><img src="${esc(it.src)}" alt="${i + 1}번 문항" style="width:${width(it)}%"></div>`;
  let key = '', bankKey = '';
  if (o.answers) {
    const keyHead = `<div class="exam-head"><h1>${esc(o.title)} — 정답${o.memos ? '과 풀이 요점' : ''}</h1></div>`;
    if (o.memos) {
      bankKey = items.map((it, i) => `<div class="ex"><div class="hd"><span class="no">${i + 1}</span><span class="ans">${ansMark(it.ans)}</span>${o.sources ? `<span class="ref">${esc(it.source)}</span>` : ''}</div>${it.memo ? `<p>${esc(it.memo)}</p>` : ''}</div>`).join('');
      key = `<div class="page" id="sk-key">${rh('정답')}${keyHead}${grid2}${rf}</div><div class="page" id="sk-keyrest">${rh('정답')}${grid2}${rf}</div>`;
    } else {
      let rows = '';
      for (let a = 0; a < items.length; a += 10) {
        const part = items.slice(a, a + 10), pad = '<td></td>'.repeat(10 - part.length), padh = '<th></th>'.repeat(10 - part.length);
        rows += `<tr class="n">${part.map((_, j) => `<th>${a + j + 1}</th>`).join('')}${padh}</tr><tr class="a">${part.map(it => `<td>${ansMark(it.ans)}</td>`).join('')}${pad}</tr>`;
      }
      key = `<div class="page" id="sk-key">${rh('정답')}${keyHead}<table class="key">${rows}</table>${rf}</div>`;
    }
  }
  const opt = JSON.stringify({ cols: one ? 1 : 2, autoPrint: !!o.autoPrint });
  const END = '<' + '/script>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(o.title)} — 기출 문항</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet">
<style>${CSS}</style></head><body style="--gap:6mm">
<p class="wait">쪽을 나누는 중…</p>
<div id="lab"><div id="ruler" style="width:100mm;height:0"></div>
<div class="page" id="sk-first">${rh('PRACTICE')}${nameline}${head}${grid}${rf}</div>
<div class="page" id="sk-rest">${rh('PRACTICE')}${grid}${rf}</div>${key}
<div class="page"><div class="qgrid${one ? ' c1' : ''}" id="bank" style="flex:none"><div class="qcol">${items.map(q).join('')}</div>${one ? '' : '<div class="qcol"></div>'}</div><div class="qgrid" style="flex:none"><div class="qcol" id="bank2">${bankKey}</div><div class="qcol"></div></div></div>
</div>
<script>(${layout.toString()})(${paginate.toString()}, ${opt}).catch(function (e) { document.body.insertAdjacentHTML('afterbegin', '<p class="wait">쪽을 나누지 못했습니다: ' + e.message + '</p>'); });${END}
</body></html>`;
}

const DLG = `
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
  if (!document.getElementById('gs-style')) { const st = document.createElement('style'); st.id = 'gs-style'; st.textContent = DLG; document.head.appendChild(st); }
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
