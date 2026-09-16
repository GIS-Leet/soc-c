// 5단계 — 할 일 위젯 스냅샷·좌석표 모델 테스트
import XCTest
@testable import Desk

final class Stage5Tests: XCTestCase {
    func test_위젯_할일_정렬_라벨_토글() {
        let a = WidgetTodo(id: "a", text: "done", done: true, due: nil), b = WidgetTodo(id: "b", text: "no due", done: false, due: nil), c = WidgetTodo(id: "c", text: "due", done: false, due: "2026-09-10")
        XCTAssertEqual(WidgetTodo.order([a, b, c]).map(\.id), ["c", "b", "a"])
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; let now = f.date(from: "2026-09-09 15:00")!
        XCTAssertEqual(WidgetTodo.dueLabel("2026-09-09", now: now), "오늘")
        XCTAssertEqual(WidgetTodo.dueLabel("2026-09-10", now: now), "내일")
        XCTAssertEqual(WidgetTodo.dueLabel("2026-09-07", now: now), "지남 2일")
        XCTAssertEqual(WidgetTodo.dueLabel("2026-10-01", now: now), "10/1")
        XCTAssertEqual(WidgetTodo.toggled([a, b], id: "b").map(\.done), [true, true])
        let data = try! JSONEncoder().encode([a, c]); XCTAssertEqual(try! JSONDecoder().decode([WidgetTodo].self, from: data), [a, c])
    }
    func test_공지_파싱_최신순() {
        let raw: [String: Any] = ["a": ["date": "2026.09.01", "text": "첫 공지", "createdAt": 1000.0], "b": ["date": "2026.09.09", "text": "둘째", "createdAt": 2000.0], "c": ["nope": 1]]
        let ns = Notice.parse(raw)
        XCTAssertEqual(ns.map(\.text), ["둘째", "첫 공지"])
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; XCTAssertEqual(Notice.dateString(f.date(from: "2026-08-06")!), "2026.08.06")
    }
    func test_좌석표_평문_왕복() {
        var c = SeatChart(id: "x", name: "2-3", rows: 2, cols: 3)
        XCTAssertEqual(c.seats.count, 6)
        c.seats[c.index(1, 2)] = "s1"; c.cycle("s1", on: "2026-09-09")
        let back = SeatChart.from("x", c.plain)!
        XCTAssertEqual(back, c)
        XCTAssertEqual(back.seats[5], "s1"); XCTAssertNil(back.seats[0])
        XCTAssertEqual(back.mark("s1", on: "2026-09-09"), "지각")
        XCTAssertTrue(JSONSerialization.isValidJSONObject(c.plain))
        XCTAssertEqual(SeatChart(id: "y", name: "big", rows: 20, cols: 0).seats.count, 8 * 1)
    }
    func test_출석_순환과_집계() {
        var c = SeatChart(id: "x", name: "a", rows: 1, cols: 2, seats: ["s1", "s2"])
        let d = "2026-09-09"
        c.cycle("s1", on: d); XCTAssertEqual(c.mark("s1", on: d), "지각")
        c.cycle("s1", on: d); XCTAssertEqual(c.mark("s1", on: d), "결석")
        c.cycle("s1", on: d); XCTAssertEqual(c.mark("s1", on: d), "조퇴")
        c.cycle("s1", on: d); XCTAssertNil(c.mark("s1", on: d)); XCTAssertTrue(c.counts(on: d).isEmpty)
        c.cycle("s1", on: d); c.cycle("s2", on: d); c.cycle("s2", on: d); c.cycle("s2", on: "2026-09-10")
        XCTAssertEqual(c.counts(on: d), ["지각": 1, "결석": 1])
        XCTAssertEqual(SeatChart.summary([c], student: "s2"), ["결석": 1, "지각": 1])
        XCTAssertEqual(SeatChart.summaryText(SeatChart.summary([c], student: "s2")), "지각 1 · 결석 1")
        XCTAssertNil(SeatChart.plainAttendanceNil(c))
    }
}
private extension SeatChart {
    static func plainAttendanceNil(_ c: SeatChart) -> Any? { var e = c; e.attendance = [:]; return e.plain["attendance"] }
}
