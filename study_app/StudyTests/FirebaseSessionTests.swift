// 토큰 갱신 경쟁·일시적 오류·로그아웃 중 응답을 외부 계정 없이 검증한다.
import XCTest
@testable import Desk

final class FirebaseSessionTests: XCTestCase {
    final class Credentials: @unchecked Sendable {
        private let lock = NSLock(); private var stored: String? = "test-refresh"
        var value: String? { get { lock.lock(); defer { lock.unlock() }; return stored } set { lock.lock(); stored = newValue; lock.unlock() } }
    }
    actor Server {
        var calls = 0; let status: Int; let json: String; var barrier: CheckedContinuation<Void, Never>?
        init(status: Int = 200, json: String = "{\"id_token\":\"fixture-id\",\"refresh_token\":\"rotated\",\"expires_in\":\"3600\"}") { self.status = status; self.json = json }
        func request(_ request: URLRequest) async throws -> (Data, URLResponse) {
            calls += 1; await withCheckedContinuation { barrier = $0 }
            return (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        func release() { barrier?.resume(); barrier = nil }
        func wait(_ count: Int = 1) async { while calls < count { await Task.yield() } }
    }
    func session(_ credentials: Credentials, _ server: Server) -> FirebaseSession {
        FirebaseSession(dependencies: .init(apiKey: { "fixture-key" }, readRefresh: { credentials.value }, writeRefresh: { credentials.value = $0 }, send: { try await server.request($0) }))
    }
    func test_18개요청은갱신1회를공유한다() async throws {
        let credentials = Credentials(), server = Server(); let session = session(credentials, server)
        let group = Task { try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<18 { group.addTask { try await session.token() } }
            var tokens = [String](); for try await token in group { tokens.append(token) }; return tokens
        }}
        await server.wait(); for _ in 0..<100 { await Task.yield() }; await server.release()
        let tokens = try await group.value; XCTAssertEqual(tokens, Array(repeating: "fixture-id", count: 18)); let calls = await server.calls; XCTAssertEqual(calls, 1); XCTAssertEqual(credentials.value, "rotated")
    }
    func test_429와500은갱신자격을보존한다() async {
        for status in [429,500] {
            let credentials = Credentials(), server = Server(status: status, json: "{}"), session = session(credentials, server)
            let task = Task { try await session.token() }; await server.wait(); await server.release()
            do { _ = try await task.value; XCTFail("실패 응답이 성공 처리됨") } catch {}
            XCTAssertEqual(credentials.value, "test-refresh")
        }
    }
    func test_로그아웃뒤이전갱신응답이세션을되살리지않는다() async {
        let credentials = Credentials(), server = Server(), session = session(credentials, server)
        let task = Task { try await session.token() }; await server.wait(); await session.signOut(); await server.release()
        do { _ = try await task.value; XCTFail("로그아웃 뒤 세션 복원") } catch {}
        XCTAssertNil(credentials.value); let revision = await session.sessionRevision; XCTAssertEqual(revision, 1)
    }
    func test_확정된자격무효만토큰을지운다() async {
        let credentials = Credentials(), server = Server(status: 400, json: "{\"error\":{\"message\":\"INVALID_REFRESH_TOKEN\"}}"), session = session(credentials, server)
        let task = Task { try await session.token() }; await server.wait(); await server.release()
        do { _ = try await task.value; XCTFail("무효 토큰") } catch {}
        XCTAssertNil(credentials.value)
    }
    func test_로그인교체중과실패뒤이전계정토큰을주지않는다() async throws {
        let credentials = Credentials(), server = Server(), session = session(credentials, server)
        let initial = Task { try await session.token() }; await server.wait(); await server.release(); _ = try await initial.value
        let replacement = Task { try await session.signIn(googleIDToken: "new-user", accessToken: "fixture") }
        await server.wait(2)
        do { _ = try await session.token(); XCTFail("교체 중 이전 계정 토큰 노출") } catch {}
        XCTAssertNil(credentials.value)
        await server.release() // 갱신 형식의 응답이므로 signIn 검증은 실패한다.
        do { _ = try await replacement.value; XCTFail("잘못된 로그인 응답") } catch {}
        do { _ = try await session.token(); XCTFail("실패 뒤 이전 계정으로 복귀") } catch {}
        XCTAssertNil(credentials.value)
    }

    func test_갱신결과를기다리던호출자도복귀시세션을재확인한다() async throws {
        let credentials = Credentials(), server = Server(), session = session(credentials, server)
        let barrier = MockTransport()
        let completedRefresh = Task<String, Error> { try await barrier.hold(); return "old-user-token" }
        let revision = await session.sessionRevision
        let waiter = Task { try await session.validatedResult(completedRefresh, revision: revision) }
        await barrier.started(); await session.signOut(); await barrier.complete()
        do { _ = try await waiter.value; XCTFail("로그아웃 후 대기자가 이전 토큰을 반환") } catch {}
    }

}
