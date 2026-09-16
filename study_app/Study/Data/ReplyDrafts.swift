// 질문별 초안은 계정별 기기 파일에 보관하며 서버 전송 대기열과 구분한다.
import Foundation
import CryptoKit

@MainActor enum ReplyDrafts {
    private static var memory: [String: String] = [:]
    static func clearMemory() { memory.removeAll() }
    private static func key(_ id: String) -> String { String(SHA256.hash(data: Data((((TestRuntime.isTesting ? "test" : UserDefaults.standard.string(forKey: "fb-email")) ?? "signed-out") + "/" + id).utf8)).map { String(format: "%02x", $0) }.joined()) }
    static var directory: URL { let root = TestRuntime.isTesting ? TestRuntime.directory : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]; return root.appendingPathComponent("reply-drafts", isDirectory: true) }
    static func read(_ id: String) -> String { let k = key(id); return memory[k] ?? ((try? String(contentsOf: directory.appendingPathComponent(k), encoding: .utf8)) ?? "") }
    static func save(_ id: String, _ text: String) {
        let k = key(id); memory[k] = text
        do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true); try Data(text.utf8).write(to: directory.appendingPathComponent(k), options: [.atomic, .completeFileProtectionUnlessOpen]) }
        catch { Report.shared.fail("답변 초안 기기 보관", error, show: false) }
    }
}
