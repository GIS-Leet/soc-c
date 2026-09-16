// 카드 서재 데이터 — 홈페이지 과목 JSON 전체를 카드 목록으로(필드는 문자열·2차원 목록 그대로), 오늘까지 공부한 범위·아무 카드 뽑기·읽음 기록
import Foundation

struct LibCard: Identifiable, Hashable {
    enum Kind: Hashable { case geo, kana, jpSentence, english }
    let subject: String; let index: Int; let kind: Kind
    var text: [String: String]; var lists: [String: [[String]]]; var rows: [String]
    var id: String { "\(subject)-\(index + 1)" }
    var day: Int { index + 1 }
    var title: String { text["t"] ?? "Day \(day)" }
    /// 목록 둘째 줄 — 지리·가나는 한 줄 정의, 문장 과정은 오늘 문장
    var subtitle: String { ((kind == .geo || kind == .kana) ? text["m"] : text["s"]) ?? "" }
    func matches(_ q: String) -> Bool {
        let q = q.lowercased()
        return text.values.contains { $0.lowercased().contains(q) } || rows.contains { $0.contains(q) }
            || lists.values.contains { $0.contains { $0.contains { $0.lowercased().contains(q) } } }
    }
}

struct CardDeck: Equatable {
    let subject: String; let start: Date; let cards: [LibCard]
    func elapsed(_ now: Date, cal: Calendar = .current) -> Int { cal.dateComponents([.day], from: cal.startOfDay(for: start), to: cal.startOfDay(for: now)).day ?? 0 }
    /// 오늘 카드 번호(0부터, 과정이 끝나면 처음부터 다시). 시작 전이면 nil
    func todayIndex(_ now: Date, cal: Calendar = .current) -> Int? { let i = elapsed(now, cal: cal); return i < 0 || cards.isEmpty ? nil : i % cards.count }
    /// 오늘까지 한 번이라도 공부한 카드
    func studied(_ now: Date, cal: Calendar = .current) -> [LibCard] { let i = elapsed(now, cal: cal); return i < 0 ? [] : Array(cards.prefix(i + 1)) }
}

enum CardLibrary {
    static func parse(subject: String, json: Data) -> CardDeck? {
        guard let root = try? JSONSerialization.jsonObject(with: json) as? [String: Any], let s = root["start"] as? String,
              let days = root["days"] as? [[String: Any]], let start = FB.day.date(from: s) else { return nil }
        let cards = days.enumerated().map { i, c -> LibCard in
            var text: [String: String] = [:], lists: [String: [[String]]] = [:], rows: [String] = []
            for (k, v) in c {
                if let str = v as? String { text[k] = str }
                else if let a = v as? [[Any]] { lists[k] = a.map { $0.map { "\($0)" } } }
                else if let a = v as? [Any] { let strs = a.map { "\($0)" }; if k == "rows" { rows = strs } else { lists[k] = [strs] } }
            }
            let kind: LibCard.Kind = subject == "지리" ? .geo : subject == "영어" ? .english : (text["type"] == "kana" ? .kana : .jpSentence)
            return LibCard(subject: subject, index: i, kind: kind, text: text, lists: lists, rows: rows)
        }
        return CardDeck(subject: subject, start: start, cards: cards)
    }
    static func load(force: Bool = false) async -> [CardDeck] {
        var out: [CardDeck] = []
        for s in DailyCards.sources {
            if let d = await DailyCards.data(file: s.file, force: force), let deck = parse(subject: s.subject, json: d) { out.append(deck) }
        }
        return out
    }
    /// 아무 카드 한 장 — 오늘까지 공부한 카드 중 안 읽은 것 먼저, 다 읽었으면 공부한 것 전체, 시작 전이면 전체에서
    static func pick(_ decks: [CardDeck], now: Date, read: Set<String>, cal: Calendar = .current, random: (Int) -> Int = { Int.random(in: 0..<$0) }) -> LibCard? {
        let studied = decks.flatMap { $0.studied(now, cal: cal) }
        let unread = studied.filter { !read.contains($0.id) }
        let pool = !unread.isEmpty ? unread : !studied.isEmpty ? studied : decks.flatMap(\.cards)
        return pool.isEmpty ? nil : pool[random(pool.count)]
    }
}

/// 읽은 카드(기기별)
enum CardReads {
    static let key = "cardLibraryRead"
    static func all() -> Set<String> { Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }
    static func mark(_ id: String) { var s = all(); if s.insert(id).inserted { UserDefaults.standard.set(Array(s), forKey: key) } }
}
