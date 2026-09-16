// 일정 위젯·일정 알림용 스냅샷 모델 — desk/calendar 와 Apple 캘린더 일정을 날짜별로 App Group 에 저장(앱이 쓰고 위젯이 읽음)
import Foundation

struct WidgetEvent: Codable, Equatable, Identifiable {
    var id: String; var date: String; var title: String; var minutes: Int?; var source: String   // source: desk | apple
    var colorHex: String? = nil
    var timeLabel: String? { minutes.map { String(format: "%02d:%02d", $0 / 60, $0 % 60) } }

    /// desk 텍스트 "16:30 회의" → (시각, 제목). 시각 표기 없으면 nil
    static func split(_ text: String) -> (minutes: Int?, title: String) {
        let t = text.trimmingCharacters(in: .whitespaces)
        if let r = t.range(of: #"^(\d{1,2}):(\d{2})\s*"#, options: .regularExpression) {
            let hm = t[r].trimmingCharacters(in: .whitespaces).split(separator: ":")
            if hm.count == 2, let h = Int(hm[0]), let m = Int(hm[1]), h < 24, m < 60 { let title = String(t[r.upperBound...]); return (h * 60 + m, title.isEmpty ? t : title) }
        }
        if let r = t.range(of: #"^(오전|오후)\s?(\d{1,2})시(\s?(\d{1,2})분)?\s*"#, options: .regularExpression) {
            let s = String(t[r]); let nums = s.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
            if let h0 = nums.first { var h = h0 % 12; if s.hasPrefix("오후") { h += 12 }; let m = nums.count > 1 ? nums[1] : 0; let title = String(t[r.upperBound...]); return (h * 60 + m, title.isEmpty ? t : title) }
        }
        return (nil, t)
    }
    /// 표시 순서: 시각 있는 것은 시각순, 종일은 뒤
    static func order(_ list: [WidgetEvent]) -> [WidgetEvent] { list.sorted { ($0.minutes ?? 10_000, $0.title) < ($1.minutes ?? 10_000, $1.title) } }
    static func on(_ list: [WidgetEvent], _ key: String) -> [WidgetEvent] { order(list.filter { $0.date == key }) }
    static let day: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yyyy-MM-dd"; return f }()
    static func key(_ d: Date) -> String { day.string(from: d) }
    /// 날짜 라벨: 오늘·내일·M/D (요일)
    static func dayLabel(_ key: String, now: Date = Date(), cal: Calendar = .current) -> String {
        guard let d = day.date(from: key) else { return key }
        let n = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day ?? 0
        let w = DateFormatter(); w.locale = Locale(identifier: "ko_KR"); w.dateFormat = "E"
        if n == 0 { return "오늘" }; if n == 1 { return "내일" }
        let p = key.split(separator: "-"); return "\(Int(p[1]) ?? 0)/\(Int(p[2]) ?? 0) (\(w.string(from: d)))"
    }
}

/// 일정 알림 계획 — 매일 아침 요약 + 시각 있는 일정 10분 전. 순수 함수라 테스트 가능
enum EventAlarmPlan {
    struct Item: Equatable { var id: String; var fire: Date; var title: String; var body: String }
    static func items(_ events: [WidgetEvent], now: Date, days: Int = 7, morning: Int = 7 * 60, before: Int = 10, cal: Calendar = .current) -> [Item] {
        var out: [Item] = []
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: cal.startOfDay(for: now)) else { continue }
            let k = WidgetEvent.key(d); let list = WidgetEvent.on(events, k); guard !list.isEmpty else { continue }
            if let m = cal.date(bySettingHour: morning / 60, minute: morning % 60, second: 0, of: d), m > now {
                let lines = list.prefix(6).map { ($0.timeLabel.map { $0 + " " } ?? "") + $0.title }.joined(separator: "\n") + (list.count > 6 ? "\n외 \(list.count - 6)개" : "")
                out.append(Item(id: "event-day-\(k)", fire: m, title: (i == 0 ? "오늘" : WidgetEvent.dayLabel(k, now: now, cal: cal)) + " 일정 \(list.count)개", body: lines))
            }
            for e in list { guard let mins = e.minutes, let f = cal.date(bySettingHour: mins / 60, minute: mins % 60, second: 0, of: d)?.addingTimeInterval(-Double(before) * 60), f > now else { continue }
                out.append(Item(id: "event-\(k)-\(e.id)", fire: f, title: "\(before)분 뒤 · \(e.timeLabel ?? "")", body: e.title)) }
        }
        return out.sorted { $0.fire < $1.fire }
    }
}
