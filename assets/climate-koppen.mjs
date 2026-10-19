// 쾨펜 기후 구분 — 월평균 기온·강수량 열두 달로 기후 기호를 정하고, 그렇게 정한 까닭을 한 단계씩 돌려준다.
// 판정 순서와 기준은 Peel 외(2007)와 Kottek 외(2006)를 따른다. 화면은 이 결과를 그대로 문장으로 보여 주므로
// 숫자를 고치면 설명도 함께 바뀐다. 테스트: tests/climate-koppen.test.mjs
//
// 기준 하나는 고를 수 있다 — 온대(C)와 냉대(D)를 가르는 최한월 기온. 쾨펜 원안과 우리 교과서는 -3℃,
// 미국·일부 자료는 0℃를 쓴다. 서울처럼 그 사이에 있는 곳은 기준에 따라 기호가 바뀐다.

export const NAMES = {
  Af: '열대 우림 기후', Am: '열대 몬순 기후', Aw: '사바나 기후', As: '사바나 기후(여름 건조)',
  BWh: '사막 기후', BWk: '사막 기후', BSh: '스텝 기후', BSk: '스텝 기후',
  Csa: '지중해성 기후', Csb: '지중해성 기후', Csc: '지중해성 기후',
  Cwa: '온대 겨울 건조 기후', Cwb: '온대 겨울 건조 기후', Cwc: '온대 겨울 건조 기후',
  Cfa: '온난 습윤 기후', Cfb: '서안 해양성 기후', Cfc: '서안 해양성 기후',
  Dsa: '냉대 여름 건조 기후', Dsb: '냉대 여름 건조 기후', Dsc: '냉대 여름 건조 기후', Dsd: '냉대 여름 건조 기후',
  Dwa: '냉대 겨울 건조 기후', Dwb: '냉대 겨울 건조 기후', Dwc: '냉대 겨울 건조 기후', Dwd: '냉대 겨울 건조 기후',
  Dfa: '냉대 습윤 기후', Dfb: '냉대 습윤 기후', Dfc: '냉대 습윤 기후', Dfd: '냉대 습윤 기후',
  ET: '툰드라 기후', EF: '빙설 기후',
};
export const GROUPS = {
  A: { name: '열대', hint: '가장 추운 달도 18℃ 이상' },
  B: { name: '건조', hint: '증발량보다 비가 적다' },
  C: { name: '온대', hint: '가장 추운 달이 18℃ 미만, 영하로 깊이 내려가지 않는다' },
  D: { name: '냉대', hint: '가장 추운 달이 매우 춥고 여름은 10℃를 넘는다' },
  E: { name: '한대', hint: '가장 따뜻한 달도 10℃ 미만' },
};

const sum = (a) => a.reduce((s, v) => s + v, 0);
const r1 = (v) => Math.round(v * 10) / 10;
const mm = (v) => r1(v).toLocaleString('ko-KR') + 'mm';
const deg = (v) => r1(v).toFixed(1).replace('-0.0', '0.0') + '℃';
const MONTH = (i) => i + 1 + '월';

/**
 * @param {{t:number[], p:number[], lat:number}} s 월평균 기온(℃)·월강수량(mm) 열두 달, 위도
 * @param {{cd?: -3|0}} opt cd: 온대·냉대 경계(최한월 기온)
 */
export function classify(s, { cd = -3 } = {}) {
  const { t, p } = s;
  const north = s.lat >= 0;
  // 여름 반년: 북반구 4~9월, 남반구 10~3월
  const summerIdx = (north ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2]);
  const winterIdx = (north ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8]);
  const MAT = sum(t) / 12, MAP = sum(p);
  const Thot = Math.max(...t), Tcold = Math.min(...t);
  const iHot = t.indexOf(Thot), iCold = t.indexOf(Tcold);
  const Ps = summerIdx.map((i) => p[i]), Pw = winterIdx.map((i) => p[i]);
  const Psum = sum(Ps), Pwin = sum(Pw);
  const Pdry = Math.min(...p), iDry = p.indexOf(Pdry);
  const Psdry = Math.min(...Ps), Pswet = Math.max(...Ps), Pwdry = Math.min(...Pw), Pwwet = Math.max(...Pw);
  // 건조 한계(mm): 증발량을 기온으로 가늠하고, 비가 언제 오는지도 따진다
  // (여름비는 금방 증발해 더 많이 와야 하므로 기준이 높다)
  const season = Pwin >= 0.7 * MAP ? 'winter' : Psum >= 0.7 * MAP ? 'summer' : 'even';
  const add = season === 'winter' ? 0 : season === 'summer' ? 280 : 140;
  const Pth = 20 * MAT + add;
  const steps = [];
  const near = [];
  let code = '';

  // ① 한대: 가장 따뜻한 달이 10℃에도 못 미치면 나무가 자라지 못한다
  if (Thot < 10) {
    code = Thot > 0 ? 'ET' : 'EF';
    steps.push({ k: 'E', text: `가장 따뜻한 ${MONTH(iHot)}도 ${deg(Thot)}로 10℃에 못 미칩니다`, result: 'E 한대' });
    steps.push({
      k: code, text: Thot > 0 ? `그래도 ${deg(Thot)}로 0℃보다 높아 여름에 땅이 녹습니다` : `가장 따뜻한 달도 0℃ 이하라 얼음이 녹지 않습니다`,
      result: NAMES[code],
    });
    if (Math.abs(Thot - 10) < 1) near.push('한대와 그 밖의 경계(최난월 10℃)에 가깝습니다');
    return finish();
  }
  steps.push({ k: 'notE', text: `가장 따뜻한 ${MONTH(iHot)}이 ${deg(Thot)}로 10℃ 이상입니다`, result: '한대 아님' });

  // ② 건조: 비가 증발할 수 있는 양보다 적은가
  const seasonText = { winter: '비의 70% 이상이 겨울 반년에 와서 0을 더합니다', summer: '비의 70% 이상이 여름 반년에 와서 280을 더합니다', even: '비가 계절에 고루 와서 140을 더합니다' }[season];
  const dryLine = Math.max(Pth, 0);
  if (MAP < Pth) {
    const W = MAP < Pth / 2;
    code = 'B' + (W ? 'W' : 'S') + (MAT >= 18 ? 'h' : 'k');
    steps.push({
      k: 'B', text: `연강수량 ${mm(MAP)}이 건조 한계 ${mm(Pth)}보다 적습니다`,
      detail: `건조 한계 = 연평균 기온 ${deg(MAT)} × 20 + 계절 보정. ${seasonText}.`,
      result: 'B 건조',
    });
    steps.push({ k: W ? 'BW' : 'BS', text: W ? `건조 한계의 절반(${mm(Pth / 2)})에도 못 미칩니다` : `건조 한계의 절반(${mm(Pth / 2)})은 넘습니다`, result: W ? 'W 사막' : 'S 스텝' });
    steps.push({ k: code.slice(2), text: `연평균 기온이 ${deg(MAT)}로 18℃ ${MAT >= 18 ? '이상' : '미만'}입니다`, result: MAT >= 18 ? 'h 더운 곳' : 'k 서늘한 곳' });
    if (Math.abs(MAP - Pth) / Math.max(Pth, 1) < 0.1) near.push('건조 기후와 습윤 기후의 경계(건조 한계)에 가깝습니다');
    if (Math.abs(MAP - Pth / 2) / Math.max(Pth / 2, 1) < 0.1) near.push('사막과 스텝의 경계에 가깝습니다');
    return finish();
  }
  steps.push({
    k: 'notB', text: `연강수량 ${mm(MAP)}이 건조 한계 ${mm(dryLine)}보다 많습니다`,
    detail: `건조 한계 = 연평균 기온 ${deg(MAT)} × 20 + 계절 보정. ${seasonText}.`,
    result: '건조 아님',
  });
  if (Math.abs(MAP - Pth) / Math.max(Pth, 1) < 0.1) near.push('건조 기후와 습윤 기후의 경계(건조 한계)에 가깝습니다');

  // ③ 열대 · 온대 · 냉대: 가장 추운 달의 기온
  if (Tcold >= 18) {
    steps.push({ k: 'A', text: `가장 추운 ${MONTH(iCold)}도 ${deg(Tcold)}로 18℃ 이상입니다`, result: 'A 열대' });
    if (Tcold - 18 < 1) near.push('열대와 온대의 경계(최한월 18℃)에 가깝습니다');
    // 가장 건조한 달의 비 — 60mm면 한 달 내내 숲이 마르지 않는다
    if (Pdry >= 60) {
      code = 'Af';
      steps.push({ k: 'f', text: `가장 건조한 ${MONTH(iDry)}에도 ${mm(Pdry)}로 60mm 이상 옵니다`, result: 'f 건기 없음' });
    } else if (Pdry >= 100 - MAP / 25) {
      code = 'Am';
      steps.push({ k: 'm', text: `가장 건조한 ${MONTH(iDry)}은 ${mm(Pdry)}지만, 연강수량이 많아 건기에도 숲이 버팁니다`, detail: `기준: 100 − 연강수량 ÷ 25 = ${mm(100 - MAP / 25)}`, result: 'm 몬순' });
    } else {
      code = 'Aw';
      steps.push({ k: 'w', text: `가장 건조한 ${MONTH(iDry)}이 ${mm(Pdry)}로 뚜렷한 건기가 있습니다`, detail: `몬순 기준(100 − 연강수량 ÷ 25 = ${mm(100 - MAP / 25)})에도 못 미칩니다`, result: 'w 건기와 우기' });
    }
    return finish();
  }
  const isC = Tcold > cd;
  const G = isC ? 'C' : 'D';
  steps.push({
    k: G, text: isC ? `가장 추운 ${MONTH(iCold)}이 ${deg(Tcold)}로 18℃ 미만이고 ${cd}℃보다 높습니다` : `가장 추운 ${MONTH(iCold)}이 ${deg(Tcold)}로 ${cd}℃ 이하입니다`,
    result: isC ? 'C 온대' : 'D 냉대',
  });
  if (Math.abs(Tcold - cd) < 1) near.push(`온대와 냉대의 경계(최한월 ${cd}℃)에 가깝습니다`);
  if (18 - Tcold < 1) near.push('열대와 온대의 경계(최한월 18℃)에 가깝습니다');

  // ④ 비가 어느 계절에 모자란가
  let second = 'f';
  if (Psdry < 40 && Psdry < Pwwet / 3 && Psdry < Pwdry) {
    second = 's';
    steps.push({ k: 's', text: `여름의 가장 건조한 달이 ${mm(Psdry)}로 40mm 미만이고, 겨울의 가장 습한 달(${mm(Pwwet)})의 1/3도 안 됩니다`, result: 's 여름 건조' });
  } else if (Pwdry < Pswet / 10 && Pwdry < Psdry) {
    second = 'w';
    steps.push({ k: 'w', text: `겨울의 가장 건조한 달이 ${mm(Pwdry)}로, 여름의 가장 습한 달(${mm(Pswet)})의 1/10(${mm(Pswet / 10)})보다 적습니다`, result: 'w 겨울 건조' });
  } else {
    steps.push({ k: 'f', text: `여름 건조(s)나 겨울 건조(w)의 기준에 들지 않습니다`, detail: `여름 가장 건조한 달 ${mm(Psdry)} · 겨울 가장 건조한 달 ${mm(Pwdry)}`, result: 'f 연중 습윤' });
    if (Pwdry < Pswet / 10 * 1.25 && Pwdry < Psdry) near.push('겨울 건조(w)의 기준에 가깝습니다');
  }

  // ⑤ 여름이 얼마나 더운가
  const warm = t.filter((v) => v >= 10).length;
  let third;
  if (Thot >= 22) {
    third = 'a';
    steps.push({ k: 'a', text: `가장 따뜻한 달이 ${deg(Thot)}로 22℃ 이상입니다`, result: 'a 더운 여름' });
    if (Thot - 22 < 0.5) near.push('여름 기온이 a와 b의 경계(22℃)에 가깝습니다');
  } else if (warm >= 4) {
    third = 'b';
    steps.push({ k: 'b', text: `22℃를 넘는 달은 없지만 10℃ 이상인 달이 ${warm}개월(4개월 이상)입니다`, result: 'b 따뜻한 여름' });
    if (22 - Thot < 0.5) near.push('여름 기온이 a와 b의 경계(22℃)에 가깝습니다');
  } else if (G === 'D' && Tcold <= -38) {
    third = 'd';
    steps.push({ k: 'd', text: `10℃ 이상인 달이 ${warm}개월뿐이고, 가장 추운 달이 ${deg(Tcold)}로 -38℃ 이하입니다`, result: 'd 혹독한 겨울' });
  } else {
    third = 'c';
    steps.push({ k: 'c', text: `10℃ 이상인 달이 ${warm}개월뿐입니다`, result: 'c 짧은 여름' });
  }
  code = G + second + third;
  return finish();

  function finish() {
    return {
      code, group: code[0], name: NAMES[code] || '', steps, near,
      stats: { MAT: r1(MAT), MAP: r1(MAP), Thot, Tcold, iHot, iCold, range: r1(Thot - Tcold), Pdry, iDry, Pwet: Math.max(...p), iWet: p.indexOf(Math.max(...p)), season, Pth: r1(Pth) },
    };
  }
}

// 남반구 자료를 북반구 계절에 맞춰 6개월 미는 보기(1월 자리에 7월 값)
export const shiftHalfYear = (arr) => arr.slice(6).concat(arr.slice(0, 6));
