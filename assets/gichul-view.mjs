// Desk 「기출」 뷰 — 진도·이어서 분류·PDF 추가(선택·끌어다 놓기)·분류(문항 + 3축 태그)·시험·검색(인쇄)·통계. 데이터는 앱과 같은 desk/gichul · GitHub 기출/
import * as G from './gichul.mjs?v=1c013acc';
import { openPdf, prepare, renderParts } from './gichul-pdf.mjs?v=0504bf5f';

const FOLDER = '기출', PDF_CACHE = 'gichul-pdf-v1';
const AX = Object.fromEntries(G.AXES);

export function mountGichul(root, fb) {
  const { db, ref, get, set, remove, onValue, escapeHTML: esc } = fb;
  const S = { data: { exams: [], items: [] }, tax: null, gh: null, sub: 'tag', cur: null, work: null, axis: 'c', q: '',
    sTags: [], sSubject: '', sAxis: 'c', sQ: '', started: false, queue: [], drafts: 0 };
  const docs = new Map();
  const $ = sel => root.querySelector(sel);

  root.innerHTML = `
    <div class="panel gc-panel">
      <div class="gc-top">
        <div class="gc-prog">
          <div class="gc-stat"><span>오늘</span><b id="gcToday">0</b><em>/ ${G.DAILY}</em></div>
          <div class="gc-stat"><span>누적</span><b id="gcTotal">0</b><em>/ ${G.GOAL.toLocaleString()}</em></div>
          <div class="gc-bar" aria-hidden="true"><i id="gcBar"></i></div>
          <span class="gc-pendn" id="gcPend" hidden></span>
        </div>
        <nav class="desk-views gc-tabs" id="gcTabs" style="display:flex;">
          <button class="on" data-sub="tag">분류</button><button data-sub="exams">시험</button><button data-sub="search">검색</button><button data-sub="stats">통계</button>
        </nav>
        <div class="mat-actions">
          <button class="btn-sub" id="gcNext" title="다음 미분류 문항">이어서 분류</button>
          <button class="btn-solid" id="gcAdd">+ PDF 추가</button>
          <input type="file" id="gcFile" multiple accept=".pdf,application/pdf" hidden>
        </div>
      </div>
      <p class="mat-status" id="gcStatus" hidden></p>
      <div class="gc-body" id="gcBody"><div class="ev-empty">불러오는 중…</div></div>
    </div>
    <div class="gc-modal" id="gcModal" hidden></div>
    <div class="gc-drop" id="gcDrop" hidden><span>PDF 를 놓으면 문항을 찾습니다</span></div>`;

  // ── 상태 표시 ──
  const status = (msg, err) => { const p = $('#gcStatus'); p.hidden = !msg; p.textContent = msg || ''; p.classList.toggle('err', !!err); };
  function header() {
    const t = G.todayCount(S.data), n = G.taggedCount(S.data);
    $('#gcToday').textContent = t; $('#gcTotal').textContent = n;
    $('#gcToday').classList.toggle('done', t >= G.DAILY);
    $('#gcBar').style.width = Math.min(100, n / G.GOAL * 100) + '%';
    const pn = G.pendingCount(S.data); $('#gcPend').hidden = !pn; $('#gcPend').textContent = `검증 전 ${pn}`;
    const nx = G.nextUntagged(S.data); $('#gcNext').disabled = !nx;
  }

  // ── 시작: 분류표 · GitHub 설정 · 데이터 스트림 ──
  async function start() {
    if (S.started) return; S.started = true;
    try { S.tax = G.parseTaxonomy(await (await fetch('data/gichul-taxonomy.json', { cache: 'no-cache' })).json()); }
    catch { S.tax = { concepts: [], data: [], errors: [] }; status('분류표를 불러오지 못했습니다 — 새로 고침해 주세요.', true); }
    try { const g = (await get(ref(db, 'desk/settings/github'))).val() || {}; if (g.token) S.gh = { token: g.token, repo: g.repo || 'GIS-Leet/soc-c-private' }; } catch {}
    onValue(ref(db, 'desk/gichul'), snap => {
      S.data = G.parseData(snap.val());
      if (S.cur && !S.data.items.some(i => i.id === S.cur)) S.cur = null;
      if (!S.cur) S.cur = G.nextUntagged(S.data)?.id ?? S.data.items[0]?.id ?? null;
      if (S.work && S.work.id !== S.cur) S.work = null;
      header(); if (!(S.sub === 'tag' && S.work)) render();
    }, e => status('기출 데이터를 읽지 못했습니다: ' + e.message, true));
  }

  // ── GitHub ──
  const ghHead = () => ({ Authorization: 'Bearer ' + S.gh.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  const ghUrl = path => `https://api.github.com/repos/${S.gh.repo}/contents/` + path.split('/').map(encodeURIComponent).join('/');
  async function ghSha(path) { const r = await fetch(ghUrl(path), { headers: ghHead() }); if (r.status === 404) return null; if (!r.ok) throw new Error('GitHub ' + r.status); return (await r.json()).sha; }
  const b64 = bytes => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.onerror = no; f.readAsDataURL(new Blob([bytes])); });

  /** 시험 PDF — 브라우저 캐시 → 없으면 GitHub 에서 받아 보관 */
  function pdfOf(exam) {
    if (!docs.has(exam.id)) docs.set(exam.id, (async () => {
      const key = new Request(location.origin + '/__gichul/' + encodeURIComponent(exam.id) + '.pdf');
      let buf = null;
      try { const c = await caches.open(PDF_CACHE); const hit = await c.match(key); if (hit) buf = await hit.arrayBuffer(); } catch {}
      if (!buf) {
        if (!S.gh) throw new Error('자료 탭에서 GitHub 토큰을 먼저 연결해 주세요.');
        const r = await fetch(ghUrl(exam.pdf), { headers: { ...ghHead(), Accept: 'application/vnd.github.raw' } });
        if (!r.ok) throw new Error('PDF 를 받지 못했습니다 (GitHub ' + r.status + ')');
        buf = await r.arrayBuffer();
        try { const c = await caches.open(PDF_CACHE); await c.put(key, new Response(buf.slice(0))); } catch {}
      }
      return openPdf(new Uint8Array(buf));
    })().catch(e => { docs.delete(exam.id); throw e; }));
    return docs.get(exam.id);
  }
  /** 문항 그림을 el 안에 그림 */
  async function draw(el, item, scale) {
    const exam = G.exam(S.data, item.examId); if (!exam) return;
    try { const cv = await renderParts(await pdfOf(exam), item.parts, scale); cv.className = 'gc-cv'; el.replaceChildren(cv); }
    catch (e) { el.innerHTML = `<div class="gc-err">${esc(e.message)} <button class="btn-sub">다시 시도</button></div>`; el.querySelector('button').onclick = () => draw(el, item, scale); }
  }
  const lazy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { lazy.unobserve(e.target); const it = S.data.items.find(i => i.id === e.target.dataset.id); if (it) draw(e.target, it, 1.1); } }), { rootMargin: '300px' });
  const thumb = it => `<div class="gc-th" data-id="${esc(it.id)}"><div class="gc-ph"></div></div>`;
  const observeThumbs = () => root.querySelectorAll('.gc-th[data-id]').forEach(el => lazy.observe(el));

  // ── 화면 전환 ──
  $('#gcTabs').addEventListener('click', e => { const b = e.target.closest('button[data-sub]'); if (!b) return; go(b.dataset.sub); });
  function go(sub, id) {
    commit();
    S.sub = sub; if (id) { S.cur = id; S.work = null; }
    root.querySelectorAll('#gcTabs button').forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
    render();
  }
  $('#gcNext').onclick = () => { const n = G.nextUntagged(S.data, S.cur); if (n) go('tag', n.id); };
  function render() {
    const body = $('#gcBody');
    if (!S.data.exams.length) {
      body.innerHTML = `<div class="gc-empty"><b>기출 PDF 를 넣으면 시작합니다</b><p>평가원·교육청 문제지 PDF 를 고르거나 이 화면에 끌어다 놓으면 학년도·시행·과목을 읽고 문항을 잘라 목록에 올립니다. iPad·Mac 의 Desk 앱과 같은 목록입니다.</p><button class="btn-solid">+ PDF 추가</button></div>`;
      body.querySelector('button').onclick = () => $('#gcFile').click(); return;
    }
    ({ tag: renderTag, exams: renderExams, search: renderSearch, stats: renderStats })[S.sub]();
  }

  // ── 분류 ──
  function renderTag() {
    const body = $('#gcBody');
    const it = S.data.items.find(i => i.id === S.cur);
    if (!it) { body.innerHTML = '<div class="ev-empty">분류할 문항이 없습니다.</div>'; return; }
    if (!S.work || S.work.id !== it.id) S.work = structuredClone(it);
    const exam = G.exam(S.data, it.examId);
    body.innerHTML = `
      <div class="gc-tag">
        <div class="gc-q"><div class="gc-zoom"><button class="btn-sub" data-z="-1" title="작게">−</button><button class="btn-sub" data-z="1" title="크게">+</button></div><div class="gc-img" id="gcImg"><div class="gc-ph big"></div></div></div>
        <div class="gc-side">
          <div class="gc-head"><b>${it.number}번</b>${it.pts != null ? `<span>${it.pts}점</span>` : ''}<em>${esc(exam?.title || '')}</em></div>
          ${G.pending(it) ? '<p class="gc-pending">1차 분류 · 검증 전 — 확인하고 저장하면 검증됨</p>' : ''}
          <div class="gc-chips" id="gcChips"></div>
          <nav class="desk-views gc-axis" id="gcAxis" style="display:flex;">${G.AXES.map(([a, l]) => `<button data-a="${a}" class="${S.axis === a ? 'on' : ''}">${a === 'x' ? '정보' : l}<em></em></button>`).join('')}</nav>
          <div class="gc-pane" id="gcPane"></div>
          <div class="gc-foot">
            <button class="btn-sub" id="gcPrev" title="이전 (Ctrl+[)">‹</button>
            <button class="btn-solid" id="gcSave" title="저장하고 다음 (Ctrl+Enter)">저장하고 다음</button>
            <button class="btn-sub" id="gcFwd" title="다음 (Ctrl+])">›</button>
          </div>
        </div>
      </div>`;
    let zoom = Number(localStorage.getItem('gc-zoom') || 1);
    const img = $('#gcImg'); img.style.setProperty('--z', zoom);
    draw(img, it, 2.4);
    body.querySelector('.gc-zoom').onclick = e => { const b = e.target.closest('[data-z]'); if (!b) return; zoom = Math.max(0.6, Math.min(2.4, zoom + Number(b.dataset.z) * 0.2)); img.style.setProperty('--z', zoom); try { localStorage.setItem('gc-zoom', zoom); } catch {} };
    $('#gcAxis').onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; S.axis = b.dataset.a; S.q = ''; $('#gcAxis').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); pane(); };
    $('#gcPrev').onclick = () => step(-1); $('#gcFwd').onclick = () => step(1); $('#gcSave').onclick = saveNext;
    chips(); pane();
  }
  function chips() {
    const w = S.work, el = $('#gcChips'); if (!el) return;
    const all = G.AXES.flatMap(([a]) => (w.tags[a] || []).filter(t => t !== G.PENDING).map(t => [a, t]));
    el.innerHTML = all.length ? all.map(([a, t]) => `<button class="gc-chip ax-${a}" data-a="${a}" data-t="${esc(t)}" title="떼기">${esc(a === 'c' ? G.leafOf(t) : t)} ×</button>`).join('') : '<span class="gc-hint">아래에서 개념·자료·오답을 골라 붙입니다.</span>';
    el.onclick = e => { const b = e.target.closest('.gc-chip'); if (b) toggle(b.dataset.a, b.dataset.t); };
    root.querySelectorAll('#gcAxis button').forEach(b => { const n = (w.tags[b.dataset.a] || []).length; b.querySelector('em').textContent = n && b.dataset.a !== 'x' ? ' ' + n : ''; });
  }
  function toggle(a, t) {
    const l = S.work.tags[a] ? [...S.work.tags[a]] : [];
    const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); else l.push(t);
    if (l.length) S.work.tags[a] = l; else delete S.work.tags[a];
    chips(); if (S.axis === a) pane(true);
  }
  function pane(keepScroll) {
    const el = $('#gcPane'); if (!el) return;
    const top = el.querySelector('.gc-list')?.scrollTop || 0;
    if (S.axis === 'x') {
      const w = S.work;
      el.innerHTML = `
        <label class="gc-f"><span>정답</span><select id="gcAns"><option value="">모름</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${w.ans === n ? 'selected' : ''}>${'①②③④⑤'[n - 1]}</option>`).join('')}</select></label>
        <label class="gc-f"><span>배점</span><select id="gcPts"><option value="">모름</option>${[1.5, 2, 2.5, 3].map(n => `<option value="${n}" ${w.pts === n ? 'selected' : ''}>${n}점</option>`).join('')}</select></label>
        <label class="gc-f"><span>기타 태그</span><input id="gcX" placeholder="쉼표로 구분 — 예: 킬러, 수업 예시" value="${esc((w.tags.x || []).filter(t => t !== G.PENDING).join(', '))}"></label>
        <label class="gc-f"><span>메모</span><textarea id="gcMemo" rows="5" placeholder="풀이 요점·수업에서 쓸 곳">${esc(w.memo)}</textarea></label>`;
      $('#gcAns').onchange = e => { S.work.ans = e.target.value ? Number(e.target.value) : null; };
      $('#gcPts').onchange = e => { S.work.pts = e.target.value ? Number(e.target.value) : null; };
      $('#gcX').oninput = e => { const t = e.target.value.split(',').map(s => s.trim()).filter(Boolean); if (t.length) S.work.tags.x = t; else delete S.work.tags.x; chips(); };
      $('#gcMemo').oninput = e => { S.work.memo = e.target.value; };
      return;
    }
    const subject = G.exam(S.data, S.work.examId)?.meta.subject || '';
    el.innerHTML = `<input class="gc-find" id="gcFind" placeholder="찾기" value="${esc(S.q)}"><div class="gc-list" id="gcList">${tagList(S.axis, subject, S.work.tags[S.axis] || [], S.q)}</div>`;
    const find = $('#gcFind'); find.oninput = () => { S.q = find.value; $('#gcList').innerHTML = tagList(S.axis, subject, S.work.tags[S.axis] || [], S.q); };
    $('#gcList').onclick = e => { const b = e.target.closest('[data-t]'); if (b) toggle(S.axis, b.dataset.t); };
    if (keepScroll) $('#gcList').scrollTop = top;
  }
  /** 축 하나의 선택 목록 HTML — 개념은 과목 › 단원 › 세부, 시험 과목을 위로 */
  function tagList(axis, subject, selected, q) {
    const hit = s => !q || s.toLowerCase().includes(q.toLowerCase());
    const row = (t, label, cls) => `<button class="gc-opt ${cls} ${selected.includes(t) ? 'on' : ''}" data-t="${esc(t)}"><span>${esc(label)}</span><i></i></button>`;
    if (axis === 'c') return G.conceptOrder(S.tax, subject).map(s => {
      const units = s.units.filter(u => hit(u.tag) || u.subs.some(hit));
      if (!units.length) return '';
      return `<div class="gc-grp">${esc(s.name)}</div>` + units.map(u => row(u.tag, u.tag.slice(s.short.length + 1), 'unit') + u.subs.filter(x => !q || hit(x)).map(x => row(x, G.leafOf(x), 'sub')).join('')).join('');
    }).join('') || '<div class="ev-empty">찾는 항목이 없습니다.</div>';
    const opts = axis === 'd' ? S.tax.data : S.tax.errors;
    return opts.filter(hit).map(t => row(t, t, '')).join('') || '<div class="ev-empty">찾는 항목이 없습니다.</div>';
  }
  const changed = () => { if (!S.work) return false; const cur = S.data.items.find(i => i.id === S.work.id); return cur && JSON.stringify(G.itemRecord(cur)) !== JSON.stringify(G.itemRecord(S.work)); };
  function save(it) {
    const x = G.stamp(it);
    return set(ref(db, `desk/gichul/items/${x.examId}/${G.itemKey(x.number)}`), G.itemRecord(x)).catch(e => status('저장하지 못했습니다: ' + e.message, true));
  }
  function commit() { if (S.sub === 'tag' && changed()) save(S.work); }
  function step(d) {
    commit();
    const i = S.data.items.findIndex(x => x.id === S.cur), n = S.data.items.length; if (i < 0 || !n) return;
    S.cur = S.data.items[(i + d + n) % n].id; S.work = null; renderTag();
  }
  function saveNext() {
    if (!S.work) return;
    save(S.work);
    const id = S.work.id, i = S.data.items.findIndex(x => x.id === id);
    const next = S.data.items.slice(i + 1).find(x => !G.verified(x)) ?? S.data.items.find(x => !G.verified(x) && x.id !== id) ?? S.data.items[(i + 1) % S.data.items.length];
    S.cur = next.id; S.work = null; status('저장했습니다 · ' + id.split('/').pop() + '번'); setTimeout(() => status(''), 1500);
    renderTag();
  }
  document.addEventListener('keydown', e => {
    if (root.style.display === 'none' || S.sub !== 'tag' || !(e.ctrlKey || e.metaKey) || !$('#gcModal').hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); saveNext(); }
    else if (e.key === '[') { e.preventDefault(); step(-1); }
    else if (e.key === ']') { e.preventDefault(); step(1); }
  });

  // ── 시험 ──
  /** 폴더를 펼친 상태 — 브라우저에 기억. 건드린 적 없는 폴더는 가장 최근 학년도만 펼침 */
  const foldState = () => { try { return JSON.parse(localStorage.getItem('gc-folders') || '{}'); } catch { return {}; } };
  function renderExams() {
    const body = $('#gcBody'), st = foldState();
    const count = exams => { const ids = new Set(exams.map(e => e.id)), its = S.data.items.filter(i => ids.has(i.examId)), done = its.filter(G.verified).length;
      return { n: its.length, html: `<em class="${done === its.length && done ? 'ok' : ''}">${done}/${its.length}</em>` }; };
    const fold = (key, title, exams, inner, fallback, sub) => { const c = count(exams);
      return `<details class="gc-fold ${sub ? 'sub' : ''}" data-k="${esc(key)}" ${(st[key] ?? fallback) ? 'open' : ''}><summary><div><b>${esc(title)}</b><span>시험 ${exams.length}개 · ${c.n}문항</span></div>${c.html}</summary>${inner}</details>`; };
    const examBlock = e => {
      const its = G.itemsOf(S.data, e.id), done = its.filter(G.verified).length;
      const short = [e.meta.exam.endsWith('학평') ? e.meta.grade : '', e.meta.subject].filter(Boolean).join(' ');   // 폴더 안에서는 학년·과목만
      return `<details class="gc-fold exam" data-k="${esc('e:' + e.id)}" ${st['e:' + e.id] ? 'open' : ''}><summary><div><b>${esc(short)}</b><span>${its.length}문항 · ${e.pages}쪽</span></div><em class="${done === its.length && done ? 'ok' : ''}">${done}/${its.length}</em><button class="btn-sub" data-del="${esc(e.id)}">삭제</button></summary>
        <div class="gc-grid">${its.map(it => `<button class="gc-cell ${G.verified(it) ? 'on' : G.pending(it) ? 'pend' : ''}" data-go="${esc(it.id)}"><span>${it.number}</span>${thumb(it)}<em>${esc((it.tags.c || []).map(G.leafOf)[0] || '')}</em></button>`).join('')}</div></details>`;
    };
    // 학년도 폴더 › 시행 폴더(3월 학평 … 수능) › 시험
    body.innerHTML = `<div class="gc-scroll">` + G.folders(S.data).map((y, yi) =>
      fold(String(y.year), `${y.year}학년도`, y.sessions.flatMap(ss => ss.exams), y.sessions.map(ss => fold(`${y.year}/${ss.name}`, ss.name, ss.exams, ss.exams.map(examBlock).join(''), false, true)).join(''), yi === 0, false)).join('') + `</div>`;
    body.onclick = e => {
      const d = e.target.closest('[data-del]'); if (d) { e.preventDefault(); return delExam(d.dataset.del); }
      const g = e.target.closest('[data-go]'); if (g) return go('tag', g.dataset.go);
    };
    body.querySelectorAll('details.gc-fold').forEach(el => el.addEventListener('toggle', () => {
      const cur = foldState(); cur[el.dataset.k] = el.open; try { localStorage.setItem('gc-folders', JSON.stringify(cur)); } catch {}
      if (el.open) observeThumbs();
    }));
    observeThumbs();
  }
  async function delExam(id) {
    const e = G.exam(S.data, id); if (!e) return;
    const n = G.itemsOf(S.data, id).filter(G.tagged).length;
    if (!confirm(`「${e.title}」을(를) 지울까요?\n붙인 태그 ${n}개도 함께 지워집니다. (iPad·Mac 앱에서도 사라짐)`)) return;
    try {
      await remove(ref(db, 'desk/gichul/items/' + id)); await remove(ref(db, 'desk/gichul/exams/' + id));
      docs.delete(id); try { (await caches.open(PDF_CACHE)).delete(location.origin + '/__gichul/' + encodeURIComponent(id) + '.pdf'); } catch {}
      if (S.gh) { const sha = await ghSha(e.pdf).catch(() => null); if (sha) await fetch(ghUrl(e.pdf), { method: 'DELETE', headers: ghHead(), body: JSON.stringify({ message: `삭제: ${e.pdf} (Desk 웹)`, sha }) }); }
      status('지웠습니다: ' + e.title);
    } catch (err) { status('지우지 못했습니다: ' + err.message, true); }
  }

  // ── 검색 ──
  function renderSearch() {
    const body = $('#gcBody');
    const subjects = [...new Set(S.data.exams.map(e => e.meta.subject))].sort();
    const res = G.search(S.data, { subject: S.sSubject || null, tags: S.sTags });
    body.innerHTML = `
      <div class="gc-search">
        <div class="gc-filter">
          <label class="gc-f"><span>과목</span><select id="gcSubj"><option value="">전체</option>${subjects.map(s => `<option ${s === S.sSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <div class="gc-chips">${S.sTags.map(t => `<button class="gc-chip" data-t="${esc(t)}">${esc(G.leafOf(t))} ×</button>`).join('') || '<span class="gc-hint">태그를 고르면 모두 붙은 문항만 남습니다. 단원 태그는 그 아래 세부 태그도 찾습니다.</span>'}</div>
          <nav class="desk-views gc-axis" id="gcSAxis" style="display:flex;">${[['c', '개념'], ['d', '자료'], ['o', '오답']].map(([a, l]) => `<button data-a="${a}" class="${S.sAxis === a ? 'on' : ''}">${l}</button>`).join('')}</nav>
          <input class="gc-find" id="gcSFind" placeholder="찾기" value="${esc(S.sQ)}">
          <div class="gc-list" id="gcSList">${tagList(S.sAxis, S.sSubject, S.sTags, S.sQ)}</div>
        </div>
        <div class="gc-results">
          <div class="gc-res-h"><b>결과 ${res.length}개</b>${res.length ? `<button class="btn-sub" id="gcPrint" ${res.length > 120 ? 'disabled title="120문항까지"' : ''}>인쇄 · PDF 저장</button>` : ''}</div>
          <div class="gc-scroll">${res.map(it => { const e = G.exam(S.data, it.examId); return `<button class="gc-row" data-go="${esc(it.id)}">${thumb(it)}<div><b>${esc(e?.title || '')} ${it.number}번</b><span>${esc(G.allTags(it).map(G.leafOf).join(' · '))}</span></div></button>`; }).join('')}</div>
        </div>
      </div>`;
    $('#gcSubj').onchange = e => { S.sSubject = e.target.value; renderSearch(); };
    $('#gcSAxis').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { S.sAxis = b.dataset.a; S.sQ = ''; renderSearch(); } };
    const f = $('#gcSFind'); f.oninput = () => { S.sQ = f.value; $('#gcSList').innerHTML = tagList(S.sAxis, S.sSubject, S.sTags, S.sQ); };
    body.onclick = e => {
      const c = e.target.closest('.gc-filter .gc-chip, .gc-list [data-t]');
      if (c) { const t = c.dataset.t, i = S.sTags.indexOf(t); if (i >= 0) S.sTags.splice(i, 1); else S.sTags.push(t); return renderSearch(); }
      const g = e.target.closest('[data-go]'); if (g) return go('tag', g.dataset.go);
      if (e.target.closest('#gcPrint')) printItems(res);
    };
    observeThumbs();
  }
  /** 고른 문항을 A4 인쇄 창으로 — 브라우저 인쇄에서 「PDF 로 저장」 */
  async function printItems(items) {
    const w = window.open('', '_blank'); if (!w) return status('팝업이 막혔습니다 — 이 사이트의 팝업을 허용해 주세요.', true);
    w.document.write('<p style="font:14px sans-serif;padding:24px">문항을 그리는 중…</p>');
    const blocks = [];
    for (const it of items) {
      const e = G.exam(S.data, it.examId);
      try { const cv = await renderParts(await pdfOf(e), it.parts, 2.4); blocks.push(`<figure><figcaption>${esc(e.title)} ${it.number}번</figcaption><img src="${cv.toDataURL('image/png')}"></figure>`); } catch {}
    }
    const title = S.sTags.map(G.leafOf).join('·') || S.sSubject || '기출 모음';
    w.document.open(); w.document.write(`<!doctype html><meta charset="utf-8"><title>기출 ${esc(title)}</title><style>@page{size:A4;margin:14mm}body{margin:0;font-family:Pretendard,-apple-system,sans-serif}figure{margin:0 0 8mm;break-inside:avoid}figcaption{font-size:9pt;font-weight:600;color:#555;margin-bottom:2mm}img{width:100%;max-height:250mm;object-fit:contain;object-position:left top}</style>${blocks.join('')}<script>onload=()=>setTimeout(()=>print(),300)<\/script>`); w.document.close();
  }

  // ── 통계 ──
  function renderStats() {
    const d = S.data, body = $('#gcBody');
    const bars = (axis, label) => { const f = G.frequency(d, axis), m = f[0]?.n || 1;
      return `<section class="gc-stat-sec"><h3>${label}</h3>${f.length ? f.slice(0, 12).map(r => `<div class="gc-sbar"><span>${esc(r.tag)}</span><b>${r.n}</b><i class="ax-${axis}" style="width:${r.n / m * 100}%"></i></div>`).join('') : '<div class="ev-empty">아직 없음</div>'}</section>`; };
    const c = G.cross(d), units = Object.keys(c).sort(), types = S.tax.data.filter(t => units.some(u => c[u][t]));
    body.innerHTML = `<div class="gc-scroll gc-stats">
      <div class="p-stats gc-kpi"><div class="stat-i"><b>${G.taggedCount(d)}</b><span>검증</span></div><div class="stat-i"><b>${d.items.length}</b><span>전체 문항</span></div><div class="stat-i"><b>${d.exams.length}</b><span>시험</span></div></div>
      <div class="gc-stat-cols">${bars('c', '개념 (단원별)')}${bars('d', '자료 유형')}${bars('o', '오답 유형')}</div>
      ${units.length && types.length ? `<section class="gc-stat-sec"><h3>단원 × 자료 유형</h3><div class="gc-cross"><table><tr><th></th>${types.map(t => `<th>${esc(t)}</th>`).join('')}</tr>${units.map(u => `<tr><th>${esc(u)}</th>${types.map(t => `<td class="${c[u][t] ? 'on' : ''}">${c[u][t] || '·'}</td>`).join('')}</tr>`).join('')}</table></div><p class="gc-hint">어느 단원이 어떤 자료로 자주 나오는지 — 수업 예시와 자체 문항 만들 때 참고.</p></section>` : ''}
    </div>`;
  }

  // ── PDF 추가 ──
  $('#gcAdd').onclick = () => $('#gcFile').click();
  $('#gcFile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  let dragDepth = 0;
  root.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#gcDrop').hidden = false; } });
  root.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#gcDrop').hidden = true; } });
  root.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  root.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#gcDrop').hidden = true; addFiles([...e.dataTransfer.files].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')); });

  async function addFiles(files) {
    if (!files.length) return;
    if (!S.gh) return status('자료 탭에서 GitHub 토큰을 먼저 연결해 주세요 — PDF 원본을 비공개 저장소에 보관합니다.', true);
    for (const f of files) {
      S.drafts++; status(`PDF 읽는 중 — ${f.name} (문항 찾는 중)`);
      try { const d = await prepare(f); if (!d.found.length) throw new Error('문항 번호를 찾지 못했습니다(스캔 PDF 는 지원 안 함).'); S.queue.push({ ...d, name: f.name }); }
      catch (e) { status(`${f.name}: ${e.message}`, true); }
      finally { S.drafts--; }
    }
    if (!S.drafts && !$('#gcStatus').classList.contains('err')) status('');
    if ($('#gcModal').hidden) showDraft();
  }
  function showDraft() {
    const d = S.queue.shift(), m = $('#gcModal'); if (!d) { m.hidden = true; return; }
    const meta = { ...d.meta };
    const opts = (list, cur) => (list.includes(cur) ? list : [cur, ...list]).map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v || '없음')}</option>`).join('');
    m.hidden = false;
    m.innerHTML = `<div class="panel gc-sheet" role="dialog" aria-label="기출 PDF 확인">
      <div class="gc-sheet-h"><b>${esc(d.name)}</b><span>${d.pages}쪽</span></div>
      <div class="gc-meta">
        <label class="gc-f"><span>학년도</span><input id="gmYear" type="number" min="1994" max="2100" value="${meta.year}"></label>
        <label class="gc-f"><span>시행</span><select id="gmExam">${opts(G.EXAMS, meta.exam)}</select></label>
        <label class="gc-f"><span>학년</span><select id="gmGrade">${opts(G.GRADES, meta.grade)}</select></label>
        <label class="gc-f"><span>과목</span><select id="gmSubj">${opts(G.SUBJECTS, meta.subject)}</select></label>
      </div>
      <p class="gc-title" id="gmTitle"></p>
      <p class="gc-count" id="gmCount"></p>
      <div class="gc-grid gc-prev" id="gmPrev">${d.found.map(f => `<div class="gc-cell"><span>${f.number}${f.parts.length > 1 ? ' · 조각 ' + f.parts.length : ''}</span><div class="gc-th" data-n="${f.number}"><div class="gc-ph"></div></div></div>`).join('')}</div>
      <p class="mat-status err" id="gmErr" hidden></p>
      <div class="gc-sheet-f"><button class="btn-sub" id="gmCancel">취소</button><button class="btn-solid" id="gmSave">저장</button></div>
    </div>`;
    const read = () => { meta.year = Number($('#gmYear').value) || meta.year; meta.exam = $('#gmExam').value; meta.grade = $('#gmGrade').value; meta.subject = $('#gmSubj').value; };
    const refresh = () => {
      read(); const exp = G.expectedCount(meta.subject), have = new Set(d.found.map(f => f.number));
      const missing = Array.from({ length: exp }, (_, i) => i + 1).filter(n => !have.has(n));
      $('#gmTitle').textContent = '제목: ' + G.metaTitle(meta) + (G.exam(S.data, G.metaId(meta)) ? ' — 이미 있음: 저장하면 문항 위치만 바꾸고 태그·정답·메모는 유지' : '');
      $('#gmCount').innerHTML = `문항 <b>${d.found.length}개</b>` + (d.found.length === exp ? ' — 정상' : ` — ${esc(meta.subject || '이 과목')}은 보통 ${exp}문항 · 빠진 번호: ${missing.join(', ') || '없음'}`);
      $('#gmCount').classList.toggle('warn', d.found.length !== exp);
      $('#gmSave').disabled = !meta.subject;
    };
    m.querySelectorAll('.gc-meta input, .gc-meta select').forEach(x => x.addEventListener('input', refresh));
    refresh();
    (async () => { for (const el of m.querySelectorAll('.gc-th[data-n]')) { const f = d.found.find(x => x.number === Number(el.dataset.n)); try { const cv = await renderParts(d.pdf, f.parts, 0.8); cv.className = 'gc-cv'; el.replaceChildren(cv); } catch {} } })();
    $('#gmCancel').onclick = () => { m.hidden = true; showDraft(); };
    $('#gmSave').onclick = async () => {
      read(); const btn = $('#gmSave'); btn.disabled = true; btn.textContent = '올리는 중…'; $('#gmErr').hidden = true;
      try {
        const id = G.metaId(meta), path = `${FOLDER}/${id}.pdf`;
        // PDF 를 GitHub 에 올린 뒤에만 RTDB 에 씀 — PDF 없는 시험이 생기지 않게
        const sha = await ghSha(path);
        const r = await fetch(ghUrl(path), { method: 'PUT', headers: ghHead(), body: JSON.stringify({ message: `업로드: ${id}.pdf (Desk 웹)`, content: await b64(d.bytes), ...(sha ? { sha } : {}) }) });
        if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + (await r.text()).slice(0, 120));
        try { const c = await caches.open(PDF_CACHE); await c.put(new Request(location.origin + '/__gichul/' + encodeURIComponent(id) + '.pdf'), new Response(d.bytes.slice(0))); } catch {}
        docs.set(id, Promise.resolve(d.pdf));
        const old = G.exam(S.data, id);
        await set(ref(db, 'desk/gichul/items/' + id), G.mergeFound(id, meta, d.found, G.itemsOf(S.data, id)));
        await set(ref(db, 'desk/gichul/exams/' + id), G.examRecord({ title: G.metaTitle(meta), meta, pdf: path, pages: d.pages, count: d.found.length, createdAt: old?.createdAt ?? Date.now() }));
        status(`저장했습니다: ${G.metaTitle(meta)} · ${d.found.length}문항`);
        m.hidden = true; showDraft();
      } catch (e) { $('#gmErr').hidden = false; $('#gmErr').textContent = '저장하지 못했습니다: ' + e.message; btn.disabled = false; btn.textContent = '저장'; }
    };
  }

  /** 로그아웃 — 토큰·PDF·데이터를 메모리에서 비움(스트림은 desk 의 세션 범위가 끊음) */
  function reset() { S.gh = null; S.started = false; S.data = { exams: [], items: [] }; S.cur = null; S.work = null; S.queue = []; docs.clear(); $('#gcModal').hidden = true; status(''); $('#gcBody').innerHTML = '<div class="ev-empty">불러오는 중…</div>'; }
  return { open: start, reset };
}
