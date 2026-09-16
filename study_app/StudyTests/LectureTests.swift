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
    func test_탐색위치와_실제시청비율_분리() {
        let views=ViewRecord.parse(["vid":["u":["sec":99,"dur":100,"watchedSec":3,"progressVersion":2,"n":1,"at":1,"done":false]]])
        XCTAssertEqual(views["vid"]?["u"]?.pct,0.03)
        XCTAssertEqual(views["vid"]?["u"]?.sec,99)
        XCTAssertEqual(views["vid"]?["u"]?.measured,true)
    }
    func test_학생의여러기록은탐색위치대신시청기준으로선택() {
        let far=ViewRecord(sec:99,dur:100,n:1,at:1,done:false,watchedSec:3,progressVersion:2)
        let watched=ViewRecord(sec:30,dur:100,n:1,at:2,done:false,watchedSec:80,progressVersion:2)
        XCTAssertEqual(ViewRecord.best([far,watched]),watched)
    }
}
