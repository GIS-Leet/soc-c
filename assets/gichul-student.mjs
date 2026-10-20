// 통합사회 기출 문항(gichul.html) — Desk 「학생용 공개」가 올린 data/gichul/index.json 과 문항 그림을 단원별 또는 시험별(학년도 › 시행 › 학년)로 보여 준다.
// 목록에서 풀어 보기(번호 고르기 → 정답 · 풀이), 한 문항씩 풀기(전체 화면, 키보드 1~5 · ← →). 분류표는 data/gichul-taxonomy.json(Desk 와 같은 것).
import * as G from './gichul.mjs?v=7adfbb60';
import { GEO_UNITS } from './gichul-publish.mjs?v=ada1f9ee';
import { $, esc, params, setParams, shareButton } from './map-kit.mjs?v=affb9c7a';


const st = { view: 'unit', tag: '', exam: '', type: '', solve: null };   // view: 'unit' 단원별 · 'exam' 시험별(exam = 시험 제목)
let D, TAX, COUNT, SUBJ;

const sameTag = (t, tag) => t === tag || t.startsWith(tag + ' > ');
const itemsOf = (tag) => D.items.filter((it) => (it.c || []).some((t) => sameTag(t, tag)));
const examOf = (it) => D.exams[it.e];
// 시험별 — 목록(index.json)의 시험은 이미 학년도(최근) › 시행(3월 → … → 수능) › 학년 순서다(gichul-publish.mjs buildPublic)
const examIndex = (title) => D.exams.findIndex((e) => e.title === title);
const examItems = (title) => { const i = examIndex(title); return D.items.filter((it) => it.e === i).sort((a, b) => a.n - b.n); };
const examName = (e) => e.title.replace(/\s*통합사회$/, '');
const examShort = (e) => [e.exam, e.grade].filter(Boolean).join(' · ');
function examYears() {
  const years = new Map();
  D.exams.forEach((e) => { if (!years.has(e.year)) years.set(e.year, []); years.get(e.year).push(e); });
  return [...years];
}
const inExam = () => st.view === 'exam';
const headName = () => inExam() ? examName(D.exams[examIndex(st.exam)]) : st.tag.includes(' > ') ? leaf(st.tag) : unitName(st.tag);
const leaf = (t) => G.leafOf(t).replace(/^통사[12]\s+/, '');
const unitName = (tag) => tag.replace(/^통사[12]\s+/, '');

// ── 단원 목록 ──
function counts() {
  const n = new Map();
  for (const it of D.items) for (const t of new Set((it.c || []).flatMap((x) => [x, G.unitOf(x)]))) n.set(t, (n.get(t) || 0) + 1);
  return n;
}
// 단원별 · 시험별 전환
function modeHtml() {
  return `<div class="gx-mode" role="group" aria-label="보는 방식">${[['unit', '단원별'], ['exam', '시험별']].map(([v, l]) =>
    `<button type="button" class="opt" data-view="${v}" aria-pressed="${st.view === v}">${l}</button>`).join('')}</div>`;
}
function examNavHtml() {
  return examYears().map(([year, list]) => `<section class="gx-course"><h2>${year}학년도</h2><ol>${list.map((e) => {
    const n = D.items.filter((it) => examOf(it) === e).length;
    return `<li><button type="button" data-exam="${esc(e.title)}" aria-current="${st.exam === e.title}">${esc(examShort(e))}<span>${n}</span></button></li>`;
  }).join('')}</ol></section>`).join('');
}
function navHtml() {
  if (inExam()) return modeHtml() + examNavHtml();
  return modeHtml() + SUBJ.map((s) => `<section class="gx-course"><h2>${esc(s.name)}</h2><ol>${s.units.map((u) => {
    const n = COUNT.get(u.tag) || 0, on = st.tag === u.tag || st.tag.startsWith(u.tag + ' > ');
    const subs = on ? `<ol class="gx-subs">${u.subs.filter((x) => COUNT.get(x)).map((x) => `<li><button type="button" data-tag="${esc(x)}" aria-current="${st.tag === x}">${esc(leaf(x))}<span>${COUNT.get(x)}</span></button></li>`).join('')}</ol>` : '';
    return `<li class="${on ? 'is-open' : ''}"><button type="button" data-tag="${esc(u.tag)}" ${n ? '' : 'disabled'} aria-current="${st.tag === u.tag}">${esc(unitName(u.tag))}<span>${n || '—'}</span></button>${subs}</li>`;
  }).join('')}</ol></section>`).join('');
}
// 좁은 화면 — 단원 고르기 상자
function pickHtml() {
  if (inExam()) {
    return modeHtml() + `<label class="gx-pick"><span>시험</span><select id="gxPick">${examYears().map(([year, list]) => `<optgroup label="${year}학년도">${list.map((e) =>
      `<option value="${esc(e.title)}" ${st.exam === e.title ? 'selected' : ''}>${esc(examName(e))} (${D.items.filter((it) => examOf(it) === e).length})</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  }
  const opt = (tag, label, n) => `<option value="${esc(tag)}" ${st.tag === tag ? 'selected' : ''} ${n ? '' : 'disabled'}>${esc(label)} (${n || 0})</option>`;
  return modeHtml() + `<label class="gx-pick"><span>단원</span><select id="gxPick">${SUBJ.map((s) => `<optgroup label="${esc(s.name)}">${s.units.map((u) =>
    opt(u.tag, unitName(u.tag), COUNT.get(u.tag)) + u.subs.filter((x) => COUNT.get(x)).map((x) => opt(x, '　· ' + leaf(x), COUNT.get(x))).join('')).join('')}</optgroup>`).join('')}</select></label>`;
}

// ── 문항 ──
function notesHtml(it) {
  const rows = (it.notes || []).map((n) => `<div class="gx-note"><dt>${esc(n.k)}</dt><dd>${esc(n.t)}</dd></div>`).join('');
  const kinds = [...(it.c || []).map(leaf), ...(it.d || []), ...(it.o || [])];
  return `${it.ans ? `<p class="gx-right">정답 <b>${it.ans}번</b></p>` : ''}
    ${rows ? `<dl class="gx-notes">${rows}</dl>` : '<p class="gx-none">이 문항에는 풀이 메모가 아직 없습니다.</p>'}
    <p class="gx-kind"><span>분류</span>${esc(kinds.join(' · '))}</p>`;
}
function choicesHtml(it, idx) {
  if (!it.ans) return '';
  return `<div class="gx-choices" role="group" aria-label="답 고르기">${[1, 2, 3, 4, 5].map((k) => `<button type="button" data-pick="${k}" data-i="${idx}" aria-label="${k}번 고르기">${k}</button>`).join('')}</div>`;
}
// 문항 머리의 작은 글씨 — 단원별에서는 어느 시험인지, 시험별에서는 어느 단원인지
const sourceOf = (it) => inExam() ? [...new Set((it.c || []).map(leaf))].join(' · ') : examOf(it).title;
function itemHtml(it, idx) {
  const e = examOf(it);
  return `<article class="gx-item" id="q-${idx}" data-i="${idx}">
    <header class="gx-h"><b>${it.n}번</b>${it.pts ? `<span>${it.pts}점</span>` : ''}<em>${esc(sourceOf(it))}</em></header>
    <figure class="gx-paper"><img src="data/gichul/img/${esc(it.img)}" alt="${esc(e.title)} ${it.n}번 문항" ${it.w ? `width="${it.w}" height="${it.h}"` : ''} loading="lazy" decoding="async"></figure>
    <div class="gx-act">${choicesHtml(it, idx)}<button type="button" class="opt gx-show" data-show="${idx}" aria-expanded="false">정답과 풀이</button></div>
    <div class="gx-ans" id="a-${idx}" hidden>${notesHtml(it)}</div>
  </article>`;
}
function current() {
  const all = inExam() ? examItems(st.exam) : itemsOf(st.tag);
  return st.type ? all.filter((it) => (it.d || []).includes(st.type)) : all;
}
function render() {
  $('#gxNav').innerHTML = navHtml();
  $('#gxPickWrap').innerHTML = pickHtml();
  const all = inExam() ? examItems(st.exam) : itemsOf(st.tag), list = current();
  const types = [...new Set(all.flatMap((it) => it.d || []))];
  if (st.type && !types.includes(st.type)) st.type = '';
  $('#gxHead').innerHTML = `<h2>${esc(headName())}</h2>
    <p>${list.length}문항${st.type ? ` · 자료 「${esc(st.type)}」` : ''}</p>
    ${types.length > 1 ? `<div class="gx-types" role="group" aria-label="자료 유형"><button type="button" class="opt" data-type="" aria-pressed="${!st.type}">모두</button>${types.map((t) => `<button type="button" class="opt" data-type="${esc(t)}" aria-pressed="${st.type === t}">${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="gx-tools"><button type="button" class="opt gx-solvebtn" id="gxSolve" ${list.length ? '' : 'disabled'}>한 문항씩 풀기</button><button type="button" class="share-btn" id="gxShare">공유</button></div>`;
  $('#gxList').innerHTML = list.map((it) => itemHtml(it, D.items.indexOf(it))).join('') || `<p class="gx-empty">이 ${inExam() ? '시험' : '단원'}에는 아직 문항이 없습니다.</p>`;
  shareButton($('#gxShare'), () => location.href, () => `통합사회 기출 · ${headName()}`);
  setParams(inExam() ? { v: 'exam', x: st.exam, t: st.type } : { u: st.tag, t: st.type });
}

// 답 고르기 — 고르면 맞았는지 표시하고 풀이를 연다
function pick(btn) {
  const it = D.items[+btn.dataset.i], k = +btn.dataset.pick, box = btn.closest('.gx-choices');
  box.querySelectorAll('button').forEach((b) => { b.classList.remove('is-pick', 'is-right', 'is-wrong'); b.setAttribute('aria-pressed', 'false'); });
  btn.classList.add('is-pick', k === it.ans ? 'is-right' : 'is-wrong'); btn.setAttribute('aria-pressed', 'true');
  if (k !== it.ans) box.querySelector(`[data-pick="${it.ans}"]`)?.classList.add('is-right');
  return k === it.ans;
}
function toggle(idx, open) {
  const a = document.getElementById('a-' + idx), b = document.querySelector(`[data-show="${idx}"]`);
  if (!a) return;
  a.hidden = open === undefined ? !a.hidden : !open;
  b?.setAttribute('aria-expanded', String(!a.hidden));
}

// ── 한 문항씩 풀기 ──
function openSolve(at = 0) {
  st.solve = { list: current(), i: at, done: new Map() };
  $('#gxSolveBox').hidden = false; document.body.classList.add('gx-lock'); drawSolve();
  $('#gxSolveBox').focus();
}
function closeSolve() { st.solve = null; $('#gxSolveBox').hidden = true; document.body.classList.remove('gx-lock'); }
function drawSolve() {
  const S = st.solve, it = S.list[S.i], idx = D.items.indexOf(it), e = examOf(it), got = S.done.get(it.id);
  const right = [...S.done.values()].filter(Boolean).length;
  $('#gxSolveBox').innerHTML = `<div class="gx-sv">
    <header class="gx-sv-top"><span>${S.i + 1} / ${S.list.length}</span><span>맞힌 문항 ${right} / 푼 문항 ${S.done.size}</span><button type="button" class="opt" data-sv="close">닫기</button></header>
    <div class="gx-sv-body">
      <header class="gx-h"><b>${it.n}번</b>${it.pts ? `<span>${it.pts}점</span>` : ''}<em>${esc(sourceOf(it))}</em></header>
      <figure class="gx-paper"><img src="data/gichul/img/${esc(it.img)}" alt="${esc(e.title)} ${it.n}번 문항" ${it.w ? `width="${it.w}" height="${it.h}"` : ''}></figure>
      <div class="gx-act">${choicesHtml(it, idx)}<button type="button" class="opt gx-show" data-show="${idx}" aria-expanded="${got !== undefined}">정답과 풀이</button></div>
      <div class="gx-ans" id="a-${idx}" ${got !== undefined ? '' : 'hidden'}>${notesHtml(it)}</div>
    </div>
    <footer class="gx-sv-nav"><button type="button" class="opt" data-sv="prev" ${S.i ? '' : 'disabled'}>← 앞 문항</button><button type="button" class="opt" data-sv="next" ${S.i < S.list.length - 1 ? '' : 'disabled'}>다음 문항 →</button></footer>
  </div>`;
  if (got !== undefined) { const b = $('#gxSolveBox').querySelector(`[data-pick="${S.pickOf?.[it.id]}"]`); if (b) pick(b); }
}
function solveMove(d) { const S = st.solve; const n = S.i + d; if (n < 0 || n >= S.list.length) return; S.i = n; drawSolve(); $('#gxSolveBox').scrollTop = 0; }

async function main() {
  const [idx, tax] = await Promise.all([
    fetch('data/gichul/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('data/gichul-taxonomy.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  TAX = G.parseTaxonomy(tax);
  // 지리 단원만 목록에 — 공개하는 문항도 이 단원들뿐(gichul-publish.mjs GEO_UNITS)
  SUBJ = TAX.concepts.filter((c) => c.name.startsWith('통합사회')).map((c) => ({ ...c, units: c.units.filter((u) => GEO_UNITS.includes(u.tag)) })).filter((c) => c.units.length);
  if (!idx || !idx.items?.length) {
    $('#gxMain').classList.add('gx--empty'); $('#gxMain').innerHTML = '<p class="gx-empty">아직 공개된 문항이 없습니다. 문항을 단원별로 정리해 올리면 여기에 나타납니다.</p>';
    return;
  }
  D = idx; COUNT = counts();
  const p = params(), first = SUBJ.flatMap((s) => s.units).find((u) => COUNT.get(u.tag));
  st.tag = p.get('u') && COUNT.get(p.get('u')) ? p.get('u') : first?.tag || '';
  st.type = p.get('t') || '';
  st.exam = examIndex(p.get('x') || '') >= 0 ? p.get('x') : D.exams[0].title;
  st.view = p.get('v') === 'exam' ? 'exam' : 'unit';
  $('#gxMade').textContent = `${D.items.length}문항 · 시험 ${D.exams.length}회분 · ${new Date(D.made).toLocaleDateString('ko-KR')} 정리`;
  render();

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.view && (t.closest('#gxNav') || t.closest('#gxPickWrap'))) { if (st.view !== t.dataset.view) { st.view = t.dataset.view; st.type = ''; render(); } return; }
    if (t.dataset.exam !== undefined && t.closest('#gxNav')) { st.exam = t.dataset.exam; st.type = ''; render(); $('#gxHead').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (t.dataset.tag !== undefined && t.closest('#gxNav')) { st.tag = t.dataset.tag; st.type = ''; render(); $('#gxHead').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (t.dataset.type !== undefined && t.closest('#gxHead')) { st.type = t.dataset.type; render(); return; }
    if (t.id === 'gxSolve') return openSolve(0);
    if (t.dataset.pick) {
      const ok = pick(t), i = +t.dataset.i;
      if (st.solve) { const it = D.items[i]; st.solve.done.set(it.id, ok); (st.solve.pickOf ||= {})[it.id] = +t.dataset.pick; drawSolve(); }
      else toggle(i, true);
      return;
    }
    if (t.dataset.show) return toggle(+t.dataset.show);
    if (t.dataset.sv === 'close') return closeSolve();
    if (t.dataset.sv === 'prev') return solveMove(-1);
    if (t.dataset.sv === 'next') return solveMove(1);
  });
  document.addEventListener('change', (ev) => { if (ev.target.id === 'gxPick') { if (inExam()) st.exam = ev.target.value; else st.tag = ev.target.value; st.type = ''; render(); } });
  document.addEventListener('keydown', (ev) => {
    if (!st.solve) return;
    if (ev.key === 'Escape') return closeSolve();
    if (ev.key === 'ArrowRight') return solveMove(1);
    if (ev.key === 'ArrowLeft') return solveMove(-1);
    if (/^[1-5]$/.test(ev.key)) $('#gxSolveBox').querySelector(`[data-pick="${ev.key}"]`)?.click();
  });
}
main().catch((e) => { console.error(e); $('#gxMain').classList.add('gx--empty'); $('#gxMain').innerHTML = '<p class="gx-empty">문항을 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
