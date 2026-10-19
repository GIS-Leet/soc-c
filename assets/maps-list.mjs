// 통합사회 GIS 지도 — 지도 목록. maps.html(목록)과 map-*.html(각 판의 머리 · 앞뒤 이동)이 함께 쓴다.
// course: 1 통합사회1 · 2 통합사회2 / unit: 단원(교육과정 대단원 · 성취 기준 주제) / concept: 이 판에서 해 보는 GIS 분석
export const MAPS = [
  { id: 'perspectives', course: 1, unit: 'Ⅰ 통합적 관점', title: '새만금 간척과 통합적 관점',
    q: '새만금 간척을 시간적 · 공간적 · 사회적 · 윤리적 관점에서 각각 보면 무엇이 드러나는가?', concept: '레이어 중첩 · 위성 영상 시계열' },
  { id: 'livability', course: 1, unit: 'Ⅱ 인간, 사회, 환경과 행복', title: '살기 좋은 곳의 기준과 시·도 순위',
    q: '기준과 무게를 바꾸면 시·도의 순위는 어떻게 달라지는가?', concept: '다기준 평가(가중 중첩)' },
  { id: 'shelter', course: 1, unit: 'Ⅲ 자연환경과 인간 · 자연재해와 안전권', title: '서울 지진 대피 장소까지의 거리',
    q: '지진이 나면 걸어서 몇 분 안에 대피 장소에 닿을 수 있는가? 닿지 못하는 곳은 어디인가?', concept: '버퍼 · 중첩' },
  { id: 'culture', course: 1, unit: 'Ⅳ 문화와 다양성', title: '종교 · 언어 분포와 기후',
    q: '종교와 언어의 분포는 기후의 경계와 얼마나 겹치는가?', concept: '분포 지도 · 중첩' },
  { id: 'distance', course: 1, unit: 'Ⅴ 생활공간과 사회', title: '도시 사이의 거리와 이동 시간',
    q: '지도 위의 거리와 자동차로 걸리는 시간은 어떻게 다른가?', concept: '시간 거리 · 네트워크' },
  { id: 'fieldwork', course: 1, unit: 'Ⅴ 생활공간과 사회 · 지역 조사', title: '지역 조사 지도 도구',
    q: '조사한 지역의 문제를 지도에 표시하고 거리와 넓이를 잰다.', concept: '측정 · 레이어 · 지도 만들기' },
  { id: 'mobility', course: 2, unit: 'Ⅰ 인권 보장과 헌법', title: '서울 지하철역의 승강기와 이동권',
    q: '휠체어를 타고 지하철역을 오르내리고 갈아탈 수 있는가?', concept: '접근성' },
  { id: 'access', course: 2, unit: 'Ⅱ 사회정의와 불평등', title: '응급실까지 걸리는 시간',
    q: '가장 가까운 응급실까지 걸리는 시간은 사는 곳에 따라 얼마나 다른가?', concept: '네트워크 분석 · 서비스 권역' },
  { id: 'supply', course: 2, unit: 'Ⅲ 시장 경제와 지속가능발전 · 국제 분업', title: '스마트폰 부품과 완성품의 무역 흐름',
    q: '스마트폰 부품을 만드는 나라, 조립하는 나라, 사 가는 나라는 각각 어디인가?', concept: '흐름(OD) 지도' },
  { id: 'refugees', course: 2, unit: 'Ⅳ 세계화와 평화', title: '난민의 출신국과 비호국',
    q: '난민은 주로 어느 나라로 가는가? 이웃 나라로 가는 비율은 얼마인가?', concept: '흐름 지도' },
  { id: 'boundaries', course: 2, unit: 'Ⅳ 세계화와 평화 · 동아시아 갈등', title: '동아시아 바다의 경계',
    q: '영해와 배타적 경제 수역은 어떤 기준으로 정하고, 왜 이웃 나라와 겹치는가?', concept: '영역 레이어 · 중첩' },
  { id: 'aging', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 인구 문제', title: '시·군·구별 고령화와 인구 감소',
    q: '고령화와 인구 감소는 어느 시·군·구에서 더 심한가?', concept: '단계 구분도' },
  { id: 'sealevel', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 기후변화 대응', title: '해수면 상승과 해안 침수',
    q: '해수면이 오르면 우리나라 해안의 어느 곳이 먼저 잠기는가?', concept: '수치 표고 모델(DEM) 분석' },
  { id: 'energy', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 에너지 자원', title: '태양광 · 풍력 발전 적지',
    q: '태양광 · 풍력 발전기는 어디에 세울 수 있는가? 자원이 풍부한 곳이 곧 적지인가?', concept: '적지 분석' },
];
export const COURSES = { 1: '통합사회1', 2: '통합사회2' };
export const byId = (id) => MAPS.find((m) => m.id === id);
/** 같은 과목 안의 앞 · 뒤 판 */
export function neighbors(id) {
  const i = MAPS.findIndex((m) => m.id === id);
  return { prev: MAPS[i - 1] || null, next: MAPS[i + 1] || null };
}
