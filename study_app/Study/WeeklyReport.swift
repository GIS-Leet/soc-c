// 주간 공부 리포트 — 세션·출제 이력으로 이번 주 요약을 만들어 일요일 20:00 알림으로 예약 (앱이 열릴 때마다 최신 값으로 갱신)
import Foundation
import UserNotifications

enum WeeklyReport {
    struct Summary: Equatable { let minutes: Int; let days: Int; let accuracy: Int?; let weak: [String] }
    static func weekStart(_ now: Date, cal: Calendar = .current) -> Date {
        let d = cal.startOfDay(for: now); let w = (cal.component(.weekday, from: d) + 5) % 7   // 월요일 시작
        return cal.date(byAdding: .day, value: -w, to: d)!
    }
    static func summary(sessions: [StudySession], quizlog: [String: Any], now: Date = Date(), cal: Calendar = .current) -> Summary {
        let ws = weekStart(now, cal: cal), keys = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: ws) }.map(FB.key)
        let byDay = StudyStats.minutesByDay(sessions.filter { keys.contains($0.date) && $0.subject != "스트릭 프리즈" })
        let minutes = byDay.values.reduce(0, +), days = byDay.keys.count
        var right = 0, wrong = 0; var weakest: [(String, Int)] = []
        for (id, v) in quizlog {
            guard let e = v as? [String: Any], FB.ms(e["last"]) >= ws.timeIntervalSince1970 * 1000 else { continue }
            let r = Int(FB.ms(e["right"])), w = Int(FB.ms(e["wrong"])), st = Int(FB.ms(e["streak"]))
            right += r; wrong += w
            if w > 0, st < 2 { weakest.append((id, w)) }
        }
        let acc = right + wrong > 0 ? Int(Double(right) / Double(right + wrong) * 100) : nil
        return Summary(minutes: minutes, days: days, accuracy: acc, weak: weakest.sorted { $0.1 > $1.1 }.prefix(3).map { $0.0 })
    }
    /// 일요일 20:00 (이미 지났으면 다음 주) 알림 예약. 내용은 지금 기준 요약
    static func schedule(_ s: Summary, now: Date = Date(), cal: Calendar = .current) {
        let nc = UNUserNotificationCenter.current()
        nc.removePendingNotificationRequests(withIdentifiers: ["weekly-report"])
        var comps = cal.dateComponents([.year, .month, .day], from: now)
        let wd = cal.component(.weekday, from: now)            // 1=일
        var days = (8 - wd) % 7; if days == 0, cal.component(.hour, from: now) >= 20 { days = 7 }
        if let d = cal.date(byAdding: .day, value: days, to: cal.startOfDay(for: now)) { comps = cal.dateComponents([.year, .month, .day], from: d) }
        comps.hour = 20; comps.minute = 0
        let c = UNMutableNotificationContent(); c.title = "이번 주 공부"
        var body = "\(s.days)일 · \(s.minutes)분"
        if let a = s.accuracy { body += " · 정답률 \(a)%" }
        if !s.weak.isEmpty { body += " · 약한 문제 \(s.weak.count)개 — 다음 주에 먼저 나옵니다" }
        c.body = body; c.sound = .default
        nc.add(UNNotificationRequest(identifier: "weekly-report", content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
    }
}
