// 자료실 — GitHub 저장소(비공개) 폴더의 파일 목록·업로드·삭제·다운로드. PC desk와 같은 저장소·폴더·토큰(desk/settings/github)
import Foundation

struct GHFile: Identifiable, Equatable { let name: String; let path: String; let sha: String; let size: Int; let downloadURL: String?; var repo: String? = nil; var id: String { path } }

struct GitHubFiles {
    static let folders = ["수업", "평가", "학습자료"]   // desk.html의 data-folder
    let token: String; let repo: String
    var headers: [String: String] { ["Authorization": "Bearer \(token)", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"] }
    struct HTTP: LocalizedError { let code: Int; let msg: String; var errorDescription: String? { "GitHub \(code): \(msg.prefix(160))" } }

    func url(_ folder: String, _ name: String? = nil) -> URL {
        var p = "https://api.github.com/repos/\(repo)/contents/" + folder.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!
        if let name { p += "/" + name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)! }
        return URL(string: p)!
    }
    private func send(_ method: String, _ url: URL, body: [String: Any]? = nil) async throws -> Data {
        try TestRuntime.requireLiveAccess()
        var r = URLRequest(url: url); r.httpMethod = method; headers.forEach { r.setValue($1, forHTTPHeaderField: $0) }
        if let body { r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, resp) = try await URLSession.shared.data(for: r)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw HTTP(code: code, msg: String(data: data, encoding: .utf8) ?? "") }
        return data
    }
    func list(_ folder: String) async throws -> [GHFile] {
        let data = try await send("GET", url(folder))
        guard let arr = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return arr.filter { $0["type"] as? String == "file" }.compactMap { f in
            guard let n = f["name"] as? String, let p = f["path"] as? String, let sha = f["sha"] as? String else { return nil }
            return GHFile(name: n, path: p, sha: sha, size: f["size"] as? Int ?? 0, downloadURL: f["download_url"] as? String, repo: repo)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    func upload(_ folder: String, name: String, data: Data, existingSha: String?) async throws {
        var body: [String: Any] = ["message": "업로드: \(name) (Desk 앱)", "content": data.base64EncodedString()]
        if let existingSha { body["sha"] = existingSha }
        _ = try await send("PUT", url(folder, name), body: body)
    }
    func delete(_ f: GHFile) async throws {
        _ = try await send("DELETE", URL(string: "https://api.github.com/repos/\(repo)/contents/" + f.path.split(separator: "/").map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)! }.joined(separator: "/"))!, body: ["message": "삭제: \(f.name) (Desk 앱)", "sha": f.sha])
    }
    /// 비공개 저장소 파일 내려받기 → 임시 파일 URL
    func download(_ f: GHFile) async throws -> URL {
        try TestRuntime.requireLiveAccess()
        var r = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/contents/" + f.path.split(separator: "/").map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)! }.joined(separator: "/"))!)
        headers.forEach { r.setValue($1, forHTTPHeaderField: $0) }; r.setValue("application/vnd.github.raw", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: r)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw HTTP(code: (resp as? HTTPURLResponse)?.statusCode ?? 0, msg: "download") }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("materials", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let out = dir.appendingPathComponent(f.name); try data.write(to: out); return out
    }
}
