// 테스트마다 독립 임시 폴더를 만들며 앱의 실제 저장소를 사용하지 않는다.
import Foundation
final class TestStorage {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("desk-test-" + UUID().uuidString, isDirectory: true)
    init() throws { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
    var queueURL: URL { directory.appendingPathComponent("queue.json") }
    deinit { try? FileManager.default.removeItem(at: directory) }
}
