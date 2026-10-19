// 지도로 읽는 통합사회 — 지도 목록. maps.html(목록)과 map-*.html(각 판의 머리 · 앞뒤 이동)이 함께 쓴다.
// course: 1 통합사회1 · 2 통합사회2 / unit: 단원(교육과정 대단원 · 성취 기준 주제) / concept: 이 판에서 해 보는 GIS 분석
export const MAPS = [
  { id: 'perspectives', course: 1, unit: 'Ⅰ 통합적 관점', title: '한 장소, 네 관점 — 새만금',
    q: '같은 바다와 갯벌을 시간 · 공간 · 사회 · 윤리의 눈으로 보면 무엇이 달리 보일까?', concept: '레이어 중첩 · 위성 영상 시계열' },
  { id: 'livability', course: 1, unit: 'Ⅱ 인간, 사회, 환경과 행복', title: '어디가 살기 좋은가',
    q: '살기 좋은 곳의 기준을 바꾸면 시·도의 순위는 어떻게 달라질까?', concept: '다기준 평가(가중 중첩)' },
  { id: 'shelter', course: 1, unit: 'Ⅲ 자연환경과 인간 · 자연재해와 안전권', title: '대피소까지 몇 분?',
    q: '지진이 나면 걸어서 몇 분 안에 대피 장소에 닿을 수 있을까? 닿지 못하는 곳은 어디일까?', concept: '버퍼 · 중첩' },
  { id: 'culture', course: 1, unit: 'Ⅳ 문화와 다양성', title: '문화권은 왜 거기서 갈리나',
    q: '종교와 언어의 분포는 기후 · 지형의 경계와 어떻게 겹칠까?', concept: '분포 지도 · 중첩' },
  { id: 'distance', course: 1, unit: 'Ⅴ 생활공간과 사회', title: '줄어드는 거리',
    q: '지도 위의 거리와 실제로 걸리는 시간은 어떻게 다를까? 교통이 바꾸는 것은 무엇일까?', concept: '시간 거리 · 네트워크' },
  { id: 'fieldwork', course: 1, unit: 'Ⅴ 생활공간과 사회 · 지역 조사', title: '우리 동네 조사 도구',
    q: '지역의 문제를 지도 위에서 재고, 표시하고, 설명해 보자.', concept: '측정 · 레이어 · 지도 만들기' },
  { id: 'mobility', course: 2, unit: 'Ⅰ 인권 보장과 헌법', title: '이동권 지도',
    q: '휠체어를 탄 사람에게도 같은 도시일까?', concept: '접근성' },
  { id: 'access', course: 2, unit: 'Ⅱ 사회정의와 불평등', title: '몇 분 안에 닿는가',
    q: '응급실까지 걸리는 시간은 사는 곳에 따라 얼마나 다를까?', concept: '네트워크 분석 · 서비스 권역' },
  { id: 'supply', course: 2, unit: 'Ⅲ 시장 경제와 지속가능발전 · 국제 분업', title: '스마트폰 한 대의 지도',
    q: '부품은 어디서 만들고, 어디서 조립하며, 어디로 팔려 갈까?', concept: '흐름(OD) 지도' },
  { id: 'refugees', course: 2, unit: 'Ⅳ 세계화와 평화', title: '난민은 어디서 어디로',
    q: '분쟁을 피해 떠난 사람들은 어디로 향할까? 생각보다 가까운 곳일까?', concept: '흐름 지도' },
  { id: 'boundaries', course: 2, unit: 'Ⅳ 세계화와 평화 · 동아시아 갈등', title: '선 하나의 의미',
    q: '바다 위의 선은 어떤 기준으로 긋고, 왜 서로 겹칠까?', concept: '영역 레이어 · 중첩' },
  { id: 'aging', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 인구 문제', title: '사라지는 마을',
    q: '고령화와 인구 감소는 어느 시·군·구에서 먼저, 더 빠르게 일어날까?', concept: '단계 구분도' },
  { id: 'sealevel', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 기후변화 대응', title: '바닷물이 1m 오르면',
    q: '해수면이 오르면 우리 해안의 어디가 먼저 잠길까?', concept: '수치 표고 모델(DEM) 분석' },
  { id: 'energy', course: 2, unit: 'Ⅴ 미래와 지속가능한 삶 · 에너지 자원', title: '햇빛과 바람의 지도',
    q: '태양광과 풍력 발전기는 어디에 세워야 할까? 자원이 많은 곳이 곧 좋은 곳일까?', concept: '적지 분석' },
];
export const COURSES = { 1: '통합사회1', 2: '통합사회2' };
export const byId = (id) => MAPS.find((m) => m.id === id);
/** 같은 과목 안의 앞 · 뒤 판 */
export function neighbors(id) {
  const i = MAPS.findIndex((m) => m.id === id);
  return { prev: MAPS[i - 1] || null, next: MAPS[i + 1] || null };
}
