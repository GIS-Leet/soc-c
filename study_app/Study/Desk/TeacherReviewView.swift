// 주간 리뷰(교사용) — 반별 진도 편차·미답변·이번 주 질문·다음 주 일정·D-day 를 한 장으로. 일요일 19:30 알림 + 더보기 화면
import SwiftUI
import UserNotifications

struct TeacherReview: Equatable {
    struct ClassGap: Equatable, Identifiable { var id: String; var name: String; var done: Int; var gap: Int }
    var weekStart: Date; var total: Int; var maxDone: Int; var classes: [ClassGap]
    var open: Int; var followUps: Int; var newQuestions: Int; var answered: Int
    var nextEvents: [(date: String, events: [CalEvent])]; var ddays: [DDay]; var studyMinutes: Int
    static func == (a: TeacherReview, b: TeacherReview) -> Bool { a.weekStart == b.weekStart && a.classes == b.classes && a.open == b.open && a.newQuestions == b.newQuestions && a.nextEvents.map(\.date) == b.nextEvents.map(\.date) && a.ddays == b.ddays }
    var behind: [ClassGap] { classes.filter { $0.gap >= 2 } }
    var headline: String {
        var parts: [String] = []
        if let worst = classes.max(by: { $0.gap < $1.gap }), worst.gap >= 2 { parts.append("진도 편차 \(worst.gap)차시 (\(worst.name) 뒤처짐)") } else if total > 0 { parts.append("진도 고름") }
        if open > 0 { parts.append("미답변 \(open)") }
        let n = nextEvents.reduce(0) { $0 + $1.events.count }; if n > 0 { parts.append("다음 주 일정 \(n)개") }
        if let d = ddays.first { parts.append("\(d.label) \(d.badge)") }
        return parts.joined(separator: " · ")
    }
    static func make(progress: Progress, questions: [Question], calendar: [String: [CalEvent]], ddays: [DDay], sessions: [StudySession], now: Date = Date(), cal: Calendar = .current) -> TeacherReview {
        let ws = WeeklyReport.weekStart(now, cal: cal), wsMs = ws.timeIntervalSince1970 * 1000
        let total = progress.lessons.count, maxDone = progress.classes.map(\.done).max() ?? 0
        let classes = progress.classes.map { ClassGap(id: $0.id, name: $0.name, done: min(total, $0.done), gap: maxDone - min(total, $0.done)) }
        let open = questions.filter(\.open).count, fu = questions.filter(\.needsFollowUp).count
        let newQ = questions.filter { $0.timestamp >= wsMs }.count
        let answered = questions.filter { q in q.replies.contains { $0.isTeacher && Question.parseTime($0.time) >= wsMs } }.count
        let nextStart = cal.date(byAdding: .day, value: 7, to: ws)!
        let next = (0..<7).compactMap { i -> (date: String, events: [CalEvent])? in guard let d = cal.date(byAdding: .day, value: i, to: nextStart) else { return nil }; let k = FB.key(d); guard let e = calendar[k], !e.isEmpty else { return nil }; return (k, e) }
        let dd = ddays.filter { ($0.days(from: now) ?? -1) >= 0 && ($0.days(from: now) ?? 99) <= 21 }.sorted { ($0.days(from: now) ?? 0) < ($1.days(from: now) ?? 0) }
        let keys = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: ws) }.map(FB.key)
        let mins = sessions.filter { keys.contains($0.date) && $0.subject != "스트릭 프리즈" }.reduce(0) { $0 + $1.min }
        return TeacherReview(weekStart: ws, total: total, maxDone: maxDone, classes: classes, open: open, followUps: fu, newQuestions: newQ, answered: answered, nextEvents: next, ddays: dd, studyMinutes: mins)
    }
    /// 일요일 19:30 알림(이미 지났으면 다음 주)
    static func schedule(_ r: TeacherReview, now: Date = Date(), cal: Calendar = .current) {
        let nc = UNUserNotificationCenter.current(); nc.removePendingNotificationRequests(withIdentifiers: ["weekly-teacher"])
        let wd = cal.component(.weekday, from: now); var days = (8 - wd) % 7
        if days == 0, cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now) >= 19 * 60 + 30 { days = 7 }
        guard let d = cal.date(byAdding: .day, value: days, to: cal.startOfDay(for: now)) else { return }
        var comps = cal.dateComponents([.year, .month, .day], from: d); comps.hour = 19; comps.minute = 30
        let c = UNMutableNotificationContent(); c.title = "다음 주 준비"; c.body = r.headline.isEmpty ? "진도·질문·일정을 한 번 훑어보세요" : r.headline; c.sound = .default; c.userInfo = ["review": true]
        nc.add(UNNotificationRequest(identifier: "weekly-teacher", content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
    }
}

struct TeacherReviewView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject var store: DeskStore
    var r: TeacherReview { TeacherReview.make(progress: store.progress, questions: store.questions, calendar: store.calendar, ddays: store.ddays, sessions: store.sessions) }
    var body: some View {
        let r = r
        ScrollView {
            VStack(spacing: 14) {
                DeskCard {
                    Eyebrow(text: "이번 주", trailing: r.weekStart.formatted(.dateTime.month().day()) + " ~")
                    Text(r.headline.isEmpty ? "조용한 한 주" : r.headline).desk(.title).lineSpacing(3)
                }
                DeskCard {
                    Eyebrow(text: "반별 진도", trailing: r.total > 0 ? "최고 \(r.maxDone)/\(r.total)" : nil)
                    if r.classes.isEmpty { Text("진도표가 없습니다").foregroundStyle(.secondary) }
                    ForEach(r.classes.sorted { $0.gap > $1.gap }) { c in
                        HStack { HStack(spacing: 5) { ClassDot(name: c.name); Text(c.name).desk(.bodyStrong) }.frame(width: 52, alignment: .leading)
                            GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(c.gap >= 2 ? DeskTheme.warn : (DeskColors.cls(name: c.name, scheme: scheme) ?? DeskTheme.accent)).frame(width: r.total > 0 ? g.size.width * CGFloat(c.done) / CGFloat(r.total) : 0) } }.frame(height: 8)
                            Text(c.gap == 0 ? "최고" : "-\(c.gap)차시").scaledFont(12, .semibold, mono: true).foregroundStyle(c.gap >= 2 ? DeskTheme.warn : .secondary).frame(width: 56, alignment: .trailing) }
                    }
                    if !r.behind.isEmpty { Text("뒤처진 반은 다음 주에 한 차시 더 나가거나 압축 학습지로 따라잡을지 정하세요.").font(.footnote).foregroundStyle(.secondary) }
                }
                HStack(spacing: 14) {
                    DeskCard { Eyebrow(text: "질문", color: r.open > 0 ? DeskTheme.live : DeskTheme.accent); Text("\(r.open)").desk(.number(32)).foregroundStyle(r.open > 0 ? DeskTheme.live : DeskTheme.brand); Text(r.followUps > 0 ? "미답변 · 후속 \(r.followUps)" : "미답변").font(.caption).foregroundStyle(.secondary); Text("이번 주 새 질문 \(r.newQuestions) · 답 \(r.answered)").font(.caption).foregroundStyle(.secondary) }
                    DeskCard { Eyebrow(text: "내 공부"); Text("\(r.studyMinutes)").desk(.number(32)).foregroundStyle(DeskTheme.brand); Text("분 · 이번 주").font(.caption).foregroundStyle(.secondary) }
                }
                DeskCard {
                    Eyebrow(text: "다음 주 일정", trailing: r.nextEvents.isEmpty ? "없음" : "\(r.nextEvents.reduce(0) { $0 + $1.events.count })개")
                    ForEach(r.nextEvents, id: \.date) { d in
                        Text(WidgetEvent.dayLabel(d.date)).desk(.label).foregroundStyle(.secondary).padding(.top, 2)
                        ForEach(d.events) { e in HStack(spacing: 8) { let s = WidgetEvent.split(e.text); Text(s.minutes.map { String(format: "%02d:%02d", $0 / 60, $0 % 60) } ?? "종일").scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 40, alignment: .leading); Text(s.title).desk(.body) } }
                    }
                }
                if !r.ddays.isEmpty { DeskCard { Eyebrow(text: "다가오는 D-day"); ForEach(r.ddays) { d in HStack { Text(d.label).desk(.bodyStrong); Spacer(); Text(d.badge).scaledFont(14, .bold, mono: true).foregroundStyle(DeskTheme.accent) } } } }
            }.padding(16)
        }
        .background(DeskTheme.canvas).navigationTitle("주간 리뷰").navigationBarTitleDisplayMode(.inline)
    }
}
