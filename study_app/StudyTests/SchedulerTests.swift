// 회차 시각 뽑기·잠금 판단 테스트
import XCTest
@testable import Desk

struct SeededRNG: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 { state = state &* 6364136223846793005 &+ 1442695040888963407; return state }
}

final class SchedulerTests: XCTestCase {
    let cal = Calendar(identifier: .gregorian)
    func date(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }

    override func setUp() { Store.slots = [:]; Store.done = [:]; Store.lockedSince = nil }

    func test_평일_창() { XCTAssertEqual(Scheduler.window(for: date("2026-09-09 12:00")).start, 8 * 60 + 10); XCTAssertEqual(Scheduler.window(for: date("2026-09-09 12:00")).end, 16 * 60) }
    func test_주말_창() { let w = Scheduler.window(for: date("2026-09-12 12:00")); XCTAssertEqual(w.start, 10 * 60); XCTAssertEqual(w.end, 20 * 60) }

    func test_시각_4개_간격_45분_창_안() {
        for seed in 1...200 {
            var rng = SeededRNG(state: UInt64(seed))
            let d = seed % 2 == 0 ? date("2026-09-09 00:00") : date("2026-09-12 00:00")
            let t = Scheduler.pickTimes(for: d, using: &rng)
            let w = Scheduler.window(for: d)
            XCTAssertEqual(t.count, 4)
            XCTAssertEqual(t, t.sorted())
            XCTAssertGreaterThanOrEqual(t.first!, w.start); XCTAssertLessThan(t.last!, w.end)
            for i in 1..<4 { XCTAssertGreaterThanOrEqual(t[i] - t[i - 1], 45, "seed \(seed)") }
        }
    }
    func test_ensure는_기존_날짜_유지하고_지난_날짜_삭제() {
        Store.slots = ["2026-09-08": [500, 600, 700, 800], "2026-09-09": [520, 620, 720, 820]]
        Scheduler.ensure(days: 3, now: date("2026-09-09 09:00"))
        XCTAssertNil(Store.slots["2026-09-08"]); XCTAssertEqual(Store.slots["2026-09-09"], [520, 620, 720, 820])
        XCTAssertEqual(Store.slots.count, 3)
    }
    func test_지난_미완료_회차와_완료_처리() {
        Store.slots = ["2026-09-09": [500, 600, 700, 800]]   // 8:20 10:00 11:40 13:20
        XCTAssertEqual(Scheduler.passedUndone(now: date("2026-09-09 08:00")), [])
        XCTAssertEqual(Scheduler.passedUndone(now: date("2026-09-09 10:30")), [1, 2])
        XCTAssertEqual(Scheduler.mode(now: date("2026-09-09 10:30")), "full")
        XCTAssertEqual(Scheduler.markDone(now: date("2026-09-09 10:30")), [1, 2])
        XCTAssertEqual(Store.done["2026-09-09"], [1, 2])
        XCTAssertEqual(Scheduler.passedUndone(now: date("2026-09-09 10:35")), [])
        XCTAssertEqual(Scheduler.mode(now: date("2026-09-09 10:35")), "test")
        XCTAssertEqual(Scheduler.passedUndone(now: date("2026-09-09 13:30")), [3, 4])
    }
    func test_추가_공부는_회차_0() {
        Store.slots = ["2026-09-09": [900, 910, 920, 930]]
        XCTAssertEqual(Scheduler.markDone(now: date("2026-09-09 08:00")), [])
        XCTAssertEqual(Store.done["2026-09-09"], [0])
    }
    func test_upcoming_미래만_정렬() {
        Store.slots = ["2026-09-09": [500, 600, 700, 800], "2026-09-10": [610, 700, 800, 900]]
        let u = Scheduler.upcoming(now: date("2026-09-09 10:30"))
        XCTAssertEqual(u.map { $0.slot }, [3, 4, 1, 2, 3, 4])
        XCTAssertEqual(u.first!.day, "2026-09-09")
    }
}
