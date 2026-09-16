// Firebase 세션은 갱신 요청을 공유하고 일시적 오류에서 자격 증명을 보존한다.
import Foundation

actor FirebaseSession {
    static let shared = FirebaseSession()
    static let changed = Notification.Name("DeskFirebaseSessionChanged")
    struct NotSignedIn: LocalizedError { var errorDescription: String? { "Firebase 로그인이 필요합니다." } }
    struct NoAPIKey: LocalizedError { var errorDescription: String? { "GoogleService-Info.plist 의 API_KEY 가 없습니다." } }
    struct ServiceError: LocalizedError { let status: Int; var errorDescription: String? { "인증 서버 연결에 실패했습니다 (HTTP \(status)). 다시 시도하세요." } }
    struct Dependencies {
        var apiKey: () -> String?
        var readRefresh: () -> String?
        var writeRefresh: (String?) -> Void
        var send: (URLRequest) async throws -> (Data, URLResponse)
        var now: () -> Date = Date.init
        var readEmail: () -> String? = { nil }
        var writeEmail: (String?) -> Void = { _ in }
        static var live: Dependencies { Dependencies(apiKey: { FirebaseSession.apiKey }, readRefresh: { TestRuntime.isTesting ? nil : Keychain.get("fb-refresh") }, writeRefresh: { value in
            guard !TestRuntime.isTesting else { return }; if let value { Keychain.set(value, for: "fb-refresh") } else { Keychain.delete("fb-refresh") }
        }, send: { request in try TestRuntime.requireLiveAccess(); return try await URLSession.shared.data(for: request) }, readEmail: { TestRuntime.isTesting ? nil : UserDefaults.standard.string(forKey: "fb-email") }, writeEmail: { email in guard !TestRuntime.isTesting else { return }; UserDefaults.standard.set(email, forKey: "fb-email") }) }
    }
    private let dependencies: Dependencies
    private var replacingSession = false
    private var idToken: String?
    private var expiresAt = Date.distantPast
    private(set) var email: String?
    private(set) var sessionRevision: UInt64 = 0
    private var refreshTask: (id: UUID, task: Task<String, Error>)?
    init(dependencies: Dependencies = .live) { self.dependencies = dependencies; self.email = dependencies.readEmail() }
    static var apiKey: String? {
        guard !TestRuntime.isTesting else { return nil }
        if let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"), let data = NSDictionary(contentsOf: url), let key = data["API_KEY"] as? String { TimetableStore.apiKey = key; return key }
        return TimetableStore.apiKey
    }
    var hasRefreshToken: Bool { dependencies.readRefresh() != nil }
    private func advanceSession() {
        sessionRevision &+= 1
        Task { @MainActor in NotificationCenter.default.post(name: FirebaseSession.changed, object: nil) }
    }
    func signIn(googleIDToken: String, accessToken: String) async throws -> String? {
        guard let key = dependencies.apiKey() else { throw NoAPIKey() }
        refreshTask?.task.cancel(); refreshTask = nil
        idToken = nil; expiresAt = .distantPast; email = nil
        dependencies.writeRefresh(nil); dependencies.writeEmail(nil)
        replacingSession = true; advanceSession(); let revision = sessionRevision
        defer { if sessionRevision == revision { replacingSession = false } }
        var request = URLRequest(url: URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=\(key)")!)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var post = URLComponents(); post.queryItems = [URLQueryItem(name: "id_token", value: googleIDToken), URLQueryItem(name: "access_token", value: accessToken), URLQueryItem(name: "providerId", value: "google.com")]
        request.httpBody = try JSONSerialization.data(withJSONObject: ["postBody": post.percentEncodedQuery ?? "", "requestUri": "http://localhost", "returnSecureToken": true, "returnIdpCredential": true])
        let (data, response) = try await dependencies.send(request)
        guard revision == sessionRevision else { throw NotSignedIn() }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let id = json["idToken"] as? String, let refresh = json["refreshToken"] as? String else { throw ServiceError(status: status) }
        apply(id: id, expiresIn: json["expiresIn"] as? String); dependencies.writeRefresh(refresh)
        email = json["email"] as? String; dependencies.writeEmail(email); replacingSession = false; advanceSession()
        return email
    }
    func token() async throws -> String {
        guard !replacingSession else { throw NotSignedIn() }
        if let idToken, expiresAt > dependencies.now().addingTimeInterval(300) { return idToken }
        if let refreshTask { return try await validatedResult(refreshTask.task, revision: sessionRevision) }
        let id = UUID(), revision = sessionRevision
        let task = Task { try await self.refresh(revision: revision) }
        refreshTask = (id, task)
        defer { if refreshTask?.id == id { refreshTask = nil } }
        return try await validatedResult(task, revision: revision)
    }
    // 공유 갱신 완료 뒤에도 대기자가 복귀하기 전에 계정이 바뀌었을 수 있다.
    func validatedResult(_ task: Task<String, Error>, revision: UInt64) async throws -> String {
        let value = try await task.value
        guard sessionRevision == revision, !replacingSession else { throw NotSignedIn() }
        return value
    }
    private func refresh(revision: UInt64) async throws -> String {
        guard let key = dependencies.apiKey() else { throw NoAPIKey() }
        guard let refresh = dependencies.readRefresh() else { throw NotSignedIn() }
        var request = URLRequest(url: URL(string: "https://securetoken.googleapis.com/v1/token?key=\(key)")!)
        request.httpMethod = "POST"; request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents(); form.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token"), URLQueryItem(name: "refresh_token", value: refresh)]
        request.httpBody = Data((form.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
        let (data, response) = try await dependencies.send(request)
        guard revision == sessionRevision, !Task.isCancelled else { throw NotSignedIn() }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard status == 200, let id = json?["id_token"] as? String else {
            let reason = (json?["error"] as? [String: Any])?["message"] as? String
            if [400,401].contains(status), let reason, ["USER_DISABLED", "USER_NOT_FOUND", "INVALID_REFRESH_TOKEN", "TOKEN_EXPIRED", "INVALID_GRANT"].contains(reason) { signOut(); throw NotSignedIn() }
            throw ServiceError(status: status)
        }
        if let rotated = json?["refresh_token"] as? String { dependencies.writeRefresh(rotated) }
        apply(id: id, expiresIn: json?["expires_in"] as? String)
        return id
    }
    private func apply(id: String, expiresIn: String?) { idToken = id; expiresAt = dependencies.now().addingTimeInterval(Double(expiresIn ?? "3600") ?? 3600) }
    func invalidateToken() { idToken = nil; expiresAt = .distantPast }
    func signOut() { replacingSession = false; refreshTask?.task.cancel(); refreshTask = nil; idToken = nil; expiresAt = .distantPast; email = nil; dependencies.writeRefresh(nil); dependencies.writeEmail(nil); advanceSession() }
}
