// Firebase Realtime Database REST 클라이언트 — 읽기/쓰기 + 실시간 스트림(SSE). 경로·규칙은 PC desk.html과 동일
import Foundation

enum RTDB {
    static let base = URL(string: "https://soc-c-qna-default-rtdb.firebaseio.com")!
    struct HTTPError: LocalizedError { let code: Int; let body: String; var errorDescription: String? { "HTTP \(code): \(body.prefix(200))" } }

    static func url(_ path: String, auth: Bool = true, extra: [String: String] = [:]) async throws -> URL {
        try TestRuntime.requireLiveAccess()
        var c = URLComponents(url: base.appendingPathComponent(path + ".json"), resolvingAgainstBaseURL: false)!
        var items = extra.map { URLQueryItem(name: $0.key, value: $0.value) }
        if auth { items.append(URLQueryItem(name: "auth", value: try await FirebaseSession.shared.token())) }
        c.queryItems = items.isEmpty ? nil : items
        return c.url!
    }
    private static func send(_ method: String, _ path: String, body: Any? = nil) async throws -> Any? {
        var req = URLRequest(url: try await url(path)); req.httpMethod = method
        if let body { req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.fragmentsAllowed]) }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw HTTPError(code: code, body: String(data: data, encoding: .utf8) ?? "") }
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
    struct VersionedValue { let value: Any?; let etag: String }
    static func getWithETag(_ path: String) async throws -> VersionedValue {
        var request = URLRequest(url: try await url(path)); request.setValue("true", forHTTPHeaderField: "X-Firebase-ETag")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let etag = response.value(forHTTPHeaderField: "ETag") else {
            throw HTTPError(code: (response as? HTTPURLResponse)?.statusCode ?? 0, body: "버전 정보를 읽지 못했습니다.")
        }
        let value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return VersionedValue(value: value is NSNull ? nil : value, etag: etag)
    }
    static func putIfMatch(_ path: String, _ value: Any, etag: String) async throws -> Bool {
        var request = URLRequest(url: try await url(path)); request.httpMethod = "PUT"
        request.setValue(etag, forHTTPHeaderField: "If-Match"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        let (_, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 412 { return false }
        guard (200..<300).contains(code) else { throw HTTPError(code: code, body: "조건부 저장에 실패했습니다.") }
        return true
    }
    static func get(_ path: String) async throws -> Any? { let v = try await send("GET", path); return v is NSNull ? nil : v }
    static func put(_ path: String, _ value: Any) async throws { _ = try await send("PUT", path, body: value) }
    static func patch(_ path: String, _ value: [String: Any]) async throws { _ = try await send("PATCH", path, body: value) }
    @discardableResult static func push(_ path: String, _ value: [String: Any]) async throws -> String {
        ((try await send("POST", path, body: value)) as? [String: Any])?["name"] as? String ?? ""
    }
    static func delete(_ path: String) async throws { _ = try await send("DELETE", path) }

    struct Snapshot { let value: Any?; let acknowledgedBeforeConnection: Set<String> }

    /// 실시간 스트림: 변경마다 그 경로의 전체 스냅샷을 내보냄. 끊기면 다시 연결
    static func observe(_ path: String, acknowledgedIDs: @escaping @Sendable () -> Set<String> = { [] }, onError: @escaping @Sendable (String) -> Void = { _ in }) -> AsyncStream<Snapshot> {
        AsyncStream { cont in
            let task = Task {
                var snapshot: Any? = nil
                while !Task.isCancelled {
                    do {
                        let prior = acknowledgedIDs()
                        var initial = true
                        var req = URLRequest(url: try await url(path)); req.setValue("text/event-stream", forHTTPHeaderField: "Accept"); req.timeoutInterval = 3600
                        let (bytes, resp) = try await URLSession.shared.bytes(for: req)
                        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { onError("데이터 연결 실패 (HTTP \((resp as? HTTPURLResponse)?.statusCode ?? 0))"); try await Task.sleep(for: .seconds(5)); continue }
                        var event = ""
                        for try await line in bytes.lines {
                            if Task.isCancelled { return }
                            if line.hasPrefix("event:") { event = line.dropFirst(6).trimmingCharacters(in: .whitespaces); continue }
                            guard line.hasPrefix("data:") else { continue }
                            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                            if event == "auth_revoked" { await FirebaseSession.shared.invalidateToken(); onError("인증 갱신 중"); break }
                            if event == "cancel" { onError("데이터 읽기 권한이 거절되었습니다."); break }   // 토큰 만료 → 재연결
                            guard event == "put" || event == "patch", let d = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any],
                                  let p = d["path"] as? String else { continue }
                            let comps = p.split(separator: "/").map(String.init)
                            if event == "put" { snapshot = JSONTree.set(snapshot, comps, d["data"] is NSNull ? nil : d["data"]) }
                            else if let obj = d["data"] as? [String: Any] { for (k, v) in obj { snapshot = JSONTree.set(snapshot, comps + k.split(separator: "/").map(String.init), v is NSNull ? nil : v) } }
                            let complete = initial && event == "put" && comps.isEmpty
                            cont.yield(Snapshot(value: snapshot, acknowledgedBeforeConnection: complete ? prior : []))
                            if complete { initial = false }
                        }
                    } catch { if Task.isCancelled { return }; onError(error.localizedDescription); if TestRuntime.isTesting { cont.finish(); return } }
                    try? await Task.sleep(for: .seconds(3))
                }
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }
}

/// JSON 트리에 경로로 값 넣기 (배열은 사전으로 바꿔 다룸)
enum JSONTree {
    /// FB.dict 와 같음(확장 타깃에는 DeskModels 가 없어 여기 둠)
    static func asDict(_ any: Any?) -> [String: Any] {
        if let d = any as? [String: Any] { return d.filter { !($0.value is NSNull) } }
        if let a = any as? [Any] { var d: [String: Any] = [:]; for (i, v) in a.enumerated() where !(v is NSNull) { d[String(i)] = v }; return d }
        return [:]
    }
    static func set(_ root: Any?, _ path: [String], _ value: Any?) -> Any? {
        guard let head = path.first else { return value }
        var dict = asDict(root)
        let child = set(dict[head], Array(path.dropFirst()), value)
        if let child { dict[head] = child } else { dict.removeValue(forKey: head) }
        return dict.isEmpty ? nil : dict
    }
}
