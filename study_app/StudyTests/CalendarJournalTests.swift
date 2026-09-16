import XCTest
@testable import Desk

final class CalendarJournalTests: XCTestCase {
    @MainActor func test_원격ACK뒤로컬실패는같은ID로재개한다() async throws {
        let storage = try TestStorage()
        let url = storage.queueURL.appendingPathExtension("calendar")
        let journal = CalendarJournal(url: url)
        let item = CalendarPlan.DeskItem(date: "2026-09-20", id: "stable", text: "회의")
        try journal.append(.init(id: "operation", kind: "import", eventID: "event", source: nil, destination: item))
        var remote = 0
        do { try await journal.resume(remote: { _ in remote += 1 }, local: { _ in throw CocoaError(.fileWriteUnknown) }) } catch {}
        let restarted = CalendarJournal(url: url)
        XCTAssertEqual(try restarted.records().first?.destination?.id, "stable")
        try await restarted.resume(remote: { _ in remote += 1 }, local: { _ in })
        XCTAssertEqual(remote, 1)
        XCTAssertTrue(try restarted.records().isEmpty)
    }
    func test_DateMoveIsOneAtomicPatchWithStableID() throws {
        let op = CalendarJournal.Operation(id: "op", kind: "move", eventID: "ek", source: .init(date: "2026-09-10", id: "same", text: "old"), destination: .init(date: "2026-09-11", id: "same", text: "new"))
        XCTAssertTrue(op.patch["2026-09-10/same"] is NSNull)
        XCTAssertEqual((op.patch["2026-09-11/same"] as? [String: String])?["text"], "new")
    }
}
