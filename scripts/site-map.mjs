// 사이트 지도 — 상단 드롭다운 · 전체 메뉴 · 첫 화면 바로가기가 모두 이 한 곳에서 나온다(scripts/site-nav.mjs 가 써 넣음)
// 페이지를 더하거나 이름을 바꾸면 여기만 고치고 `node scripts/site-nav.mjs` 를 돌린다.

const KAKAO = 'https://open.kakao.com/o/siXWPozi';

/** 묶음 — 한 페이지는 한 묶음에만 둔다(여러 메뉴에 같은 링크를 되풀이하지 않음) */
export const GROUPS = {
  progress: { title: '진도와 시험', items: [
    { label: '반별 진도', href: 'progress.html#class-progress', desc: '우리 반은 어디까지' },
    { label: '시험 범위', href: 'progress.html#exam-range', desc: '몇 차시부터 몇 차시까지' },
    { label: '전체 수업 계획', href: 'progress.html#lesson-plan', desc: '단원별 차시와 학습 목표' },
  ] },
  study: { title: '공부 자료', items: [
    { label: '자료실', href: 'library.html', desc: '학습지, PPT, 참고자료' },
    { label: '통합사회 기출 문항', href: 'gichul.html', desc: '단원별, 시험별 풀이' },
  ] },
  climate: { title: '3.1 기후 환경', items: [
    { label: '지구 공전과 계절', href: 'climate_3d.html' },
    { label: '적도 수렴대의 이동', href: 'climate_itcz.html' },
    { label: '태양 고도와 일사량', href: 'climate_solar.html' },
  ] },
  landform: { title: '3.2 지형 변화', items: [
    { label: '지형 만들기 스튜디오', href: 'terrain.html' },
    { label: '지형 형성 작용', href: 'dynamic_earth.html' },
    { label: '세계 지형 탐구', href: 'world_landforms.html' },
  ] },
  city: { title: '3.3 도시 공간', items: [
    { label: '서울 대도시권의 확장', href: 'seoul.html' },
    { label: '도시와 인구 변화 실험', href: 'ai_dashboard.html', desc: '녹지, 열섬, 인구' },
  ] },
  data: { title: '지도와 통계', items: [
    { label: '통합사회 GIS 지도', href: 'maps.html', desc: '단원마다 지도 하나' },
    { label: '기후 그래프', href: 'climate.html', desc: '관측소 223곳, 쾨펜 기후' },
    { label: '통계로 보는 세계', href: 'stats.html', desc: '세계 217개국, 우리나라 시·도' },
  ] },
  ask: { title: '질문과 의견', items: [
    { label: 'Q&A 게시판', href: 'qna.html', desc: '수업 내용 질문' },
    { label: '카카오 오픈채팅', href: KAKAO, desc: '정말 급한 질문만', ext: true },
    { label: '건의함', href: 'feedback.html', desc: '수업과 홈페이지 의견' },
    { label: '정보화 기기 문의', href: 'support.html', desc: '기기 고장, 기술 지원' },
  ] },
};

/** 상단 메뉴 — 마우스를 올리면 펼쳐지는 묶음. 묶음이 없는 항목(Q&A · 건의)은 평범한 링크 */
export const NAV = [
  { label: '자료실', href: 'library.html', drop: ['study'] },
  { label: '진도표', href: 'progress.html', drop: ['progress'] },
  { label: 'Q&A', href: 'qna.html' },
  { label: '시뮬레이터', href: 'simulators.html', drop: ['climate', 'landform', 'city', 'data'],
    foot: { text: '단원별로 정리된 전체 목록', link: { label: '시뮬레이터 전체 보기', href: 'simulators.html' } } },
  { label: '건의', href: 'feedback.html' },
];

/** 전체 메뉴(햄버거) · 첫 화면 바로가기 — 모든 페이지가 여기 한 번씩 나온다.
    small: 링크 옆 작은 글씨 — 'desc' 는 설명, 'unit' 은 묶음 제목(단원) */
export const MENU = [
  { title: '진도와 시험', groups: ['progress'], small: 'desc' },
  { title: '공부 자료', groups: ['study'], small: 'desc' },
  { title: '시뮬레이터', groups: ['climate', 'landform', 'city'], small: 'unit',
    first: { label: '시뮬레이터 전체', href: 'simulators.html' } },
  { title: '지도와 통계', groups: ['data'], small: 'desc' },
  { title: '질문과 의견', groups: ['ask'], small: 'desc' },
];
