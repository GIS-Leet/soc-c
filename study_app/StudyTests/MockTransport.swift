// 응답을 보류하거나 실패시켜 네트워크 없이 경쟁 상태를 재현한다.
import Foundation
actor MockTransport {
    private(set) var calls = 0
    private var continuation: CheckedContinuation<Void, Error>?
    func hold() async throws { calls += 1; try await withCheckedThrowingContinuation { continuation = $0 } }
    func complete(_ error: Error? = nil) { if let error { continuation?.resume(throwing: error) } else { continuation?.resume() }; continuation = nil }
    func started(_ count: Int = 1) async { while calls < count { await Task.yield() } }
}
