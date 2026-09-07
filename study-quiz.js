// 공부 → 시험: 1일차부터 오늘까지의 카드에서 랜덤 문제를 만들고 화면에 띄운다. study.html과 Mac 창(daily_study)이 함께 씀.
(function (root) {
  'use strict';
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = a => [...new Set(a)];
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 정답을 뺀 후보에서 오답 3개. 3개가 안 나오면 문제를 만들지 않는다
  function mcq(label, prompt, answer, cands, extra = {}) {
    const wrong = shuffle(uniq(cands.filter(x => x && x !== answer))).slice(0, 3);
    if (wrong.length < 3) return null;
    return Object.assign({ type: 'mcq', label, prompt, answer, options: shuffle([answer, ...wrong]) }, extra);
  }
  // 오늘까지의 카드 인덱스 (회차가 2 이상이면 전체)
  function poolIdx(D, todayIdx) { const n = D.days.length; return (todayIdx >= n ? D.days : D.days.slice(0, todayIdx + 1)).map((_, i) => i); }
  // 오늘 카드 minToday개 + 나머지는 풀에서 랜덤 → 카드 인덱스 목록
  function chooseCards(pool, t, count, minToday) {
    const others = pool.filter(i => i !== t), out = [];
    for (let k = 0; k < Math.min(minToday, count); k++) out.push(t);
    while (out.length < count) out.push(others.length ? rand(others) : t);
    return shuffle(out);
  }

  // ── 지리: 정의→개념 · 영문→개념 · 용어 설명→용어 · 개념→정의 ──
  function geo(D, todayIdx, count = 5) {
    const all = D.days, n = all.length, t = todayIdx % n;
    const names = all.map(c => c.t), defs = all.map(c => c.m).filter(Boolean), terms = all.flatMap(c => (c.k || []).map(([k]) => k));
    const makers = [
      c => c.m && mcq('이 정의에 해당하는 개념은?', c.m, c.t, names),
      c => c.en && mcq('이 영문 표기에 해당하는 개념은?', c.en, c.t, names, { lang: 'en' }),
      c => c.m && mcq('이 개념의 정의는?', c.t, c.m, defs),
      ...[0, 1, 2].map(j => c => { const ks = c.k || []; if (!ks[j]) return null; const [k, d] = ks[j]; return mcq('이 설명에 해당하는 용어는?', d, k, terms); }),
    ];
    const qs = [], seen = new Set();
    for (const i of chooseCards(poolIdx(D, todayIdx), t, count, 2)) {
      const c = all[i];
      for (const mk of shuffle(makers)) {           // 같은 카드가 또 뽑혀도(1일차) 아직 안 낸 유형·용어로
        const q = mk(c); if (!q) continue;
        const key = q.prompt + '→' + q.answer; if (seen.has(key)) continue;
        seen.add(key); q.day = i + 1; qs.push(q); break;
      }
    }
    return qs;
  }

  // ── 일본어 ──
  const isSmall = ch => 'ゃゅょぁぃぅぇぉャュョァィゥェォ'.includes(ch);
  function splitKana(row) { const out = []; for (const ch of row) { if (isSmall(ch) && out.length) out[out.length - 1] += ch; else out.push(ch); } return out; }
  // desk 가나 퀴즈와 같은 읽기 규칙
  const kanaRead = (k, k2h) => k === 'っ' || k === 'ッ' ? 'ㅅ 받침' : k === 'ー' ? '길게' : k === 'ん' || k === 'ン' ? 'ㄴ 받침' : k2h(k, { noInitial: true });
  const wordsOf = c => [...(c.v || []).map(([w, , k]) => [w, k]), ...(c.w || [])];

  function jp(D, todayIdx, opt = {}, count = 5) {
    const all = D.days, n = all.length, t = todayIdx % n, today = all[t];
    if (today.type === 'kana') return kana(D, todayIdx, opt, count);
    const allWords = all.filter(c => c.type !== 'kana').flatMap(wordsOf);
    const allW = allWords.map(([w]) => w), allK = allWords.map(([, k]) => k);
    const pool = poolIdx(D, todayIdx).filter(i => all[i].type !== 'kana');
    const qs = [], usedW = new Set();
    for (const i of chooseCards(pool, t, count - 1, 2)) {           // 단어↔뜻 4문제, 단어는 중복 없이
      const pair = shuffle(wordsOf(all[i])).find(([w]) => !usedW.has(w)); if (!pair) continue;
      const [w, k] = pair; usedW.add(w);
      const q = Math.random() < 0.5 ? mcq('이 단어의 뜻은?', w, k, allK, { lang: 'ja' }) : mcq('이 뜻에 해당하는 단어는?', k, w, allW, { optLang: 'ja' });
      if (q) { q.day = i + 1; qs.push(q); }
    }
    if (today.s) qs.push({ type: 'typed', label: '오늘 문장을 일본어로 그대로 입력', prompt: today.s,   // 따라 쓰기 1문제
      hint: opt.kanaToHangul ? opt.kanaToHangul(today.s) : '', answer: today.s, day: t + 1 });
    return qs;
  }
  function kana(D, todayIdx, opt, count) {
    const all = D.days, n = all.length, t = todayIdx % n, read = k => kanaRead(k, opt.kanaToHangul);
    const readable = k => !/[\u3040-\u30ff]/.test(read(k));   // 읽기가 한글로 온전히 안 되는 글자(ふぇ 등)는 뺀다
    const todayK = uniq(all[t].rows.flatMap(splitKana)).filter(readable);
    const poolK = uniq(poolIdx(D, todayIdx).filter(i => all[i].type === 'kana').flatMap(i => all[i].rows.flatMap(splitKana))).filter(readable);
    const readings = uniq(all.filter(c => c.type === 'kana').flatMap(c => c.rows.flatMap(splitKana)).filter(readable).map(read));
    const picks = shuffle(todayK).slice(0, Math.min(3, count));      // 오늘 글자 최소 3
    const others = shuffle(poolK.filter(k => !todayK.includes(k)));
    const rest = shuffle(todayK.filter(k => !picks.includes(k)));
    while (picks.length < count) { const k = others.pop() ?? rest.pop(); if (k === undefined) break; picks.push(k); }
    return shuffle(picks).map(k => { const q = mcq('이 글자의 읽기는?', k, read(k), readings, { lang: 'ja', big: true }); if (q) q.day = t + 1; return q; }).filter(Boolean);
  }

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
  // el 안에 문제를 하나씩 띄운다. opt.checkTyped(typed, answer) → bool|Promise, opt.onFinish(score, total, wrong)
  function mount(el, questions, opt = {}) {
    ensureCss();
    const st = { i: 0, ok: 0, wrong: [], busy: false }, total = questions.length;
    function head(q) {
      return `<div class="sq-head"><span class="sq-prog">${st.i + 1} / ${total}</span><span>${esc(q.label)}</span>${q.day ? `<span class="sq-day">Day ${q.day}</span>` : ''}</div>`;
    }
    function render() {
      const q = questions[st.i];
      if (!q) { el.innerHTML = ''; opt.onFinish && opt.onFinish(st.ok, total, st.wrong); return; }
      if (q.type === 'mcq') {
        el.innerHTML = head(q) + `<div class="sq-prompt${q.big ? ' big' : ''}"${q.lang ? ` lang="${q.lang}"` : ''}>${esc(q.prompt)}</div><div class="sq-opts">` +
          q.options.map((o, i) => `<button type="button" data-a="${esc(o)}"${q.optLang ? ` lang="${q.optLang}"` : ''}><i>${i + 1}</i>${esc(o)}</button>`).join('') + `</div>`;
      } else {
        el.innerHTML = head(q) + `<div class="sq-prompt" lang="ja">${esc(q.prompt)}</div>${q.hint ? `<div class="sq-hint">${esc(q.hint)}</div>` : ''}` +
          `<div class="sq-typed"><input type="text" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="따라 쓰세요"><button type="button" class="sq-check" disabled>확인</button></div><div class="sq-msg"></div>`;
        const inp = el.querySelector('input'), btn = el.querySelector('.sq-check'), msg = el.querySelector('.sq-msg');
        inp.addEventListener('input', () => { btn.disabled = !inp.value.trim(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
        btn.addEventListener('click', async () => {
          if (st.busy) return; st.busy = true; btn.disabled = true;
          const ok = await opt.checkTyped(inp.value, q.answer);
          if (ok) { st.ok++; msg.textContent = '정확합니다'; msg.className = 'sq-msg ok'; }
          else { st.wrong.push(q); msg.textContent = `다릅니다 — 정답: ${q.answer}`; msg.className = 'sq-msg ng'; }
          st.i++; setTimeout(render, ok ? 500 : 1600);
        });
        setTimeout(() => inp.focus(), 50);
      }
      st.busy = false;
    }
    function answer(a) {
      const q = questions[st.i]; if (!q || q.type !== 'mcq' || st.busy) return; st.busy = true;
      const right = a === q.answer;
      el.querySelectorAll('.sq-opts button').forEach(b => { if (b.dataset.a === q.answer) b.classList.add('ok'); else if (b.dataset.a === a) b.classList.add('ng'); });
      if (right) st.ok++; else st.wrong.push(q);
      st.i++; setTimeout(render, right ? 400 : 1000);
    }
    const onClick = e => { const b = e.target.closest('.sq-opts button'); if (b) answer(b.dataset.a); };
    const onKey = e => {   // 1~4 키
      if (!/^[1-4]$/.test(e.key) || !el.isConnected || el.hidden) return;
      const t = e.target; if (t && t.closest && t.closest('input, textarea')) return;
      const b = el.querySelectorAll('.sq-opts button')[Number(e.key) - 1]; if (b) { e.preventDefault(); answer(b.dataset.a); }
    };
    el.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    render();
    return { destroy() { el.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); el.innerHTML = ''; } };
  }
  const pass = (score, total) => total > 0 && score >= Math.ceil(total * 0.8);   // 5문제면 4개
  root.StudyQuiz = { geo, jp, mount, pass, splitKana };
})(typeof window !== 'undefined' ? window : globalThis);
