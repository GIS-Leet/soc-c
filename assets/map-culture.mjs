// 종교 · 언어 분포와 기후 — 나라마다 가장 큰 종교로 칠한 세계 지도에 기후 · 언어 층을 겹쳐 본다(분포 지도 · 중첩).
// 자료: data/maps/culture/culture.json (scripts/build-map-culture.py — CIA World Factbook · Beck et al. 2023 쾨펜 · Natural Earth).
// 핵심은 「문화권은 자연환경과 전파 경로가 함께 만든다」 — 겹치는 곳과 겹치지 않는 곳을 둘 다 보게 한다.
import { $, $$, esc, fmt, tips, params, setParams, shareButton, initPage, loadBasemap } from './map-kit.mjs?v=affb9c7a';

// 범주 — 색(--s1~s6)과 무늬를 함께 쓴다(색만으로 구분하지 않기)
const FAM = [
  { id: 'chr', name: '크리스트교', c: '--s1', pat: 'solid' },
  { id: 'isl', name: '이슬람교', c: '--s3', pat: 'diag' },
  { id: 'bud', name: '불교', c: '--s4', pat: 'dots' },
  { id: 'hin', name: '힌두교', c: '--s2', pat: 'cross' },
  { id: 'none', name: '종교 없음', c: '--s5', pat: 'horiz' },
  { id: 'oth', name: '그 밖의 종교', c: '--s6', pat: 'vert' },
];
const BRS = [
  { id: 'cat', name: '가톨릭', c: '--s1', pat: 'solid' },
  { id: 'pro', name: '개신교', c: '--s3', pat: 'diag' },
  { id: 'ort', name: '정교회', c: '--s5', pat: 'dots' },
  { id: 'xch', name: '그 밖 · 갈래 모름', c: '--s4', pat: 'horiz' },
];
const CLIM = { A: '열대', B: '건조', C: '온대', D: '냉대', E: '한대', M: '겨울 건조형' };
const OVER = [
  { id: '', name: '겹치지 않기' },
  { id: 'B', name: '건조 기후(B)', k: 'clim' },
  { id: 'M', name: '겨울이 건조한 기후(Aw · Am · Cw · Dw)', k: 'clim' },
  { id: 'A', name: '열대 기후(A)', k: 'clim' },
  { id: 'C', name: '온대 기후(C)', k: 'clim' },
  { id: 'D', name: '냉대 기후(D)', k: 'clim' },
  { id: 'E', name: '한대 기후(E)', k: 'clim' },
  { id: 'ar', name: '아랍어 나라', k: 'lang' },
  { id: 'ib', name: '에스파냐어 · 포르투갈어 나라', k: 'lang' },
];
const st = { mode: 'fam', o: 'B', u: null };
let D, BM, svg, byId = {};

/** 받침에 맞춘 이/가 */
const josa = (w) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이' : '가'; };
const famOf = (id) => FAM.find((f) => f.id === id);
const brOf = (id) => BRS.find((b) => b.id === id);
/** 이 나라를 칠할 범주(지금 보기 기준) */
function catOf(c) {
  if (st.mode === 'br') return c.fam === 'chr' ? brOf(c.br || 'xch') : null;
  return c.fam ? famOf(c.fam) : null;
}
const inLayer = (c, o) => (['ar', 'ib'].includes(o) ? (c.lang || []).includes(o) : c.clim && c.clim[o] >= 50);

function patterns() {
  const mk = (cat, pre) => {
    const mark = {
      solid: '',
      diag: '<path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" class="cu-pm"/>',
      dots: '<circle cx="3" cy="3" r="1.1" class="cu-pd"/>',
      cross: '<path d="M0,0 L6,6 M6,0 L0,6" class="cu-pm"/>',
      horiz: '<path d="M0,3 H6" class="cu-pm"/>',
      vert: '<path d="M3,0 V6" class="cu-pm"/>',
    }[cat.pat];
    return `<pattern id="${pre}${cat.id}" class="cu-pat" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" style="fill:var(${cat.c})"/>${mark}</pattern>`;
  };
  return [...FAM.map((f) => mk(f, 'cuF')), ...BRS.map((b) => mk(b, 'cuB'))].join('');
}
const fillOf = (cat) => (cat ? `url(#${st.mode === 'br' ? 'cuB' : 'cuF'}${cat.id})` : 'var(--st-fill)');

function overlayPath(o) {
  if (!o) return '';
  if (CLIM[o]) return D.climate[o];
  return D.countries.filter((c) => (c.lang || []).includes(o)).map((c) => c.d).join('');
}

function drawMap() {
  const W = BM.world;
  const shapes = D.countries.map((c) => {
    const cat = catOf(c);
    const tip = c.fam === undefined ? `${c.name}|Factbook 자료와 잇지 못함` : !c.fam ? `${c.name}|비율 자료 없음` : `${c.name}|${famOf(c.fam).name}${c.shares?.[c.fam] ? ` ${fmt(c.shares[c.fam], 1)}%` : ''}${c.fam === 'chr' && c.br ? ` · ${brOf(c.br).name}` : ''}|조사 ${c.year || '연도 없음'}`;
    return `<path class="cu-c${st.u === c.id ? ' is-sel' : ''}" d="${c.d}" style="fill:${fillOf(cat)}" data-id="${c.id}" data-tip="${esc(tip)}"/>`;
  }).join('');
  const op = overlayPath(st.o);
  const sel = st.u ? D.countries.find((c) => c.id === st.u) : null;
  $('#cuMap').innerHTML = `<svg class="mk-svg cu-svg" viewBox="0 0 ${W.w} ${W.h}" role="img" aria-label="나라마다 가장 큰 종교로 칠한 세계 지도${st.o ? ` — ${esc(OVER.find((x) => x.id === st.o).name)} 겹침` : ''}">
    <defs>${patterns()}<clipPath id="cuSphere"><path d="${W.sphere}"/></clipPath>
      ${op ? `<mask id="cuMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W.w}" height="${W.h}"><rect width="${W.w}" height="${W.h}" fill="white"/><path d="${op}" fill="black"/></mask>` : ''}</defs>
    <path class="cu-sphere" d="${W.sphere}"/>
    <g clip-path="url(#cuSphere)"><path class="cu-grat" d="${W.meridians}${W.parallels.grid}"/><path class="cu-eq" d="${W.parallels.eq}${W.parallels.tropic}"/></g>
    <g class="cu-shapes">${shapes}</g>
    ${op ? `<path class="cu-veil" d="${W.sphere}" mask="url(#cuMask)"/><path class="cu-ol" d="${op}"/>` : ''}
    ${sel ? `<path class="cu-selline" d="${sel.d}"/>` : ''}
  </svg>`;
  svg = $('#cuMap svg');
  scaleUi();
}

/** 화면 크기에 맞춰 무늬 칸을 화면 픽셀 기준(약 6px)으로 */
function scaleUi() {
  if (!svg) return;
  const px = svg.getBoundingClientRect().width || 1000;
  const k = Math.max(0.6, BM.world.w / px);
  $$('.cu-pat', svg).forEach((p) => p.setAttribute('patternTransform', `scale(${k})`));
}

function legend() {
  const cats = st.mode === 'br' ? BRS : FAM;
  const pre = st.mode === 'br' ? 'cuKB' : 'cuKF';
  const sw = (cat) => `<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" style="fill:url(#${pre}${cat.id})"/></svg>`;
  $('#cuKeys').innerHTML = cats.map((c) => `<span>${sw(c)}${esc(c.name)}</span>`).join('')
    + `<span><i style="background:var(--st-fill)"></i>${st.mode === 'br' ? '크리스트교가 다수가 아닌 나라' : '비율 자료 없음'}</span>`
    + (st.o ? `<span><svg width="22" height="12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" rx="2" class="cu-key-ol"/></svg>${esc(OVER.find((x) => x.id === st.o).name)}${CLIM[st.o] ? '' : ''} — 바깥은 어둡게</span>` : '');
}

/** 겹침 셈 — 지금 층 안의 나라들이 어느 종교인지, 그리고 반대로 */
function overlap() {
  const o = st.o;
  const box = $('#cuSay');
  if (!o) {
    box.innerHTML = `<p>위에서 기후나 언어 층을 골라 겹쳐 보세요. 고른 층 바깥은 어둡게 가려집니다.</p>
      <p>종교의 분포는 자연환경과 전파 경로가 함께 만듭니다. 기후 층과 겹치지 않는 곳은 전파 경로로 설명해야 하는 곳입니다.</p>`;
    return;
  }
  const isLang = !CLIM[o];
  const pool = D.countries.filter((c) => c.fam && (isLang || c.clim));
  const inside = pool.filter((c) => inLayer(c, o));
  const cats = st.mode === 'br' ? BRS : FAM;
  const count = (list) => cats.map((cat) => ({ cat, n: list.filter((c) => catOf(c)?.id === cat.id).length })).filter((x) => x.n);
  const cnt = count(inside);
  const top = cnt.slice().sort((a, b) => b.n - a.n)[0];
  const what = isLang ? `${OVER.find((x) => x.id === o).name.replace(' 나라', '')}를 쓰는 나라` : `${CLIM[o]} 기후가 국토의 절반을 넘는 나라`;
  const bars = cnt.sort((a, b) => b.n - a.n).map(({ cat, n }) => `<li><span class="cu-bn">${esc(cat.name)}</span><span class="cu-bar"><i style="width:${(100 * n) / inside.length}%;background:var(${cat.c})"></i></span><span class="cu-bv">${n}곳</span></li>`).join('');
  // 반대 방향: 가장 많은 종교의 나라 가운데 이 층 안에 드는 몫
  // 거꾸로 보기 — 이 층과 짝지어 배우는 종교(없으면 층 안에서 가장 많은 종교)의 나라 가운데 층 안에 드는 몫
  const FOCUS = { B: ['isl'], ar: ['isl'], M: ['bud', 'hin'], ib: ['chr', 'cat'] };
  const focus = (FOCUS[o] || []).map((id) => cats.find((x) => x.id === id)).filter(Boolean);
  const size = (c) => { const el = svg?.querySelector(`[data-id="${c.id}"]`); if (!el) return 0; const b = el.getBBox(); return b.width * b.height; };
  const back = (focus.length ? focus : top ? [top.cat] : []).map((cat) => {
    const all = pool.filter((c) => catOf(c)?.id === cat.id);
    const inn = all.filter((c) => inLayer(c, o));
    // 층 밖의 나라는 지도에서 넓게 보이는 순서로(그린 모양의 크기)
    const big = all.filter((c) => !inLayer(c, o)).map((c) => [c, size(c)]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c.name);
    return `<p>거꾸로, ${esc(cat.name)}${josa(cat.name)} 가장 큰 나라 ${all.length}곳 가운데 이 층에 드는 나라는 <b>${inn.length}곳</b>입니다.${big.length ? ` 층 밖에 있는 나라로는 ${esc(big.join(' · '))} 등이 있습니다.` : ''}</p>`;
  }).join('');
  box.innerHTML = `<p><b>${esc(what)} ${inside.length}곳</b> — 가장 많은 것은 ${top ? `<b>${esc(top.cat.name)}(${top.n}곳)</b>` : '없음'}입니다.</p>
    <ul class="cu-bars">${bars}</ul>${back}<p>${WHY[o] || ''}</p>`;
}

const WHY = {
  B: '건조 기후 지역은 물이 귀해 오아시스 농업과 유목이 발달했습니다. 7세기 아라비아반도에서 생겨난 이슬람교는 이 건조 지역을 따라 상인과 정복으로 퍼졌습니다. 그래서 건조 기후와 이슬람 문화권이 많이 겹칩니다. 그러나 기후가 종교를 만든 것은 아닙니다. 습한 동남아시아의 이슬람교는 바닷길 무역으로 전해졌습니다.',
  M: '비가 여름에 몰리고 겨울이 건조한 기후입니다. 아시아에서는 여름 계절풍이 이 비를 몰고 와 벼농사가 발달하고 사람이 많이 삽니다. 인도에서 생겨난 힌두교와 불교는 이 계절풍 아시아 안에서 퍼졌습니다. 힌두교는 인도 · 네팔에 남았고, 불교는 동남아시아와 동아시아로 퍼졌습니다. 같은 기후가 아프리카와 라틴 아메리카에도 넓지만 그곳은 크리스트교로 칠해집니다. 기후가 같아도 종교는 전파 경로를 따릅니다.',
  A: '열대 기후 지역은 한 종교로 묶이지 않습니다. 아프리카와 라틴 아메리카의 열대는 크리스트교, 동남아시아는 불교와 이슬람교로 갈립니다. 같은 기후에서도 유럽의 식민 지배, 상인의 바닷길처럼 누가 언제 들어왔는지에 따라 종교가 갈렸습니다.',
  C: '온대 기후는 유럽과 동아시아에 넓은데, 두 곳의 종교는 크게 다릅니다. 같은 기후라도 문화가 생겨나고 퍼진 뿌리가 다르면 다른 문화권이 됩니다.',
  D: '냉대 기후는 러시아 · 동유럽 · 북유럽 · 캐나다에 넓습니다. 위의 「크리스트교 안의 갈래」로 바꿔 보세요. 같은 냉대라도 러시아 · 동유럽은 정교회, 북유럽은 개신교로 갈립니다. 갈래는 기후가 아니라 교회가 나뉘고 퍼진 역사를 따릅니다.',
  E: '한대 기후 지역에는 사람이 적게 살아, 나라 단위 지도에서는 거의 드러나지 않습니다. 나라 단위로 칠한 지도의 한계가 가장 잘 보이는 층입니다.',
  ar: '아랍어 나라는 서남아시아와 북아프리카에 모여 있고, 거의 모두 이슬람교가 가장 큽니다. 그런데 이슬람교가 가장 큰 나라는 아랍어 나라보다 훨씬 넓게 퍼져 있습니다. 이란 · 튀르키예 · 남아시아 · 동남아시아에는 이슬람교가 전해졌지만 아랍어는 공용어가 되지 않았습니다.',
  ib: '에스파냐어 · 포르투갈어 나라는 이베리아반도와 라틴 아메리카에 있습니다. 16세기부터 에스파냐와 포르투갈이 아메리카를 식민지로 삼으면서 말과 가톨릭이 함께 건너갔습니다. 위의 「크리스트교 안의 갈래」로 바꿔 보세요.',
};

function detail() {
  const box = $('#cuDetail');
  const c = st.u ? D.countries.find((x) => x.id === st.u) : null;
  $('#cuPick').value = c ? c.id : '';
  if (!c) { box.innerHTML = '<p class="mk-note">지도에서 나라를 누르거나 위 목록에서 고르면 종교 비율이 나옵니다.</p>'; return; }
  const row = (name, v, fill, label) => `<li><span class="cu-bn">${esc(name)}</span><span class="cu-bar"><i style="width:${Math.min(100, v)}%;background:${fill}"></i></span><span class="cu-bv">${label ?? fmt(v, 1) + '%'}</span></li>`;
  let h = `<h3>${esc(c.name)} <small>${c.year ? `조사 ${esc(c.year)}` : '조사 연도 없음'}</small></h3>`;
  if (c.shares) {
    h += '<ul class="cu-bars">' + FAM.filter((f) => c.shares[f.id]).sort((a, b) => c.shares[b.id] - c.shares[a.id]).map((f) => row(f.name, c.shares[f.id], `var(${f.c})`)).join('')
      + (c.shares.rest ? row('기타 · 미상', c.shares.rest, 'var(--st-label-4)') : '') + '</ul>';
    if (c.branches && c.shares.chr) {
      h += '<p class="cu-sub">크리스트교 안의 갈래</p><ul class="cu-bars">' + BRS.filter((b) => c.branches[b.id]).map((b) => row(b.name, c.branches[b.id], `var(${b.c})`)).join('') + '</ul>';
    }
  } else if (c.fam) {
    h += `<p>원문에 비율이 없고 한 종교만 분명히 적혀 있어 <b>${esc(famOf(c.fam).name)}</b>로 칠했습니다.</p>`;
  } else if (c.fam === null) {
    h += '<p>원문에 비율이 없어 칠하지 않았습니다.</p>';
  } else {
    h += '<p>Factbook 자료와 잇지 못한 지역입니다.</p>';
  }
  if (c.clim) {
    h += '<p class="cu-sub">국토의 기후(쾨펜, 면적 비율)</p><div class="cu-stack" role="img" aria-label="' + esc(['A', 'B', 'C', 'D', 'E'].map((k) => `${CLIM[k]} ${fmt(c.clim[k], 0)}%`).join(', ')) + '">'
      + ['A', 'B', 'C', 'D', 'E'].map((k) => (c.clim[k] ? `<i style="flex:${c.clim[k]};background:var(--g${k})" title="${CLIM[k]} ${fmt(c.clim[k], 1)}%"></i>` : '')).join('') + '</div>'
      + '<p class="mk-keys cu-ckeys">' + ['A', 'B', 'C', 'D', 'E'].filter((k) => c.clim[k] >= 0.5).map((k) => `<span><i style="background:var(--g${k})"></i>${CLIM[k]} ${fmt(c.clim[k], 0)}%</span>`).join('') + '</p>';
  }
  if (c.lang?.length) h += `<p class="cu-sub">말: ${c.lang.map((l) => (l === 'ar' ? '아랍어' : '에스파냐어 · 포르투갈어')).map(esc).join(' · ')}</p>`;
  if (c.src) h += `<details class="cu-src"><summary>원문 보기(CIA World Factbook)</summary><p lang="en">${esc(c.src)}</p></details>`;
  box.innerHTML = h;
}

function draw() {
  drawMap();
  legend();
  overlap();
  detail();
  $$('#cuMode [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
  $$('#cuOver [data-o]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === st.o)));
  setParams({ c: st.mode === 'br' ? 'br' : null, o: st.o || 'none', u: st.u });
}

export async function main() {
  await initPage('culture');
  [D, BM] = await Promise.all([fetch('data/maps/culture/culture.json').then((r) => r.json()), loadBasemap()]);
  byId = Object.fromEntries(D.countries.map((c) => [c.id, c]));
  const q = params();
  if (q.get('c') === 'br') st.mode = 'br';
  if (q.has('o')) st.o = OVER.some((x) => x.id === q.get('o')) ? q.get('o') : '';
  if (q.get('u') && byId[q.get('u')]) st.u = q.get('u');
  const names = D.countries.filter((c) => c.fam !== undefined).slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const nFam = D.countries.filter((c) => c.fam).length;
  const years = D.countries.map((c) => parseInt(c.year, 10)).filter(Number.isFinite).sort((a, b) => a - b);
  const yrRecent = years.filter((y) => y >= 2015).length;

  $('#mkBody').innerHTML = `
    <div class="mk-stage mk-stage--below">
      <div class="cu-bar-top">
        <div class="mk-field"><span class="mk-l">칠하기</span><div class="mk-tools" id="cuMode"><button type="button" class="opt" data-m="fam">가장 큰 종교</button><button type="button" class="opt" data-m="br">크리스트교 안의 갈래</button></div></div>
        <div class="mk-field cu-over"><span class="mk-l">겹쳐 볼 층</span><div class="mk-tools" id="cuOver">${OVER.map((x) => `<button type="button" class="opt" data-o="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
      </div>
      <figure class="mk-map mk-tiphost cu-mapbox" id="cuMap"></figure>
      <div class="mk-keys cu-keys" id="cuKeys"></div>
      <div class="cu-grid">
        <section class="mk-panel"><h2>겹쳐 보면</h2><div class="mk-why" id="cuSay" aria-live="polite"></div></section>
        <section class="mk-panel"><h2>나라 보기</h2>
          <div class="cu-pickrow"><label class="mk-note" for="cuPick">나라 고르기</label><select id="cuPick" class="cu-pick"><option value="">—</option>${names.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button type="button" class="share-btn" id="cuShare">공유</button></div>
          <div class="mk-why cu-detail" id="cuDetail" aria-live="polite"></div>
        </section>
      </div>
      <section class="mk-panel">
        <h2>생각해 볼 것</h2>
        <ol class="mk-steps">
          <li>「건조 기후」를 겹쳐 보세요. 이슬람교가 가장 큰 나라 가운데 건조 기후 바깥에 있는 나라는 어디이고, 이슬람교는 그곳까지 어떻게 갔을까요?</li>
          <li>「아랍어 나라」를 겹쳐 보세요. 이란 · 튀르키예는 이슬람교가 가장 크지만 층 밖에 있습니다. 종교와 말이 퍼진 범위는 왜 다를까요?</li>
          <li>「크리스트교 안의 갈래」로 바꾸고 「에스파냐어 · 포르투갈어 나라」를 겹쳐 보세요. 라틴 아메리카의 가톨릭은 어디에서 온 것일까요?</li>
          <li>나이지리아를 눌러 보세요. 이슬람교와 크리스트교가 거의 반반인 나라를 한 색으로 칠하면 무엇이 사라질까요? 우리나라는 왜 「종교 없음」으로 칠해질까요?</li>
        </ol>
      </section>
    </div>`;
  $('#mkSource').innerHTML = `<p><b>자료</b> 종교 · 언어: CIA World Factbook(미국 정부 저작물, 퍼블릭 도메인)의 나라별 「Religions」 「Languages」 — JSON 정리본 <a href="https://github.com/factbook/factbook.json">factbook/factbook.json</a>(2026년 1월 22일 갱신본, 2026-10-20 받음). 나라마다 조사 연도가 다르며(${years[0]}~${years[years.length - 1]}년, ${years.length}곳 가운데 ${yrRecent}곳이 2015년 이후) 나라를 누르면 연도가 나옵니다. 기후: Beck et al.(2023) 쾨펜-가이거 기후 구분 1991~2020년, 0.1° 격자(CC BY 4.0). 나라 경계: Natural Earth 1:50m. 나라 이름: 세계은행 국가 목록(통계로 보는 세계와 같음).</p>
    <p><b>계산</b> 종교 글을 「이름 비율%」로 나눠 여섯 갈래(크리스트교 · 이슬람교 · 불교 · 힌두교 · 종교 없음 · 그 밖)로 더한 뒤 가장 큰 갈래로 칠했습니다. 「미상 · 응답 거부 · 이름 없는 기타」는 어느 갈래에도 넣지 않았습니다. 비율이 없는 나라는 한 종교만 분명히 적힌 경우(수단 · 사우디아라비아 · 몰디브 · 서사하라 · 산마리노 · 바티칸)만 칠했습니다. 칠한 나라는 ${nFam}곳입니다. 기후 비율은 0.1° 칸을 위도에 따른 넓이로 셌고, 「국토의 절반을 넘는」 나라만 층 안으로 셉니다. 「겨울이 건조한 기후」는 Aw · Am · Cw · Dw를 묶은 것입니다. 아랍어 · 에스파냐어 · 포르투갈어 나라는 그 말을 공용어로 적었거나, 50% 넘게 쓰거나, 맨 앞에 적은 나라입니다.</p>
    <p><b>한계</b> 나라 하나를 한 색으로 칠하므로 나라 안의 차이(나이지리아의 북부 이슬람교 · 남부 크리스트교, 인도 안의 이슬람교 등)는 사라집니다. 가장 큰 종교만 보여 주므로 둘째 종교가 거의 같은 나라도 한 색이 됩니다. 「종교 없음」이 가장 큰 나라(우리나라 · 중국 · 베트남 등)도 전통 신앙과 문화는 남아 있습니다. 조사 방식과 연도가 나라마다 달라 정밀한 비교에는 맞지 않습니다.</p>`;

  const style = document.createElement('style');
  style.textContent = `
    .cu-bar-top { display: flex; flex-wrap: wrap; gap: 12px 28px; align-items: end; }
    .cu-over { flex: 1 1 520px; }
    .cu-mapbox { background: transparent; min-height: 0; padding: 4px 0; }
    .cu-svg { cursor: pointer; }
    .cu-sphere { fill: var(--map-sea); }
    .cu-grat { fill: none; stroke: var(--map-line); stroke-width: 0.5; }
    .cu-eq { fill: none; stroke: var(--map-line); stroke-width: 0.7; stroke-dasharray: 3 3; }
    .cu-c { stroke: var(--map-sea); stroke-width: 0.35; }
    .cu-c:hover { stroke: var(--st-label); stroke-width: 0.8; }
    .cu-c.is-sel { stroke: var(--st-label); stroke-width: 1.2; }
    .cu-selline { fill: none; stroke: var(--st-label); stroke-width: 1.4; pointer-events: none; }
    .cu-pm { stroke: var(--map-sea); stroke-width: 0.9; stroke-opacity: 0.55; fill: none; }
    .cu-pd { fill: var(--map-sea); fill-opacity: 0.55; }
    .cu-veil { fill: var(--map-sea); fill-opacity: 0.62; pointer-events: none; }
    .cu-ol { fill: none; stroke: var(--st-label); stroke-width: 0.8; pointer-events: none; }
    .cu-key-ol { fill: none; stroke: var(--st-label); stroke-width: 1.4; }
    .cu-keys { padding: 0 2px; }
    .cu-keys svg { flex-shrink: 0; }
    .cu-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 900px) { .cu-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .cu-bar-top .mk-tools { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; } .cu-bar-top .mk-tools .opt { flex-shrink: 0; } .cu-bar-top { gap: 10px; } .cu-over { flex-basis: 100%; min-width: 0; } .cu-bar-top .mk-field { min-width: 0; max-width: 100%; } }
    .cu-bars { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 4px; }
    .cu-bars li { display: grid; grid-template-columns: 96px 1fr 52px; gap: 8px; align-items: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
    .cu-bn { color: var(--st-label-2); }
    .cu-bar { height: 12px; background: var(--st-fill-3); border-radius: 0 4px 4px 0; overflow: hidden; }
    .cu-bar i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
    .cu-bv { text-align: right; color: var(--st-label); }
    .cu-detail h3 { font-size: 16px; font-weight: 700; color: var(--st-label); }
    .cu-detail h3 small { margin-left: 6px; font-size: 12px; font-weight: 500; color: var(--st-label-3); }
    .cu-sub { margin-top: 10px; font-size: 12px; color: var(--st-label-3); }
    .cu-stack { display: flex; height: 12px; border-radius: 4px; overflow: hidden; margin-top: 6px; background: var(--st-fill-3); }
    .cu-stack i { display: block; height: 100%; }
    .cu-ckeys { margin-top: 6px; }
    .cu-src { margin-top: 10px; font-size: 12px; color: var(--st-label-3); }
    .cu-src summary { cursor: pointer; color: var(--st-label-2); }
    .cu-src p { margin-top: 6px; line-height: 1.6; }
    .cu-pickrow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .cu-pick { height: 34px; padding: 0 10px; border-radius: var(--st-r-element); background: var(--st-fill-2); color: var(--st-label); border: 0; font: inherit; font-size: 13px; max-width: 220px; }
    .cu-pick option { background: var(--st-surface-raised); }
  `;
  document.head.append(style);
  // 범례 · 막대용 무늬(화면 픽셀 고정)
  const keyPat = (cat, pre) => {
    const mark = { solid: '', diag: '<path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" class="cu-pm"/>', dots: '<circle cx="3" cy="3" r="1.1" class="cu-pd"/>', cross: '<path d="M0,0 L6,6 M6,0 L0,6" class="cu-pm"/>', horiz: '<path d="M0,3 H6" class="cu-pm"/>', vert: '<path d="M3,0 V6" class="cu-pm"/>' }[cat.pat];
    return `<pattern id="${pre}${cat.id}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" style="fill:var(${cat.c})"/>${mark}</pattern>`;
  };
  document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${FAM.map((f) => keyPat(f, 'cuKF')).join('')}${BRS.map((b) => keyPat(b, 'cuKB')).join('')}</defs></svg>`);

  const body = $('#mkBody');
  tips(body);
  body.addEventListener('click', (e) => {
    const m = e.target.closest('#cuMode [data-m]');
    if (m) { st.mode = m.dataset.m; draw(); return; }
    const o = e.target.closest('#cuOver [data-o]');
    if (o) { st.o = o.dataset.o; draw(); return; }
    const c = e.target.closest('.cu-c');
    if (c) { st.u = st.u === c.dataset.id ? null : c.dataset.id; draw(); }
  });
  $('#cuPick').addEventListener('change', (e) => { st.u = e.target.value || null; draw(); });
  shareButton($('#cuShare'), () => location.href, () => `${st.mode === 'br' ? '크리스트교 안의 갈래' : '가장 큰 종교'}${st.o ? ` · ${OVER.find((x) => x.id === st.o).name} 겹침` : ''}`);
  new ResizeObserver(() => scaleUi()).observe($('#cuMap'));
  draw();
  document.body.dataset.ready = 'true';
}
main().catch((e) => { console.error(e); $('#mkBody').innerHTML = '<p class="mk-wait">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; });
