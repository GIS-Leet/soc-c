# 강의 영상 — YouTube 일부 공개 + 홈페이지 학번 인증 + Desk 관리 (설계)

작성 2026-09-13. 사용자 승인: A안(Firebase 익명 로그인 + 보안 규칙 명단 대조), 시청 기록 포함, 관리 창구는 Desk 앱(iPhone·iPad·Mac Catalyst 공용, PC desk.html은 손대지 않음).

## 1. 목적과 범위

- 선생님이 찍은 강의 영상을 YouTube에 **일부 공개(unlisted)** 로 올리고, 그 링크를 Desk 앱에서 등록·관리한다.
- 학생은 홈페이지(nyuheatgis.com)의 새 페이지 **`lecture.html`** 에서 **학번 + 이름** 으로 1차 인증을 통과한 뒤에만 영상 목록을 보고 재생한다. 인증 전에는 영상 ID가 브라우저로 내려가지 않는다.
- 학생의 **시청 기록**(어디까지 봤는지)이 Firebase에 남고, 선생님만 Desk 앱에서 본다.
- 범위 밖: YouTube 파일 업로드 자동화, 영상 링크 유출 자체의 차단(YouTube 특성상 불가), PC desk.html 관리 화면.

## 2. 데이터 모델 (Firebase RTDB `soc-c-qna`)

모든 시각은 ms(Unix epoch), 기존 desk 노드와 같다.

```
roster/{h}                  { sid: "20315", name: "홍길동", at: ms }      선생님만 읽기·쓰기
members/{uid}               { h, sid, name, at }                          학생 본인 쓰기(명단 대조 통과 시만), 본인·선생님 읽기
videos/{id}                 { yt: "dQw4w9WgXcQ", title, unit, date: "2026-09-13", order: Int, note, createdAt: ms }
                                                                          선생님 쓰기, 인증된 학생·선생님 읽기
views/{videoId}/{uid}       { sec: Double(도달 최대 초), dur: Double, n: Int(재생 횟수), at: ms, done: Bool }
                                                                          학생 본인 쓰기(인증된 경우), 선생님 읽기
```

**해시 규칙 `h`** (홈페이지 JS와 Desk Swift가 반드시 같은 값을 내야 한다):

1. 학번: 숫자만 남긴다(공백·하이픈 제거).
2. 이름: 모든 공백 제거 후 유니코드 NFC 정규화.
3. `h = SHA-256( sid + "|" + name )` 의 소문자 hex 64자.
4. 테스트 벡터: `("20315","홍길동")` 과 `(" 2 0 3 1 5","홍 길 동")` 모두 → `9505a804043275e25ca8d4b6af8824b211854d9869d1ed25b057f60ac96abf3d`.

`videos.id` 는 push 키. `order` 는 목록 정렬(작을수록 위), 같은 값이면 `date` 내림차순. `unit` 은 자유 문자열(예 "3.1 기후 환경")이고 목록에서 묶음 제목으로 쓴다. `done` 은 `sec / dur >= 0.9`.

## 3. 보안 규칙 (사용자가 콘솔에 직접 추가)

`TEACHER` = `auth != null && auth.token.email === 'leetae712@gmail.com'`. 기존 규칙에 아래 네 블록을 추가한다.

```json
"roster": {
  ".read":  "auth != null && auth.token.email === 'leetae712@gmail.com'",
  ".write": "auth != null && auth.token.email === 'leetae712@gmail.com'"
},
"members": {
  "$uid": {
    ".read":  "auth != null && (auth.uid === $uid || auth.token.email === 'leetae712@gmail.com')",
    ".write": "auth != null && auth.uid === $uid && newData.child('h').isString() && root.child('roster').child(newData.child('h').val()).exists()",
    ".validate": "newData.hasChildren(['h']) && newData.child('h').val().matches(/^[0-9a-f]{64}$/)"
  }
},
"videos": {
  ".read":  "auth != null && (auth.token.email === 'leetae712@gmail.com' || (root.child('members').child(auth.uid).child('h').isString() && root.child('roster').child(root.child('members').child(auth.uid).child('h').val()).exists()))",
  ".write": "auth != null && auth.token.email === 'leetae712@gmail.com'"
},
"views": {
  ".read": "auth != null && auth.token.email === 'leetae712@gmail.com'",
  "$vid": {
    "$uid": {
      ".read":  "auth != null && auth.uid === $uid",
      ".write": "auth != null && auth.uid === $uid && root.child('members').child(auth.uid).child('h').isString() && root.child('roster').child(root.child('members').child(auth.uid).child('h').val()).exists()",
      ".validate": "newData.child('sec').isNumber() && newData.child('dur').isNumber() && newData.child('n').isNumber() && newData.child('at').isNumber() && newData.child('done').isBoolean()"
    }
  }
}
```

원리: 학생은 익명 로그인으로 uid를 받은 뒤 `members/{uid}` 에 `{h, sid, name, at}` 을 쓴다. 규칙은 `roster/{h}` 가 존재할 때만 쓰기를 허용하므로 **쓰기 성공 = 인증 통과**. 이후 `videos` 읽기와 `views` 쓰기는 매번 "이 uid 의 h 가 명단에 있는가"를 확인한다. 명단에서 지우면 즉시 차단된다. `roster` 는 학생이 읽을 수 없어 해시 목록도 노출되지 않는다.

**사용자가 직접 할 일**: (1) Firebase 콘솔 → Authentication → Sign-in method → **익명** 사용 설정. (2) 위 규칙 반영. (3) 영상은 YouTube 앱/Studio에서 일부 공개로 업로드.

## 4. 홈페이지 `lecture.html` (GitHub GIS-Leet/soc-c)

**골격**: library.html 을 본으로 한다 — 같은 `<head>`(gtag·테마 스크립트·Pretendard·stratum.css·geo.css), 같은 마스트헤드(`header.st-glass.st-bar` + `nav.geo-nav`), 같은 모바일 메뉴(`div.geo-menu`), 같은 푸터, `stratum.js`·`geo.js`. Firebase 는 study.html 과 같은 10.8.1 모듈 방식, `authDomain: "soc-c-qna.web.app"` (firebaseapp.com 은 ISP 차단).

**내비 링크**: 7개 페이지(index, library, progress, qna, simulators, feedback, support) 각각의 데스크톱 `nav.geo-nav` 와 모바일 `.geo-menu__links` 에 `<a class="lg" href="lecture.html">강의 영상</a>` 을 「자료실」 다음에 넣는다. lecture.html 에서는 그 링크에 `on` 클래스. `sw.js` 는 desk 셸 전용이라 손대지 않는다.

**화면 흐름**:

1. 진입 → 히어로(`sheet-num` "수업 영상", `sheet-title` "Lecture", 설명 한 줄) → 본문은 상태에 따라 셋 중 하나.
2. **게이트**(미인증): `st-card` 안에 학번(`inputmode=numeric`)·이름 입력 두 칸과 「확인」 버튼. 익명 로그인 → h 계산(WebCrypto `crypto.subtle.digest`) → `set(members/{uid}, {h, sid, name, at: serverTimestamp})`. 성공하면 `localStorage['lecture-id'] = {sid, name}` 저장 후 목록으로. `PERMISSION_DENIED` 이면 "명단에 없는 학번 또는 이름입니다. 다시 확인해 주세요." 한 문장만(무엇이 틀렸는지 노출 안 함). 그 외 오류는 메시지 그대로.
3. **목록**(인증됨): `videos` 를 `onValue` 로 받아 `unit` 별로 묶고 `order`→`date` 순 정렬. 각 항목은 `st-row`: 왼쪽 썸네일(`https://i.ytimg.com/vi/{yt}/mqdefault.jpg`, 16:9, 폭 96px), 제목(`st-row__title`), 메타(`날짜 · 메모`), 오른쪽에 내 진행률(`views/{id}/{uid}` 의 sec/dur, 0%면 표시 없음, done 이면 `st-badge--success` "시청 완료"). 상단 오른쪽에 작은 텍스트 "홍길동 · 20315 · 다른 사람으로" (누르면 localStorage 삭제 + signOut → 게이트).
4. **재생**: 항목 클릭 → 같은 페이지에서 목록 위에 플레이어 카드가 열린다(`st-card`, 16:9, 닫기 버튼). YouTube IFrame Player API(`https://www.youtube.com/iframe_api`, `host: 'https://www.youtube-nocookie.com'`, `playerVars: {rel:0, modestbranding:1, playsinline:1}`). 마지막 위치(`sec`)가 있으면 그 지점부터 재생(`start`).
5. **시청 기록**: 재생 중 15초마다, 그리고 `PAUSED`/`ENDED` 이벤트와 `pagehide` 때 `update(views/{id}/{uid}, {sec: max(이전 sec, currentTime), dur, n, at, done})`. `n` 은 `PLAYING` 으로 처음 들어갈 때 1 증가(영상당 세션 1회). `done = sec/dur >= 0.9`.
6. **자동 재인증**: 페이지 로드 시 `onAuthStateChanged` 로 uid 가 있고 `members/{uid}` 를 읽을 수 있으면 바로 목록. uid 가 없는데 `localStorage['lecture-id']` 가 있으면 조용히 익명 로그인 + members 쓰기를 다시 시도하고, 실패하면 게이트(입력값은 미리 채움).

**오류 처리**: Firebase 로드 실패·네트워크 오류는 `st-callout` 한 줄로 표시하고 다시 시도 버튼. 규칙 미반영 상태(익명 로그인 꺼짐)는 `auth/operation-not-allowed` 로 오므로 "관리자 설정이 아직 안 되었습니다"로 표시.

**디자인**: STRATUM 규칙 그대로 — 토큰만 사용, 유리는 마스트헤드에만, 읽는 내용은 `st-card`/`st-row`. 모바일(학생 폰) 우선, 데스크톱에서는 목록 2열(`st-grid--2`) 없이 한 열 유지(썸네일 행이라 한 열이 읽기 쉬움). 사용자 디자인 톤 규칙(AI 티 금지, 홈페이지 톤 = STRATUM 현재 버전)을 따른다.

## 5. Desk 앱 (`~/project/study_app`)

### 5.1 공용 코드 (`Shared/Lecture.swift` — 앱·공유 확장 둘 다 컴파일)

- `enum YouTubeID { static func parse(_ s: String) -> String? }`: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/live/`, `youtube.com/embed/`, `m.youtube.com`, 11자 ID 자체(`[A-Za-z0-9_-]{11}`) 인식. 그 외 nil.
- `enum RosterHash { static func h(sid:name:) -> String; static func normalize(sid:) / (name:) }`: 2절 규칙, CryptoKit SHA256.
- `struct RosterLine { static func parse(_ text: String) -> [(sid: String, name: String)] }`: 한 줄에 "학번 이름"(공백·탭·쉼표 구분, 순서는 숫자 덩어리가 학번), 빈 줄·숫자 없는 줄 무시, 중복 학번은 마지막 것.

### 5.2 모델 (`Study/Data/LectureModels.swift`)

- `struct LectureVideo: Identifiable, Equatable { id, yt, title, unit, date, order, note, createdAt; var thumb: URL; static func parse(_:) -> [LectureVideo] }` (정렬: order 오름차순 → date 내림차순).
- `struct RosterEntry { h, sid, name, at }`, `struct Member { uid, h, sid, name, at }`, `struct ViewRecord { videoId, uid, sec, dur, n, at, done; var pct: Double }`.
- `DeskStore` 에 `@Published var videos: [LectureVideo]`, `roster: [String: RosterEntry]`(키 h), `members: [Member]`, `views: [String: [String: ViewRecord]]`(videoId → uid). 스트림 4개 추가: `videos`, `roster`, `members`, `views`. 파생: `func watchers(of video) -> [(member: Member, rec: ViewRecord?)]`(명단 이름으로 표시), `func verifiedCount`.
- 쓰기: `addVideo(yt:title:unit:date:note:)`(order = 현재 최소 order − 1, 즉 맨 위), `updateVideo`, `deleteVideo`, `moveVideo`(order 재부여), `publishRoster(entries:)`(`roster` 전체를 PUT — 명단 = 붙여 넣은 목록 그대로), `removeRosterEntry(h)`. 기존 `WriteQueue` 경로(`qput/qpatch/qdelete`)를 그대로 써서 오프라인 큐·낙관적 갱신을 유지한다.

### 5.3 화면

- `ClassHubView` 첫 섹션에 `NavigationLink { LectureVideosView() } label: Label("강의 영상", systemImage: "play.rectangle")` 를 「자료함」 다음에, `NavigationLink { RosterView() }` "홈페이지 명단" 은 「학생 · 좌석표 · 상담」 다음에.
- `Study/Desk/LectureVideosView.swift`
  - 목록: `unit` 별 Section, 행 = 썸네일(AsyncImage, 폭 88) + 제목 + `날짜 · 시청 n/m명`. 비어 있으면 `EmptyHint`(icon "play.rectangle", "강의 영상이 없습니다", "YouTube 앱에서 공유 → Desk 「강의 영상」, 또는 오른쪽 위 + 로 링크를 붙여 넣으세요.").
  - 툴바 `+` → `AddVideoSheet`: URL 칸(붙여넣기 버튼, `UIPasteboard.general.string` 에서 YouTube ID 인식되면 자동 채움), 제목, 단원, 날짜(DatePicker), 메모. Mac Catalyst 에서도 동일(공유 확장 없음). 저장은 `store.addVideo`.
  - 스와이프: 삭제(확인 없음, 낙관적). 편집: 상세 화면 툴바 「편집」 → 같은 시트.
  - 상세 `LectureVideoDetail`: 상단 16:9 `WKWebView` 임베드(`https://www.youtube-nocookie.com/embed/{yt}?playsinline=1&rel=0`), 아래 「시청 현황」 Section — 명단(roster)의 모든 학생을 학번 순으로, 시청한 학생은 진행률 막대(ClassHubView.classRow 와 같은 Capsule 막대) + 마지막 시청 시각, 안 본 학생은 회색 "—". 헤더에 "시청 n / 명단 m · 완료 k". 정렬 토글 없음(YAGNI).
- `Study/Desk/RosterView.swift`
  - 상단 설명 한 줄 + 「명단 붙여넣기」 버튼 → 시트에 `TextEditor`(예시 placeholder "20315 홍길동"), 붙여 넣은 텍스트를 `RosterLine.parse` 로 미리 보기(n명 인식, 오류 줄 표시) → 「게시」 = `publishRoster`. 기존 명단이 있으면 "기존 m명을 이 n명으로 바꿉니다" 확인.
  - 목록: 학번 순, 각 행 = 학번·이름 + 인증 여부(`members` 중 같은 h 가 있으면 `checkmark.seal.fill` 초록 + 인증 시각, 없으면 회색). 헤더 "인증 k / m". 스와이프 삭제 = 그 학생 차단.
- `DeskShare/ShareView.swift`: `Target` 에 `.lecture = "강의 영상"` 추가. 로드 시 `items.url` 또는 텍스트에서 `YouTubeID.parse` 가 성공하면 기본 target = `.lecture`, 피커를 항상 보이게(파일 없어도). lecture 폼 = 제목(YouTube 공유 텍스트가 있으면 그것, 없으면 빈칸)·단원·날짜·메모. 저장 = `RTDB.push("videos", …)` 직접(확장은 DeskStore 없음), order 는 `RTDB.get("videos")` 로 최소값 − 1. `project.yml` DeskShare sources 에 `Shared/Lecture.swift` 추가.

### 5.4 오류 처리

- 명단 게시·영상 저장 실패는 기존 `Report.shared.fail` 로 표시. 공유 확장은 폼 아래 빨간 한 줄(기존 방식).
- `videos` 읽기 실패(규칙 미반영)는 DeskStore 의 기존 스트림 재연결 로직에 맡긴다(별도 처리 없음).

## 6. 테스트

**Desk (StudyTests, XCTest)**

- `LectureTests.swift`: `YouTubeID.parse` 7가지 URL 형태 + 실패 3개, `RosterHash.h` 테스트 벡터 2개(2절), `RosterLine.parse`(구분자·빈 줄·중복·순서 바뀜), `LectureVideo.parse` 정렬, `ViewRecord.pct` 와 `done`.
- 스냅샷·UI 테스트는 추가하지 않는다(기존 시뮬 러너가 자주 멈춤). 대신 시뮬레이터 실행 스크린샷으로 화면 확인.

**홈페이지 (임시 클론 안에서 node)**

- `lecture.html` 의 해시 함수를 `tests/lecture-hash.test.mjs` 에서 같은 벡터로 검사(페이지 안 함수는 `window.LectureHash` 로 노출해 node 에서 문자열 추출·평가). package.json 에 `"test": "node --test tests/"` 추가.
- 브라우저 흐름 검사(Browser pane): 게이트 표시 → 잘못된 학번 → 오류 문구 → (규칙·익명 로그인이 준비된 뒤) 실제 학번으로 통과 → 목록 → 재생 → `views` 기록 확인. 준비 전이면 게이트·오류 문구·레이아웃(모바일·다크)까지만 확인하고 그 사실을 보고한다.

## 7. 순서

1. Desk 앱: Shared/Lecture.swift + 테스트 → 모델·스토어 → 화면 → 공유 확장 → 빌드·시뮬 확인 → 커밋.
2. 홈페이지: 임시 클론 → 브랜치 `lecture` → lecture.html + 내비 7페이지 + 테스트 → PR → 클론 삭제.
3. 사용자: 익명 로그인 켜기, 규칙 반영, 명단 게시, 영상 1개 등록 → 폰에서 통과·차단·시청 기록 검증.
