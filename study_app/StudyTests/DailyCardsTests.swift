import XCTest
@testable import Desk

final class DailyCardsTests: XCTestCase {
    func test_오늘_카드_계산() {
        let json = Data(#"{"start":"2026-09-12","days":[{"t":"A","s":"How's it going?"},{"t":"B","m":"둘째"},{"t":"C"}]}"#.utf8)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let d0 = DailyCards.today(subject: "영어", json: json, now: f.date(from: "2026-09-12")!)!
        XCTAssertEqual(d0.day, 1); XCTAssertEqual(d0.title, "A"); XCTAssertEqual(d0.line, "How's it going?"); XCTAssertEqual(d0.round, 1); XCTAssertEqual(d0.left, 2)
        let d4 = DailyCards.today(subject: "영어", json: json, now: f.date(from: "2026-09-16")!)!
        XCTAssertEqual(d4.day, 2); XCTAssertEqual(d4.round, 2); XCTAssertEqual(d4.line, "둘째")   // 3일 과정 두 바퀴째
        XCTAssertNil(DailyCards.today(subject: "x", json: Data("{}".utf8)))
    }
}
