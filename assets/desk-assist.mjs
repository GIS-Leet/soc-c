// Desk 「답변 도우미」·노트 요약 — 비슷한 이전 질문·답, 관련 자료, Claude 로 답변 초안. Desk 앱 QAAssist·KnowledgeIndex·NoteSummary 와 같은 규칙.
// 자료 색인(비공개 자료함 + 홈페이지 공개 자료실의 HTML·PDF·MD 글자 조각)은 이 브라우저 IndexedDB 에만, Claude API 키는 이 기기 localStorage 에만 둔다.
import { openPdf } from './gichul-pdf.mjs?v=c8039730';

// ── 낱말 뽑기 — 조사·어미를 떼고 긴 합성어는 앞뒤 두 글자도 (앱 KnowledgeIndex.terms) ──
const SUFFIXES = '이라는 이라고 에서는 에서도 으로는 으로도 에게서 한테서 이지만 이어서 이에요 이예요 입니다 습니다 합니다 됩니다 있나요 인가요 하나요 했는데 하는데 인데요 는데요 잖아요 때문에 에서 에게 한테 으로 이랑 하고 이나 부터 까지 처럼 보다 마다 조차 밖에 이며 이고 이라 라는 라고 다는 다고 는데 은데 인데 나요 가요 까요 어요 아요 에요 예요 네요 지요 었던 했던 하는 되는 있는 없는 같은 이다 였다 했다 한다 된다 에도 에는 에만 와는 과는 인건 인지 은 는 이 가 을 를 에 의 와 과 도 만 로 랑 요 죠 다 고 며 서 지 나 게 면'.split(' ').sort((a, b) => b.length - a.length);
const STOP = new Set('질문 선생님 안녕하세요 감사합니다 혹시 궁금 제가 저는 이거 그거 이게 그게 무엇 뭐가 어떻게 그리고 그런데 근데 하지만 그래서 때문 경우 정도 관련 부분 내용 설명 이해 수업 시험 문제 답변 추가 차이 의미 이유 맞나 맞는 아닌 아니 않나 않는 있는 없는 있는데 없는데 하는 되는 같은 대한 대해 통해 위해 우리 여기 저기 이번 다음 지난 오늘 내일 거의 많이 제대로 범위 포함 프린트 페이지 아예 이런 저런 그런 앞에 뒤에 하셨 나와 나오 들은 어떻 있고 있나 있을 있어 없고 작은 조금씩 되는데 있어야 해서 하면 되면 뭔가 그리 너무 텐데 있으 건가 거죠 경우도 결국 아니면 몇몇'.split(' '));
const len = s => [...s].length;
export function stem(word) {
  let w = word;
  for (let i = 0; i < 2; i++) { const s = SUFFIXES.find(x => len(w) - len(x) >= 2 && w.endsWith(x)); if (!s) break; w = w.slice(0, w.length - s.length); }
  return w;
}
export function terms(s) {
  const out = new Set();
  const spaced = String(s || '').toLowerCase().replace(/([a-z0-9])(?=[가-힣])|([가-힣])(?=[a-z0-9])/g, '$1$2 ');
  for (const raw of spaced.replace(/[^가-힣a-z0-9 ]/g, ' ').split(' ').filter(Boolean)) {
    const w = stem(raw);
    if (len(w) < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w);
    if (len(w) >= 4 && /^[가-힣]+$/.test(w)) for (const p of [w.slice(0, 2), w.slice(-2)]) if (!STOP.has(p)) out.add(p);
  }
  return out;
}
const inter = (a, b) => [...a].filter(x => b.has(x));

/** 답이 달린 다른 질문 중 비슷한 것 — 드문 낱말에 무게(IDF), 두 낱말 이상 겹치고 겹침 몫 0.17 이상 (앱 QAAssist.related) */
export function related(q, all, limit = 3) {
  const T = all.map(o => terms(`${o.title || ''} ${o.text || ''}`)), n = all.length, df = {};
  for (const t of T) for (const w of t) df[w] = (df[w] || 0) + 1;
  const idf = w => Math.log(1 + n / (df[w] || 1));
  const qt = terms(`${q.title || ''} ${q.text || ''}`), total = [...qt].reduce((s, w) => s + idf(w), 0);
  if (!total) return [];
  return all.map((o, i) => {
    if (o.id === q.id) return null;
    const ans = Object.values(o.replies || {}).find(r => r.isTeacher && r.text)?.text; if (!ans) return null;
    const hit = inter(qt, T[i]).filter(w => n < 50 || (df[w] || 0) / n < 0.2);
    if (hit.length < 2) return null;
    const s = hit.reduce((a, w) => a + idf(w), 0) / total;
    return s >= 0.17 ? { q: o, answer: ans, score: Math.min(1, s) } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);
}
/** 질문 낱말이 이름에 들어 있는 자료 */
export function materialsFor(q, files, limit = 3) {
  const keys = [...terms(`${q.title || ''} ${q.text || ''}`)];
  return files.map(f => { const nm = f.name.toLowerCase(); const sc = keys.filter(k => nm.includes(k)).reduce((a, k) => a + (len(k) >= 3 ? 2 : 1), 0); return [f, sc]; })
    .filter(([, sc]) => sc >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

// ── 글자 조각 ──
export function htmlText(html) {
  let s = String(html).replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  for (const [a, b] of [['&nbsp;', ' '], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&#39;', "'"]]) s = s.split(a).join(b);
  return tidy(s);
}
export const tidy = s => String(s).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
export function chunks(text, key, sha, source, size = 500) {
  const out = []; let cur = '';
  const flush = () => { const t = cur.trim(); if (len(t) >= 40) out.push({ key, sha, source, text: t }); cur = ''; };
  for (let line of tidy(text).split('\n').filter(Boolean)) {
    while (line.length > size) { cur += (cur ? '\n' : '') + line.slice(0, size); flush(); line = line.slice(size); }
    if (cur.length + line.length > size) flush();
    cur += (cur ? '\n' : '') + line;
  }
  flush(); return out;
}
/** 질문과 맞는 조각 — 두 낱말 이상·점수 7 이상(또는 질문에 두 번 넘게 나온 드문 낱말 하나), 1등의 80% 미만은 버림, 한 자료에서 2개까지 (앱 KnowledgeIndex.pick) */
export function pick(question, list, limit = 3, minScore = 7) {
  const q = terms(question); if (!q.size || !list.length) return [];
  const T = list.map(c => terms(c.text)), n = list.length, df = {};
  for (const t of T) for (const w of t) df[w] = (df[w] || 0) + 1;
  const ql = String(question).toLowerCase(), scored = [];
  list.forEach((c, i) => {
    const hit = inter(q, T[i]).filter(w => n < 50 || df[w] / n < 0.15); if (!hit.length) return;
    const s = hit.reduce((a, w) => a + Math.log(1 + n / df[w]), 0);
    const single = hit.length === 1 && len(hit[0]) >= 3 && s >= 4.5 && ql.split(hit[0]).length - 1 >= 2;
    if ((hit.length >= 2 && s >= minScore) || single) scored.push([c, s]);
  });
  scored.sort((a, b) => b[1] - a[1]);
  const top = scored[0]?.[1]; if (top == null) return [];
  const out = [], per = {};
  for (const [c, s] of scored) { if (out.length >= limit || s < top * 0.8) break; if ((per[c.key] || 0) < 2) { per[c.key] = (per[c.key] || 0) + 1; out.push(c); } }
  return out;
}
export const INSTRUCTIONS = '당신은 고등학교 지리·통합사회 교사입니다. 학생의 질문에 한국어 존댓말로 답합니다. 순서: ① 핵심 개념을 한 문장으로 정의 ② 왜 그런지 이유 ③ 예 하나 ④ 필요하면 \'수업 시간에 더 다루겠다\'는 한 줄. 모두 합쳐 3~5문장. 함께 주어진 수업 자료와 이전 답변에 있는 내용을 우선 쓰고, 자료에 없는 사실은 지어내지 않습니다. 이전 답변이 있으면 그 말투와 수준을 따릅니다. 인사말·서명·머리글 없이 본문만 씁니다.';
export const SUMMARY_INSTRUCTIONS = '당신은 고등학교 지리 교사의 메모를 정리하는 비서입니다. 주어진 노트를 한국어로 3~5개의 짧은 항목으로 요약합니다. 각 항목은 「- 」로 시작하고 한 줄입니다. 노트에 없는 내용은 넣지 않습니다. 제목·인사말·설명 없이 항목만 씁니다.';
export function draftPrompt(q, rel, ctx) {
  const ref = rel.slice(0, 3).map(r => `이전 질문: ${r.q.title || String(r.q.text || '').slice(0, 80)}\n이전 답변: ${r.answer}`).join('\n\n');
  const mat = ctx.map(c => `[${c.source}]\n${c.text}`).join('\n\n');
  return `학생 질문 제목: ${q.title || ''}\n학생 질문: ${q.text || ''}` + (mat ? `\n\n참고할 수업 자료:\n${mat}` : '') + (ref ? `\n\n참고할 이전 답변:\n${ref}` : '');
}
/** 노트 맨 위 「## 요약」 블록 넣기·바꾸기 (앱 NoteSummary.insert) */
export function insertSummary(summary, md) {
  const H = '## 요약', block = `${H}\n${summary.trim()}\n\n`, lines = String(md || '').split('\n'), h = lines.indexOf(H);
  if (h >= 0) {
    let end = h + 1;
    while (end < lines.length && lines[end].trim() && !lines[end].startsWith('#')) end++;
    while (end < lines.length && !lines[end].trim()) end++;
    lines.splice(h, end - h);
  }
  return block + lines.join('\n');
}

// ── Claude (공식 SDK — 필요할 때만 불러옴) ──
const MODEL = 'claude-opus-5-5', KEY_LS = 'desk-claude-key';
export const claudeKey = { get() { try { return localStorage.getItem(KEY_LS) || ''; } catch { return ''; } }, set(v) { try { v ? localStorage.setItem(KEY_LS, v.trim()) : localStorage.removeItem(KEY_LS); } catch {} } };
let sdk = null;
async function askClaude(system, prompt, effort = 'medium') {
  const key = claudeKey.get(); if (!key) throw new Error('Claude API 키가 없습니다. 「도우미 설정」에서 넣어 주세요.');
  sdk ??= (await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm')).default;
  const Anthropic = sdk, client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  try {
    // 정책상 거절되면 같은 호출 안에서 다른 모델이 이어 답하도록 서버 쪽 fallbacks 를 켬
    const r = await client.beta.messages.create({ model: MODEL, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort }, system, messages: [{ role: 'user', content: prompt }] });
    if (r.stop_reason === 'refusal') throw new Error('Claude 가 이 요청에 답하지 않았습니다' + (r.stop_details?.explanation ? ` (${r.stop_details.explanation})` : '') + '.');
    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) throw new Error('Claude 가 빈 답을 주었습니다.');
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API 키가 올바르지 않습니다. 「도우미 설정」에서 다시 넣어 주세요.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('이 API 키로는 쓸 수 없습니다(권한).');
    if (e instanceof Anthropic.RateLimitError) throw new Error('요청이 많아 잠시 막혔습니다. 조금 뒤 다시 시도하세요.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Claude 에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude 응답 오류 ${e.status ?? ''}: ${String(e.message).slice(0, 200)}`);
    throw e;
  }
}

// ── 자료 색인(IndexedDB) ──
const DB_NAME = 'desk-knowledge', STORE = 'files', INDEXABLE = /\.(html?|pdf|md|txt)$/i, MAX_BYTES = 20 * 1024 * 1024;
function idb() {
  return new Promise((ok, no) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
}
async function idbAll() { const db = await idb(); return new Promise((ok, no) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => no(r.error); }); }
async function idbPut(rows, dels = []) { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE); rows.forEach(x => st.put(x)); dels.forEach(k => st.delete(k)); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); }
async function idbClear() { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); }
async function pdfText(bytes) {
  const pdf = await openPdf(bytes); let out = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 120); i++) { const tc = await (await pdf.getPage(i)).getTextContent(); out += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n'; }
  pdf.destroy?.(); return out;
}

const CSS = `
.as-box { margin: 14px 0 6px; padding: 12px 14px; border-radius: var(--st-r-element, 10px); background: var(--st-fill-3, var(--st-fill-2)); }
.as-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.as-head .dash-h { margin: 0; flex: 1; }
.as-head .btn-sub, .as-head .btn-solid { height: 30px; padding: 0 12px; font-size: 12.5px; }
.as-body { margin-top: 10px; }
.as-body[hidden] { display: none; }
.as-cap { font-size: 12px; font-weight: 650; color: var(--st-label-3); margin: 10px 0 4px; }
.as-rel { padding: 8px 0; font-size: 13.5px; line-height: 1.55; }
.as-rel .q { font-weight: 650; color: var(--st-label); }
.as-rel .a { color: var(--st-label-2); white-space: pre-wrap; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.as-rel .m { font-size: 11.5px; color: var(--st-label-3); }
.as-rel button, .as-mat button { border: 0; background: none; padding: 0; margin-left: 6px; font: inherit; font-size: 12px; font-weight: 600; color: var(--st-accent-ink); cursor: pointer; }
.as-mat { font-size: 13.5px; padding: 3px 0; color: var(--st-label); }
.as-none { font-size: 13px; color: var(--st-label-3); }
.as-status { font-size: 12.5px; color: var(--st-label-3); margin-top: 8px; line-height: 1.55; }
.as-status.err { color: var(--st-danger-ink); }
.as-modal { position: fixed; inset: 0; z-index: 210; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,0.32); }
.as-modal[hidden] { display: none; }
.as-modal .panel { width: 100%; max-width: 460px; padding: 22px !important; display: flex; flex-direction: column; gap: 10px; background: var(--st-surface); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 18px 50px rgba(0,0,0,0.22); }
.as-modal h3 { margin: 0 0 2px; font-size: 17px; font-weight: 700; }
.as-modal p { margin: 0; font-size: 12.5px; color: var(--st-label-2); line-height: 1.6; }
.as-modal input { height: 38px; padding: 0 12px; background: var(--st-fill-2); color: var(--st-label); border: 1px solid transparent; border-radius: var(--st-r-element, 10px); font: inherit; font-size: 14px; outline: none; }
.as-modal input:focus { background: var(--st-surface); border-color: var(--accent); }
.as-modal .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.as-modal .row .btn-sub, .as-modal .row .btn-solid { height: 34px; padding: 0 14px; }
.as-modal .sep { height: 1px; background: var(--st-separator); margin: 6px 0; }
`;

export function mountAssist(ctx) {
  if (!document.getElementById('as-style')) { const st = document.createElement('style'); st.id = 'as-style'; st.textContent = CSS; document.head.appendChild(st); }
  const esc = ctx.escapeHTML;
  let index = null, building = false, lastSources = [];

  // ── 설정 시트(API 키·자료 색인) ──
  const modal = document.createElement('div');
  modal.className = 'as-modal'; modal.hidden = true;
  modal.innerHTML = `<div class="panel" role="dialog" aria-label="도우미 설정">
    <h3>도우미 설정</h3>
    <p>답변 초안과 노트 요약은 Claude(Anthropic)가 씁니다. API 키는 <b>이 기기 브라우저에만</b> 저장되고 Firebase 에 올라가지 않습니다. 키는 console.anthropic.com 에서 만듭니다.</p>
    <input type="password" id="asKey" placeholder="sk-ant-…" autocomplete="off">
    <div class="row"><button class="btn-solid" data-a="save">저장</button><button class="btn-sub" data-a="forget">키 지우기</button><span class="as-none" id="asKeyState"></span></div>
    <div class="sep"></div>
    <h3 style="font-size:15px">자료 색인</h3>
    <p>비공개 자료함과 홈페이지 공개 자료실의 HTML·PDF·MD 에서 글자만 뽑아 이 브라우저에 둡니다. 초안을 쓸 때 질문과 맞는 조각을 함께 넘깁니다. 바뀐 파일만 다시 읽습니다.</p>
    <div class="row"><button class="btn-sub" data-a="build">색인 만들기·갱신</button><button class="btn-sub" data-a="clear">색인 지우기</button></div>
    <div class="as-status" id="asIdx"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn-sub" data-a="close">닫기</button></div>
  </div>`;
  document.body.appendChild(modal);
  const $m = id => modal.querySelector('#' + id);
  async function paintSettings() {
    const k = claudeKey.get();
    $m('asKeyState').textContent = k ? `저장됨 (…${k.slice(-4)})` : '키 없음 — 초안·요약을 쓸 수 없습니다';
    try { const all = await idbAll(); index = all; const files = all.filter(x => !x.key.startsWith('note:')).length, n = all.reduce((a, x) => a + x.chunks.length, 0); if (!building) $m('asIdx').textContent = files ? `자료 ${files}개 · 조각 ${n.toLocaleString()}개` : '아직 색인이 없습니다.'; }
    catch { $m('asIdx').textContent = '이 브라우저에서 색인을 쓸 수 없습니다.'; }
  }
  const openSettings = () => { modal.hidden = false; $m('asKey').value = ''; paintSettings(); };
  modal.addEventListener('click', async e => {
    if (e.target === modal) { modal.hidden = true; return; }
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'close') modal.hidden = true;
    if (a === 'save') { const v = $m('asKey').value.trim(); if (v) { claudeKey.set(v); $m('asKey').value = ''; } paintSettings(); }
    if (a === 'forget') { claudeKey.set(''); paintSettings(); }
    if (a === 'clear') { await idbClear().catch(() => {}); index = []; paintSettings(); }
    if (a === 'build') buildIndex();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });

  async function buildIndex() {
    if (building) return; building = true;
    const st = $m('asIdx'); st.classList.remove('err');
    const say = t => { st.textContent = t; };
    try {
      say('자료 목록을 받는 중…');
      const list = [];
      const gh = await ctx.github();
      if (gh?.token) {
        const r = await fetch(`https://api.github.com/repos/${gh.repo}/git/trees/HEAD?recursive=1`, { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github+json' } });
        if (r.ok) for (const t of (await r.json()).tree || []) if (t.type === 'blob' && INDEXABLE.test(t.path) && !t.path.startsWith('기출/'))
          list.push({ key: 'priv:' + t.path, sha: t.sha, source: t.path.split('/').pop(), url: `https://api.github.com/repos/${gh.repo}/contents/${t.path.split('/').map(encodeURIComponent).join('/')}`, auth: gh.token });
      }
      try {
        const pub = await (await fetch(new URL('materials-index.json', import.meta.url))).json();
        for (const it of pub.items || []) if (it.type !== 'dir' && INDEXABLE.test(it.path))
          list.push({ key: 'pub:' + it.path, sha: 'size:' + (it.size ?? ''), source: it.name, url: `https://raw.githubusercontent.com/${pub.source}/${pub.sourceSha || 'HEAD'}/${it.path.split('/').map(encodeURIComponent).join('/')}` });
      } catch {}
      const have = new Map((await idbAll()).map(x => [x.key, x]));
      const want = new Set(list.map(x => x.key));
      const todo = list.filter(x => have.get(x.key)?.sha !== x.sha);
      let done = 0, fails = 0;
      for (const f of todo) {
        say(`읽는 중 ${++done}/${todo.length} — ${f.source}`);
        try {
          const r = await fetch(f.url, f.auth ? { headers: { Authorization: 'Bearer ' + f.auth, Accept: 'application/vnd.github.raw' } } : {});
          if (!r.ok) throw new Error(r.status);
          const ext = f.key.split('.').pop().toLowerCase();
          const text = ext === 'pdf' ? await pdfText(new Uint8Array(await r.arrayBuffer())) : ext.startsWith('htm') ? htmlText(await r.text()) : await r.text();
          await idbPut([{ key: f.key, sha: f.sha, source: f.source, at: Date.now(), chunks: chunks(text, f.key, f.sha, f.source).map(c => c.text) }]);
        } catch { fails++; }
      }
      // 없어진 파일은 지우고, 상한(20MB)을 넘으면 오래 읽은 것부터 버림
      let all = await idbAll(); const gone = all.filter(x => !want.has(x.key)).map(x => x.key);
      all = all.filter(x => want.has(x.key)).sort((a, b) => a.at - b.at);
      let bytes = all.reduce((a, x) => a + x.chunks.join('').length * 2, 0); const trim = [];
      while (bytes > MAX_BYTES && all.length) { const x = all.shift(); trim.push(x.key); bytes -= x.chunks.join('').length * 2; }
      await idbPut([], [...gone, ...trim]);
      index = await idbAll();
      say(`완료 — 새로 읽은 자료 ${todo.length - fails}개${fails ? ` · 실패 ${fails}개` : ''} · 전체 ${index.length}개 · 조각 ${index.reduce((a, x) => a + x.chunks.length, 0).toLocaleString()}개`);
    } catch (e) { st.classList.add('err'); say('색인을 만들지 못했습니다: ' + (e.message || e)); }
    finally { building = false; }
  }
  async function contextFor(q) {
    if (!index) { try { index = await idbAll(); } catch { index = []; } }
    const list = index.flatMap(x => x.chunks.map(t => ({ key: x.key, source: x.source, text: t })));
    for (const [id, n] of Object.entries(ctx.notes() || {})) {
      const md = n?.md || n?.content || ''; if (!md) continue;
      list.push(...chunks(md, 'note:' + id, '', `노트 「${n.title || md.slice(0, 20)}」`));
    }
    let total = 0;
    return pick(`${q.title || ''} ${q.text || ''}`, list, 3).filter(c => (total += c.text.length) <= 1500);
  }

  // ── Q&A 답변 도우미 상자 ──
  function mountQa(box, qa) {
    box.className = 'as-box';
    box.innerHTML = `<div class="as-head"><span class="dash-h">답변 도우미</span><button class="btn-sub" data-a="toggle">펼치기</button><button class="btn-solid" data-a="draft">초안 쓰기</button><button class="btn-sub" data-a="settings" title="Claude API 키·자료 색인">설정</button></div>
      <div class="as-body" hidden></div><div class="as-status" hidden></div>`;
    const body = box.querySelector('.as-body'), status = box.querySelector('.as-status');
    let openFor = null, rel = [];
    const say = (t, err) => { status.hidden = !t; status.textContent = t || ''; status.classList.toggle('err', !!err); };
    async function renderBody() {
      const q = qa.current(); if (!q) return;
      rel = related(q, qa.all());
      const files = await ctx.files().catch(() => []);
      const mats = materialsFor(q, files);
      body.innerHTML = `<div class="as-cap">비슷한 이전 질문</div>` + (rel.length ? rel.map((r, i) =>
        `<div class="as-rel"><div class="q">${esc(r.q.title || String(r.q.text || '').slice(0, 60))} <span class="m">${Math.round(r.score * 100)}%</span><button data-use="${i}">답 가져오기</button></div><div class="a">${esc(r.answer)}</div></div>`).join('')
        : '<div class="as-none">답이 달린 비슷한 질문이 없습니다.</div>') +
        `<div class="as-cap">관련 자료</div>` + (mats.length ? mats.map(f => `<div class="as-mat">${esc(f.name)}</div>`).join('') : '<div class="as-none">이름이 맞는 자료가 없습니다.</div>');
    }
    box.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'settings') return openSettings();
      if (a === 'toggle') { body.hidden = !body.hidden; b.textContent = body.hidden ? '펼치기' : '접기'; if (!body.hidden) { openFor = qa.currentId(); renderBody(); } return; }
      if (b.dataset.use != null) { const r = rel[+b.dataset.use]; if (r) qa.insert(r.answer); return; }
      if (a === 'draft') {
        const q = qa.current(); if (!q) return;
        if (!claudeKey.get()) { say('Claude API 키가 없습니다. 「설정」에서 넣으면 초안을 씁니다.', true); return openSettings(); }
        const id = qa.currentId(); b.disabled = true; say('초안을 쓰는 중… (자료와 이전 답을 함께 봅니다)');
        try {
          const ctxChunks = await contextFor(q);
          lastSources = [...new Set(ctxChunks.map(c => c.source))];
          const text = await askClaude(INSTRUCTIONS, draftPrompt(q, related(q, qa.all()), ctxChunks));
          if (qa.currentId() !== id) return say('');   // 그사이 다른 질문으로 옮겼으면 넣지 않음
          qa.insert(text);
          say(lastSources.length ? `초안을 넣었습니다 — 참고: ${lastSources.join(', ')}. 고친 뒤 등록하세요.` : '초안을 넣었습니다 — 맞는 자료 조각은 없었습니다. 고친 뒤 등록하세요.');
        } catch (err) { say(err.message || String(err), true); }
        finally { b.disabled = false; }
      }
    });
    return {
      // 다른 질문을 열면 펼친 내용·상태를 새로
      update() { say(''); if (!body.hidden && openFor !== qa.currentId()) { openFor = qa.currentId(); renderBody(); } }
    };
  }

  // ── 노트 요약 ──
  async function summarizeNote(note) {
    const body = String(note.md || '').trim();
    if ([...body].length < 40) throw new Error('요약하기에 노트가 너무 짧습니다.');
    if (!claudeKey.get()) { openSettings(); throw new Error('Claude API 키가 없습니다. 설정에서 넣어 주세요.'); }
    const s = await askClaude(SUMMARY_INSTRUCTIONS, (note.title ? `제목: ${note.title}\n` : '') + '노트:\n' + body.slice(0, 6000), 'low');
    return insertSummary(s, note.md);
  }
  return { mountQa, summarizeNote, openSettings };
}
