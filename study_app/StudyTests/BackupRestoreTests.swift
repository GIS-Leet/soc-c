// 손상·경로 탈출·중복을 실제 데이터에 쓰기 전에 거부하고 임시 폴더에 왕복 복원한다.
import XCTest
@testable import Desk

final class BackupRestoreTests: XCTestCase {
    func archive() -> BackupArchive { BackupArchive(entries:[.init(path:"state/queue.json",size:2,sha256:BackupArchive.hash(Data("[]".utf8)),data:Data("[]".utf8)),BackupArchive.entry("state/settings.json",Data("{}".utf8)),BackupArchive.entry("ink/note/audio/record.m4a",Data([1,2,3]))]) }
    func testRoundTripPreservesBytesAndManifest() throws {
        let source=archive();let restored=try JSONDecoder().decode(BackupArchive.self,from:JSONEncoder().encode(source))
        let dir=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer {try? FileManager.default.removeItem(at:dir)}
        let files=try restored.stage(in:dir)
        XCTAssertEqual(files.count,3);XCTAssertEqual(try Data(contentsOf:dir.appendingPathComponent("ink/note/audio/record.m4a")),Data([1,2,3]))
    }
    func testCorruptionAndTraversalAndDuplicateRejectBeforeWriting() {
        var source=archive();source.entries.append(BackupArchive.entry("ink/../secret",Data()))
        XCTAssertThrowsError(try source.validated())
        source=archive();source.entries.append(source.entries[0]);XCTAssertThrowsError(try source.validated())
        source=archive();source.entries[0] = .init(path:"state/queue.json",size:2,sha256:"bad",data:Data("[]".utf8));XCTAssertThrowsError(try source.validated())
    }
}

extension BackupRestoreTests {
    func testInterruptedDirectoryReplacementRestoresOldBytesOnRestart() throws {
        let base=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let original=base.appendingPathComponent("original"),stageName="restore-"+UUID().uuidString,stage=base.appendingPathComponent(stageName)
        defer {try? FileManager.default.removeItem(at:base)}
        try FileManager.default.createDirectory(at:original,withIntermediateDirectories:true)
        try Data("old".utf8).write(to:original.appendingPathComponent("note"))
        try FileManager.default.createDirectory(at:stage.appendingPathComponent("ink"),withIntermediateDirectories:true)
        try Data("new".utf8).write(to:stage.appendingPathComponent("ink/note"))
        let journalURL=base.appendingPathComponent("transaction.json")
        var transaction=RestoreTransaction(journalURL:journalURL,base:base,destinations:["ink":original],journal:.init(stageName:stageName,previousQueue:Data("[]".utf8),previousSettings:Data("{}".utf8)))
        try transaction.install("ink")
        XCTAssertEqual(try String(contentsOf:original.appendingPathComponent("note")),"new")
        let recovered=try XCTUnwrap(RestoreTransaction.load(journalURL:journalURL,base:base,destinations:["ink":original]))
        try recovered.undoFolders();try recovered.undoFolders() // Restarting recovery is harmless.
        XCTAssertEqual(try String(contentsOf:original.appendingPathComponent("note")),"old")
        try recovered.finish();XCTAssertFalse(FileManager.default.fileExists(atPath:journalURL.path))
    }
}
