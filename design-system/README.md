# STRATUM — Leet's Geographia 디자인 시스템 v1.0

Astryx(토큰 구조 · 정보 밀도)와 Apple 휴먼 인터페이스 가이드라인(레이어 · 재질 · 유동적 모션)을
하나로 합친 디자인 시스템. 빌드 도구 없이 정적 HTML에 바로 붙는다.

문서 페이지: [`design-system/index.html`](index.html) — 모든 토큰과 컴포넌트를 시스템 자신으로 만든 살아있는 스타일 가이드.

## 파일

| 파일 | 내용 |
| --- | --- |
| `stratum.css` | 토큰(색·간격·반경·타이포·모션·재질) + 기본 스타일 + 컴포넌트 |
| `stratum.js` | 스프링 · 관성 투사 · 고무줄 · 시트 · 세그먼티드 · 테마. 의존성 없음 |
| `index.html` | 문서 겸 데모 |

## 붙이는 법

```html
<!-- <head> — 첫 페인트 깜빡임 방지를 위해 스타일보다 먼저 -->
<script>(function(){try{var t=localStorage.getItem('geo-theme');
  if(t)document.documentElement.dataset.theme=t;}catch(e){}})();</script>
<link rel="stylesheet" href="design-system/stratum.css">

<!-- </body> 직전 -->
<script src="design-system/stratum.js"></script>
```

## 세 개의 지층

화면의 모든 요소는 셋 중 하나에 속한다.

| 층 | 클래스 | 쓰는 곳 |
| --- | --- | --- |
| ③ GLASS 유리층 | `.st-glass`, `.st-bar`, `.st-sheet` | 내비 · 툴바 · 시트 · 팝오버 |
| ② SEDIMENT 퇴적층 | `.st-card`, `.st-row`, `.st-list` | 카드 · 패널 · 리스트 |
| ① BEDROCK 기반층 | `body` 배경 | 페이지 바탕 |

**유리는 조작에만 쓰고 콘텐츠에는 쓰지 않는다.** 읽어야 하는 것은 전부 퇴적층(불투명)에 둔다.
유리 위에 유리를 겹치지 않는다.

## 토큰 규칙

- 모든 값은 토큰. raw hex / px 금지.
- 접두사는 전부 `--st-`. 기존 페이지의 CSS 변수와 충돌하지 않는다.
- 색은 의미로 이름 짓는다. `--st-label`은 "가장 진한 글자색"이지 "검정"이 아니다.
- 다크 모드는 기존 사이트와 같은 `geo-theme` localStorage 키를 공유한다.

## 모션

스프링은 **감쇠비(damping)**와 **response(초)** 두 개로 기술한다.

| 토큰 | damping / response | 쓰는 곳 |
| --- | --- | --- |
| `--st-spring-snappy` | 1.0 / 0.30s | 기본 UI. 오버슛 없음 |
| `--st-spring-smooth` | 1.0 / 0.40s | 큰 표면 이동 |
| `--st-spring-bouncy` | 0.8 / 0.40s | 제스처(플릭·드래그 놓기) 뒤에만 |
| `--st-spring-playful` | 0.68 / 0.45s | 1회성 강조 연출 |

색·투명도처럼 제스처와 무관한 변화에는 스프링 대신 `--st-ease` + `--st-dur-fast`를 쓴다.
표에서 자주 일어나는 hover에 400ms를 넣지 않는다.

```js
const s = new Stratum.Spring({ damping: 1.0, response: 0.4,
  onUpdate: v => el.style.transform = `translateY(${v}px)` });
s.animateTo(0, releaseVelocity);          // 손 뗀 속도를 그대로 인계

new Stratum.Sheet('#my-sheet', { scrim: '#my-scrim' }).open();
```

`Stratum.Spring`의 정지 허용오차는 다루는 값의 규모에 비례한다(`_scale × 0.002`).
px 단위든 0~1 정규화 단위든 같은 상대 정밀도로 멈춘다 — 절대 허용오차를 쓰면
정규화 스프링이 목표에 닿기 전에 멈춘다.

## 접근성 (기본값으로 보장)

- 본문 · 보조 · 메타 글자색 전부 **4.5:1 이상** (라이트 5.1~17.4 · 다크 5.2~14.2)
- 조작 요소 테두리 `--st-border-control`은 3:1 이상. 장식용 헤어라인(`--st-separator`)과 분리
- 터치 타깃 최소 44px — 버튼의 시각 높이(36px)와 무관하게 `::after`로 확보
- `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast: more` 모두 대응
- 크기는 rem — 사용자 글자 크기 설정을 따라 커진다

## 적용 현황

현재 이 시스템을 쓰는 페이지: `design-system/index.html` (문서 페이지).
기존 페이지들(`index.html`, `qna.html`, 시뮬레이터 등)은 아직 각자의 스타일을 쓰고 있으며,
필요할 때 한 페이지씩 옮기면 된다.
