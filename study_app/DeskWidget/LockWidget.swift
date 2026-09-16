// 잠금 화면 위젯 — 사각: 지금/다음 수업 + 남은 분, 원형: 교시 번호, 한 줄: 요약 (+미답변 수)
import WidgetKit
import SwiftUI

struct LockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DeskLock", provider: Provider()) { LockWidgetView(entry: $0) }
            .configurationDisplayName("수업 (잠금 화면)")
            .description("지금·다음 수업과 미답변 질문 수")
            .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct LockWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var t: Timetable? { entry.table }
    var cur: Timetable.Slot? { t?.current(at: entry.date) }
    var nxt: Timetable.Slot? { t?.next(at: entry.date) }
    var weekend: Bool { Timetable.dayKey(entry.date) == nil }
    func mins(_ target: Int) -> Int { max(0, target - Timetable.minutes(entry.date)) }
    var unanswered: Int { TimetableStore.unanswered }
    /// 과목 문자열의 첫 단어(교실 번호)
    static func room(_ subject: String) -> String { subject.split(separator: " ").first.map(String.init) ?? subject }
    /// 오늘 수업이 끝났으면 다음 평일 첫 수업
    var nextDay: (label: String, slot: Timetable.Slot?)? {
        guard let t, let f = Optional(t.focus(at: entry.date)), f.shifted else { return nil }
        return (Timetable.focusLabel(f, now: entry.date), t.slots(on: f.date).first { $0.subject != nil })
    }
    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                if let c = cur { VStack(spacing: -2) { Text("\(c.period)").font(.system(size: 22, weight: .bold, design: .rounded)); Text("교시").font(.system(size: 9)) } }
                else if let n = nxt { VStack(spacing: -2) { Text("\(n.period)").font(.system(size: 22, weight: .bold, design: .rounded)); Text(Timetable.hhmm(n.period)).font(.system(size: 9).monospacedDigit()) } }
                else if let d = nextDay, let s = d.slot { VStack(spacing: -2) { Text("\(s.period)").font(.system(size: 22, weight: .bold, design: .rounded)); Text(String(d.label.prefix(2))).font(.system(size: 9)) } }
                else { Image(systemName: weekend ? "sun.max" : "checkmark").font(.system(size: 20, weight: .semibold)) }
            }
        case .accessoryInline:   // 짧게: 시각 + 교실(과목 첫 단어)
            if let c = cur { Text("\(Self.room(c.subject!)) · \(mins(c.start + Timetable.periodLength))분") }
            else if let n = nxt { Text("\(Timetable.hhmm(n.period)) \(Self.room(n.subject!))") }
            else if let d = nextDay, let s = d.slot { Text("\(String(d.label.prefix(2))) \(Timetable.hhmm(s.period)) \(Self.room(s.subject!))") }
            else { Text(weekend ? "수업 없음" : "수업 끝") + Text(unanswered > 0 ? " · 미답변 \(unanswered)" : "") }
        default:
            VStack(alignment: .leading, spacing: 2) {
                if let c = cur {
                    Text("지금 \(c.period)교시 · \(mins(c.start + Timetable.periodLength))분 남음").font(.caption.weight(.semibold))
                    Text(c.subject!).font(.headline).lineLimit(1)
                    if let n = nxt { Text("다음 \(Timetable.hhmm(n.period)) \(Self.room(n.subject!))").font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                } else if let n = nxt {
                    Text("다음 \(n.period)교시 · \(mins(n.start))분 후").font(.caption.weight(.semibold))
                    Text(n.subject!).font(.headline).lineLimit(1)
                    Text(Timetable.hhmm(n.period) + (unanswered > 0 ? " · 미답변 \(unanswered)" : "")).font(.caption2).foregroundStyle(.secondary)
                } else if let d = nextDay, let s = d.slot {
                    Text("\(d.label) \(s.period)교시 · \(Timetable.hhmm(s.period))").font(.caption.weight(.semibold))
                    Text(s.subject!).font(.headline).lineLimit(1)
                    Text(unanswered > 0 ? "미답변 \(unanswered)" : (weekend ? "주말" : "오늘 수업 끝")).font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text(weekend ? "주말" : "오늘 수업 끝").font(.headline)
                    Text(unanswered > 0 ? "미답변 질문 \(unanswered)" : "수고했습니다").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}
