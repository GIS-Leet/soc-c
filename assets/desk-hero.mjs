// Desk 대시보드 「홈페이지 배경 영상」 — 홈페이지 첫 화면의 지구 배경을 정한 기간 동안 영상으로 바꾸는 설정. 저장 즉시 반영(notices/_hero)
import { HERO_KEY, DEFAULT_SRC, normalize, heroState, safeSrc } from './site-hero.mjs?v=a7592028';

const CSS = `
.p-hero .hr-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; font-size: 13.5px; color: var(--st-label); }
.p-hero label.c { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 650; }
.p-hero label.c input { accent-color: var(--st-accent-solid); }
.p-hero .hr-f { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--st-label-3); flex: 1; min-width: 118px; }
.p-hero input[type=date], .p-hero input[type=text] { height: 36px; padding: 0 10px; min-width: 0; background: var(--st-fill-2); color: var(--st-label);
  border: 1px solid var(--st-fill); border-radius: var(--st-r-element); font: inherit; font-size: 13px; outline: none; font-feature-settings: 'tnum' 1; }
.p-hero input:focus { background: var(--st-surface); border-color: var(--accent); }
.p-hero input[type=range] { flex: 1; min-width: 80px; accent-color: var(--st-accent-solid); }
.p-hero .hr-dim { font-size: 12.5px; color: var(--st-label-2); font-feature-settings: 'tnum' 1; min-width: 34px; text-align: right; }
.p-hero .hr-state { font-size: 13px; line-height: 1.6; color: var(--st-label-2); margin: 2px 0 10px; }
.p-hero .hr-state b { color: var(--st-label); }
.p-hero .hr-state.warn { color: var(--st-danger-ink); }
.p-hero .hr-foot { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--st-label-3); }
.p-hero .hr-foot a { color: var(--st-accent-ink); font-weight: 650; }
.p-hero #hrTone button { padding: 5px 12px; font-size: 12px; }
`;
const dayLabel = k => { const [, m, d] = k.split('-').map(Number); return `${m}월 ${d}일`; };

export function mountHeroAdmin(panel, ctx) {
  const { db, ref, set } = ctx;
  if (!document.getElementById('hr-style')) { const st = document.createElement('style'); st.id = 'hr-style'; st.textContent = CSS; document.head.appendChild(st); }
  const body = panel.querySelector('.hr-body');
  body.innerHTML = `
    <div class="hr-row"><label class="c"><input type="checkbox" id="hrOn"> 기간 동안 영상 배경 켜기</label></div>
    <div class="hr-row"><label class="hr-f">시작일<input type="date" id="hrStart"></label><label class="hr-f">종료일<input type="date" id="hrEnd"></label></div>
    <div class="hr-row"><label class="hr-f">영상 주소<input type="text" id="hrSrc" placeholder="${DEFAULT_SRC}" maxlength="300" autocomplete="off"></label></div>
    <div class="hr-row"><span style="font-size:12.5px;color:var(--st-label-2)">영상 색조</span><nav class="desk-views" id="hrTone" style="display:inline-flex"><button type="button" data-tone="dark">어두운 영상 · 흰 글자</button><button type="button" data-tone="light">밝은 영상 · 검은 글자</button></nav></div>
    <div class="hr-row"><span style="font-size:12.5px;color:var(--st-label-2)">글자 뒤 막</span><input type="range" id="hrDim" min="0" max="85" step="5"><span class="hr-dim" id="hrDimV"></span></div>
    <div class="hr-row"><label class="c" style="font-weight:500"><input type="checkbox" id="hrWatch"> 「영상 보기」 버튼 — 누르면 소리와 함께 크게 재생</label></div>
    <div class="hr-state" id="hrState"></div>
    <div class="hr-foot"><a href="index.html?hero=preview" target="_blank" rel="noopener">미리 보기 ↗</a><span id="hrSaved"></span></div>`;
  const $ = id => body.querySelector('#' + id);
  let editing = false, timer = null, fileOk = null, checked = '', tone = 'dark';
  const paintTone = () => body.querySelectorAll('#hrTone button').forEach(b => b.classList.toggle('on', b.dataset.tone === tone));

  const read = () => ({ on: $('hrOn').checked, start: $('hrStart').value, end: $('hrEnd').value, src: $('hrSrc').value.trim() || DEFAULT_SRC, dim: Number($('hrDim').value) / 100, watch: $('hrWatch').checked, tone });
  function paintState(c) {
    const st = heroState(c), o = normalize(c), el = $('hrState');
    let t = st === 'off' ? '꺼져 있습니다 — 홈페이지는 지구 배경입니다.'
      : st === 'before' ? `<b>${dayLabel(o.start)}</b>부터 영상 배경으로 바뀝니다${o.end ? ` (${dayLabel(o.end)}까지)` : ''}.`
      : st === 'after' ? `기간이 지났습니다(${dayLabel(o.end)}까지) — 홈페이지는 지구 배경으로 돌아갔습니다.`
      : `<b>지금 홈페이지에 표시 중</b>${o.end ? ` — ${dayLabel(o.end)}까지` : ' — 끝 날짜가 없어 끌 때까지 계속'}.`;
    const bad = o.start && o.end && o.end < o.start;
    if (bad) t = '종료일이 시작일보다 앞입니다.';
    else if (fileOk === false) t += ` 다만 영상 파일(${ctx.escapeHTML(o.src)})이 아직 사이트에 없어, 올리기 전에는 지구 배경이 그대로 보입니다.`;
    el.classList.toggle('warn', bad || (fileOk === false && st !== 'off'));
    el.innerHTML = t;
    $('hrDimV').textContent = Math.round(o.dim * 100) + '%';
  }
  async function checkFile(src) {
    if (checked === src) return; checked = src; fileOk = null;
    const url = safeSrc(src, document.baseURI); if (!url) { fileOk = false; return paintState(read()); }
    try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); fileOk = r.ok; } catch { fileOk = null; }   // 다른 사이트 주소는 확인 못 할 수 있음 — 모르면 경고하지 않음
    if (checked === src) paintState(read());
  }
  function fill(c) {
    const o = normalize(c);
    $('hrOn').checked = o.on; $('hrStart').value = o.start; $('hrEnd').value = o.end;
    $('hrSrc').value = o.src === DEFAULT_SRC ? '' : o.src; $('hrDim').value = Math.round(o.dim * 100); $('hrWatch').checked = o.watch; tone = o.tone; paintTone();
    paintState(o); checkFile(o.src);
  }
  async function save() {
    const c = read();
    paintState(c); checkFile(c.src);
    if (c.start && c.end && c.end < c.start) return;
    try { await set(ref(db, 'notices/' + HERO_KEY), { hero: true, ...c, updatedAt: Date.now() }); $('hrSaved').textContent = '저장됨 — 홈페이지에 바로 반영'; }
    catch { $('hrSaved').textContent = '저장 실패 — 연결을 확인하세요'; }
    editing = false;
  }
  const changed = () => { editing = true; $('hrSaved').textContent = ''; paintState(read()); clearTimeout(timer); timer = setTimeout(save, 700); };
  $('hrTone').addEventListener('click', e => { const b = e.target.closest('button[data-tone]'); if (!b) return; tone = b.dataset.tone; paintTone(); changed(); });
  body.addEventListener('input', () => { editing = true; $('hrSaved').textContent = ''; paintState(read()); clearTimeout(timer); timer = setTimeout(save, 700); });
  return {
    render() { if (!editing) fill(ctx.cfg()); },
    reset() { clearTimeout(timer); editing = false; fileOk = null; checked = ''; $('hrSaved').textContent = ''; }
  };
}
