// 자료 업로드는 저장소와 원본 SHA를 고정한 불변 작업으로 영속화한다.
import Foundation

final class DurableUploadStore: @unchecked Sendable {
    struct Item: Codable, Equatable, Identifiable {
        var id: String; var folder: String; var name: String; var at: Double
        var repo: String?; var sourceSHA: String?; var failure: String?; var blocked: Bool?
        func canSend(to repository: String) -> Bool { repo == repository && blocked != true }
    }
    typealias Persist = (Data, URL) throws -> Void
    let directory: URL
    var index: URL { directory.appendingPathComponent("index.json") }
    private let persist: Persist
    private let lock = NSRecursiveLock()
    init(directory: URL, persist: @escaping Persist = { try $0.write(to: $1, options: .atomic) }) { self.directory = directory;self.persist = persist }
    private func locked<T>(_ body: () throws -> T) rethrows -> T { lock.lock();defer { lock.unlock() };return try body() }
    func items() throws -> [Item] { try locked { guard FileManager.default.fileExists(atPath:index.path) else { return [] };return try JSONDecoder().decode([Item].self,from:Data(contentsOf:index)) } }
    func file(_ item: Item) -> URL { directory.appendingPathComponent(item.id) }
    private func store(_ items: [Item]) throws { try persist(JSONEncoder().encode(items),index) }
    @discardableResult func enqueue(_ data: Data, repo: String, folder: String, name: String, sourceSHA: String?) throws -> Item {
        try locked {
            var current = try items()
            guard !repo.isEmpty,!name.isEmpty,!name.contains("/"),name != ".",name != ".." else { throw CocoaError(.fileWriteInvalidFileName) }
            let item = Item(id:UUID().uuidString,folder:folder,name:name,at:Date().timeIntervalSince1970,repo:repo,sourceSHA:sourceSHA)
            try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
            try persist(data,file(item));current.append(item)
            // Index failure leaves the old index intact; the orphan bytes are retained for recovery.
            try store(current);return item
        }
    }
    func acknowledge(_ id: String) throws { try locked { let current = try items();try store(current.filter { $0.id != id });if let item = current.first(where:{$0.id == id}) { try? FileManager.default.removeItem(at:file(item)) } } }
    func markFailure(_ id: String, _ message: String, blocked: Bool) throws { try locked { var current = try items();guard let i = current.firstIndex(where:{$0.id == id}) else { return };current[i].failure = message;current[i].blocked = blocked;try store(current) } }
    func retry(_ id: String) throws { try locked { var current = try items();guard let i=current.firstIndex(where:{$0.id==id}) else { return };current[i].blocked = false;current[i].failure = nil;try store(current) } }
    func bindLegacy(_ id: String, repo: String, sourceSHA: String?) throws { try locked { var current = try items();guard let i=current.firstIndex(where:{$0.id==id}),current[i].repo == nil else { return };current[i].repo=repo;current[i].sourceSHA=sourceSHA;try store(current) } }
}
