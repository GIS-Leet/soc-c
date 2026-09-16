// 자동 테스트의 저장 위치·시간·실패 조건을 실제 계정과 분리한다.
import Foundation

enum TestRuntime {
    static var isTesting: Bool { ProcessInfo.processInfo.environment["UITEST"] != nil || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil || NSClassFromString("XCTestCase") != nil }
    static let directory: URL = {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("desk-isolated-" + UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }()
    static func storage(_ name: String, production: () -> URL) -> URL {
        isTesting ? directory.appendingPathComponent(name) : production()
    }
    static func install() { if isTesting { URLProtocol.registerClass(IsolatedNetworkProtocol.self) } }
    static var scenario: String { ProcessInfo.processInfo.environment["UITEST_FAILURE"] ?? "offline" }
    static func simulatedWrite() async throws {
        switch scenario {
        case "success": return
        case "delay": try await Task.sleep(for: .seconds(2)); return
        case "403", "500": throw NSError(domain: "DeskFixture", code: Int(scenario)!, userInfo: [NSLocalizedDescriptionKey: "격리된 테스트 응답 \(scenario)"])
        default: throw URLError(.notConnectedToInternet)
        }
    }
    struct ExternalAccess: LocalizedError { var errorDescription: String? { "테스트에서 외부 접근이 차단되었습니다." } }
    static func requireLiveAccess() throws { if isTesting { throw ExternalAccess() } }
}

// 테스트에서 예상하지 않은 HTTP 요청은 실제 소켓을 열기 전에 실패한다.
private final class IsolatedNetworkProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { ["http", "https"].contains(request.url?.scheme?.lowercased() ?? "") }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: TestRuntime.ExternalAccess()) }
    override func stopLoading() {}
}
