// 코호트 요인법(cohort-component) — 한 살 · 성별 인구를 한 해씩 앞으로 민다. 화면 없이 계산만(테스트: tests/dashboard-cohort.test.mjs).
// 자료: data/dashboard/pop.json(유엔 WPP 2024에서 scripts/build-dashboard-pop.py 로 만든 것). 인구 단위는 천 명.
//
// 한 해(t → t+1)에 하는 일:
//   1) 나이 x 인구 × 생존율 S(x) = L(x+1)/L(x) → 한 살 많은 인구(99세와 100세 이상은 100세 이상으로 모은다)
//   2) 출생 = Σ 연령별 출산율 × (그해 처음과 끝 여성 인구의 평균). 연령별 출산율 = 합계 출산율 × 2023년 연령별 몫
//      남녀는 출생 성비로 나누고, 0세 = 출생 × L(0)/l(0)
//   3) 순이동 = 정한 수 × 나이 · 성별 몫(2016~2019 평균)을 더한다. 어느 칸도 0 아래로 내려가지 않게 한다.
// 사망은 2023년 생명표의 한 해 사망 확률 qx 를 비례 위험으로 바꾼다: q'(x) = 1 − (1 − qx)^k.
// k 는 그해의 기대 수명(남녀 평균)이 목표가 되도록 이분법으로 찾는다(k = 1 이면 2023년 생명표 그대로).

const L0 = 100000;

/** 생명표 — q: qx[0..99], a: ax[0..99], open: 100세 이상의 Tx/lx, k: 사망 위험 배수 */
export function lifeTable({ qx, ax, open }, k = 1) {
  const lx = new Float64Array(101), Lx = new Float64Array(101);
  lx[0] = L0;
  for (let x = 0; x < 100; x++) {
    const q = k === 1 ? qx[x] : 1 - Math.pow(1 - qx[x], k);
    const d = lx[x] * q;
    lx[x + 1] = lx[x] - d;
    Lx[x] = lx[x + 1] + ax[x] * d;
  }
  Lx[100] = (lx[100] * open) / k;
  let T = 0;
  for (let x = 0; x <= 100; x++) T += Lx[x];
  // 생존율: S[x] = 나이 x → x+1, S[99] = 99세와 100세 이상 → 100세 이상, birth = L(0)/l(0)
  const S = new Float64Array(100);
  for (let x = 0; x < 99; x++) S[x] = Lx[x + 1] / Lx[x];
  S[99] = Lx[100] / (Lx[99] + Lx[100]);
  return { e0: T / L0, S, birth: Lx[0] / L0 };
}

/** 남녀 평균 기대 수명이 target 이 되는 생명표 한 쌍 */
export function tablesFor(D, target) {
  const base = (lifeTable(D.life.m).e0 + lifeTable(D.life.f).e0) / 2;
  if (Math.abs(target - base) < 1e-6) return { m: lifeTable(D.life.m), f: lifeTable(D.life.f), e0: base };
  let lo = 0.02, hi = 8;
  let m, f, e;
  for (let i = 0; i < 60; i++) {
    const k = Math.sqrt(lo * hi);
    m = lifeTable(D.life.m, k); f = lifeTable(D.life.f, k); e = (m.e0 + f.e0) / 2;
    if (e > target) lo = k; else hi = k;
    if (Math.abs(e - target) < 1e-4) break;
  }
  return { m, f, e0: e };
}

/** 한 해 앞으로. pop = { m: Float64Array(101), f: … } */
export function step(D, pop, { tfr, tables, netmig }) {
  const next = { m: new Float64Array(101), f: new Float64Array(101) };
  for (const s of ['m', 'f']) {
    const S = tables[s].S, p = pop[s], n = next[s];
    for (let x = 0; x < 99; x++) n[x + 1] = p[x] * S[x];
    n[100] = (p[99] + p[100]) * S[99];
  }
  // 출생 — 15~49세 여성
  let births = 0;
  const a0 = D.pasfr_from;
  for (let i = 0; i < D.pasfr.length; i++) {
    const x = a0 + i;
    const asfr = (tfr * D.pasfr[i]) / 100; // 여성 한 명이 그 나이에 낳는 아이 수
    births += asfr * (pop.f[x] + next.f[x]) / 2;
  }
  const boy = D.srb / (100 + D.srb);
  next.m[0] = births * boy * tables.m.birth;
  next.f[0] = births * (1 - boy) * tables.f.birth;
  // 순이동
  for (const s of ['m', 'f']) {
    const w = D.mig[s], n = next[s];
    for (let x = 0; x <= 100; x++) n[x] = Math.max(0, n[x] + netmig * w[x]);
  }
  return { pop: next, births };
}

/** 나이 무리 합 [총, 0~14, 15~64, 65+] */
export function groups(pop) {
  let t = 0, c = 0, w = 0, o = 0;
  for (const s of ['m', 'f']) {
    for (let x = 0; x <= 100; x++) {
      const v = pop[s][x];
      t += v;
      if (x < 15) c += v; else if (x < 65) w += v; else o += v;
    }
  }
  return [t, c, w, o];
}

/** 시작 해부터 끝 해까지. tfr: 합계 출산율(해마다 같음), e0End: 끝 해의 남녀 평균 기대 수명(시작 값에서 곧게 바뀜),
 *  netmig: 한 해 순이동(천 명, 해마다 같음). 돌려줌: years[{ y, pop, g, births, e0 }] */
export function project(D, { tfr = D.tfr, e0End = null, netmig = D.netmig, end = D.end_year } = {}) {
  const base = { m: Float64Array.from(D.base.m), f: Float64Array.from(D.base.f) };
  const e0Start = (lifeTable(D.life.m).e0 + lifeTable(D.life.f).e0) / 2;
  const goal = e0End ?? e0Start;
  const span = end - D.base_year;
  const out = [{ y: D.base_year, pop: base, g: groups(base), births: null, e0: e0Start }];
  let pop = base;
  for (let i = 1; i <= span; i++) {
    // t → t+1 동안의 사망은 그 사이 해(i − 0.5)의 목표 기대 수명으로
    const tables = tablesFor(D, e0Start + ((goal - e0Start) * (i - 0.5)) / span);
    const r = step(D, pop, { tfr, tables, netmig });
    pop = r.pop;
    out.push({ y: D.base_year + i, pop, g: groups(pop), births: r.births, e0: tables.e0 });
  }
  return out;
}

/** 5세 무리(0~4 … 95~99, 100+) — 피라미드 */
export function fiveYear(arr) {
  const out = [];
  for (let a = 0; a < 100; a += 5) out.push(arr[a] + arr[a + 1] + arr[a + 2] + arr[a + 3] + arr[a + 4]);
  out.push(arr[100]);
  return out;
}
