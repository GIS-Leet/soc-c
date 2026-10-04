// 홈페이지 첫 화면 기간제 홍보 영상 — Desk 「홈페이지 홍보 영상」에서 정한 기간에만 ① 팝업(재생을 누르면 소리와 함께) 또는 ② 지구 대신 무음 배경으로 띄운다.
// 설정은 RTDB notices/_hero (누구나 읽기 · 교사만 쓰기 — 공지와 같은 경로라 규칙을 새로 게시하지 않아도 됨. text 가 없어 공지 목록·앱에는 안 나옴)
export const HERO_KEY = '_hero', DEFAULT_SRC = 'media/hero.mp4', DB = 'https://soc-c-qna-default-rtdb.firebaseio.com';
const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 저장된 값 → 쓸 수 있는 설정(없는 칸은 기본값, 이상한 값은 버림) */
export function normalize(c) {
  const o = c && typeof c === 'object' ? c : {};
  const dim = Number(o.dim);
  return { on: o.on === true, start: isDay(o.start) ? o.start : '', end: isDay(o.end) ? o.end : '',
    mode: o.mode === 'bg' ? 'bg' : 'popup',   // popup = 팝업(소리) · bg = 지구 대신 무음 배경
    title: typeof o.title === 'string' ? o.title.trim().slice(0, 60) : '',
    src: typeof o.src === 'string' && o.src.trim() ? o.src.trim() : DEFAULT_SRC,
    dim: Number.isFinite(dim) ? Math.min(0.85, Math.max(0, dim)) : 0.35, watch: o.watch === true,
    tone: o.tone === 'light' ? 'light' : 'dark' };   // 배경일 때 영상 색조 — 어두운 영상이면 검은 막 + 흰 글자, 밝은 영상이면 흰 막 + 검은 글자
}
/** off(꺼짐) · before(시작 전) · active(표시 중) · after(기간 지남) — 시작·끝 날짜 모두 그날 포함, 비우면 제한 없음 */
export function heroState(c, today = dayKey()) {
  const o = normalize(c);
  if (!o.on) return 'off';
  if (o.start && today < o.start) return 'before';
  if (o.end && today > o.end) return 'after';
  return 'active';
}
/** 영상 주소 — 사이트 안 경로나 https 주소만 */
export function safeSrc(src, base) {
  try { const u = new URL(src, base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}
/** 영상과 같은 이름의 .jpg — 재생 전 팝업에 보이는 장면 */
export const posterOf = url => url.replace(/\.[A-Za-z0-9]+(?=$|[?#])/, '.jpg');
/** 팝업을 자동으로 띄울지 — 「오늘 하루 보지 않기」(그날·그 영상)나 이번 방문에서 이미 닫았으면 띄우지 않음 */
export function popupWanted(src, { hideDay = '', closed = '', today = dayKey() } = {}) {
  return hideDay !== `${today}|${src}` && closed !== src;
}

const PLAY = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 1.2v9.6L10.6 6z"/></svg>';
const CSS = `
.hero-video { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity 900ms ease; background: rgb(var(--hero-tone, 0,0,0)); }
.hero-video video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hero-video::after { content: ''; position: absolute; inset: 0; background: rgba(var(--hero-tone, 0,0,0), var(--hero-dim, 0.35)); }
body.hero-on .hero-video { opacity: 1; }
body.hero-on .globe { opacity: 0; transition: opacity 900ms ease; }
.hero-watch { position: fixed; left: max(16px, env(safe-area-inset-left)); bottom: max(16px, env(safe-area-inset-bottom)); z-index: 40;
  display: none; align-items: center; gap: 8px; height: 38px; padding: 0 16px 0 13px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 650; color: var(--st-label, #111); background: var(--st-surface, #fff);
  border: 1px solid var(--st-separator, rgba(0,0,0,.12)); box-shadow: 0 4px 18px rgba(0,0,0,.12); }
.hero-watch svg { width: 12px; height: 12px; }
body.hero-on .hero-watch, .hero-watch.show { display: inline-flex; }
.hero-modal { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 4vmin; background: rgba(0,0,0,.82); }
.hero-modal[hidden] { display: none; }
.hero-modal video { max-width: 100%; max-height: 100%; width: min(1280px, 100%); border-radius: 10px; background: #000; }
.hero-modal button { position: absolute; top: 14px; right: 16px; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(255,255,255,.14); color: #fff; font-size: 18px; }
.hero-pop { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.56); }
.hero-pop[hidden] { display: none; }
.hero-pop-card { width: min(960px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden; border-radius: 16px;
  background: var(--st-surface, #fff); color: var(--st-label, #111); box-shadow: 0 24px 70px rgba(0,0,0,.34); }
.hp-head { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 18px; }
.hp-head b { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hp-x { width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer; font-size: 18px; line-height: 1; color: inherit; background: var(--st-fill-2, rgba(0,0,0,.06)); }
.hp-stage { position: relative; background: #000; aspect-ratio: 16 / 9; min-height: 0; }
.hp-stage video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
.hp-play { position: absolute; inset: 0; display: grid; place-items: center; border: 0; padding: 0; cursor: pointer; background: rgba(0,0,0,.18); }
.hp-play span { display: grid; place-items: center; width: 76px; height: 76px; border-radius: 50%; background: rgba(255,255,255,.94); color: #111; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
.hp-play svg { width: 26px; height: 26px; margin-left: 4px; }
.hp-play[hidden] { display: none; }
.hp-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px 12px 18px; font-size: 13px; }
.hp-foot button { border: 0; background: none; cursor: pointer; font: inherit; color: var(--st-label-2, #555); padding: 8px 4px; }
.hp-foot .hp-close { font-weight: 650; color: inherit; padding: 8px 16px; border-radius: 999px; background: var(--st-fill-2, rgba(0,0,0,.06)); }
@media (max-width: 600px) { .hero-pop { padding: 8px; } .hp-play span { width: 60px; height: 60px; } }
`;
const store = {
  get(s, k) { try { return s.getItem(k) || ''; } catch { return ''; } },
  set(s, k, v) { try { s.setItem(k, v); } catch {} }
};

/** 홈페이지에서 부름 — 기간 안이면 설정한 방식(팝업/배경)으로 영상을 띄운다 */
export async function mountHero({ preview = new URLSearchParams(location.search).get('hero') === 'preview' } = {}) {
  let cfg;
  try { const r = await fetch(`${DB}/notices/${HERO_KEY}.json`); if (!r.ok) return 'unavailable'; cfg = await r.json(); } catch { return 'unavailable'; }
  if (!cfg) return 'off';
  const state = preview ? 'active' : heroState(cfg);
  if (state !== 'active') return state;
  const o = normalize(cfg), src = safeSrc(o.src, document.baseURI);
  if (!src) return 'nosrc';
  if (!document.getElementById('hero-style')) { const st = document.createElement('style'); st.id = 'hero-style'; st.textContent = CSS; document.head.appendChild(st); }
  if (o.mode === 'popup') {
    // 재생을 누르기 전에는 파일을 받지 않으므로, 영상이 실제로 있는지 먼저 확인(없으면 빈 팝업을 띄우지 않음). 다른 사이트 주소라 확인이 안 되면 그대로 진행
    try { const r = await fetch(src, { method: 'HEAD' }); if (r.status === 404) return 'nofile'; } catch {}
    return popup(o, src, preview);
  }
  return background(o, src);
}

/** 팝업 — 영상은 재생을 눌러야 시작(소리 있는 자동 재생은 브라우저가 막고, 교실에서 갑자기 소리가 나면 안 되므로) */
function popup(o, src, preview) {
  const pop = document.createElement('div'); pop.className = 'hero-pop'; pop.hidden = true;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', o.title || '홍보 영상');
  pop.innerHTML = `<div class="hero-pop-card"><div class="hp-head"><b></b><button type="button" class="hp-x" aria-label="닫기">×</button></div>
    <div class="hp-stage"><video controls playsinline preload="none"></video><button type="button" class="hp-play" aria-label="재생"><span>${PLAY}</span></button></div>
    <div class="hp-foot"><button type="button" class="hp-today">오늘 하루 보지 않기</button><button type="button" class="hp-close">닫기</button></div></div>`;
  pop.querySelector('.hp-head b').textContent = o.title;
  const v = pop.querySelector('video'), play = pop.querySelector('.hp-play');
  v.poster = posterOf(src); v.src = src;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'hero-watch show';
  btn.innerHTML = PLAY + '영상 보기';
  const open = () => { pop.hidden = false; pop.querySelector('.hp-x').focus(); };
  const close = () => { v.pause(); pop.hidden = true; store.set(sessionStorage, 'hero-pop-closed', src); };
  play.addEventListener('click', () => { play.hidden = true; v.play().catch(() => { play.hidden = false; }); });
  v.addEventListener('play', () => { play.hidden = true; });
  v.addEventListener('error', () => { pop.remove(); btn.remove(); }, { once: true });   // 파일이 없으면 팝업도 버튼도 없앰
  pop.addEventListener('click', e => {
    if (e.target === pop || e.target.closest('.hp-x, .hp-close')) close();
    else if (e.target.closest('.hp-today')) { store.set(localStorage, 'hero-pop-hide', `${dayKey()}|${src}`); close(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); });
  btn.addEventListener('click', open);
  document.body.append(btn, pop);
  if (preview || popupWanted(src, { hideDay: store.get(localStorage, 'hero-pop-hide'), closed: store.get(sessionStorage, 'hero-pop-closed') })) open();
  return 'active';
}

/** 배경 — 소리 없이 반복. 실제로 재생이 시작된 뒤에야 지구와 바꾼다(파일이 없거나 막히면 지구 그대로) */
function background(o, src) {
  // 움직임 줄이기·데이터 절약 기기는 지구 그대로(영상 자동 재생 안 함)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return 'reduced';
  const layer = document.createElement('div'); layer.className = 'hero-video'; layer.setAttribute('aria-hidden', 'true');
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  layer.appendChild(v);
  (document.querySelector('.globe') || document.body.firstElementChild).insertAdjacentElement('afterend', layer);
  document.body.style.setProperty('--hero-dim', String(o.dim));
  document.body.style.setProperty('--hero-tone', o.tone === 'light' ? '255,255,255' : '0,0,0');
  // 영상이 깔려 있는 동안 첫 화면 테마를 영상 색조에 고정 — 테마 버튼을 눌러도 글자가 영상에 묻히지 않게(저장된 테마 설정은 건드리지 않음)
  const root = document.documentElement, lock = () => { if (o.tone === 'dark') { if (root.dataset.theme !== 'dark') root.dataset.theme = 'dark'; } else if (root.dataset.theme) delete root.dataset.theme; };
  v.addEventListener('playing', () => { document.body.classList.add('hero-on'); lock(); new MutationObserver(lock).observe(root, { attributes: true, attributeFilter: ['data-theme'] }); if (o.watch) watchButton(); }, { once: true });
  v.addEventListener('error', () => { document.body.classList.remove('hero-on'); layer.remove(); }, { once: true });
  v.src = src;
  v.play().catch(() => {});   // 자동 재생이 막히면 playing 이 오지 않아 지구가 그대로 남는다
  function watchButton() {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'hero-watch';
    btn.innerHTML = PLAY + '영상 보기';
    const modal = document.createElement('div'); modal.className = 'hero-modal'; modal.hidden = true;
    modal.innerHTML = '<button type="button" aria-label="닫기">×</button><video controls playsinline></video>';
    const big = modal.querySelector('video');
    const close = () => { big.pause(); modal.hidden = true; v.play().catch(() => {}); };
    btn.addEventListener('click', () => { v.pause(); if (!big.src) big.src = src; big.currentTime = 0; modal.hidden = false; big.play().catch(() => {}); });
    modal.addEventListener('click', e => { if (e.target !== big) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    document.body.append(btn, modal);
  }
  return 'active';
}
