// 발성 루틴 — 밀림 판단(21:00·완료·끔), 리마인드 시각(30분마다 23:30 까지, 지난 것·한 날 제외), 완료 시 자물쇠 규칙
import XCTest
@testable import Desk

final class VocalRoutineTests: XCTestCase {
    func d(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    override func setUp() { Store.vocalDone = []; Store.slots = [:]; Store.done = [:]; Store.lockedSince = nil }

    func test_루틴_구성() {
        XCTAssertEqual(VocalRoutine.steps.count, 7); XCTAssertEqual(VocalRoutine.totalMinutes, 12)
        XCTAssertEqual(VocalRoutine.steps.map(\.title), ["몸 풀기", "호흡", "립트릴", "허밍", "공명", "낭독", "마무리"])
    }
    func test_밀림_판단() {
        XCTAssertFalse(VocalRoutine.pending(now: d("2026-09-15 20:59"), on: true, done: []))
        XCTAssertTrue(VocalRoutine.pending(now: d("2026-09-15 21:00"), on: true, done: []))
        XCTAssertTrue(VocalRoutine.pending(now: d("2026-09-15 23:59"), on: true, done: ["2026-09-14"]))
        XCTAssertFalse(VocalRoutine.pending(now: d("2026-09-15 22:00"), on: true, done: ["2026-09-15"]))   // 오늘 했음
        XCTAssertFalse(VocalRoutine.pending(now: d("2026-09-15 22:00"), on: false, done: []))              // 껐음
    }
    func test_리마인드_시각() {
        let r = VocalRoutine.reminders(now: d("2026-09-15 21:40"), days: 2, on: true, done: ["2026-09-16"])
        XCTAssertEqual(r.map { ($0.day, $0.n) }.map { "\($0.0)#\($0.1)" }, ["2026-09-15#2", "2026-09-15#3", "2026-09-15#4", "2026-09-15#5"])   // 22:00~23:30, 내일은 한 날이라 없음
        XCTAssertEqual(r.first?.date, d("2026-09-15 22:00")); XCTAssertEqual(r.last?.date, d("2026-09-15 23:30"))
        let full = VocalRoutine.reminders(now: d("2026-09-15 09:00"), days: 1, on: true, done: [])
        XCTAssertEqual(full.count, 6); XCTAssertEqual(full[0].date, d("2026-09-15 21:00"))
        XCTAssertEqual(VocalRoutine.lockDates(now: d("2026-09-15 09:00"), days: 3, on: true, done: ["2026-09-16"]).map(\.day), ["2026-09-15", "2026-09-17"])
        XCTAssertTrue(VocalRoutine.reminders(now: d("2026-09-15 09:00"), days: 3, on: false, done: []).isEmpty)
    }
    func test_완료와_자물쇠() {
        Store.lockedSince = Date()
        Store.slots = ["2026-09-15": [9 * 60]]   // 09:00 공부 회차가 밀려 있음
        VocalRoutine.markDone(now: d("2026-09-15 21:30"))
        XCTAssertTrue(VocalRoutine.isDone(d("2026-09-15 22:00"))); XCTAssertTrue(Store.isLocked, "공부가 밀려 있으면 잠금 유지")
        _ = Scheduler.markDone(now: d("2026-09-15 21:40"))
        XCTAssertFalse(Store.isLocked, "둘 다 끝나면 해제")
        // 반대 순서: 공부 통과 뒤에도 발성이 밀려 있으면 잠금 유지
        Store.vocalDone = []; Store.done = [:]; Store.lockedSince = Date()
        _ = Scheduler.markDone(now: d("2026-09-15 21:40"))
        XCTAssertTrue(Store.isLocked)
        VocalRoutine.markDone(now: d("2026-09-15 21:50")); XCTAssertFalse(Store.isLocked)
        // 지난 날짜 정리(7일)
        Store.vocalDone = ["2026-09-01", "2026-09-10"]; VocalRoutine.markDone(now: d("2026-09-15 21:50"))
        XCTAssertEqual(Store.vocalDone, ["2026-09-10", "2026-09-15"])
    }
}
