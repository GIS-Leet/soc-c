import Foundation

/// 저장 의도 시점의 세대와 구조 변경 세대를 비교한다. 압축 결과가 늦게 와도 원본을 되살리지 않는다.
final class InkSaveGeneration: @unchecked Sendable {
    struct Ticket { let key: String; let generation: Int; let epoch: Int }
    private let lock = NSRecursiveLock()
    private var generations: [String: Int] = [:], epochs: [String: Int] = [:]
    private var active = 0
    private func locked<T>(_ body: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return body() }
    var isWriting: Bool { locked { active > 0 } }
    func begin(_ note: String, _ page: String) -> Ticket { locked {
        let key = note + "/" + page; generations[key, default: 0] += 1; active += 1
        return Ticket(key: key, generation: generations[key]!, epoch: epochs[note, default: 0])
    } }
    func finish() { locked { active = max(0, active - 1) } }
    func invalidate(_ note: String, _ page: String) { locked { generations[note + "/" + page, default: 0] += 1 } }
    func invalidateAll(_ note: String) { locked { epochs[note, default: 0] += 1 } }
    func current(_ ticket: Ticket) -> Bool { locked {
        let note = String(ticket.key.split(separator: "/").first ?? "")
        return generations[ticket.key] == ticket.generation && epochs[note, default: 0] == ticket.epoch
    } }
}

enum InkQueueMigration {
    private struct Legacy: Codable { let method: String; let path: String; let json: String? }
    static func prepare(root: URL, queue: DurableWriteQueue) throws {
        let target = root.appendingPathComponent("pending-v2.json"), old = root.appendingPathComponent("pending.json")
        guard !FileManager.default.fileExists(atPath: target.path) else { _ = try queue.records(); return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        guard FileManager.default.fileExists(atPath: old.path) else { try queue.replace([]); return }
        let bytes = try Data(contentsOf: old), legacy = try JSONDecoder().decode([Legacy].self, from: bytes)
        try bytes.write(to: root.appendingPathComponent("pending-legacy.json"), options: .atomic)
        let operations = legacy.enumerated().map { index, op in DurableWriteQueue.Op(id: UUID().uuidString, method: op.method, path: op.path, json: op.json, at: Double(index)) }
        try queue.replace(operations)
    }
}
