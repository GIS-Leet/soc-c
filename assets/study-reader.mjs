// 폰 잠금 공부의 「끝까지 읽기」 — 카드를 조각(step)으로 나눠 조각마다 최소 읽기 시간이 지나야 다음으로 넘어감.
// DOM 은 study.html 이 맡고, 여기는 계획·시간·상태만(테스트 가능).

const CPS = 5;                       // 분당 300자
const MIN = 8, MAX = 40;             // 조각당 초

/** 글자 수 → 최소 읽기 초. fast(하루 두 번째 회차부터)는 절반 */
export function readSeconds(chars, { fast = false } = {}) {
  const s = Math.min(MAX, Math.max(MIN, Math.round(chars / CPS)));
  return fast ? Math.round(s / 2) : s;
}

/** [['id', ...], ...] → 글자가 있는 조각만 [{ids, chars}] */
export function planSteps(groups, textOf) {
  return groups.map(ids => ({ ids, chars: ids.reduce((n, id) => n + (textOf(id) || '').trim().length, 0) }))
    .filter(s => s.chars > 0);
}

/** 조각 진행 상태. next() 는 시간이 찼을 때만 넘어가며 성공 여부를 돌려줌 */
export function createReader(steps, { now = () => Date.now(), fast = false } = {}) {
  let index = 0, since = now(), done = steps.length === 0;
  const need = () => readSeconds(steps[index]?.chars || 0, { fast }) * 1000;
  const remaining = () => done ? 0 : Math.max(0, Math.ceil((since + need() - now()) / 1000));
  return {
    steps,
    state: () => ({ index, total: steps.length, remaining: remaining(), last: index >= steps.length - 1, done }),
    next() {
      if (done || remaining() > 0) return false;
      if (index >= steps.length - 1) { done = true; return true; }
      index++; since = now(); return true;
    },
  };
}

/** 틀린 문제 → 읽을 개념. q = 시험 문제({id, day, prompt, answer}), D = {geo, jp}(카드 묶음). 화면은 lines 를 줄줄이 보여 줌 */
export function reviewOf(q, D) {
  const [kind, a, b] = String(q.id).split(':');
  const out = { day: q.day, prompt: q.prompt, answer: q.answer, lines: [] };
  if (kind === 'geo') {
    const c = D.geo?.days?.[Number(a)]; if (!c) return out;
    const m = /^m?term(\d+)$/.exec(b);
    if (m && c.k?.[Number(m[1])]) { const [k, d] = c.k[Number(m[1])]; out.lines.push(`${k} — ${d}`); }
    out.lines.push(c.t + (c.en ? ` (${c.en})` : ''));
    if (c.m) out.lines.push(c.m);
    if (c.a) out.lines.push(c.a);
  } else if (kind === 'jp') {
    const c = D.jp?.days?.[Number(a)]; if (!c) return out;
    const words = [...(c.v || []).map(([w, , k]) => [w, k]), ...(c.w || [])];
    const m = /^(?:k2w|w2k|mk2w)(\d+)$/.exec(b);
    if (m && words[Number(m[1])]) { const [w, k] = words[Number(m[1])]; out.lines.push(`${w} — ${k}`); }
    if (c.s) out.lines.push(`${c.s} — ${c.m || ''}`.trim());
    if (c.g) out.lines.push(c.g);
  } else if (kind === 'kana') {
    const c = (D.jp?.days || []).find(x => x.type === 'kana' && (x.rows || []).some(r => r.includes(a)));
    if (c) { const row = (c.rows || []).find(r => r.includes(a)); if (row) out.lines.push(row.split('').join(' ')); if (c.m) out.lines.push(c.m); }
  }
  return out;
}
