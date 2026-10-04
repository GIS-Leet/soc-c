// 홈페이지 첫 화면 기간제 배경 영상 — Desk 「홈페이지 배경 영상」에서 정한 기간에만 자전 지구 대신 영상을 깐다.
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
    src: typeof o.src === 'string' && o.src.trim() ? o.src.trim() : DEFAULT_SRC,
    dim: Number.isFinite(dim) ? Math.min(0.85, Math.max(0, dim)) : 0.35, watch: o.watch === true,
    tone: o.tone === 'light' ? 'light' : 'dark' };   // 영상 색조 — 어두운 영상이면 검은 막 + 흰 글자, 밝은 영상이면 흰 막 + 검은 글자
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
body.hero-on .hero-watch { display: inline-flex; }
.hero-modal { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 4vmin; background: rgba(0,0,0,.82); }
.hero-modal[hidden] { display: none; }
.hero-modal video { max-width: 100%; max-height: 100%; width: min(1280px, 100%); border-radius: 10px; background: #000; }
.hero-modal button { position: absolute; top: 14px; right: 16px; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(255,255,255,.14); color: #fff; font-size: 18px; }
`;

/** 홈페이지에서 부름 — 기간 안이면 영상을 틀고, 실제로 재생이 시작된 뒤에야 지구와 바꾼다(파일이 없거나 막히면 지구 그대로) */
export async function mountHero({ preview = new URLSearchParams(location.search).get('hero') === 'preview' } = {}) {
  let cfg;
  try { const r = await fetch(`${DB}/notices/${HERO_KEY}.json`); if (!r.ok) return 'unavailable'; cfg = await r.json(); } catch { return 'unavailable'; }
  if (!cfg) return 'off';
  const state = preview ? 'active' : heroState(cfg);
  if (state !== 'active') return state;
  const o = normalize(cfg), src = safeSrc(o.src, document.baseURI);
  if (!src) return 'nosrc';
  // 움직임 줄이기·데이터 절약 기기는 지구 그대로(영상 자동 재생 안 함)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return 'reduced';
  if (!document.getElementById('hero-style')) { const st = document.createElement('style'); st.id = 'hero-style'; st.textContent = CSS; document.head.appendChild(st); }
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
    btn.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 1.2v9.6L10.6 6z"/></svg>영상 보기';
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
