// 하루 국면 판정 — 경계 시각
import XCTest
@testable import Desk

final class DayPhaseTests: XCTestCase {
    let t = Timetable(days: ["wed": [2: "107 통사2C", 4: "102 통사2D", 6: "110 통사2C"]])   // 9:20, 11:20, 14:10
    func d(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    func test_phases_through_a_day() {
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-09 08:00")), .morning(first: Timetable.Slot(period: 2, start: 560, subject: "107 통사2C")))
        if case .inClass(let s, let left, let next) = DayPhase.of(t, now: d("2026-09-09 09:20")) { XCTAssertEqual(s.period, 2); XCTAssertEqual(left, 50); XCTAssertEqual(next?.period, 4) } else { XCTFail("수업 시작 시각은 수업 중") }
        if case .inClass(_, let left, _) = DayPhase.of(t, now: d("2026-09-09 10:09")) { XCTAssertEqual(left, 1) } else { XCTFail() }
        if case .free(let n, let gap) = DayPhase.of(t, now: d("2026-09-09 10:10")) { XCTAssertEqual(n.period, 4); XCTAssertEqual(gap, 70) } else { XCTFail("2교시 끝 → 4교시까지 70분은 공강") }
        if case .breakTime(let n, let gap) = DayPhase.of(t, now: d("2026-09-09 11:05")) { XCTAssertEqual(n.period, 4); XCTAssertEqual(gap, 15) } else { XCTFail("15분 전은 쉬는 시간") }
        if case .inClass(_, _, let next) = DayPhase.of(t, now: d("2026-09-09 14:30")) { XCTAssertNil(next) } else { XCTFail() }
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-09 15:00")), .after(last: Timetable.Slot(period: 6, start: 850, subject: "110 통사2C")))
    }
    func test_weekend_and_empty_days() {
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-12 10:00")), .weekend)      // 토
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-10 10:00")), .noClasses)    // 목: 시간표 없음
        XCTAssertEqual(DayPhase.of(nil, now: d("2026-09-10 10:00")), .noClasses)
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-09 08:00")).focusSlot?.period, 2)
        XCTAssertEqual(DayPhase.of(t, now: d("2026-09-09 15:00")).label, "수업 끝")
    }
}
