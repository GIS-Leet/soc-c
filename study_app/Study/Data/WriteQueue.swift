// 변경을 불변 작업으로 먼저 영속화하며 정확한 작업 ID의 ACK만 제거한다.
import Foundation

final class DurableWriteQueue: @unchecked Sendable {
    struct Op: Codable, Equatable, Sendable {
        let id: String; let method: String; let path: String; let json: String?; let at: Double
        var failure: String?
        var blocked: Bool?
        var acknowledged: Bool?
        var confirmedPaths: [String]?
    }
    typealias Persist = (Data, URL) throws -> Void
    private let url: URL
    private let persist: Persist
    private let send: (Op) async throws -> Void
    private let now: () -> Date
    private let lock = NSRecursiveLock()
    private var draining = false
    var isDraining: Bool { locked { draining } }
    struct Busy: LocalizedError { var errorDescription: String? { "전송 중인 변경이 있어 복원을 잠시 기다려야 합니다." } }
    private var lastFailure: String?
    private var unsaved: [Op] = []
    private var serverSnapshots: [String: Any] = [:]
    var recovery: [Op] { locked { unsaved } }
    init(url: URL, persist: @escaping Persist = { try $0.write(to: $1, options: .atomic) }, now: @escaping () -> Date = Date.init, send: @escaping (Op) async throws -> Void) {
        self.url = url; self.persist = persist; self.now = now; self.send = send
    }
    private func locked<T>(_ body: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try body() }
    func snapshot() throws -> [Op] { try records().filter { $0.acknowledged != true } }
    func records() throws -> [Op] {
        try locked {
            guard FileManager.default.fileExists(atPath: url.path) else { return [] }
            // 읽기나 해독 실패는 빈 큐가 아니다. 원본을 그대로 남긴 채 쓰기를 중단한다.
            do { return try JSONDecoder().decode([Op].self, from: Data(contentsOf: url)) }
            catch { lastFailure = error.localizedDescription; throw error }
        }
    }
    var failure: String? { locked { lastFailure } }
    private func store(_ operations: [Op]) throws {
        do { try persist(JSONEncoder().encode(operations), url); lastFailure = nil }
        catch { lastFailure = error.localizedDescription; throw error }
    }
    func replace(_ operations: [Op]) throws { try locked { guard !draining else { throw Busy() }; let ids = Set(operations.map(\.id)); let receipts = try records().filter { $0.acknowledged == true && !ids.contains($0.id) }; try store(receipts + operations); unsaved = [] } }
    func acknowledgedIDs() throws -> Set<String> { Set(try records().filter { $0.acknowledged == true }.map(\.id)) }
    func restoreRecords(_ operations: [Op]) throws {
        try locked {
            guard !draining && unsaved.isEmpty else { throw Busy() }
            try store(operations); serverSnapshots = [:]; unsaved = []
        }
    }
    @discardableResult func enqueue(_ method: String, _ path: String, _ value: Any?) throws -> Op {
        try locked {
            do {
                let json = try value.map { String(decoding: try JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed]), as: UTF8.self) }
                let op = Op(id: UUID().uuidString, method: method.lowercased(), path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")), json: json, at: now().timeIntervalSince1970)
                do {
                    var operations = try records(); operations.append(contentsOf: unsaved); operations.append(op); try store(operations); unsaved = []; return op
                } catch { unsaved.append(op); throw error }
            } catch { lastFailure = error.localizedDescription; throw error }
        }
    }
    private func effects(_ op: Op) throws -> [([String], Any?)] {
        let base = op.path.split(separator: "/").map(String.init)
        let value = try op.json.map { try JSONSerialization.jsonObject(with: Data($0.utf8), options: [.fragmentsAllowed]) }
        if op.method == "lessoncomplete", let payload = value as? [String: Any], let id = payload["id"] as? String {
            return [(base + ["done"], payload["target"] ?? 0), (base + ["completedLessons", id], payload)]
        }
        if op.method == "patch" { return ((value as? [String: Any]) ?? [:]).map { (base + $0.key.split(separator: "/").map(String.init), $0.value) } }
        return [(base, op.method == "delete" ? nil : value)]
    }
    private func nextOperation() throws -> Op? {
        var barriers: [[String]] = []
        for operation in try snapshot() {
            let paths = try effects(operation).map { $0.0 }
            if operation.blocked == true || paths.contains(where: { path in barriers.contains(where: { path.starts(with: $0) || $0.starts(with: path) }) }) { barriers.append(contentsOf: paths); continue }
            return operation
        }
        return nil
    }
    func drain(retryBlocked: Bool = false) async -> (left: Int, dropped: String?) {
        let admitted = locked { if draining { return false }; draining = true; return true }
        guard admitted else { return ((try? snapshot().count) ?? 0, failure) }
        defer { locked { draining = false } }
        do {
            try locked { if !unsaved.isEmpty { var current = try records(); current.append(contentsOf: unsaved); try store(current); unsaved = [] } }
            if retryBlocked {
                try locked { var current = try records(); for index in current.indices { current[index].blocked = nil }; try store(current) }
            }
            while let operation = try nextOperation() {
                do { try await send(operation) }
                catch {
                    let message = error.localizedDescription
                    let code = (error as? RTDB.HTTPError)?.code ?? ((error as NSError).domain == "DeskFixture" ? (error as NSError).code : 0)
                    let permanent = (400..<500).contains(code) && ![401,408,429].contains(code)
                    try locked {
                        var current = try records()
                        if let index = current.firstIndex(where: { $0.id == operation.id }) { current[index].failure = message; current[index].blocked = permanent }
                        try store(current); lastFailure = message
                    }
                    if permanent { continue }
                    return (try snapshot().count, message)
                }
                // await 동안 추가된 작업을 다시 읽고, 보낸 ID만 원자적으로 제거한다.
                try locked {
                    var current = try records()
                    if let index = current.firstIndex(where: { $0.id == operation.id }) { current[index].acknowledged = true; current[index].failure = nil; current[index].blocked = nil }
                    try store(current); try pruneConfirmed()
                }
            }
            let remaining = try snapshot(); let message = remaining.compactMap(\.failure).first
            locked { lastFailure = message }; return (remaining.count, message)
        } catch { locked { lastFailure = error.localizedDescription }; return ((try? snapshot().count) ?? 0, error.localizedDescription) }
    }
    // REST ACK는 전송 대기에서 빠지지만, 서버 에코 확인 전까지 로컬 원본을 지키는 영속 영수증이다.
    func confirmServerSnapshot(_ snapshot: Any?, at path: String, authoritativeAfter ids: Set<String> = []) throws {
        try locked {
            let base = path.split(separator: "/").map(String.init)
            var current = try records()
            for index in current.indices where current[index].acknowledged == true && ids.contains(current[index].id) {
                let covered = try effects(current[index]).filter { $0.0.starts(with: base) }.map { $0.0.joined(separator: "/") }
                current[index].confirmedPaths = Set((current[index].confirmedPaths ?? []) + covered).sorted()
            }
            if !ids.isEmpty { try store(current) }
            serverSnapshots[path] = snapshot ?? NSNull(); try pruneConfirmed()
        }
    }
    private func pruneConfirmed() throws {
        let current = try records()
        var retained: [Op] = []
        for (index, original) in current.enumerated() {
            var op = original
            guard op.acknowledged == true else { retained.append(op); continue }
            let changes = try effects(op)
            var confirmed = Set(op.confirmedPaths ?? [])
            for effect in changes {
                let candidates = serverSnapshots.keys.map { ($0, $0.split(separator: "/").map(String.init)) }.filter { effect.0.starts(with: $0.1) }
                guard let source = candidates.max(by: { $0.1.count < $1.1.count }) else { continue }
                let actual = effect.0.dropFirst(source.1.count).reduce(serverSnapshots[source.0]) { JSONTree.asDict($0)[$1] }
                let a = try? JSONSerialization.data(withJSONObject: actual ?? NSNull(), options: [.fragmentsAllowed, .sortedKeys])
                // 에코가 여러 ACK를 합쳐 보낼 수 있으므로 후속 확인된 변경까지 합성한다.
                var expectedTree = JSONTree.set(nil, effect.0, effect.1 is NSNull ? nil : effect.1)
                for later in current.dropFirst(index + 1) where later.acknowledged == true {
                    for change in try effects(later) where change.0.starts(with: effect.0) || effect.0.starts(with: change.0) {
                        expectedTree = JSONTree.set(expectedTree, change.0, change.1 is NSNull ? nil : change.1)
                    }
                }
                let expected = effect.0.reduce(expectedTree) { JSONTree.asDict($0)[$1] }
                let b = try? JSONSerialization.data(withJSONObject: expected ?? NSNull(), options: [.fragmentsAllowed, .sortedKeys])
                let lessonConfirmed = op.method == "lessoncomplete" && ((effect.0.last == "done" && (actual as? Int ?? -1) >= (effect.1 as? Int ?? 0)) || (effect.0.contains("completedLessons") && actual != nil && !(actual is NSNull)))
                if lessonConfirmed || (a != nil && a == b) { confirmed.insert(effect.0.joined(separator: "/")) }
            }
            if changes.allSatisfy({ confirmed.contains($0.0.joined(separator: "/")) }) { continue }
            op.confirmedPaths = confirmed.sorted(); retained.append(op)
        }
        if retained != current { try store(retained) }
    }
    func overlay(_ snapshot: Any?, at path: String) throws -> Any? {
        let base = path.split(separator: "/").map(String.init)
        var root: Any? = JSONTree.set(nil, base, snapshot)
        for op in try locked({ try self.records() + unsaved }) {
            for (components, value) in try effects(op) {
                guard components.starts(with: base) || base.starts(with: components) else { continue }
                if op.acknowledged == true && (op.confirmedPaths ?? []).contains(components.joined(separator: "/")) { continue }
                var applied = value
                if op.method == "lessoncomplete", components.last == "done" {
                    let current = components.reduce(root) { JSONTree.asDict($0)[$1] } as? Int ?? 0
                    applied = max(current, value as? Int ?? 0)
                }
                root = JSONTree.set(root, components, applied is NSNull ? nil : applied)
            }
        }
        return base.reduce(root) { JSONTree.asDict($0)[$1] }
    }

}

enum WriteQueue {
    typealias Op = DurableWriteQueue.Op
    static let url: URL = {
        let path = TestRuntime.storage("desk-queue.json") { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("desk-queue.json") }
        try? FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        return path
    }()
    static let engine = DurableWriteQueue(url: url, persist: { data, url in
        if TestRuntime.isTesting && TestRuntime.scenario == "local-failure" { throw CocoaError(.fileWriteNoPermission) }
        try data.write(to: url, options: .atomic)
    }, send: { op in
        if TestRuntime.isTesting { try await TestRuntime.simulatedWrite(); return }
        let value = try op.json.map { try JSONSerialization.jsonObject(with: Data($0.utf8), options: [.fragmentsAllowed]) }
        switch op.method {
        case "put": try await RTDB.put(op.path, value ?? NSNull())
        case "patch": try await RTDB.patch(op.path, (value as? [String: Any]) ?? [:])
        case "delete": try await RTDB.delete(op.path)
        case "lessoncomplete": try await LessonCompletion.commit(op.path, (value as? [String: Any]) ?? [:])
        default: throw CocoaError(.coderInvalidValue)
        }
    })
    static func recordsForBackup() throws -> [Op] { try engine.records() + engine.recovery }
    static func acknowledgedIDs() -> Set<String> { (try? engine.acknowledgedIDs()) ?? [] }
    static func restoreRecords(_ records: [Op]) throws { try engine.restoreRecords(records) }
    static func confirmServerSnapshot(_ snapshot: Any?, at path: String, authoritativeAfter ids: Set<String> = []) -> Result<Void, Error> { Result { try engine.confirmServerSnapshot(snapshot, at: path, authoritativeAfter: ids) } }
    static var isDraining: Bool { engine.isDraining }
    static var failure: String? { engine.failure }
    static func pending() -> [Op] { ((try? engine.snapshot()) ?? []) + engine.recovery }
    @discardableResult static func set(_ ops: [Op]) -> Result<Void, Error> { Result { try engine.replace(ops) } }
    @discardableResult static func enqueue(_ method: String, _ path: String, _ value: Any?) -> Result<Op, Error> { Result { try engine.enqueue(method, path, value) } }
    @discardableResult static func put(_ path: String, _ value: Any) -> Result<Op, Error> { enqueue("put", path, value) }
    @discardableResult static func patch(_ path: String, _ value: [String: Any]) -> Result<Op, Error> { enqueue("patch", path, value) }
    @discardableResult static func delete(_ path: String) -> Result<Op, Error> { enqueue("delete", path, nil) }
    static func overlay(_ snapshot: Any?, at path: String) -> Any? { do { return try engine.overlay(snapshot, at: path) } catch { return snapshot } }
    static func drain(retryBlocked: Bool = false) async -> (left: Int, dropped: String?) { guard !Backup.hasInterruptedRestore else { return (pending().count,"중단된 백업 복원을 먼저 복구해 주세요.") };return await engine.drain(retryBlocked: retryBlocked) }
}

extension RTDB {
    /// Firebase push 키와 같은 규칙(시간순 정렬되는 20자) — 오프라인에서도 새 항목 키를 만들 수 있게
    static func pushKey(now: Date = Date()) -> String {
        let chars = Array("-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz")
        var t = Int(now.timeIntervalSince1970 * 1000); var s = [Character](repeating: "-", count: 8)
        for i in (0..<8).reversed() { s[i] = chars[t % 64]; t /= 64 }
        return String(s) + String((0..<12).map { _ in chars[Int.random(in: 0..<64)] })
    }
}
