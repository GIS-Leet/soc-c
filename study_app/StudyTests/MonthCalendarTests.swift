// 월 달력 — 격자(일요일 시작·주 수·앞뒤 달)와 하루 일정 모으기(종류·시각 순서)
import XCTest
@testable import Desk
import SwiftUI

final class MonthCalendarTests: XCTestCase {
    func day(_ s: String) -> Date { FB.day.date(from: s)! }
    var greg: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = .current; return c }

    func test_격자_일요일_시작과_주_수() {
        let sep = MonthGrid.days(month: day("2026-09-15"), cal: greg)          // 9/1 화요일, 30일 → 5주
        XCTAssertEqual(sep.count, 35)
        XCTAssertEqual(sep.first?.key, "2026-08-30"); XCTAssertEqual(sep.first?.weekday, 1); XCTAssertFalse(sep[0].inMonth)
        XCTAssertEqual(sep[2].key, "2026-09-01"); XCTAssertTrue(sep[2].inMonth)
        XCTAssertEqual(sep.last?.key, "2026-10-03"); XCTAssertEqual(sep.filter(\.inMonth).count, 30)
        XCTAssertEqual(MonthGrid.days(month: day("2026-08-01"), cal: greg).count, 42)   // 8/1 토요일, 31일 → 6주
        XCTAssertEqual(MonthGrid.days(month: day("2026-02-10"), cal: greg).count, 28)   // 2/1 일요일, 28일 → 4주
    }
    func test_달_넘기기_말일에서도_다음달_1일() {
        XCTAssertEqual(FB.key(MonthGrid.shift(day("2026-01-31"), by: 1, cal: greg)), "2026-02-01")
        XCTAssertEqual(FB.key(MonthGrid.shift(day("2026-01-15"), by: -1, cal: greg)), "2025-12-01")
        XCTAssertEqual(MonthGrid.title(day("2026-09-15")), "2026년 9월")
    }
    func test_하루_일정_종일_먼저_그다음_시각순() {
        let k = "2026-09-11"
        let desk = [CalEvent(id: "e1", date: k, text: "15:30 교과협의회"), CalEvent(id: "e2", date: k, text: "안내문 배부")]
        let ext = [ExternalEvent(id: "x1", title: "치과", date: k, minutes: 9 * 60, endMinutes: 10 * 60, calendar: "개인", color: .red),
                   ExternalEvent(id: "x2", title: "연수", date: k, minutes: nil, endMinutes: nil, calendar: "학교", color: .blue)]
        let todos = [Todo(id: "t1", text: "채점", done: false, createdAt: 0, due: k), Todo(id: "t2", text: "끝난 일", done: true, createdAt: 0, due: k), Todo(id: "t3", text: "다른 날", done: false, createdAt: 0, due: "2026-09-12")]
        let ddays = [DDay(id: "d1", label: "2차 지필평가", date: k), DDay(id: "d2", label: "방학", date: "2026-12-24")]
        let items = DayAgenda.items(key: k, desk: desk, external: ext, todos: todos, ddays: ddays)
        XCTAssertEqual(items.map(\.title), ["2차 지필평가", "채점", "안내문 배부", "연수", "치과", "교과협의회"])
        XCTAssertEqual(items.map(\.kind), [.dday, .todo, .desk, .apple, .apple, .desk])
        XCTAssertEqual(items.last?.minute, 15 * 60 + 30); XCTAssertEqual(items.last?.event?.id, "e1")   // Desk 일정만 삭제 대상
        XCTAssertNil(items.first(where: { $0.kind == .apple })?.event)
        XCTAssertTrue(DayAgenda.items(key: "2026-09-13", desk: desk, external: ext, todos: todos, ddays: ddays).isEmpty)
    }
}
