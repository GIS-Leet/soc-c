import XCTest
import CryptoKit
@testable import Desk

final class ClassPersistenceTests: XCTestCase {
    func test_NoteAndAppendMergeAndStableLogRetry() throws {
        let initial: [String: Any] = ["name": "합성", "note": "old", "custom": "keep", "logs": []]
        let log = StudentLog(id: 0, date: "2026-09-16", text: "synthetic", tag: "상담")
        let note = try StudentEdit.setNote("new", baseline: "old").applying(to: initial, studentID: "s")
        let appended = try StudentEdit.appendLog(log).applying(to: note, studentID: "s")
        let retry = try StudentEdit.appendLog(log).applying(to: appended, studentID: "s")
        XCTAssertEqual(retry["note"] as? String, "new")
        XCTAssertEqual(retry["custom"] as? String, "keep")
        XCTAssertEqual((retry["logs"] as? [Any])?.count, 1)
        XCTAssertThrowsError(try StudentEdit.setNote("mine", baseline: "old").applying(to: retry, studentID: "s"))
    }
    func test_LegacyLogIdentitySurvivesDelete() throws {
        let source: [String: Any] = ["logs": [["text": "first"], ["text": "second"]]]
        let logs = try XCTUnwrap(Student.from("s", source)).logs
        let result = try StudentEdit.deleteLog(logs[0].recordID).applying(to: source, studentID: "s")
        XCTAssertEqual(Student.from("s", result)?.logs.first?.recordID, logs[1].recordID)
    }
    func test_DeletedStudentCannotBeRecreated() async throws {
        let persistence = ClassPersistence(get: { _ in .init(value: nil, etag: "null") }, put: { _, _, _ in XCTFail("deleted record must never be recreated"); return true })
        do { _ = try await persistence.edit("s", .setNote("new", baseline: "old"), key: SymmetricKey(size: .bits256)); XCTFail("must fail") } catch {}
    }
    func test_ConcurrentSetupLosesCASWithoutReplacingMetadata() async throws {
        var calls = 0
        let persistence = ClassPersistence(get: { _ in .init(value: nil, etag: "empty") }, put: { _, _, etag in
            calls += 1; XCTAssertEqual(etag, "empty"); return calls == 1
        })
        _ = try await persistence.setup("synthetic-pass")
        do { _ = try await persistence.setup("different-pass"); XCTFail("second setup must fail") } catch {}
        XCTAssertEqual(calls, 2)
    }
    func test_ConcurrentAppendRetriesAgainstLatestCiphertext() async throws {
        let key = SymmetricKey(size: .bits256)
        let first = StudentLog(id: 0, date: "2026-09-16", text: "first", tag: "상담")
        let second = StudentLog(id: 1, date: "2026-09-16", text: "second", tag: "관찰")
        var plain: [String: Any] = ["name": "합성", "note": "old", "logs": []]
        var calls = 0
        let persistence = ClassPersistence(get: { _ in
            let blob = try ClassCrypto.encrypt(plain, key: key)
            return .init(value: ["enc": ["iv": blob.iv, "ct": blob.ct]], etag: String(calls))
        }, put: { _, value, _ in
            calls += 1
            if calls == 1 { plain = try StudentEdit.appendLog(first).applying(to: plain, studentID: "s"); plain["note"] = "other note"; return false }
            let blob = try XCTUnwrap(ClassCrypto.blob((value as? [String: Any])?["enc"]))
            plain = try XCTUnwrap(ClassCrypto.decrypt(blob, key: key) as? [String: Any]); return true
        })
        _ = try await persistence.edit("s", .appendLog(second), key: key)
        XCTAssertEqual(Student.from("s", plain)?.logs.map(\.recordID), [first.recordID, second.recordID])
        XCTAssertEqual(plain["note"] as? String, "other note")
    }

}
