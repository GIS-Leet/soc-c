// 공부 → 시험: 1일차부터 오늘까지의 카드에서 문제를 만들고 화면에 띄운다. study.html과 Mac 창(daily_study)이 함께 씀.
// v2 — 주관식(떠올리기) 위주 + 같은 분야 오답 보기 + 출제 이력(SRS): 최근 낸 문제는 피하고, 틀렸거나 오래된 것을 먼저.
(function (root) {
  'use strict';
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = a => [...new Set(a)];
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const AVOID_DAYS = 2;        // 이 안에 낸 문제는 (후보가 넉넉하면) 다시 안 냄
  const TYPED_PER_TEST = 3;    // 5문제 중 주관식 3, 4지선다 2

  // ── 채점: 정규화 후 비교. 괄호 안(영문·연도 등)은 무시, 「A 또는 B」식 대체 정답 허용 ──
  const norm = s => (s || '').normalize('NFKC').toLowerCase().replace(/\([^)]*\)|（[^）]*）/g, '').replace(/[\s。、．，！？.,!?「」『』・…·\-–—~〜_'"`:;／/]/g, '');
  function grade(q, typed) {
    const t = norm(typed); if (!t) return false;
    const answers = [q.answer, ...(q.alt || [])].map(norm).filter(Boolean);
    return answers.some(a => a === t);
  }

  // ── 출제 이력 ──
  // log: { [id]: { last: ms, right: n, wrong: n, streak: n } }. 우선순위: 틀린 지 얼마 안 됨 > 한 번도 안 냄 > 오래됨. 최근 AVOID_DAYS 안에 낸 건 뒤로.
  function priority(entry, now) {
    if (!entry) return 1000;
    const age = (now - (entry.last || 0)) / DAY;
    const recent = age < AVOID_DAYS;
    const wrongBoost = (entry.wrong || 0) > 0 && (entry.streak || 0) < 2 ? 1500 : 0;  // 틀린 뒤 2연속 정답 전까지는 '한 번도 안 낸 문제'보다 우선
    return (recent ? -1000 : 0) + wrongBoost + Math.min(age, 60) * 5 - Math.min(entry.streak || 0, 5) * 20;
  }
  // 후보 중 count개 고르기: 오늘 카드 최소 minToday, 형식 비율(주관식 typedN) 맞춤, 우선순위 높은 순 + 약간의 무작위
  function select(cands, count, typedN, isToday, log, now) {
    const scored = shuffle(cands).map(q => ({ q, p: priority(log[q.id], now) + Math.random() * 30 })).sort((a, b) => b.p - a.p);
    const out = [], used = new Set();
    const take = pred => { const hit = scored.find(x => !used.has(x.q.id) && pred(x.q)); if (hit) { used.add(hit.q.id); out.push(hit.q); } return !!hit; };
    let todayN = 0, typedGot = 0, mcqGot = 0;
    const want = (q) => (q.type === 'typed' ? typedGot < typedN : mcqGot < count - typedN);
    const push = q => { if (q.type === 'typed') typedGot++; else mcqGot++; if (isToday(q)) todayN++; };
    // 0) 틀렸던 문제(아직 2연속 정답 전)는 형식 비율 안에서 먼저 — 오늘 카드보다 우선, 최대 count-2개
    for (let i = 0; i < count - 2; i++) { if (take(q => want(q) && priority(log[q.id], now) >= 1500)) push(out[out.length - 1]); else break; }
    // 1) 오늘 카드 2문제(형식 비율 안에서)
    for (let i = 0; i < 2; i++) { if (take(q => isToday(q) && want(q))) push(out[out.length - 1]); }
    // 2) 나머지: 비율 맞춰 채우기
    while (out.length < count) { if (take(q => want(q))) push(out[out.length - 1]); else if (take(() => true)) push(out[out.length - 1]); else break; }
    return shuffle(out);
  }

  function mcqOpts(answer, near, far) {   // 오답 3개: 비슷한(같은 분야·같은 날) 후보 먼저, 부족하면 전체에서
    const pool = uniq([...shuffle(near), ...shuffle(far)].filter(x => x && norm(x) !== norm(answer)));
    return pool.slice(0, 3);
  }
  function mcq(id, label, prompt, answer, near, far, extra = {}) {
    const wrong = mcqOpts(answer, near, far); if (wrong.length < 3) return null;
    return Object.assign({ id, type: 'mcq', label, prompt, answer, options: shuffle([answer, ...wrong]) }, extra);
  }
  const typed = (id, label, prompt, answer, extra = {}) => Object.assign({ id, type: 'typed', label, prompt, answer }, extra);
  const poolIdx = (D, todayIdx) => { const n = D.days.length; return (todayIdx >= n ? D.days : D.days.slice(0, todayIdx + 1)).map((_, i) => i); };
  // 핵심 정리(a)에서 개념명/용어가 들어간 문장 하나를 골라 그 말을 빈칸으로
  function cloze(c) {
    const words = [c.t, ...(c.k || []).map(([k]) => k)].filter(w => w && w.length >= 2);
    const sents = (c.a || '').split(/(?<=[.。])\s+/);
    for (const w of shuffle(words)) {
      const s = sents.find(x => x.includes(w) && x.length <= 140);
      if (s) return { prompt: s.split(w).join('＿＿'), answer: w };
    }
    return null;
  }

  // ── 지리 ──
  function geoCandidates(D, todayIdx) {
    const all = D.days, out = [];
    const names = all.map(c => c.t), defs = all.map(c => c.m).filter(Boolean), terms = all.flatMap(c => (c.k || []).map(([k]) => k));
    for (const i of poolIdx(D, todayIdx)) {
      const c = all[i], same = all.filter(x => x !== c && x.c === c.c);
      const sameNames = same.map(x => x.t), sameDefs = same.map(x => x.m).filter(Boolean), sameTerms = same.flatMap(x => (x.k || []).map(([k]) => k));
      const en = c.en ? [c.en.replace(/\(.*$/, '').trim()] : [];
      if (c.m) out.push(typed(`geo:${i}:def2name`, '이 정의에 해당하는 개념을 쓰세요', c.m, c.t, { alt: en, day: i + 1 }));
      (c.k || []).forEach(([k, d], j) => out.push(typed(`geo:${i}:term${j}`, '이 설명에 해당하는 용어를 쓰세요', d, k, { day: i + 1 })));
      const cz = cloze(c); if (cz) out.push(typed(`geo:${i}:cloze`, '빈칸에 들어갈 말을 쓰세요', cz.prompt, cz.answer, { day: i + 1 }));
      if (c.m) out.push(mcq(`geo:${i}:mdef`, '이 정의에 해당하는 개념은?', c.m, c.t, sameNames, names, { day: i + 1 }));
      if (c.en) out.push(mcq(`geo:${i}:men`, '이 영문 표기에 해당하는 개념은?', c.en, c.t, sameNames, names, { day: i + 1, lang: 'en' }));
      if (c.m) out.push(mcq(`geo:${i}:mname`, '이 개념의 정의는?', c.t, c.m, sameDefs, defs, { day: i + 1 }));
      (c.k || []).forEach(([k, d], j) => out.push(mcq(`geo:${i}:mterm${j}`, '이 설명에 해당하는 용어는?', d, k, sameTerms, terms, { day: i + 1 })));
    }
    return out.filter(Boolean);
  }
  function geo(D, todayIdx, opt = {}, count = 5) {
    const t = todayIdx % D.days.length, now = opt.now || Date.now();
    return select(geoCandidates(D, todayIdx), count, TYPED_PER_TEST, q => q.day === t + 1, opt.log || {}, now);
  }

  // ── 일본어 ──
  const isSmall = ch => 'ゃゅょぁぃぅぇぉャュョァィゥェォ'.includes(ch);
  function splitKana(row) { const out = []; for (const ch of row) { if (isSmall(ch) && out.length) out[out.length - 1] += ch; else out.push(ch); } return out; }
  const kanaRead = (k, k2h) => k === 'っ' || k === 'ッ' ? 'ㅅ 받침' : k === 'ー' ? '길게' : k === 'ん' || k === 'ン' ? 'ㄴ 받침' : k2h(k, { noInitial: true });
  const wordsOf = c => [...(c.v || []).map(([w, r, k]) => [w, k, r]), ...(c.w || []).map(([w, k]) => [w, k, ''])];

  function jp(D, todayIdx, opt = {}, count = 5) {
    const all = D.days, t = todayIdx % all.length, today = all[t], now = opt.now || Date.now(), log = opt.log || {};
    if (today.type === 'kana') return kana(D, todayIdx, opt, count);
    const allWords = all.filter(c => c.type !== 'kana').flatMap(wordsOf), allW = allWords.map(x => x[0]), allK = allWords.map(x => x[1]);
    const cands = [];
    for (const i of poolIdx(D, todayIdx).filter(i => all[i].type !== 'kana')) {
      const ws = wordsOf(all[i]), nearW = ws.map(x => x[0]), nearK = ws.map(x => x[1]);
      ws.forEach(([w, k, r], j) => {
        cands.push(typed(`jp:${i}:k2w${j}`, '이 뜻을 일본어로 쓰세요', k, w, { alt: r ? [r] : [], day: i + 1, lang: 'ja' }));
        cands.push(mcq(`jp:${i}:w2k${j}`, '이 단어의 뜻은?', w, k, nearK, allK, { day: i + 1, lang: 'ja' }));
        cands.push(mcq(`jp:${i}:mk2w${j}`, '이 뜻에 해당하는 단어는?', k, w, nearW, allW, { day: i + 1, optLang: 'ja' }));
      });
    }
    const qs = select(cands.filter(Boolean), count - 1, TYPED_PER_TEST - 1, q => q.day === t + 1, log, now);
    if (today.s) qs.push(typed(`jp:${t}:s`, '오늘 문장을 일본어로 그대로 입력', today.s, today.s, { hint: opt.kanaToHangul ? opt.kanaToHangul(today.s) : '', day: t + 1, lang: 'ja' }));
    return qs;
  }
  function kana(D, todayIdx, opt, count) {
    const all = D.days, t = todayIdx % all.length, read = k => kanaRead(k, opt.kanaToHangul), now = opt.now || Date.now(), log = opt.log || {};
    const readable = k => !/[぀-ヿ]/.test(read(k));
    const todayK = uniq(all[t].rows.flatMap(splitKana)).filter(readable);
    const poolK = uniq(poolIdx(D, todayIdx).filter(i => all[i].type === 'kana').flatMap(i => all[i].rows.flatMap(splitKana))).filter(readable);
    const readings = uniq(all.filter(c => c.type === 'kana').flatMap(c => c.rows.flatMap(splitKana)).filter(readable).map(read));
    const rowOf = k => (all[t].rows.find(r => splitKana(r).includes(k)) || '');
    const cands = [];
    for (const k of poolK) {
      const near = uniq(splitKana(rowOf(k)).concat(todayK).map(read));
      cands.push(typed(`kana:${k}:t`, '이 글자의 읽기를 한글로 쓰세요', k, read(k), { big: true, lang: 'ja', day: todayK.includes(k) ? t + 1 : undefined }));
      cands.push(mcq(`kana:${k}:m`, '이 글자의 읽기는?', k, read(k), near, readings, { big: true, lang: 'ja', day: todayK.includes(k) ? t + 1 : undefined }));
    }
    return select(cands.filter(Boolean), count, TYPED_PER_TEST, q => todayK.includes(q.prompt), log, now);
  }

  // ── 이력 갱신: answered = [{id, ok}] → log에 반영한 새 항목들(저장용) ──
  function applyLog(log, answered, now = Date.now()) {
    const patch = {};
    for (const { id, ok } of answered) {
      const e = { ...(log[id] || { right: 0, wrong: 0, streak: 0 }) };
      e.last = now; if (ok) { e.right++; e.streak = (e.streak || 0) + 1; } else { e.wrong++; e.streak = 0; }
      log[id] = e; patch[id] = e;
    }
    return patch;
  }
  const keyOK = id => id.replace(/[.#$\[\]\/]/g, '_');   // Firebase 키에 못 쓰는 글자

  // ── 화면 ──
  const CSS = `
.sq-head{display:flex;align-items:baseline;gap:10px;font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--st-accent-ink);margin-bottom:10px}
.sq-prog{font-feature-settings:'tnum' 1;color:var(--st-label-3)}.sq-day{margin-left:auto;color:var(--st-label-3);font-weight:600;letter-spacing:.04em;white-space:nowrap}
.sq-prompt{font-size:19px;font-weight:700;line-height:1.5;letter-spacing:-.01em;color:var(--st-label);word-break:keep-all;margin-bottom:14px}
.sq-prompt.big{font-size:56px;line-height:1.2;text-align:center;padding:10px 0 6px}
.sq-hint{font-size:14px;color:var(--st-label-3);margin:-8px 0 12px}
.sq-opts{display:grid;gap:8px}@media(min-width:640px){.sq-opts{grid-template-columns:1fr 1fr}}
.sq-opts button{display:flex;align-items:center;gap:10px;text-align:left;min-height:48px;padding:10px 14px;background:var(--st-fill-2);border:1px solid transparent;border-radius:var(--st-r-element);font:inherit;font-size:15px;line-height:1.4;color:var(--st-label);cursor:pointer;transition:background 150ms,border-color 150ms}
.sq-opts button i{font-style:normal;font-size:12px;font-weight:700;color:var(--st-label-3);min-width:14px}
.sq-opts button:hover{background:var(--st-fill)}
.sq-opts button.ok{background:var(--st-success-soft);border-color:var(--st-success-ink);color:var(--st-success-ink)}
.sq-opts button.ng{background:var(--st-danger-soft);border-color:var(--st-danger-ink);color:var(--st-danger-ink)}
.sq-typed{display:flex;gap:8px}.sq-typed input{flex:1;min-width:0;height:44px;padding:0 14px;background:var(--st-fill-2);border:1px solid transparent;border-radius:var(--st-r-element);font:inherit;font-size:16px;color:var(--st-label);outline:none}
.sq-typed input:focus{background:var(--st-surface);border-color:var(--st-accent);box-shadow:var(--st-ring)}
.sq-check{height:44px;padding:0 18px;border:0;border-radius:var(--st-r-full);background:var(--st-accent-solid);color:#fff;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}.sq-check:disabled{opacity:.5;cursor:not-allowed}
.sq-msg{margin-top:8px;font-size:13px;font-weight:600;min-height:18px}.sq-msg.ok{color:var(--st-success-ink)}.sq-msg.ng{color:var(--st-danger-ink)}`;
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('study-quiz-css')) return;
    const s = document.createElement('style'); s.id = 'study-quiz-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  // el 안에 문제를 하나씩. opt.onFinish(score, total, wrong, answered[{id, ok}]). 주관식 채점은 grade()
  function mount(el, questions, opt = {}) {
    ensureCss();
    const st = { i: 0, ok: 0, wrong: [], answered: [], busy: false }, total = questions.length;
    const head = q => `<div class="sq-head"><span class="sq-prog">${st.i + 1} / ${total}</span><span>${esc(q.label)}</span>${q.day ? `<span class="sq-day">Day ${q.day}</span>` : ''}</div>`;
    function render() {
      const q = questions[st.i];
      if (!q) { el.innerHTML = ''; opt.onFinish && opt.onFinish(st.ok, total, st.wrong, st.answered); return; }
      if (q.type === 'mcq') {
        el.innerHTML = head(q) + `<div class="sq-prompt${q.big ? ' big' : ''}"${q.lang ? ` lang="${q.lang}"` : ''}>${esc(q.prompt)}</div><div class="sq-opts">` +
          q.options.map((o, i) => `<button type="button" data-a="${esc(o)}"${q.optLang ? ` lang="${q.optLang}"` : ''}><i>${i + 1}</i>${esc(o)}</button>`).join('') + `</div>`;
      } else {
        el.innerHTML = head(q) + `<div class="sq-prompt${q.big ? ' big' : ''}"${q.lang ? ` lang="${q.lang}"` : ''}>${esc(q.prompt)}</div>${q.hint ? `<div class="sq-hint">${esc(q.hint)}</div>` : ''}` +
          `<div class="sq-typed"><input type="text"${q.lang === 'ja' && !q.big ? ' lang="ja"' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="답을 입력"><button type="button" class="sq-check" disabled>확인</button></div><div class="sq-msg"></div>`;
        const inp = el.querySelector('input'), btn = el.querySelector('.sq-check'), msg = el.querySelector('.sq-msg');
        inp.addEventListener('input', () => { btn.disabled = !inp.value.trim(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
        btn.addEventListener('click', async () => {
          if (st.busy) return; st.busy = true; btn.disabled = true; inp.readOnly = true;
          const ok = opt.checkTyped ? await opt.checkTyped(inp.value, q.answer, q) : grade(q, inp.value);
          st.answered.push({ id: q.id, ok });
          if (ok) { st.ok++; msg.textContent = '정확합니다'; msg.className = 'sq-msg ok'; }
          else { st.wrong.push(q); msg.textContent = `다릅니다 — 정답: ${q.answer}`; msg.className = 'sq-msg ng'; }
          st.i++; setTimeout(render, ok ? 500 : 1800);
        });
        setTimeout(() => inp.focus(), 50);
      }
      st.busy = false;
    }
    function answer(a) {
      const q = questions[st.i]; if (!q || q.type !== 'mcq' || st.busy) return; st.busy = true;
      const right = a === q.answer;
      el.querySelectorAll('.sq-opts button').forEach(b => { if (b.dataset.a === q.answer) b.classList.add('ok'); else if (b.dataset.a === a) b.classList.add('ng'); });
      st.answered.push({ id: q.id, ok: right });
      if (right) st.ok++; else st.wrong.push(q);
      st.i++; setTimeout(render, right ? 400 : 1000);
    }
    const onClick = e => { const b = e.target.closest('.sq-opts button'); if (b) answer(b.dataset.a); };
    const onKey = e => {
      if (!/^[1-4]$/.test(e.key) || !el.isConnected || el.hidden) return;
      const t = e.target; if (t && t.closest && t.closest('input, textarea')) return;
      const b = el.querySelectorAll('.sq-opts button')[Number(e.key) - 1]; if (b) { e.preventDefault(); answer(b.dataset.a); }
    };
    el.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    render();
    return { destroy() { el.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); el.innerHTML = ''; } };
  }
  const pass = (score, total) => total > 0 && score >= Math.ceil(total * 0.8);
  root.StudyQuiz = { geo, jp, mount, pass, grade, norm, applyLog, keyOK, splitKana, geoCandidates, TYPED_PER_TEST, AVOID_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
