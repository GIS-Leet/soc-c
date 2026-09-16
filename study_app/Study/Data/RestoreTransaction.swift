// 복원 중 앱이 종료되더라도 기존 폴더와 대기열을 되돌릴 수 있는 영속 저널이다.
import Foundation

struct RestoreTransaction {
    struct Root: Codable { let name: String; let existed: Bool }
    struct Journal: Codable {
        let stageName: String
        let previousQueue: Data
        let previousSettings: Data
        var roots: [Root] = []
    }
    let journalURL: URL
    let base: URL
    let destinations: [String:URL]
    var journal: Journal
    var stage: URL { base.appendingPathComponent(journal.stageName) }
    var rollback: URL { stage.appendingPathComponent("rollback") }
    func checkpoint() throws { try JSONEncoder().encode(journal).write(to:journalURL,options:[.atomic,.completeFileProtectionUnlessOpen]) }
    mutating func install(_ name: String) throws {
        guard let destination=destinations[name] else { throw CocoaError(.fileWriteInvalidFileName) }
        let existed=FileManager.default.fileExists(atPath:destination.path)
        journal.roots.append(Root(name:name,existed:existed));try checkpoint()
        try FileManager.default.createDirectory(at:rollback,withIntermediateDirectories:true)
        if existed { try FileManager.default.moveItem(at:destination,to:rollback.appendingPathComponent(name)) }
        try FileManager.default.createDirectory(at:destination.deletingLastPathComponent(),withIntermediateDirectories:true)
        try FileManager.default.moveItem(at:stage.appendingPathComponent(name),to:destination)
    }
    func undoFolders() throws {
        for root in journal.roots.reversed() {
            guard let destination=destinations[root.name] else { throw CocoaError(.fileReadCorruptFile) }
            let previous=rollback.appendingPathComponent(root.name)
            if FileManager.default.fileExists(atPath:previous.path) {
                if FileManager.default.fileExists(atPath:destination.path) { try FileManager.default.removeItem(at:destination) }
                try FileManager.default.moveItem(at:previous,to:destination)
            } else if !root.existed && !FileManager.default.fileExists(atPath:stage.appendingPathComponent(root.name).path) {
                if FileManager.default.fileExists(atPath:destination.path) { try FileManager.default.removeItem(at:destination) }
            }
        }
    }
    func finish() throws {
        // Removing the journal is the commit point; leftover staging may be cleaned later.
        try FileManager.default.removeItem(at:journalURL)
        try? FileManager.default.removeItem(at:stage)
    }
    static func load(journalURL: URL, base: URL, destinations: [String:URL]) throws -> RestoreTransaction? {
        guard FileManager.default.fileExists(atPath:journalURL.path) else { return nil }
        let journal=try JSONDecoder().decode(Journal.self,from:Data(contentsOf:journalURL))
        guard journal.stageName.hasPrefix("restore-"),UUID(uuidString:String(journal.stageName.dropFirst(8))) != nil,Set(journal.roots.map(\.name)).count==journal.roots.count,journal.roots.allSatisfy({destinations[$0.name] != nil}) else { throw CocoaError(.fileReadCorruptFile) }
        return RestoreTransaction(journalURL:journalURL,base:base,destinations:destinations,journal:journal)
    }
}
