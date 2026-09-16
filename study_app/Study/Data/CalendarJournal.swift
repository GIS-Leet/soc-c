import Foundation

/// 양쪽 저장은 원자적일 수 없어 원격 ACK와 EventKit 반영을 따로 기록한다.
@MainActor final class CalendarJournal {
    struct Operation: Codable {
        let id: String; let kind: String; let eventID: String?
        let source: CalendarPlan.DeskItem?; let destination: CalendarPlan.DeskItem?
        var remoteDone = false
        var patch: [String: Any] {
            var value: [String: Any] = [:]
            if kind == "move" || kind == "deleteDesk", let source { value[source.key] = NSNull() }
            if ["move", "import", "updateDesk"].contains(kind), let destination { value[destination.key] = ["text": destination.text] }
            return value
        }
    }
    let url: URL
    init(url: URL) { self.url = url }
    func records() throws -> [Operation] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try JSONDecoder().decode([Operation].self, from: Data(contentsOf: url))
    }
    private func save(_ values: [Operation]) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(values).write(to: url, options: .atomic)
    }
    func append(_ operation: Operation) throws { var values = try records(); values.append(operation); try save(values) }
    func resume(remote: (Operation) async throws -> Void, local: (Operation) throws -> Void) async throws {
        while var operation = try records().first {
            if !operation.remoteDone {
                try await remote(operation)
                operation.remoteDone = true
                var values = try records(); values[0] = operation; try save(values)
            }
            try local(operation)
            var values = try records(); values.removeFirst(); try save(values)
        }
    }
}
