// 격리된 저장소에서 미전송 변경과 정확한 ACK 제거를 검증한다.
import XCTest
@testable import Desk
final class QueueTests: XCTestCase {
    func test_inflight수정은이전ACK로사라지지않는다() async throws {
        let storage = try TestStorage(); let transport = MockTransport()
        let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in try await transport.hold() })
        let first = try queue.enqueue("put", "desk/notes/a", ["text": "v1"])
        let draining = Task { await queue.drain() }; await transport.started()
        let second = try queue.enqueue("put", "desk/notes/a", ["text": "v2"])
        XCTAssertNotEqual(first.id, second.id)
        await transport.complete(); await transport.started(2)
        // 첫 ACK 직후 두 번째 전송이 시작되어도 큐에서 두 번째 작업은 유지된다.
        while (try queue.snapshot()).contains(where: { $0.id == first.id }) { await Task.yield() }
        XCTAssertEqual(try queue.snapshot().map(\.id), [second.id])
        await transport.complete(URLError(.notConnectedToInternet)); _ = await draining.value
        XCTAssertEqual(try queue.snapshot().map(\.id), [second.id])
    }
    func test_패치_null과상하위순서를재시작에도보존한다() throws {
        let storage = try TestStorage(); let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("put", "desk/notes/a", ["text": "v1", "old": true])
        try queue.enqueue("patch", "desk/notes/a", ["text": "v2", "old": NSNull(), "nested/x": 3])
        try queue.enqueue("delete", "desk/notes/a/nested", nil)
        try queue.enqueue("patch", "desk/notes", ["a/nested/y": 4])
        let restored = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        let result = try XCTUnwrap(restored.overlay(["a": ["text": "stale"]], at: "desk/notes") as? [String: Any])
        let a = try XCTUnwrap(result["a"] as? [String: Any]); XCTAssertEqual(a["text"] as? String, "v2"); XCTAssertNil(a["old"])
        XCTAssertEqual((a["nested"] as? [String: Int])?["y"], 4)
    }
    func test_손상파일과디스크실패를빈큐로덮지않는다() throws {
        let storage = try TestStorage(); let broken = Data("broken queue".utf8); try broken.write(to: storage.queueURL)
        let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        XCTAssertThrowsError(try queue.enqueue("put", "desk/a", 1)); XCTAssertEqual(try Data(contentsOf: storage.queueURL), broken)
        let denied = DurableWriteQueue(url: storage.directory.appendingPathComponent("other.json"), persist: { _,_ in throw CocoaError(.fileWriteNoPermission) }, send: { _ in })
        XCTAssertThrowsError(try denied.enqueue("put", "desk/a", 1)); XCTAssertEqual(try denied.snapshot().count, 0); XCTAssertEqual(denied.recovery.count, 1)
    }
    func test_권한거절은실패작업으로보존한다() async throws {
        let storage = try TestStorage(); let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in throw RTDB.HTTPError(code: 403, body: "denied") })
        let operation = try queue.enqueue("put", "desk/a", 1); _ = await queue.drain()
        XCTAssertEqual(try queue.snapshot().first?.id, operation.id); XCTAssertNotNil(try queue.snapshot().first?.failure)
    }
    func test_push키_시간순() { XCTAssertLessThan(RTDB.pushKey(now: Date(timeIntervalSince1970: 1)), RTDB.pushKey(now: Date(timeIntervalSince1970: 2))) }
    func test_ACK영속실패도원래작업을보존하고재시도한다() async throws {
        let storage = try TestStorage()
        final class Disk { var writes = 0 }
        let disk = Disk()
        let queue = DurableWriteQueue(url: storage.queueURL, persist: { data, url in
            disk.writes += 1
            if disk.writes == 2 { throw CocoaError(.fileWriteNoPermission) }
            try data.write(to: url, options: .atomic)
        }, send: { _ in })
        let operation = try queue.enqueue("put", "desk/a", 1)
        _ = await queue.drain(); XCTAssertEqual(try queue.snapshot().map(\.id), [operation.id])
        _ = await queue.drain(); XCTAssertTrue(try queue.snapshot().isEmpty)
    }
    func test_전송중복원은거절하고로컬실패복구는같은ID를쓴다() async throws {
        let storage = try TestStorage(), transport = MockTransport()
        let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in try await transport.hold() })
        try queue.enqueue("put", "desk/a", 1)
        let task = Task { await queue.drain() }; await transport.started()
        XCTAssertTrue(queue.isDraining); XCTAssertThrowsError(try queue.replace([]))
        await transport.complete(); _ = await task.value; XCTAssertFalse(queue.isDraining)
        final class Disk { var fail = true }
        let disk = Disk()
        let recovery = DurableWriteQueue(url: storage.directory.appendingPathComponent("retry.json"), persist: { data, url in
            if disk.fail { throw CocoaError(.fileWriteNoPermission) }; try data.write(to: url, options: .atomic)
        }, send: { _ in throw URLError(.notConnectedToInternet) })
        XCTAssertThrowsError(try recovery.enqueue("put", "desk/b", 2))
        let id = try XCTUnwrap(recovery.recovery.first?.id); disk.fail = false
        _ = await recovery.drain(); XCTAssertEqual(try recovery.snapshot().map(\.id), [id]); XCTAssertTrue(recovery.recovery.isEmpty)
    }

    func test_권한실패는종속작업만막고다른경로는전송한다() async throws {
        let storage = try TestStorage()
        final class Sent { var paths: [String] = [] }
        let sent = Sent()
        let queue = DurableWriteQueue(url: storage.queueURL, send: { op in
            if op.path == "desk/notes/a" { throw RTDB.HTTPError(code: 403, body: "denied") }
            sent.paths.append(op.path)
        })
        try queue.enqueue("put", "desk/notes/a", ["title": "blocked"])
        try queue.enqueue("put", "desk/notes/a/title", "dependent")
        try queue.enqueue("put", "desk/todos/b", ["text": "independent"])
        _ = await queue.drain()
        XCTAssertEqual(sent.paths, ["desk/todos/b"])
        XCTAssertEqual(try queue.snapshot().map(\.path), ["desk/notes/a", "desk/notes/a/title"])
    }

    func test_ACK뒤늦은SSE와재시작이최신본문을지우지않는다() async throws {
        let storage = try TestStorage(), path = "desk/notes/a"
        let queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("patch", path, ["md": "new body"]); _ = await queue.drain()
        XCTAssertTrue(try queue.snapshot().isEmpty)
        try queue.enqueue("patch", path, ["pinned": true])
        let stale: [String: Any] = ["a": ["md": "old body", "pinned": false]]
        let live = try XCTUnwrap(queue.overlay(stale, at: "desk/notes") as? [String: [String: Any]])
        XCTAssertEqual(live["a"]?["md"] as? String, "new body"); XCTAssertEqual(live["a"]?["pinned"] as? Bool, true)
        let restart = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        let restored = try XCTUnwrap(restart.overlay(stale, at: "desk/notes") as? [String: [String: Any]])
        XCTAssertEqual(restored["a"]?["md"] as? String, "new body")
    }

    func test_부분서버에코는확인된필드만해제한다() async throws {
        let storage = try TestStorage(), queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("patch", "desk", ["notes/a/md": "new", "notes-prev/a/md": "previous"])
        _ = await queue.drain()
        try queue.confirmServerSnapshot(["a": ["md": "old"]], at: "desk/notes")
        XCTAssertEqual((try queue.overlay(["a": ["md": "old"]], at: "desk/notes") as? [String: [String: String]])?["a"]?["md"], "new")
        try queue.confirmServerSnapshot(["a": ["md": "new"]], at: "desk/notes")
        XCTAssertEqual((try queue.overlay(["a": ["md": "other device"]], at: "desk/notes") as? [String: [String: String]])?["a"]?["md"], "other device")
        XCTAssertEqual(try queue.records().count, 1)
        try queue.confirmServerSnapshot(["a": ["md": "previous"]], at: "desk/notes-prev")
        XCTAssertTrue(try queue.records().isEmpty)
    }

    func test_합쳐진최신에코는이전ACK본문도함께확인한다() async throws {
        let storage = try TestStorage(), queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("put", "desk/notes/a", ["md": "v1", "pinned": false]); _ = await queue.drain()
        try queue.enqueue("patch", "desk/notes/a", ["md": "v2"]); _ = await queue.drain()
        try queue.confirmServerSnapshot(["a": ["md": "v2", "pinned": false]], at: "desk/notes")
        XCTAssertTrue(try queue.records().isEmpty)
        let remote: [String: Any] = ["a": ["md": "other device", "pinned": true]]
        XCTAssertEqual((try queue.overlay(remote, at: "desk/notes") as? [String: [String: Any]])?["a"]?["md"] as? String, "other device")
    }

    func test_재접속전체스냅샷은이전ACK만종료하고새ACK는보존한다() async throws {
        let storage = try TestStorage(), queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("patch", "desk/notes/a", ["md": "A"]); _ = await queue.drain()
        let restart = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        let prior = try restart.acknowledgedIDs()
        try restart.enqueue("patch", "desk/notes/a", ["pinned": true]); _ = await restart.drain()
        let remote: [String: Any] = ["a": ["md": "B", "pinned": false]]
        try restart.confirmServerSnapshot(remote, at: "desk/notes", authoritativeAfter: prior)
        let visible = try XCTUnwrap(restart.overlay(remote, at: "desk/notes") as? [String: [String: Any]])
        XCTAssertEqual(visible["a"]?["md"] as? String, "B")
        XCTAssertEqual(visible["a"]?["pinned"] as? Bool, true)
        XCTAssertEqual(try restart.records().count, 1)
    }

    func test_수업완료는기존반과더높은진도를보존하고사건확인을기다린다() async throws {
        let storage = try TestStorage(), queue = DurableWriteQueue(url: storage.queueURL, send: { _ in })
        try queue.enqueue("lessonComplete", "progress/classes/c", ["id": "stable", "target": 3])
        let overlay = try XCTUnwrap(queue.overlay(["name": "반", "done": 5], at: "progress/classes/c") as? [String: Any])
        XCTAssertEqual(overlay["name"] as? String, "반"); XCTAssertEqual(overlay["done"] as? Int, 5)
        _ = await queue.drain()
        try queue.confirmServerSnapshot(["name": "반", "done": 5], at: "progress/classes/c")
        XCTAssertEqual(try queue.records().count, 1)
        try queue.confirmServerSnapshot(["name": "반", "done": 5, "completedLessons": ["stable": ["at": 1]]], at: "progress/classes/c")
        XCTAssertTrue(try queue.records().isEmpty)
    }

}
