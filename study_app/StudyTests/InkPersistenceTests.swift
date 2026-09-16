import XCTest
@testable import Desk

final class InkPersistenceTests: XCTestCase {
    func test_LateCompressionDeleteAndStructureInvalidateOldGeneration() {
        let state = InkSaveGeneration()
        let first = state.begin("n", "p1"), second = state.begin("n", "p1")
        XCTAssertFalse(state.current(first)); XCTAssertTrue(state.current(second)); XCTAssertTrue(state.isWriting)
        state.invalidate("n", "p1"); XCTAssertFalse(state.current(second))
        let third = state.begin("n", "p2"); state.invalidateAll("n"); XCTAssertFalse(state.current(third))
        state.finish(); state.finish(); state.finish(); XCTAssertFalse(state.isWriting)
    }
    func test_LegacyQueueMigrationIsAtomicAndNotRepeated() throws {
        let storage = try TestStorage(), root = storage.queueURL.deletingLastPathComponent().appendingPathComponent("ink")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let old = Data(#"[{"method":"put","path":"desk/ink/n/p1","json":"{\"data\":\"old\"}"}]"#.utf8)
        try old.write(to: root.appendingPathComponent("pending.json"))
        let queue = DurableWriteQueue(url: root.appendingPathComponent("pending-v2.json"), send: { _ in })
        try InkQueueMigration.prepare(root: root, queue: queue)
        let id = try XCTUnwrap(queue.snapshot().first?.id)
        try InkQueueMigration.prepare(root: root, queue: queue)
        XCTAssertEqual(try queue.snapshot().map(\.id), [id])
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("pending-legacy.json")), old)
    }
    func test_CorruptLegacyQueueNeverBecomesEmptySuccess() throws {
        let storage = try TestStorage(), root = storage.queueURL.deletingLastPathComponent()
        try Data("broken".utf8).write(to: root.appendingPathComponent("pending.json"))
        let queue = DurableWriteQueue(url: root.appendingPathComponent("pending-v2.json"), send: { _ in })
        XCTAssertThrowsError(try InkQueueMigration.prepare(root: root, queue: queue))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("pending-v2.json").path))
    }
}
