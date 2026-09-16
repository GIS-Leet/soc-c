// 네트워크 상태 + 자료실 업로드 재시도 큐 — 오프라인일 때 필기본 PDF 등을 기기에 두었다가 연결되면 올림
import Foundation
import Network
import Combine

@MainActor
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()
    @Published var connected = true
    private let monitor = NWPathMonitor()
    init() { if TestRuntime.isTesting { connected=false;return };monitor.pathUpdateHandler = { [weak self] p in Task { @MainActor in self?.connected = p.status == .satisfied } }; monitor.start(queue: DispatchQueue(label: "net")) }
}

enum UploadQueue {
    typealias Item = DurableUploadStore.Item
    static let dir: URL = {
        let root = TestRuntime.isTesting ? TestRuntime.directory : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = root.appendingPathComponent("uploads",isDirectory:true);try? FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true);return dir
    }()
    static let engine = DurableUploadStore(directory:dir)
    static var index: URL { engine.index }
    static func pending() -> [Item] { (try? engine.items()) ?? [] }
    static func file(_ item: Item) -> URL { engine.file(item) }
    @discardableResult static func enqueue(_ data: Data, folder: String, name: String, repo: String, sourceSHA: String?) throws -> Item { try engine.enqueue(data,repo:repo,folder:folder,name:name,sourceSHA:sourceSHA) }
    @MainActor private(set) static var draining = false
    @MainActor static func retry(_ item: Item, gh: GitHubFiles) async throws {
        guard !draining,!Backup.hasInterruptedRestore else { throw BackupArchive.Invalid(message:"전송 작업이 끝난 뒤 다시 시도해 주세요.") }
        draining=true;defer {draining=false}
        guard let current=try engine.items().first(where:{$0.id==item.id}),current.repo==gh.repo else { return }
        let data=try Data(contentsOf:file(current))
        try await gh.upload(current.folder,name:current.name,data:data,existingSha:current.sourceSHA)
        try engine.acknowledge(current.id)
    }
    @MainActor static func drain(gh: GitHubFiles?) async -> Int {
        guard let gh,!draining,!Backup.hasInterruptedRestore else { return pending().count }
        draining=true;defer { draining=false }
        do {
            var barriers=Set<String>()
            for item in try engine.items() {
                let path=(item.repo ?? "legacy")+"/"+item.folder+"/"+item.name
                guard item.canSend(to:gh.repo),!barriers.contains(path) else { barriers.insert(path);continue }
                do {
                    let data=try Data(contentsOf:file(item))
                    try await gh.upload(item.folder,name:item.name,data:data,existingSha:item.sourceSHA)
                    try engine.acknowledge(item.id)
                } catch {
                    barriers.insert(path)
                    let blocked=(error as? GitHubFiles.HTTP).map { (400..<500).contains($0.code) && $0.code != 429 } ?? false
                    try engine.markFailure(item.id,error.localizedDescription,blocked:blocked)
                }
            }
        } catch { Report.shared.fail("업로드 대기열",error,show:false) }
        return pending().count
    }
}
