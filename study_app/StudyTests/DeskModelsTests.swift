// desk 모델 파싱·계산 테스트 (실데이터 모양 기준)
import XCTest
@testable import Desk

final class DeskModelsTests: XCTestCase {
    func test_배열형_사전형_통일() {
        XCTAssertEqual(FB.dict([NSNull(), ["text": "a"]]).keys.sorted(), ["1"])
        XCTAssertEqual(FB.dict(["x": ["text": "a"], "y": NSNull()]).keys.sorted(), ["x"])
    }
    func test_할일_정렬_미완료_마감순() {
        let t = Todo.parse(["a": ["text": "A", "done": true, "createdAt": 1.0], "b": ["text": "B", "done": false, "createdAt": 2.0, "due": "2026-09-12"], "c": ["text": "C", "done": false, "createdAt": 3.0, "due": "2026-09-10"], "d": ["text": "D", "done": false, "createdAt": 1.0]])
        XCTAssertEqual(t.map(\.text), ["C", "B", "D", "A"])
    }
    func test_디데이() {
        let d = DDay(id: "x", label: "수능", date: "2026-11-12")
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
        XCTAssertEqual(d.days(from: f.date(from: "2026-09-09 10:00")!), 64)
        XCTAssertEqual(DDay(id: "y", label: "개학", date: "2026-08-18").days(from: f.date(from: "2026-09-09 10:00")!), -22)
    }
    func test_일정_날짜별() {
        let c = CalEvent.parse(["2026-09-09": ["-a": ["text": "회의"], "-b": ["text": "상담"]], "2026-09-10": ["-c": ["text": "감독"]]])
        XCTAssertEqual(c["2026-09-09"]?.map(\.text), ["회의", "상담"]); XCTAssertEqual(c["2026-09-10"]?.count, 1)
    }
    func test_노트_정렬_제목_미리보기() {
        let n = Note.parse(["a": ["title": "", "md": "**고정 지출**\n\\- 월세", "createdAt": 1.0, "updatedAt": 5.0], "b": ["title": "B", "md": "x", "createdAt": 1.0, "updatedAt": 9.0], "c": ["title": "C", "md": "y", "createdAt": 1.0, "updatedAt": 1.0, "pinned": true]])
        XCTAssertEqual(n.map(\.id), ["c", "b", "a"])
        XCTAssertEqual(n[2].displayTitle, "**고정 지출**"); XCTAssertEqual(n[2].preview, "고정 지출 - 월세")
    }
    func test_연속일() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; let now = f.date(from: "2026-09-09 10:00")!
        XCTAssertEqual(StudyStats.streak(["2026-09-09": 5, "2026-09-08": 7, "2026-09-07": 2], now: now), 3)
        XCTAssertEqual(StudyStats.streak(["2026-09-08": 7, "2026-09-07": 2], now: now), 2)   // 오늘 아직 없으면 어제부터
        XCTAssertEqual(StudyStats.streak(["2026-09-06": 7], now: now), 0)
    }
    func test_JSON트리_put_patch() {
        var s = JSONTree.set(nil, [], ["a": ["text": "x"]])
        s = JSONTree.set(s, ["b", "text"], "y")
        XCTAssertEqual((FB.dict(s)["b"] as? [String: Any])?["text"] as? String, "y")
        s = JSONTree.set(s, ["a"], nil)
        XCTAssertNil(FB.dict(s)["a"])
    }
}
