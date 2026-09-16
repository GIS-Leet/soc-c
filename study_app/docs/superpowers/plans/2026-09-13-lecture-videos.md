# 강의 영상(YouTube 일부 공개 + 홈페이지 학번 인증 + Desk 관리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님이 YouTube 일부 공개로 올린 강의 영상을 Desk 앱에서 등록·관리하고, 학생은 홈페이지 `lecture.html`에서 학번·이름 인증 뒤 보며, 시청 기록을 선생님만 Desk에서 본다.

**Architecture:** Firebase RTDB 에 `roster`(명단 해시)·`members`(인증된 익명 uid)·`videos`·`views` 네 노드를 두고, 보안 규칙이 "uid 의 해시가 명단에 있는가"를 매번 확인한다(서버 코드 없음). Desk 앱은 기존 `DeskStore` 스트림·`WriteQueue` 경로로 네 노드를 읽고 쓰며, 공용 코드(`Shared/Lecture.swift`)는 앱·공유 확장·테스트가 함께 컴파일한다. 홈페이지는 library.html 골격 + STRATUM 디자인 시스템 + Firebase 10.8.1 모듈 SDK 로 페이지 하나를 추가한다.

**Tech Stack:** SwiftUI(iOS 17+, Mac Catalyst), CryptoKit, WKWebView, XCTest, XcodeGen(`~/project/bin/xcodegen`, `./setup.sh`); 정적 HTML + Firebase JS SDK 10.8.1 + YouTube IFrame Player API, node `--test`.

**Spec:** `docs/superpowers/specs/2026-09-13-lecture-videos-design.md`

## Global Constraints

- 새 소스 파일 첫 줄은 역할을 설명하는 한국어 한 줄 주석(Swift `//`, JS `//`).
- 해시 규칙: 학번은 0~9 숫자만, 이름은 공백 제거 후 NFC, `sha256(sid + "|" + name)` 소문자 hex. 테스트 벡터 `("20315","홍길동")` → `9505a804043275e25ca8d4b6af8824b211854d9869d1ed25b057f60ac96abf3d`.
- Firebase 경로 이름 고정: `roster/{h}`, `members/{uid}`, `videos/{id}`, `views/{videoId}/{uid}`. 시각은 ms.
- 홈페이지 Firebase `authDomain` 은 `soc-c-qna.web.app`(firebaseapp.com 은 ISP 차단). 홈페이지 소스는 GitHub `GIS-Leet/soc-c` 에만 두고, 작업은 scratchpad 임시 클론 → 브랜치 → PR → 클론 삭제. 로컬 `~/project/*.html` 사본은 쓰지 않는다.
- 홈페이지 디자인은 STRATUM(`design-system/stratum.css`) 토큰·컴포넌트만 사용, raw hex/px 금지, 유리(`st-glass`)는 마스트헤드에만.
- Desk 앱 UI 문구·톤은 기존 화면과 같게(존댓말 안내문, 기존 `EmptyHint`·`DeskTheme`·`scaledFont` 사용). PC desk.html 은 건드리지 않는다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Xcode 프로젝트는 XcodeGen 산출물이다. **Swift 파일을 새로 만들면 `./setup.sh` 로 프로젝트를 다시 생성**해야 빌드에 들어간다.
- 테스트 실행: `xcodebuild test -project Desk.xcodeproj -scheme Desk -destination 'id=E0C61F58-1ED3-4FE7-8DBA-7D3E42118960' -only-testing:DeskTests/LectureTests 2>&1 | tail -30` (부팅된 시뮬 "Test iPhone 3"). 러너가 멈추면 `xcodebuild build-for-testing` 후 `test-without-building` 으로 나눠 실행.

---

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `Shared/Lecture.swift` (새) | `YouTubeID.parse`, `RosterHash`, `RosterLine` — 순수 함수, 앱·확장·테스트 공용 |
| `Study/Data/LectureModels.swift` (새) | `LectureVideo`, `RosterEntry`, `Member`, `ViewRecord` 파싱·정렬 |
| `Study/Data/DeskStore.swift` (수정) | 네 노드 스트림·`@Published`, `addVideo/updateVideo/deleteVideo/publishRoster/removeRosterEntry`, `watchers(of:)` |
| `Study/Desk/LectureVideosView.swift` (새) | 목록·추가/편집 시트·상세(임베드 + 시청 현황) |
| `Study/Desk/RosterView.swift` (새) | 명단 붙여넣기·게시·인증 여부 |
| `Study/Desk/ClassHubView.swift` (수정) | 두 링크 추가 |
| `DeskShare/ShareView.swift` (수정) + `project.yml` (수정) | 「강의 영상」 갈래 |
| `StudyTests/LectureTests.swift` (새) | 파서·해시·모델 테스트 |
| soc-c `lecture.html` (새) | 학생 페이지 |
| soc-c `tests/lecture-hash.test.mjs` (새), `package.json` (수정) | 해시 동일성 검사 |
| soc-c 7개 페이지 (수정) | 내비 링크 ×2 |

---

### Task 1: 공용 코드 — YouTube ID·명단 해시·명단 파서

**Files:**
- Create: `Shared/Lecture.swift`
- Test: `StudyTests/LectureTests.swift`

**Interfaces:**
- Produces: `YouTubeID.parse(_ s: String) -> String?`, `RosterHash.h(sid: String, name: String) -> String`, `RosterHash.sid(_:) -> String`, `RosterHash.name(_:) -> String`, `RosterLine.Entry {sid, name}`, `RosterLine.parse(_ text: String) -> [RosterLine.Entry]`.

- [ ] **Step 1: 실패하는 테스트 작성**

```swift
// 강의 영상 공용 코드·모델 테스트 — YouTube ID 추출, 명단 해시(홈페이지와 같은 벡터), 명단 파싱, 영상·시청 기록 파싱
import XCTest
@testable import Desk

final class LectureTests: XCTestCase {
    func test_유튜브_ID_추출() {
        let id = "dQw4w9WgXcQ"
        for s in ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?si=abc", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
                  "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                  "3.1 기후 환경 강의 https://youtu.be/dQw4w9WgXcQ 보세요", "dQw4w9WgXcQ"] {
            XCTAssertEqual(YouTubeID.parse(s), id, s)
        }
        XCTAssertNil(YouTubeID.parse("https://vimeo.com/12345"))
        XCTAssertNil(YouTubeID.parse("https://www.youtube.com/"))
        XCTAssertNil(YouTubeID.parse("그냥 글"))
    }
    func test_명단_해시_벡터() {
        let v = "9505a804043275e25ca8d4b6af8824b211854d9869d1ed25b057f60ac96abf3d"
        XCTAssertEqual(RosterHash.h(sid: "20315", name: "홍길동"), v)
        XCTAssertEqual(RosterHash.h(sid: " 2 0 3 1 5", name: "홍 길 동"), v)
        XCTAssertEqual(RosterHash.h(sid: "20315", name: "홍길동".decomposedStringWithCanonicalMapping), v)
    }
    func test_명단_파싱() {
        let e = RosterLine.parse("20315 홍길동\n\n20316\t김 철수\n이름없음\n20317,박영희\n20315 홍길순\n")
        XCTAssertEqual(e.map(\.sid), ["20315", "20316", "20317"])
        XCTAssertEqual(e.map(\.name), ["홍길순", "김철수", "박영희"])
        XCTAssertEqual(RosterLine.parse("홍길동 20315").first?.sid, "20315")
    }
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd ~/project/study_app && ./setup.sh >/dev/null && xcodebuild test -project Desk.xcodeproj -scheme Desk -destination 'id=E0C61F58-1ED3-4FE7-8DBA-7D3E42118960' -only-testing:DeskTests/LectureTests 2>&1 | grep -E "error:|Testing failed|BUILD" | head`
Expected: 컴파일 오류 `cannot find 'YouTubeID' in scope`.

- [ ] **Step 3: 구현**

```swift
// 강의 영상 공용 코드 — YouTube ID 추출, 명단 해시(홈페이지 lecture.html 과 같은 규칙), 명단 텍스트 파싱. 앱·공유 확장·테스트가 함께 컴파일
import Foundation
import CryptoKit

enum YouTubeID {
    private static let idRe = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{11}$")
    private static let urlRe = try! NSRegularExpression(pattern: "https?://[^\\s<>\"']+")
    private static func isID(_ s: String) -> Bool { idRe.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }
    /// URL·공유 텍스트·ID 자체에서 11자 영상 ID 를 꺼낸다. YouTube 가 아니면 nil
    static func parse(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if isID(t) { return t }
        guard let m = urlRe.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)), let r = Range(m.range, in: t),
              let u = URL(string: String(t[r])), let host = u.host?.lowercased() else { return nil }
        guard host == "youtu.be" || host.hasSuffix("youtube.com") || host.hasSuffix("youtube-nocookie.com") else { return nil }
        let comps = u.pathComponents.filter { $0 != "/" }
        var cand: String? = nil
        if host == "youtu.be" { cand = comps.first }
        else if let v = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value { cand = v }
        else if comps.count >= 2, ["shorts", "live", "embed", "v"].contains(comps[0]) { cand = comps[1] }
        guard let c = cand, isID(c) else { return nil }
        return c
    }
}

enum RosterHash {
    static func sid(_ s: String) -> String { s.filter { ("0"..."9").contains($0) } }
    static func name(_ s: String) -> String { s.filter { !$0.isWhitespace }.precomposedStringWithCanonicalMapping }
    /// sha256(학번|이름) 소문자 hex — 홈페이지 lecture.html 의 hashId 와 같은 값이어야 한다
    static func h(sid: String, name: String) -> String {
        SHA256.hash(data: Data((Self.sid(sid) + "|" + Self.name(name)).utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum RosterLine {
    struct Entry: Equatable { let sid: String; let name: String }
    /// 한 줄 = "학번 이름"(공백·탭·쉼표 구분, 순서 무관). 숫자 덩어리가 학번, 나머지를 합친 것이 이름. 같은 학번은 마지막 줄이 남는다
    static func parse(_ text: String) -> [Entry] {
        var out: [String: Entry] = [:]; var order: [String] = []
        for raw in text.split(whereSeparator: \.isNewline) {
            let parts = raw.split { $0 == " " || $0 == "\t" || $0 == "," }.map(String.init)
            guard let sid = parts.first(where: { $0.count >= 3 && $0.allSatisfy { ("0"..."9").contains($0) } }) else { continue }
            let name = RosterHash.name(parts.filter { $0 != sid }.joined())
            guard !name.isEmpty else { continue }
            if out[sid] == nil { order.append(sid) }
            out[sid] = Entry(sid: sid, name: name)
        }
        return order.compactMap { out[$0] }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: 2단계와 같은 명령. Expected: `** TEST SUCCEEDED **`, LectureTests 3개 통과.

- [ ] **Step 5: 커밋**

```bash
cd ~/project/study_app && git add Shared/Lecture.swift StudyTests/LectureTests.swift && git commit -m "강의 영상 공용 코드: YouTube ID 추출·명단 해시·명단 파서 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 모델과 스토어

**Files:**
- Create: `Study/Data/LectureModels.swift`
- Modify: `Study/Data/DeskStore.swift` (`@Published` 목록 22행 부근, `streams` 47행 부근 `desk/settings/github` 항목 뒤, 쓰기 메서드는 `requestMaterial` 223행 뒤)
- Test: `StudyTests/LectureTests.swift` (추가)

**Interfaces:**
- Consumes: `FB.dict`, `FB.ms`, `RTDB.pushKey()`, `DeskStore.qput/qpatch/qdelete`, `RosterHash.h`, `RosterLine.Entry`.
- Produces: `LectureVideo {id, yt, title, unit, date, order: Double, note, createdAt; thumb: URL; embed: URL; plain}`, `LectureVideo.parse(_:) -> [LectureVideo]`, `RosterEntry {h, sid, name, at}` + `parse -> [String: RosterEntry]`, `Member {uid, h, sid, name, at}` + `parse -> [Member]`, `ViewRecord {sec, dur, n, at, done; pct}` + `parse -> [String: [String: ViewRecord]]`; DeskStore `videos`, `roster`, `members`, `views`, `addVideo(yt:title:unit:date:note:)`, `updateVideo(_ v: LectureVideo)`, `deleteVideo(_ id: String)`, `publishRoster(_ entries: [RosterLine.Entry])`, `removeRosterEntry(_ h: String)`, `watchers(of: LectureVideo) -> [(entry: RosterEntry, rec: ViewRecord?)]`, `isVerified(_ h: String) -> Bool`.

- [ ] **Step 1: 실패하는 테스트 추가** (LectureTests 클래스 안에)

```swift
    func test_영상_파싱_정렬() {
        let v = LectureVideo.parse(["a": ["yt": "aaaaaaaaaaa", "title": "A", "unit": "3.1", "date": "2026-09-10", "order": 2, "createdAt": 1.0],
                                    "b": ["yt": "bbbbbbbbbbb", "title": "B", "unit": "3.1", "date": "2026-09-12", "order": 2],
                                    "c": ["yt": "ccccccccccc", "title": "C", "unit": "3.2", "date": "2026-09-01", "order": -1],
                                    "x": ["title": "yt 없음"]])
        XCTAssertEqual(v.map(\.id), ["c", "b", "a"])
        XCTAssertEqual(v[0].thumb.absoluteString, "https://i.ytimg.com/vi/ccccccccccc/mqdefault.jpg")
        XCTAssertEqual(v[0].embed.absoluteString, "https://www.youtube-nocookie.com/embed/ccccccccccc?playsinline=1&rel=0")
    }
    func test_명단_회원_시청_파싱() {
        let r = RosterEntry.parse(["h1": ["sid": "20315", "name": "홍길동", "at": 5.0]])
        XCTAssertEqual(r["h1"]?.name, "홍길동")
        let m = Member.parse(["u1": ["h": "h1", "sid": "20315", "name": "홍길동", "at": 7.0], "u2": ["sid": "x"]])
        XCTAssertEqual(m.map(\.uid), ["u1"])
        let views = ViewRecord.parse(["vid": ["u1": ["sec": 90, "dur": 100, "n": 2, "at": 1.0, "done": true]]])
        XCTAssertEqual(views["vid"]?["u1"]?.pct, 0.9); XCTAssertEqual(views["vid"]?["u1"]?.n, 2)
        XCTAssertEqual(ViewRecord(sec: 10, dur: 0, n: 1, at: 0, done: false).pct, 0)
    }
```

- [ ] **Step 2: 실패 확인**

Run: Task 1 의 테스트 명령. Expected: `cannot find 'LectureVideo' in scope`.

- [ ] **Step 3: 모델 구현** — `Study/Data/LectureModels.swift`

```swift
// 강의 영상 모델 — videos(영상)·roster(명단 해시)·members(인증된 학생)·views(시청 기록) Firebase JSON 을 구조체로. 경로·필드는 홈페이지 lecture.html 과 동일
import Foundation

struct LectureVideo: Identifiable, Equatable {
    var id: String; var yt: String; var title: String; var unit: String; var date: String; var order: Double; var note: String; var createdAt: Double
    var thumb: URL { URL(string: "https://i.ytimg.com/vi/\(yt)/mqdefault.jpg")! }
    var embed: URL { URL(string: "https://www.youtube-nocookie.com/embed/\(yt)?playsinline=1&rel=0")! }
    var plain: [String: Any] { ["yt": yt, "title": title, "unit": unit, "date": date, "order": order, "note": note, "createdAt": createdAt] }
    static func parse(_ any: Any?) -> [LectureVideo] {
        FB.dict(any).compactMap { k, v -> LectureVideo? in
            guard let d = v as? [String: Any], let yt = d["yt"] as? String else { return nil }
            return LectureVideo(id: k, yt: yt, title: d["title"] as? String ?? "", unit: d["unit"] as? String ?? "", date: d["date"] as? String ?? "",
                                order: FB.ms(d["order"]), note: d["note"] as? String ?? "", createdAt: FB.ms(d["createdAt"]))
        }.sorted { $0.order != $1.order ? $0.order < $1.order : $0.date > $1.date }
    }
}

struct RosterEntry: Identifiable, Equatable {
    var h: String; var sid: String; var name: String; var at: Double
    var id: String { h }
    static func parse(_ any: Any?) -> [String: RosterEntry] {
        FB.dict(any).reduce(into: [:]) { acc, kv in
            guard let d = kv.value as? [String: Any], let sid = d["sid"] as? String, let name = d["name"] as? String else { return }
            acc[kv.key] = RosterEntry(h: kv.key, sid: sid, name: name, at: FB.ms(d["at"]))
        }
    }
}

struct Member: Identifiable, Equatable {
    var uid: String; var h: String; var sid: String; var name: String; var at: Double
    var id: String { uid }
    static func parse(_ any: Any?) -> [Member] {
        FB.dict(any).compactMap { k, v -> Member? in
            guard let d = v as? [String: Any], let h = d["h"] as? String else { return nil }
            return Member(uid: k, h: h, sid: d["sid"] as? String ?? "", name: d["name"] as? String ?? "", at: FB.ms(d["at"]))
        }.sorted { $0.at > $1.at }
    }
}

struct ViewRecord: Equatable {
    var sec: Double; var dur: Double; var n: Int; var at: Double; var done: Bool
    var pct: Double { dur > 0 ? min(1, sec / dur) : 0 }
    /// views/{videoId}/{uid}
    static func parse(_ any: Any?) -> [String: [String: ViewRecord]] {
        FB.dict(any).reduce(into: [:]) { acc, kv in
            let inner = FB.dict(kv.value).reduce(into: [String: ViewRecord]()) { a, u in
                guard let d = u.value as? [String: Any] else { return }
                a[u.key] = ViewRecord(sec: FB.ms(d["sec"]), dur: FB.ms(d["dur"]), n: Int(FB.ms(d["n"])), at: FB.ms(d["at"]), done: (d["done"] as? Bool) ?? false)
            }
            if !inner.isEmpty { acc[kv.key] = inner }
        }
    }
}
```

- [ ] **Step 4: DeskStore 수정**

`@Published var github: GitHubFiles? = nil` 줄 아래에:

```swift
    @Published var videos: [LectureVideo] = []                 // videos — 강의 영상(홈페이지 공개)
    @Published var roster: [String: RosterEntry] = [:]         // roster — 홈페이지 인증 명단(키 = 해시)
    @Published var members: [Member] = []                      // members — 인증을 마친 학생(익명 uid)
    @Published var views: [String: [String: ViewRecord]] = [:] // views — videoId → uid → 시청 기록
```

`streams` 의 `("desk/settings/github", …)` 항목 뒤에:

```swift
        ("videos", { self.videos = LectureVideo.parse($0) }),
        ("roster", { self.roster = RosterEntry.parse($0) }),
        ("members", { self.members = Member.parse($0) }),
        ("views", { self.views = ViewRecord.parse($0) }),
```

`requestMaterial` 메서드 뒤에:

```swift
    // MARK: 강의 영상·홈페이지 명단
    func addVideo(yt: String, title: String, unit: String, date: String, note: String) {
        let id = RTDB.pushKey()
        let v = LectureVideo(id: id, yt: yt, title: title, unit: unit, date: date, order: (videos.map(\.order).min() ?? 0) - 1, note: note, createdAt: Date().timeIntervalSince1970 * 1000)
        videos = LectureVideo.parse([id: v.plain]) + videos; qput("videos/\(id)", v.plain)
    }
    func updateVideo(_ v: LectureVideo) {
        if let i = videos.firstIndex(where: { $0.id == v.id }) { videos[i] = v }
        qpatch("videos/\(v.id)", ["title": v.title, "unit": v.unit, "date": v.date, "note": v.note, "yt": v.yt])
    }
    func deleteVideo(_ id: String) { videos.removeAll { $0.id == id }; qdelete("videos/\(id)"); qdelete("views/\(id)") }
    /// 붙여 넣은 명단으로 roster 전체를 바꾼다(해시 = 홈페이지와 같은 규칙)
    func publishRoster(_ entries: [RosterLine.Entry]) {
        let now = Date().timeIntervalSince1970 * 1000
        let plain = entries.reduce(into: [String: Any]()) { $0[RosterHash.h(sid: $1.sid, name: $1.name)] = ["sid": $1.sid, "name": $1.name, "at": now] }
        roster = RosterEntry.parse(plain); qput("roster", plain.isEmpty ? NSNull() : plain)
    }
    func removeRosterEntry(_ h: String) { roster[h] = nil; qdelete("roster/\(h)") }
    func isVerified(_ h: String) -> Bool { members.contains { $0.h == h } }
    /// 명단 전체를 학번 순으로, 각 학생의 이 영상 시청 기록(여러 uid 로 인증했으면 가장 많이 본 것)
    func watchers(of v: LectureVideo) -> [(entry: RosterEntry, rec: ViewRecord?)] {
        let recs = views[v.id] ?? [:]
        return roster.values.sorted { $0.sid < $1.sid }.map { e in
            let mine = members.filter { $0.h == e.h }.compactMap { recs[$0.uid] }.max { $0.sec < $1.sec }
            return (e, mine)
        }
    }
```

`RTDB.pushKey()` 가 없다면(`grep -n pushKey Study/Data/RTDB.swift` 로 확인) `RTDB` enum 에 추가:

```swift
    /// Firebase push 키와 같은 모양(시간순 정렬)의 로컬 키
    static func pushKey() -> String {
        let chars = Array("-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz")
        var ms = Int(Date().timeIntervalSince1970 * 1000); var s = ""
        for _ in 0..<8 { s = String(chars[ms % 64]) + s; ms /= 64 }
        return s + String((0..<12).map { _ in chars[Int.random(in: 0..<64)] })
    }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `./setup.sh >/dev/null && xcodebuild test … -only-testing:DeskTests/LectureTests` (Task 1 명령). Expected: 5개 통과. 또 `-only-testing:DeskTests/DeskModelsTests` 도 통과(기존 파싱 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add Study/Data/LectureModels.swift Study/Data/DeskStore.swift Study/Data/RTDB.swift StudyTests/LectureTests.swift && git commit -m "강의 영상 모델·스토어: videos/roster/members/views 스트림과 쓰기, 시청 현황 계산

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 강의 영상 화면(목록·추가/편집·상세)

**Files:**
- Create: `Study/Desk/LectureVideosView.swift`
- Modify: `Study/Desk/ClassHubView.swift:17` (자료함 링크 뒤)

**Interfaces:**
- Consumes: Task 2 스토어 API, `YouTubeID.parse`, `EmptyHint(icon:title:text:)`, `DeskTheme.accent/success`, `.desk(.bodyStrong/.label)`, `.scaledFont(_:_:)`, `FB.key(Date)`.
- Produces: `LectureVideosView`, `LectureVideoDetail(video:)`, `VideoFormSheet(video: LectureVideo?, onSave:)`.

- [ ] **Step 1: 화면 구현**

```swift
// 강의 영상 — YouTube 일부 공개 영상 목록(단원별)·링크로 추가/편집·상세(임베드 재생 + 홈페이지 학생 시청 현황). 데이터는 videos/views, 명단은 roster/members
import SwiftUI
import WebKit

struct LectureVideosView: View {
    @EnvironmentObject var store: DeskStore
    @State private var adding = false
    var units: [(unit: String, videos: [LectureVideo])] {
        var order: [String] = []; var byUnit: [String: [LectureVideo]] = [:]
        for v in store.videos { let u = v.unit.isEmpty ? "단원 없음" : v.unit; if byUnit[u] == nil { order.append(u) }; byUnit[u, default: []].append(v) }
        return order.map { ($0, byUnit[$0]!) }
    }
    var body: some View {
        List {
            if store.videos.isEmpty {
                EmptyHint(icon: "play.rectangle", title: "강의 영상이 없습니다", text: "YouTube 앱에서 공유 → Desk 「강의 영상」으로 보내거나, 오른쪽 위 + 에 링크를 붙여 넣으세요. 등록한 영상은 홈페이지에서 학번 인증을 마친 학생에게 보입니다.")
            }
            ForEach(units, id: \.unit) { u in
                Section(u.unit) {
                    ForEach(u.videos) { v in
                        NavigationLink { LectureVideoDetail(video: v) } label: { row(v) }
                            .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteVideo(v.id) } label: { Label("삭제", systemImage: "trash") } }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("강의 영상")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $adding) { VideoFormSheet(video: nil) { yt, t, u, d, n in store.addVideo(yt: yt, title: t, unit: u, date: d, note: n) } }
    }
    func row(_ v: LectureVideo) -> some View {
        let w = store.watchers(of: v); let seen = w.filter { $0.rec != nil }.count
        return HStack(spacing: 12) {
            AsyncImage(url: v.thumb) { $0.resizable().scaledToFill() } placeholder: { Color.primary.opacity(0.06) }
                .frame(width: 88, height: 50).clipShape(RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 3) {
                Text(v.title.isEmpty ? v.yt : v.title).desk(.bodyStrong).lineLimit(2)
                Text([v.date, w.isEmpty ? nil : "시청 \(seen)/\(w.count)명"].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// 추가·편집 공용 시트. onSave(yt, title, unit, date, note)
struct VideoFormSheet: View {
    let video: LectureVideo?
    let onSave: (String, String, String, String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""; @State private var title = ""; @State private var unit = ""; @State private var date = Date(); @State private var note = ""
    var yt: String? { video?.yt ?? YouTubeID.parse(link) }
    var body: some View {
        NavigationStack {
            Form {
                if video == nil {
                    Section {
                        HStack {
                            TextField("YouTube 링크", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled()
                            Button("붙여넣기") { if let s = UIPasteboard.general.string { link = s } }.buttonStyle(.bordered).controlSize(.small)
                        }
                    } footer: { Text(link.isEmpty ? "일부 공개로 올린 영상의 공유 링크를 넣으세요." : (yt == nil ? "YouTube 링크가 아닙니다." : "영상 ID \(yt!)")).foregroundStyle(link.isEmpty || yt != nil ? .secondary : DeskTheme.live) }
                }
                Section("정보") {
                    TextField("제목", text: $title)
                    TextField("단원 (예: 3.1 기후 환경)", text: $unit)
                    DatePicker("날짜", selection: $date, displayedComponents: .date)
                    TextField("메모", text: $note, axis: .vertical)
                }
            }
            .navigationTitle(video == nil ? "영상 추가" : "영상 편집").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("저장") { onSave(yt!, title.trimmingCharacters(in: .whitespaces), unit.trimmingCharacters(in: .whitespaces), FB.key(date), note); dismiss() }.disabled(yt == nil) }
            }
            .onAppear { if let v = video { title = v.title; unit = v.unit; note = v.note; date = FB.day.date(from: v.date) ?? Date() } }
        }
    }
}

struct LectureVideoDetail: View {
    @EnvironmentObject var store: DeskStore
    let video: LectureVideo
    @State private var editing = false
    var current: LectureVideo { store.videos.first { $0.id == video.id } ?? video }
    var body: some View {
        let v = current, w = store.watchers(of: v)
        let seen = w.filter { $0.rec != nil }.count, done = w.filter { $0.rec?.done == true }.count
        List {
            Section {
                EmbedPlayer(url: v.embed).aspectRatio(16 / 9, contentMode: .fit).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                VStack(alignment: .leading, spacing: 4) {
                    Text(v.title.isEmpty ? v.yt : v.title).desk(.title)
                    Text([v.unit, v.date].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    if !v.note.isEmpty { Text(v.note).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            Section {
                if w.isEmpty { Text("홈페이지 명단이 비어 있습니다. 「홈페이지 명단」에서 학번·이름을 게시하면 시청 현황이 여기 나옵니다.").font(.footnote).foregroundStyle(.secondary) }
                ForEach(w, id: \.entry.h) { item in
                    HStack(spacing: 10) {
                        Text(item.entry.sid).scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 52, alignment: .leading)
                        Text(item.entry.name).desk(.body).frame(width: 64, alignment: .leading)
                        if let r = item.rec {
                            GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(r.done ? DeskTheme.success : DeskTheme.accent).frame(width: g.size.width * r.pct) } }.frame(height: 6)
                            Text("\(Int(r.pct * 100))%").scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
                            Text(Date(timeIntervalSince1970: r.at / 1000).formatted(.dateTime.month().day())).font(.caption2).foregroundStyle(.tertiary)
                        } else { Text("—").foregroundStyle(.tertiary); Spacer() }
                    }
                }
            } header: { Text(w.isEmpty ? "시청 현황" : "시청 \(seen) / 명단 \(w.count) · 완료 \(done)") }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("강의 영상").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("편집") { editing = true } } }
        .sheet(isPresented: $editing) { VideoFormSheet(video: v) { _, t, u, d, n in var nv = v; nv.title = t; nv.unit = u; nv.date = d; nv.note = n; store.updateVideo(nv) } }
    }
}

/// youtube-nocookie 임베드 웹뷰(인라인 재생)
struct EmbedPlayer: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        let c = WKWebViewConfiguration(); c.allowsInlineMediaPlayback = true; c.mediaTypesRequiringUserActionForPlayback = []
        let w = WKWebView(frame: .zero, configuration: c); w.isOpaque = false; w.backgroundColor = .black; w.scrollView.isScrollEnabled = false
        w.load(URLRequest(url: url)); return w
    }
    func updateUIView(_ w: WKWebView, context: Context) { if w.url != url { w.load(URLRequest(url: url)) } }
}
```

- [ ] **Step 2: ClassHubView 링크 추가** — `NavigationLink { MaterialsView() } …` 줄 뒤에

```swift
                    NavigationLink { LectureVideosView() } label: { Label("강의 영상", systemImage: "play.rectangle") }
```

- [ ] **Step 3: 빌드 확인**

Run: `./setup.sh >/dev/null && xcodebuild build -project Desk.xcodeproj -scheme Desk -destination 'id=E0C61F58-1ED3-4FE7-8DBA-7D3E42118960' -quiet 2>&1 | grep -E "error|warning: unused" | head; echo "exit ${pipestatus[1]}"`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add Study/Desk/LectureVideosView.swift Study/Desk/ClassHubView.swift && git commit -m "강의 영상 화면: 단원별 목록·링크 추가/편집·임베드 재생·학생 시청 현황

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 홈페이지 명단 화면

**Files:**
- Create: `Study/Desk/RosterView.swift`
- Modify: `Study/Desk/ClassHubView.swift:16` (학생·좌석표·상담 링크 뒤)

**Interfaces:**
- Consumes: `store.roster`, `store.members`, `store.publishRoster`, `store.removeRosterEntry`, `store.isVerified`, `RosterLine.parse`.
- Produces: `RosterView`, `RosterPasteSheet(onPublish:)`.

- [ ] **Step 1: 구현**

```swift
// 홈페이지 명단 — 학번·이름 목록을 붙여 넣어 해시로 게시(roster), 어느 학생이 lecture.html 인증을 마쳤는지(members) 표시. 명단에서 지우면 그 학생은 즉시 차단
import SwiftUI

struct RosterView: View {
    @EnvironmentObject var store: DeskStore
    @State private var pasting = false
    var entries: [RosterEntry] { store.roster.values.sorted { $0.sid < $1.sid } }
    var body: some View {
        let verified = entries.filter { store.isVerified($0.h) }.count
        List {
            Section {
                Text("홈페이지 「강의 영상」은 여기 올린 학번·이름과 맞아야 열립니다. 명단은 해시로만 저장되고 학생은 명단을 볼 수 없습니다.").font(.footnote).foregroundStyle(.secondary)
                Button { pasting = true } label: { Label(entries.isEmpty ? "명단 붙여넣기" : "명단 다시 붙여넣기", systemImage: "doc.on.clipboard") }
            }
            if entries.isEmpty { EmptyHint(icon: "person.text.rectangle", title: "명단이 없습니다", text: "한 줄에 「학번 이름」 형식으로 붙여 넣으면 됩니다. 예) 20315 홍길동") }
            Section {
                ForEach(entries) { e in
                    HStack(spacing: 10) {
                        Text(e.sid).scaledFont(13, mono: true).foregroundStyle(.secondary).frame(width: 56, alignment: .leading)
                        Text(e.name).desk(.body)
                        Spacer()
                        if let m = store.members.first(where: { $0.h == e.h }) {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(DeskTheme.success)
                            Text(Date(timeIntervalSince1970: m.at / 1000).formatted(.dateTime.month().day())).font(.caption2).foregroundStyle(.tertiary)
                        } else { Image(systemName: "seal").foregroundStyle(.quaternary) }
                    }
                    .swipeActions(edge: .trailing) { Button(role: .destructive) { store.removeRosterEntry(e.h) } label: { Label("차단", systemImage: "person.slash") } }
                }
            } header: { if !entries.isEmpty { Text("인증 \(verified) / \(entries.count)") } }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("홈페이지 명단")
        .sheet(isPresented: $pasting) { RosterPasteSheet(existing: entries.count) { store.publishRoster($0) } }
    }
}

struct RosterPasteSheet: View {
    let existing: Int
    let onPublish: ([RosterLine.Entry]) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""; @State private var confirm = false
    var parsed: [RosterLine.Entry] { RosterLine.parse(text) }
    var body: some View {
        NavigationStack {
            Form {
                Section { TextEditor(text: $text).frame(minHeight: 220).scaledFont(15, mono: true) } header: { Text("한 줄에 학번 이름") } footer: { Text(text.isEmpty ? "예) 20315 홍길동" : "\(parsed.count)명 인식") }
                if !parsed.isEmpty { Section("미리 보기") { ForEach(parsed.prefix(5), id: \.sid) { Text("\($0.sid)  \($0.name)").scaledFont(14, mono: true) }; if parsed.count > 5 { Text("… 외 \(parsed.count - 5)명").foregroundStyle(.secondary) } } }
            }
            .navigationTitle("명단 붙여넣기").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("게시") { if existing > 0 { confirm = true } else { onPublish(parsed); dismiss() } }.disabled(parsed.isEmpty) }
            }
            .confirmationDialog("기존 \(existing)명을 이 \(parsed.count)명으로 바꿉니다.", isPresented: $confirm, titleVisibility: .visible) { Button("바꾸기", role: .destructive) { onPublish(parsed); dismiss() } }
        }
    }
}
```

- [ ] **Step 2: ClassHubView 링크** — `NavigationLink { ClassView() } …` 줄 뒤에

```swift
                    NavigationLink { RosterView() } label: { Label("홈페이지 명단", systemImage: "checkmark.seal") }
```

- [ ] **Step 3: 빌드 확인** — Task 3 Step 3 명령. Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add Study/Desk/RosterView.swift Study/Desk/ClassHubView.swift && git commit -m "홈페이지 명단 화면: 학번·이름 붙여넣기 → 해시 게시, 인증 여부·차단

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 공유 확장 「강의 영상」 갈래

**Files:**
- Modify: `DeskShare/ShareView.swift` (Target enum 10행, 폼 22~32행, `.task` 47행, `save()` 57~66행)
- Modify: `project.yml:203-212` (DeskShare sources 에 `Shared/Lecture.swift`)

**Interfaces:**
- Consumes: `YouTubeID.parse`, `RTDB.push/get`, `ShareItems.url/text/noteTitle`.

- [ ] **Step 1: project.yml** — DeskShare `sources` 목록의 `- Shared/DeskColors.swift` 앞에 `- Shared/Lecture.swift` 추가.

- [ ] **Step 2: ShareView 수정**

`enum Target` 을 `case note = "노트", material = "자료", lecture = "강의 영상"` 으로. 상태 추가:

```swift
    @State private var unit = ""; @State private var date = Date(); @State private var note = ""
    var yt: String? { items.flatMap { YouTubeID.parse([$0.url?.absoluteString, $0.text].compactMap { $0 }.joined(separator: " ")) } }
```

폼: 피커 조건을 `if items.hasFiles || yt != nil` 로 바꾸고, 피커의 `ForEach(Target.allCases…)` 는 `ForEach(Target.allCases.filter { $0 != .lecture || yt != nil }, id: \.self)`. `if target == .note { … } else { … }` 를 `if target == .note { … } else if target == .lecture { … } else { … }` 로 하고 lecture 분기:

```swift
                    } else if target == .lecture {
                        Section("강의 영상 · \(yt ?? "")") {
                            TextField("제목", text: $title)
                            TextField("단원 (예: 3.1 기후 환경)", text: $unit)
                            DatePicker("날짜", selection: $date, displayedComponents: .date)
                            TextField("메모", text: $note, axis: .vertical)
                        }
                        Section { Text("홈페이지에서 학번 인증을 마친 학생에게 바로 보입니다.").font(.footnote).foregroundStyle(.secondary) }
                    } else {
```

`.task` 끝: `target = loaded.hasFiles ? .material : .note` 뒤에 `if yt != nil { target = .lecture; title = loaded.text?.components(separatedBy: "\n").first ?? "" }` (YouTube 앱 공유 텍스트는 첫 줄이 제목). 저장 버튼 disabled 조건에 `|| (target == .lecture && yt == nil)` 추가.

`save()` 의 `if target == .note { … }` 뒤에:

```swift
            } else if target == .lecture {
                let all = (try await RTDB.get("videos") as? [String: Any]) ?? [:]
                let minOrder = all.values.compactMap { ($0 as? [String: Any])?["order"] as? Double }.min() ?? 0
                let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
                try await RTDB.push("videos", ["yt": yt!, "title": title, "unit": unit, "date": f.string(from: date), "order": minOrder - 1, "note": note, "createdAt": Date().timeIntervalSince1970 * 1000])
```

- [ ] **Step 3: 빌드·기존 테스트** — `./setup.sh >/dev/null && xcodebuild build …`(Task 3 Step 3) 그리고 `xcodebuild test … -only-testing:DeskTests/LectureTests` 통과.

- [ ] **Step 4: 커밋**

```bash
git add DeskShare/ShareView.swift project.yml && git commit -m "공유 확장: YouTube 링크를 「강의 영상」으로 등록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Desk 앱 화면 확인(시뮬레이터·Catalyst)

**Files:** 없음(검증)

- [ ] **Step 1: iPhone 시뮬 실행·스크린샷** — `xcodebuild build … -destination 'id=E0C61F58-…'` 후 `xcrun simctl install E0C61F58-1ED3-4FE7-8DBA-7D3E42118960 <DerivedData>/Build/Products/Debug-iphonesimulator/Desk.app && xcrun simctl launch --terminate-running-process E0C61F58-… nyuheatgis` 로 실행(픽스처 모드는 `SIMCTL_CHILD_UITEST=1 SIMCTL_CHILD_UITEST_TAB=2`). 수업 탭 → 강의 영상(빈 화면 안내) → + 시트(링크 붙여넣기 문구) → 홈페이지 명단(빈 화면) 순으로 `xcrun simctl io <udid> screenshot` 저장, 눈으로 확인.
- [ ] **Step 2: Catalyst 빌드** — `xcodebuild build -project Desk.xcodeproj -scheme Desk -destination 'platform=macOS,variant=Mac Catalyst' -quiet 2>&1 | grep error` 오류 없음(공유 확장은 iOS 전용이라 제외됨).
- [ ] **Step 3: 커밋 없음.** 문제가 있으면 해당 Task 로 돌아가 고치고 커밋.

---

### Task 7: 홈페이지 — 해시 테스트와 `lecture.html`

**Files:**
- 임시 클론: `cd /private/tmp/claude-501/-Users-leet/75a74946-c555-4554-8a6d-7b02a32f658d/scratchpad && gh repo clone GIS-Leet/soc-c site && cd site && git checkout -b lecture`
- Create: `lecture.html`, `tests/lecture-hash.test.mjs`
- Modify: `package.json` (`"scripts": {"test": "node --test tests/"}`)

**Interfaces:**
- Produces: 전역 `window.LectureHash = { normSid, normName, hashId }` (테스트가 페이지에서 그 스크립트 블록을 잘라 평가).

- [ ] **Step 1: 실패하는 테스트** — `tests/lecture-hash.test.mjs`

```js
// lecture.html 의 학번·이름 해시가 Desk 앱(Shared/Lecture.swift RosterHash)과 같은 값을 내는지 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../lecture.html', import.meta.url), 'utf8');
const m = html.match(/<script id="lecture-hash">([\s\S]*?)<\/script>/);
assert.ok(m, 'lecture.html 에 <script id="lecture-hash"> 블록이 있어야 함');
const window = {}; globalThis.crypto ??= webcrypto;
new Function('window', m[1])(window);
const H = window.LectureHash;

test('정규화', () => {
  assert.equal(H.normSid(' 2 0 3-1 5'), '20315');
  assert.equal(H.normName('홍 길 동'), '홍길동');
  assert.equal(H.normName('홍길동'.normalize('NFD')), '홍길동');
});
test('해시 벡터(Desk 앱과 동일)', async () => {
  const v = '9505a804043275e25ca8d4b6af8824b211854d9869d1ed25b057f60ac96abf3d';
  assert.equal(await H.hashId('20315', '홍길동'), v);
  assert.equal(await H.hashId(' 2 0 3 1 5', '홍 길 동'), v);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/` → `lecture.html` 없음(ENOENT) 으로 실패.

- [ ] **Step 3: `lecture.html` 작성** — library.html 의 `<head>`(gtag·테마 스크립트·폰트·stratum.css·geo.css·apple-mobile 메타), 마스트헤드, 푸터, `.geo-menu` 블록, `stratum.js`·`geo.js` 로드를 **그대로 복사**하되 `<title>강의 영상 — Leet's Geographia Class</title>`, 내비 두 곳에 `<a class="lg on" href="lecture.html">강의 영상</a>` 을 「자료실」 다음에(자료실의 `on` 은 제거). 페이지 전용 부분:

```html
<style>
.wrap { width: 100%; max-width: 1180px; margin: 0 auto; padding-inline: var(--pad-x); }
.rule { height: 1px; background: var(--st-separator); border: 0; margin: 0; max-width: 1180px; margin-inline: auto; }
.lecture { padding-block: clamp(24px, 3vw, 40px) clamp(48px, 7vw, 96px); max-width: 760px; }
.gate { display: grid; gap: var(--st-sp-3); }
.gate .st-field + .st-field { margin-top: 0; }
.gate-row { display: grid; grid-template-columns: 1fr 1.4fr; gap: var(--st-sp-2); }
.gate-err { color: var(--st-danger-ink); min-height: 1.4em; }
.who { display: flex; justify-content: space-between; align-items: center; gap: var(--st-sp-3); margin-bottom: var(--st-sp-3); }
.who button { background: none; border: 0; color: var(--st-accent-ink); font: inherit; cursor: pointer; padding: 0; }
.unit { margin-top: var(--st-sp-6); }
.vrow { cursor: pointer; }
.vrow .thumb { width: 96px; aspect-ratio: 16/9; border-radius: var(--st-r-element); object-fit: cover; background: var(--st-fill-3); flex: none; }
.vrow .st-row__title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.vrow .pct { flex: none; min-width: 3.2em; text-align: right; }
.player { position: relative; margin-bottom: var(--st-sp-4); }
.player .frame { aspect-ratio: 16/9; width: 100%; border-radius: var(--st-r-element); overflow: hidden; background: var(--st-label); }
.player iframe { width: 100%; height: 100%; border: 0; }
.player .st-between { margin-top: var(--st-sp-2); }
[hidden] { display: none !important; }
</style>
```

본문(마스트헤드 다음):

```html
<section class="wrap sheet-head">
  <div class="sheet-num reveal">수업 영상</div>
  <h1 class="sheet-title reveal">Lecture</h1>
  <p class="sheet-meta reveal">수업 내용을 다시 볼 수 있도록 강의 영상을 모아 둡니다.<br>학번과 이름으로 본인 확인을 한 뒤 볼 수 있습니다.</p>
</section>
<hr class="rule">
<main class="wrap lecture">
  <div id="gate" class="st-card" hidden>
    <div class="st-eyebrow">본인 확인</div>
    <form id="gateForm" class="gate" autocomplete="off">
      <div class="gate-row">
        <input class="st-field" id="sid" inputmode="numeric" placeholder="학번" aria-label="학번" required>
        <input class="st-field" id="name" placeholder="이름" aria-label="이름" required>
      </div>
      <p class="st-footnote gate-err" id="gateErr" aria-live="polite"></p>
      <button class="st-btn st-btn--filled" id="gateBtn" type="submit">확인</button>
    </form>
  </div>
  <div id="list" hidden>
    <div class="who st-footnote st-dim"><span id="whoText"></span><button type="button" id="whoReset">다른 사람으로</button></div>
    <div id="player" class="player" hidden>
      <div class="frame"><div id="yt"></div></div>
      <div class="st-between"><span class="st-subhead" id="playerTitle"></span><button class="st-btn st-btn--sm st-btn--outline" id="playerClose" type="button">닫기</button></div>
    </div>
    <div id="units"></div>
    <p class="st-footnote st-dim" id="listEmpty" hidden>아직 올라온 영상이 없습니다.</p>
  </div>
  <p class="st-callout st-dim" id="status">불러오는 중…</p>
</main>
```

해시 블록(`</main>` 뒤, 모듈 스크립트 앞):

```html
<script id="lecture-hash">
// 학번·이름 → 명단 해시. Desk 앱 Shared/Lecture.swift RosterHash 와 같은 규칙(숫자만 | 공백 제거·NFC, sha256 hex)
window.LectureHash = {
  normSid: s => (s || '').replace(/[^0-9]/g, ''),
  normName: s => (s || '').replace(/\s+/g, '').normalize('NFC'),
  hashId: async function (sid, name) {
    const bytes = new TextEncoder().encode(this.normSid(sid) + '|' + this.normName(name));
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
  }
};
</script>
```

모듈 스크립트:

```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
  import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
  import { getDatabase, ref, set, get, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDBgqclt0Qnnal7SlQmoYL-63L0DDplZkM",
    authDomain: "soc-c-qna.web.app",
    databaseURL: "https://soc-c-qna-default-rtdb.firebaseio.com",
    projectId: "soc-c-qna",
    storageBucket: "soc-c-qna.firebasestorage.app",
    messagingSenderId: "927605189358",
    appId: "1:927605189358:web:9ea5171373ac4c9e8661ff"
  };
  const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
  const $ = id => document.getElementById(id);
  const H = window.LectureHash;
  const LS = 'lecture-id';
  const esc = s => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const saved = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };

  let uid = null, videos = [], mine = {}, unsubVideos = null;
  const show = (gate, list, status) => { $('gate').hidden = !gate; $('list').hidden = !list; $('status').hidden = !status; if (status) $('status').textContent = status; };

  // ── 인증: members/{uid} 쓰기 성공 = 명단에 있음 ──
  async function verify(sid, name) {
    if (!auth.currentUser) await signInAnonymously(auth);
    const u = auth.currentUser.uid, h = await H.hashId(sid, name);
    await set(ref(db, `members/${u}`), { h, sid: H.normSid(sid), name: H.normName(name), at: serverTimestamp() });
    localStorage.setItem(LS, JSON.stringify({ sid: H.normSid(sid), name: H.normName(name) }));
    return u;
  }
  function gateError(e) {
    const code = e && (e.code || '') + ' ' + (e.message || '');
    if (/PERMISSION_DENIED|permission_denied/i.test(code)) return '명단에 없는 학번 또는 이름입니다. 다시 확인해 주세요.';
    if (/operation-not-allowed/i.test(code)) return '관리자 설정이 아직 안 되었습니다. 선생님께 알려 주세요.';
    if (/network/i.test(code)) return '네트워크 연결을 확인해 주세요.';
    return '확인에 실패했습니다. ' + (e && e.message ? e.message : '');
  }
  $('gateForm').addEventListener('submit', async ev => {
    ev.preventDefault(); $('gateErr').textContent = ''; $('gateBtn').disabled = true;
    try { uid = await verify($('sid').value, $('name').value); enter(); }
    catch (e) { $('gateErr').textContent = gateError(e); }
    finally { $('gateBtn').disabled = false; }
  });
  $('whoReset').addEventListener('click', async () => { localStorage.removeItem(LS); stop(); await signOut(auth); uid = null; $('sid').value = ''; $('name').value = ''; show(true, false, false); });

  // ── 목록 ──
  function enter() {
    const me = saved(); $('whoText').textContent = me ? `${me.name} · ${me.sid}` : '';
    show(false, true, false);
    unsubVideos = onValue(ref(db, 'videos'), snap => { videos = parseVideos(snap.val()); render(); },
      err => { stop(); show(true, false, false); $('gateErr').textContent = gateError(err); });
  }
  function stop() { if (unsubVideos) unsubVideos(); unsubVideos = null; closePlayer(); }
  function parseVideos(v) {
    return Object.entries(v || {}).map(([id, d]) => ({ id, ...d, order: Number(d.order || 0) })).filter(d => d.yt)
      .sort((a, b) => a.order !== b.order ? a.order - b.order : String(b.date || '').localeCompare(String(a.date || '')));
  }
  async function loadMine() {
    const out = {};
    await Promise.all(videos.map(async v => { try { const s = await get(ref(db, `views/${v.id}/${uid}`)); if (s.exists()) out[v.id] = s.val(); } catch {} }));
    mine = out;
  }
  async function render() {
    await loadMine();
    const units = []; const by = {};
    for (const v of videos) { const u = v.unit || '기타'; if (!by[u]) { by[u] = []; units.push(u); } by[u].push(v); }
    $('listEmpty').hidden = videos.length > 0;
    $('units').innerHTML = units.map(u => `
      <section class="unit"><div class="st-eyebrow">${esc(u)}</div><div class="st-list">${by[u].map(v => {
        const r = mine[v.id], pct = r && r.dur > 0 ? Math.min(100, Math.round(r.sec / r.dur * 100)) : 0;
        const badge = r && r.done ? '<span class="st-badge st-badge--success">시청 완료</span>' : pct > 0 ? `<span class="st-footnote st-dim pct">${pct}%</span>` : '';
        return `<div class="st-row vrow" data-id="${esc(v.id)}" role="button" tabindex="0">
          <img class="thumb" src="https://i.ytimg.com/vi/${esc(v.yt)}/mqdefault.jpg" alt="" loading="lazy">
          <div style="flex:1;min-width:0"><div class="st-row__title">${esc(v.title || v.yt)}</div><div class="st-row__meta">${esc([v.date, v.note].filter(Boolean).join(' · '))}</div></div>${badge}</div>`; }).join('')}</div></section>`).join('');
    $('units').querySelectorAll('.vrow').forEach(el => { const open = () => play(videos.find(v => v.id === el.dataset.id)); el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); });
  }

  // ── 재생·시청 기록 (YouTube IFrame API) ──
  let player = null, current = null, timer = null, counted = false, maxSec = 0;   // counted: 이번 재생 세션의 n 증가 여부
  const ytReady = new Promise(res => { if (window.YT && window.YT.Player) return res(); window.onYouTubeIframeAPIReady = res; const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); });
  async function play(v) {
    if (!v) return; await ytReady; closePlayer();
    current = v; counted = false; maxSec = (mine[v.id] && mine[v.id].sec) || 0;
    $('playerTitle').textContent = v.title || v.yt; $('player').hidden = false; $('player').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const start = mine[v.id] && !mine[v.id].done ? Math.floor(mine[v.id].sec) : 0;
    player = new YT.Player('yt', { host: 'https://www.youtube-nocookie.com', videoId: v.yt,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start, autoplay: 1 },
      events: { onStateChange: e => {
        if (e.data === YT.PlayerState.PLAYING) { if (!timer) timer = setInterval(() => record(false), 15000); record(false); }
        else { if (timer) { clearInterval(timer); timer = null; } if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) record(e.data === YT.PlayerState.ENDED); }
      } } });
  }
  function record(ended) {
    if (!player || !current || !uid) return;
    const dur = player.getDuration ? player.getDuration() : 0; const t = ended ? dur : (player.getCurrentTime ? player.getCurrentTime() : 0);
    maxSec = Math.max(maxSec, t || 0);
    const prev = mine[current.id] || {}; const n = (prev.n || 0) + (counted ? 0 : 1); counted = true;
    const rec = { sec: Math.round(maxSec), dur: Math.round(dur || prev.dur || 0), n, at: Date.now(), done: dur > 0 && maxSec / dur >= 0.9 };
    mine[current.id] = rec;
    update(ref(db, `views/${current.id}/${uid}`), rec).catch(() => {});
  }
  function closePlayer() { if (timer) { clearInterval(timer); timer = null; } if (player) { record(false); try { player.destroy(); } catch {} player = null; } current = null; $('player').hidden = true; const d = document.createElement('div'); d.id = 'yt'; $('player').querySelector('.frame').replaceChildren(d); }
  $('playerClose').addEventListener('click', () => { closePlayer(); render(); });
  window.addEventListener('pagehide', () => record(false));

  // ── 진입: 로그인 상태 + 저장된 학번으로 조용히 재인증 ──
  onAuthStateChanged(auth, async user => {
    const me = saved();
    if (user) {
      try { const s = await get(ref(db, `members/${user.uid}`)); if (s.exists()) { uid = user.uid; return enter(); } } catch {}
    }
    if (me) { try { uid = await verify(me.sid, me.name); return enter(); } catch {} $('sid').value = me.sid; $('name').value = me.name; }
    show(true, false, false);
  });
</script>
```

주의: 학생은 `views` 전체를 읽을 수 없으므로 `mine` 은 `loadMine()` 이 영상별 `views/{id}/{uid}` 를 하나씩 읽는다.

- [ ] **Step 4: 테스트 통과** — `npm test` → 2개 통과.

- [ ] **Step 5: 커밋**

```bash
git add lecture.html tests/lecture-hash.test.mjs package.json && git commit -m "강의 영상 페이지: 학번·이름 인증(익명 로그인 + 명단 해시) 뒤 YouTube 일부 공개 영상 목록·재생·시청 기록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 내비 링크 7개 페이지

**Files:**
- Modify: `index.html`, `library.html`, `progress.html`, `qna.html`, `simulators.html`, `feedback.html`, `support.html` — 각 파일의 `nav.geo-nav` 와 `.geo-menu__links` 안 `<a class="lg" href="library.html">자료실</a>` 줄 뒤.

- [ ] **Step 1: 일괄 삽입**

```bash
cd site && python3 - <<'EOF'
import re
for f in ["index.html","library.html","progress.html","qna.html","simulators.html","feedback.html","support.html"]:
    s = open(f, encoding="utf-8").read()
    n = 0
    def rep(m):
        global n; n += 1
        return m.group(0) + "\n" + m.group(1) + '<a class="lg" href="lecture.html">강의 영상</a>'
    s2 = re.sub(r'^([ \t]*)<a class="(?:fd )?lg(?: on)?"(?: style="--i:\d+")? href="library\.html">자료실</a>', rep, s, flags=re.M)
    assert n == 2, (f, n)
    open(f, "w", encoding="utf-8").write(s2)
    print(f, n)
EOF
```

index.html 의 데스크톱 내비는 `class="fd lg" style="--i:N"` 로 애니메이션 순번이 있다 — 삽입한 링크에도 같은 형식(`class="fd lg" style="--i:2"`)을 주고 뒤 항목들의 `--i` 를 1씩 올린다(수동 편집, `grep -n '\-\-i:' index.html` 로 확인).

- [ ] **Step 2: 확인** — `grep -c 'href="lecture.html"' *.html` 로 7개 파일 각각 2, lecture.html 은 2.

- [ ] **Step 3: 커밋**

```bash
git add *.html && git commit -m "내비에 「강의 영상」 링크

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 브라우저 검증·PR·정리

- [ ] **Step 1: 로컬 서빙** — `.claude/launch.json` 에 `{"name":"site","runtimeExecutable":"python3","runtimeArgs":["-m","http.server","8765"],"port":8765}` 로 Browser pane 에서 `http://localhost:8765/lecture.html` 열기(클론 디렉토리에서). 확인: 게이트 표시, 잘못된 학번 입력 → 오류 문구(익명 로그인이 꺼져 있으면 "관리자 설정이 아직 안 되었습니다"), 콘솔 오류 없음, 모바일(375px)·다크 모드 레이아웃, 내비의 「강의 영상」 링크. 규칙·익명 로그인이 준비돼 있으면 실제 학번으로 통과 → 목록 → 재생 → Firebase `views` 기록까지.
- [ ] **Step 2: PR** — `git push -u origin lecture && gh pr create --title "강의 영상 페이지(학번 인증) + 내비" --body "…(요약, 사용자가 할 일 3가지, 규칙 JSON)…"`. 본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: 클론 삭제** — `rm -rf site`.
- [ ] **Step 4: 메모리 갱신** — `project_homepage_firebase.md` 와 `project_study_app_ios.md` 에 이번 노드·페이지·화면 요약 한 단락씩.
