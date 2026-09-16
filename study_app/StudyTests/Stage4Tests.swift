// 타임라인 시각 파싱·주간 리포트 계산 테스트
import XCTest
@testable import Desk

final class Stage4Tests: XCTestCase {
    func test_일정_시각_파싱() {
        XCTAssertEqual(TimelineLayout.minutes(in: "16:30 교과협의회"), 16 * 60 + 30)
        XCTAssertEqual(TimelineLayout.minutes(in: "9:05 조회"), 9 * 60 + 5)
        XCTAssertEqual(TimelineLayout.minutes(in: "오후 4시 회의"), 16 * 60)
        XCTAssertEqual(TimelineLayout.minutes(in: "오전 9시 30분 상담"), 9 * 60 + 30)
        XCTAssertNil(TimelineLayout.minutes(in: "2학년 진로 상담 주간"))
        XCTAssertNil(TimelineLayout.minutes(in: "25:00 이상한 값"))
    }
    func test_주간_리포트() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; let now = f.date(from: "2026-09-09 10:00")!   // 수
        XCTAssertEqual(FB.key(WeeklyReport.weekStart(now)), "2026-09-07")
        let sessions = [StudySession(date: "2026-09-07", min: 10, subject: "a"), StudySession(date: "2026-09-08", min: 5, subject: "b"), StudySession(date: "2026-09-08", min: 0, subject: "스트릭 프리즈"), StudySession(date: "2026-09-01", min: 99, subject: "지난주")]
        let wsMs = WeeklyReport.weekStart(now).timeIntervalSince1970 * 1000
        let log: [String: Any] = ["geo:1:x": ["last": wsMs + 1000, "right": 3, "wrong": 1, "streak": 0], "geo:2:y": ["last": wsMs - 1000, "right": 0, "wrong": 5, "streak": 0], "geo:3:z": ["last": wsMs + 5000, "right": 2, "wrong": 0, "streak": 2]]
        let s = WeeklyReport.summary(sessions: sessions, quizlog: log, now: now)
        XCTAssertEqual(s.minutes, 15); XCTAssertEqual(s.days, 2); XCTAssertEqual(s.accuracy, 83); XCTAssertEqual(s.weak, ["geo:1:x"])
    }
}
