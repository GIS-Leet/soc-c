// 자료 대기열의 목적지·충돌·디스크 실패·정확한 ACK를 검증한다.
import XCTest
@testable import Desk

final class UploadQueueTests: XCTestCase {
    func make(_ persist: @escaping DurableUploadStore.Persist = { try $0.write(to: $1, options: .atomic) }) throws -> DurableUploadStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return DurableUploadStore(directory: dir, persist: persist)
    }
    func testImmutableDestinationAndVersions() throws {
        let s = try make()
        let a = try s.enqueue(Data("v1".utf8), repo: "a/r", folder: "수업", name: "a.pdf", sourceSHA: "old")
        let b = try s.enqueue(Data("v2".utf8), repo: "a/r", folder: "수업", name: "a.pdf", sourceSHA: "old")
        XCTAssertNotEqual(a.id,b.id); XCTAssertEqual(try s.items().count,2)
        try s.acknowledge(a.id)
        XCTAssertEqual(try s.items(),[b]);XCTAssertEqual(b.repo,"a/r");XCTAssertEqual(b.sourceSHA,"old")
    }
    func testDiskFailureIsThrownAndExistingWorkRemains() throws {
        var fail = false
        let s = try make { data,url in if fail { throw CocoaError(.fileWriteOutOfSpace) };try data.write(to:url,options:.atomic) }
        let a = try s.enqueue(Data("a".utf8),repo:"a/r",folder:"수업",name:"a.pdf",sourceSHA:nil)
        fail = true
        XCTAssertThrowsError(try s.enqueue(Data("b".utf8),repo:"b/r",folder:"수업",name:"b.pdf",sourceSHA:nil))
        XCTAssertEqual(try s.items(),[a])
    }
    func testCorruptIndexIsNeverReplaced() throws {
        let s = try make();let bytes = Data("corrupt".utf8);try bytes.write(to:s.index)
        XCTAssertThrowsError(try s.enqueue(Data(),repo:"a/r",folder:"수업",name:"a.pdf",sourceSHA:nil))
        XCTAssertEqual(try Data(contentsOf:s.index),bytes)
    }
    func testLegacyItemsRemainBlockedUntilDestinationChosen() throws {
        let s = try make();try Data("[{\"id\":\"legacy\",\"folder\":\"수업\",\"name\":\"a.pdf\",\"at\":1}]".utf8).write(to:s.index)
        XCTAssertNil(try s.items().first?.repo)
        XCTAssertFalse(try XCTUnwrap(s.items().first).canSend(to:"new/repo"))
    }
    func testFailureKeepsBytesAndExplicitRetryOnly() throws {
        let s = try make();let a = try s.enqueue(Data("v1".utf8),repo:"a/r",folder:"수업",name:"a.pdf",sourceSHA:"old")
        try s.markFailure(a.id,"충돌",blocked:true)
        let failed = try XCTUnwrap(s.items().first)
        XCTAssertFalse(failed.canSend(to:"a/r"));XCTAssertEqual(try Data(contentsOf:s.file(failed)),Data("v1".utf8))
        try s.retry(a.id);XCTAssertTrue(try XCTUnwrap(s.items().first).canSend(to:"a/r"))
    }
}
