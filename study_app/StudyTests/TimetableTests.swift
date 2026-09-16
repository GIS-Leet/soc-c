// 시간표 파싱·현재/다음 수업·알림 대상 테스트
import XCTest
@testable import Desk

final class TimetableTests: XCTestCase {
    func date(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    let json: [String: Any] = ["tue": [NSNull(), "106 통사2C", NSNull(), "101 통사2C", NSNull(), "108 통사2C", "109 통사2C"], "wed": ["2": "107 통사2C", "4": "102 통사2D"]]

    func test_배열형과_사전형() {
        let t = Timetable.parse(json)
        XCTAssertEqual(t.days["tue"], [1: "106 통사2C", 3: "101 통사2C", 5: "108 통사2C", 6: "109 통사2C"])
        XCTAssertEqual(t.days["wed"], [2: "107 통사2C", 4: "102 통사2D"])
        XCTAssertEqual(t.days["mon"], [:])
    }
    func test_현재_다음_수업() {
        let t = Timetable.parse(json)   // 2026-09-08 화
        XCTAssertEqual(t.current(at: date("2026-09-08 08:30"))?.period, 1)
        XCTAssertEqual(t.next(at: date("2026-09-08 08:30"))?.period, 3)
        XCTAssertNil(t.current(at: date("2026-09-08 09:30")))
        XCTAssertEqual(t.next(at: date("2026-09-08 09:30"))?.subject, "101 통사2C")
        XCTAssertNil(t.next(at: date("2026-09-08 15:00")))
        XCTAssertTrue(t.slots(on: date("2026-09-12 10:00")).allSatisfy { $0.subject == nil })   // 토
    }
    func test_알림_대상_2분전_미래만() {
        let t = Timetable.parse(json)
        let a = t.alarms(from: date("2026-09-08 09:00"), days: 2)   // 화 9시부터 이틀
        XCTAssertEqual(a.map { $0.period }, [3, 5, 6, 2, 4])
        XCTAssertEqual(a.first!.date, date("2026-09-08 10:18"))
        XCTAssertEqual(a.last!.date, date("2026-09-09 11:18"))
        XCTAssertEqual(a.first!.subject, "101 통사2C")
    }
    func test_hhmm() { XCTAssertEqual(Timetable.hhmm(1), "8:20"); XCTAssertEqual(Timetable.hhmm(5), "13:10") }
    func test_다음_평일_전환() {
        let t = Timetable(days: ["wed": [2: "a", 6: "b"], "thu": [1: "c"], "fri": [:], "mon": [3: "d"]])
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
        let d = { (s: String) in f.date(from: s)! }
        XCTAssertEqual(t.focus(at: d("2026-09-09 14:30")).shifted, false)          // 수 6교시 중
        let afterWed = t.focus(at: d("2026-09-09 15:01"))                           // 6교시 끝(15:00) 지남 → 목
        XCTAssertTrue(afterWed.shifted); XCTAssertEqual(FB.key(afterWed.date), "2026-09-10")
        XCTAssertEqual(Timetable.focusLabel(afterWed, now: d("2026-09-09 15:01")), "내일 (목)")
        XCTAssertEqual(t.focus(at: d("2026-09-11 15:00")).shifted, false)          // 금 수업 없음 16:00 전
        let fri = t.focus(at: d("2026-09-11 16:00")); XCTAssertEqual(FB.key(fri.date), "2026-09-14")   // 금 16시 → 월
        XCTAssertEqual(Timetable.focusLabel(fri, now: d("2026-09-11 16:00")), "월요일")
        let sat = t.focus(at: d("2026-09-12 10:00")); XCTAssertTrue(sat.shifted); XCTAssertEqual(FB.key(sat.date), "2026-09-14")
    }
}
