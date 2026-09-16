// 오늘의 카드 — 홈페이지 data/{geography,japanese,english}-daily.json 을 받아(1시간 캐시) 오늘 몇 일차인지·제목을 계산. study.html·desk.html 의 Day 계산과 같음
import Foundation

struct DailyCard: Equatable, Identifiable { var id: String { subject }; var subject: String; var day: Int; var round: Int; var title: String; var line: String; var left: Int }

enum DailyCards {
    static let sources: [(subject: String, file: String)] = [("지리", "geography-daily.json"), ("일본어", "japanese-daily.json"), ("영어", "english-daily.json")]
    static let cacheDir: URL = { let d = TestRuntime.storage("daily") { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("daily", isDirectory: true) }; try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }()
    /// 과목 파일 — 캐시가 1시간 안이면 그대로, 아니면 다시 받음(실패하면 옛 캐시). 오늘 카드·카드 서재 공용
    static func data(file: String, force: Bool = false) async -> Data? {
        if TestRuntime.isTesting { return nil }
        let u = cacheDir.appendingPathComponent(file)
        let fresh = (try? u.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate).map { Date().timeIntervalSince($0) < 3600 } ?? false
        if !force, fresh, let d = try? Data(contentsOf: u) { return d }
        if let (d, r) = try? await URLSession.shared.data(from: URL(string: "https://nyuheatgis.com/data/\(file)?v=\(Int(Date().timeIntervalSince1970 / 3600))")!), (r as? HTTPURLResponse)?.statusCode == 200 { try? d.write(to: u, options: .atomic); return d }
        return try? Data(contentsOf: u)
    }
    static func load(force: Bool = false) async -> [DailyCard] {
        var out: [DailyCard] = []
        for s in sources { if let data = await data(file: s.file, force: force), let c = today(subject: s.subject, json: data) { out.append(c) } }
        return out
    }
    static func today(subject: String, json: Data, now: Date = Date(), cal: Calendar = .current) -> DailyCard? {
        guard let root = try? JSONSerialization.jsonObject(with: json) as? [String: Any], let start = root["start"] as? String, let days = root["days"] as? [[String: Any]], !days.isEmpty else { return nil }
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yyyy-MM-dd"
        guard let sd = f.date(from: start) else { return nil }
        let i = max(0, cal.dateComponents([.day], from: cal.startOfDay(for: sd), to: cal.startOfDay(for: now)).day ?? 0)
        let n = days.count, c = days[i % n]
        let title = c["t"] as? String ?? ""
        let line = (c["s"] as? String) ?? (c["m"] as? String) ?? ""
        return DailyCard(subject: subject, day: i % n + 1, round: i / n + 1, title: title, line: line, left: n - 1 - i)
    }
}
