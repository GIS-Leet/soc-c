// desk 데이터 모델 — Firebase JSON(사전/배열 혼재)을 구조체로. 경로·필드는 PC desk.html과 동일
import Foundation

enum FB {
    /// Firebase가 숫자 키를 배열로 준 경우까지 사전으로 통일. null 자식은 제거
    static func dict(_ any: Any?) -> [String: Any] {
        if let d = any as? [String: Any] { return d.filter { !($0.value is NSNull) } }
        if let a = any as? [Any] { var d: [String: Any] = [:]; for (i, v) in a.enumerated() where !(v is NSNull) { d[String(i)] = v }; return d }
        return [:]
    }
    static func ms(_ any: Any?) -> Double { (any as? Double) ?? (any as? CGFloat).map(Double.init) ?? (any as? NSNumber)?.doubleValue ?? Double((any as? Int) ?? 0) }
    static let day: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yyyy-MM-dd"; return f }()
    static func key(_ d: Date) -> String { day.string(from: d) }
}

struct Todo: Identifiable, Equatable {
    let id: String; var text: String; var done: Bool; var createdAt: Double; var due: String?
    static func parse(_ any: Any?) -> [Todo] {
        FB.dict(any).compactMap { k, v in
            guard let d = v as? [String: Any], let text = d["text"] as? String else { return nil }
            return Todo(id: k, text: text, done: d["done"] as? Bool ?? false, createdAt: FB.ms(d["createdAt"]), due: d["due"] as? String)
        }
        .sorted { a, b in
            if a.done != b.done { return !a.done }
            if let x = a.due, let y = b.due, x != y { return x < y }
            if (a.due == nil) != (b.due == nil) { return a.due != nil }
            return a.createdAt < b.createdAt
        }
    }
}

struct DDay: Identifiable, Equatable {
    let id: String; var label: String; var date: String
    static func parse(_ any: Any?) -> [DDay] {
        FB.dict(any).compactMap { k, v in
            guard let d = v as? [String: Any], let l = d["label"] as? String, let dt = d["date"] as? String else { return nil }
            return DDay(id: k, label: l, date: dt)
        }.sorted { $0.date < $1.date }
    }
    /// 오늘 기준 남은 일수 (음수면 지남)
    func days(from now: Date, cal: Calendar = .current) -> Int? {
        guard let d = FB.day.date(from: date) else { return nil }
        return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day
    }
    var badge: String { guard let n = days(from: Date()) else { return "" }; return n == 0 ? "D-Day" : n > 0 ? "D-\(n)" : "D+\(-n)" }
}

struct CalEvent: Identifiable, Equatable {
    let id: String; let date: String; var text: String
    /// desk/calendar 전체 → 날짜별 이벤트
    static func parse(_ any: Any?) -> [String: [CalEvent]] {
        var out: [String: [CalEvent]] = [:]
        for (date, v) in FB.dict(any) {
            out[date] = FB.dict(v).compactMap { k, e in (e as? [String: Any])?["text"].flatMap { $0 as? String }.map { CalEvent(id: k, date: date, text: $0) } }.sorted { $0.id < $1.id }
        }
        return out
    }
}

struct Note: Identifiable, Equatable {
    let id: String; var title: String; var md: String; var createdAt: Double; var updatedAt: Double; var pinned: Bool
    var hasInk: Bool = false   // 손글씨 페이지 있음(desk/ink/{id})
    var inkText: String = ""   // 손글씨 인식 텍스트(검색용)
    static func parse(_ any: Any?) -> [Note] {
        FB.dict(any).compactMap { k, v in
            guard let d = v as? [String: Any] else { return nil }
            return Note(id: k, title: d["title"] as? String ?? "", md: d["md"] as? String ?? "", createdAt: FB.ms(d["createdAt"]), updatedAt: FB.ms(d["updatedAt"]), pinned: d["pinned"] as? Bool ?? false, hasInk: d["ink"] as? Bool ?? false, inkText: d["inkText"] as? String ?? "")
        }.sorted { a, b in a.pinned != b.pinned ? a.pinned : a.updatedAt > b.updatedAt }
    }
    var displayTitle: String { title.isEmpty ? (md.split(separator: "\n").first.map(String.init) ?? "제목 없음") : title }
    /// 미리보기 — 마크다운 기호 걷어낸 첫 줄들
    var preview: String {
        md.replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "#", with: "").replacingOccurrences(of: "*", with: "").replacingOccurrences(of: "`", with: "")
            .split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty && $0 != title }.prefix(2).joined(separator: " ")
    }
    static func timeLabel(_ ms: Double, now: Date = Date(), cal: Calendar = .current) -> String {
        let d = Date(timeIntervalSince1970: ms / 1000)
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR")
        if cal.isDateInToday(d) { f.dateFormat = "'오늘' HH:mm"; return f.string(from: d) }
        if cal.isDateInYesterday(d) { return "어제" }
        f.dateFormat = cal.component(.year, from: d) == cal.component(.year, from: now) ? "M/d" : "yyyy/M/d"
        return f.string(from: d)
    }
}

struct StudySession: Equatable { let date: String; let min: Int; let subject: String }
enum StudyStats {
    static func parse(_ any: Any?) -> [StudySession] {
        FB.dict(any).compactMap { _, v in
            guard let d = v as? [String: Any], let date = d["date"] as? String else { return nil }
            return StudySession(date: date, min: (d["min"] as? Int) ?? Int(FB.ms(d["min"])), subject: d["subject"] as? String ?? "")
        }
    }
    static func minutesByDay(_ s: [StudySession]) -> [String: Int] { s.reduce(into: [:]) { $0[$1.date, default: 0] += $1.min } }
    /// desk와 같은 규칙: 오늘부터 거꾸로, 오늘 기록이 없으면 어제부터
    static func streak(_ byDay: [String: Int], now: Date = Date(), cal: Calendar = .current) -> Int {
        var d = cal.startOfDay(for: now)
        if byDay[FB.key(d)] == nil { d = cal.date(byAdding: .day, value: -1, to: d)! }
        var n = 0
        while byDay[FB.key(d)] != nil { n += 1; d = cal.date(byAdding: .day, value: -1, to: d)! }
        return n
    }
}

/// 홈페이지 공지 — notices/{id} {date "2026.08.06", text, createdAt}. 최신 3개가 홈페이지에 표시
struct Notice: Identifiable, Equatable {
    let id: String; var date: String; var text: String; var createdAt: Double
    static func parse(_ any: Any?) -> [Notice] {
        FB.dict(any).compactMap { k, v in
            guard let d = v as? [String: Any], let text = d["text"] as? String else { return nil }
            return Notice(id: k, date: d["date"] as? String ?? "", text: text, createdAt: FB.ms(d["createdAt"]))
        }.sorted { $0.createdAt > $1.createdAt }
    }
    /// PC desk와 같은 날짜 표기 yyyy.MM.dd
    static func dateString(_ d: Date = Date()) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.dateFormat = "yyyy.MM.dd"; return f.string(from: d) }
}
