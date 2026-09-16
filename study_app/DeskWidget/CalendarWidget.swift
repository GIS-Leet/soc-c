// 일정 위젯 — desk 일정 + Apple 캘린더(앱이 저장한 스냅샷). 작음: 오늘, 중간: 오늘·내일, 큼: 이번 주
import WidgetKit
import SwiftUI

struct CalendarEntry: TimelineEntry { let date: Date; let events: [WidgetEvent] }

struct CalendarProvider: TimelineProvider {
    static var sample: [WidgetEvent] { let k = WidgetEvent.key(Date()); let t = WidgetEvent.key(Date().addingTimeInterval(86400)); return [WidgetEvent(id: "1", date: k, title: "교과협의회", minutes: 15 * 60 + 30, source: "desk"), WidgetEvent(id: "2", date: k, title: "수행평가 안내", minutes: nil, source: "desk"), WidgetEvent(id: "3", date: t, title: "치과", minutes: 18 * 60, source: "apple", colorHex: "FF6B6B")] }
    func placeholder(in context: Context) -> CalendarEntry { CalendarEntry(date: Date(), events: Self.sample) }
    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) { completion(CalendarEntry(date: Date(), events: context.isPreview ? Self.sample : TimetableStore.events)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
        let now = Date(), cal = Calendar.current, ev = TimetableStore.events
        var dates: [Date] = [now]
        var d = cal.date(bySettingHour: cal.component(.hour, from: now) + 1, minute: 0, second: 0, of: now) ?? now.addingTimeInterval(3600)
        let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now))!
        while d < midnight { dates.append(d); d = d.addingTimeInterval(3600) }   // 시각 지난 일정 흐리게 하려고 매시
        dates.append(midnight)
        completion(Timeline(entries: dates.map { CalendarEntry(date: $0, events: ev) }, policy: .atEnd))
    }
}

struct CalendarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DeskCalendar", provider: CalendarProvider()) { CalendarWidgetView(entry: $0) }
            .configurationDisplayName("일정")
            .description("desk 일정과 Apple 캘린더 — 오늘·이번 주")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct CalendarWidgetView: View {
    @Environment(\.widgetFamily) var envFamily
    @Environment(\.widgetRenderingMode) var renderingMode
    let entry: CalendarEntry
    var family: WidgetFamily? = nil
    var fam: WidgetFamily { family ?? envFamily }
    var glass: Bool { renderingMode != .fullColor }
    var accent: Color { glass ? .primary : DeskWidgetView.accent }
    var cal: Calendar { .current }
    func key(_ i: Int) -> String { WidgetEvent.key(cal.date(byAdding: .day, value: i, to: entry.date)!) }
    func events(_ i: Int) -> [WidgetEvent] { WidgetEvent.on(entry.events, key(i)) }
    func past(_ e: WidgetEvent, day: Int) -> Bool { day == 0 && (e.minutes.map { $0 + 30 < Timetable.minutes(entry.date) } ?? false) }
    var dateLabel: String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M월 d일 EEEE"; return f.string(from: entry.date) }

    var body: some View {
        Group {
            switch fam {
            case .accessoryRectangular: lock
            case .systemSmall: small
            case .systemLarge: week(rows: 9)
            default: week(rows: 3)
            }
        }
        .modifier(WidgetChrome(accessory: fam == .accessoryRectangular))
    }
    func eyebrow(_ s: String, color: Color = .secondary) -> some View { Text(s).font(.system(size: 11, weight: .semibold)).foregroundStyle(color).tracking(0.3).widgetAccentable() }
    func dot(_ e: WidgetEvent) -> some View {
        Circle().fill(glass ? Color.primary : e.colorHex.map { Color(hex: $0) } ?? DeskWidgetView.accent).frame(width: 6, height: 6)
    }
    func row(_ e: WidgetEvent, day: Int, size: CGFloat = 13) -> some View {
        HStack(spacing: 6) {
            dot(e)
            Text(e.timeLabel ?? "종일").font(.system(size: size - 1, weight: .medium)).monospacedDigit().foregroundStyle(.secondary).frame(width: size * 2.9, alignment: .leading)
            Text(e.title).font(.system(size: size, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }.opacity(past(e, day: day) ? 0.4 : 1)
    }
    var small: some View {
        let ev = events(0)
        return VStack(alignment: .leading, spacing: 5) {
            eyebrow("오늘 일정" + (ev.isEmpty ? "" : " \(ev.count)"), color: accent)
            if ev.isEmpty { Text("없음").font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary); if let n = events(1).first { Spacer(minLength: 0); eyebrow("내일"); row(n, day: 1, size: 12) } }
            else { ForEach(ev.prefix(4)) { e in row(e, day: 0, size: 12) }; if ev.count > 4 { Text("외 \(ev.count - 4)개").font(.system(size: 11)).foregroundStyle(.secondary) } }
            Spacer(minLength: 0)
        }
    }
    func list(days: Int, rows: Int) -> some View {
        var used = 0
        var blocks: [(String, Int, [WidgetEvent])] = []
        for i in 0..<days { let ev = events(i); if !ev.isEmpty, used < rows { let take = Array(ev.prefix(rows - used)); blocks.append((WidgetEvent.dayLabel(key(i), now: entry.date), i, take)); used += take.count + (i == 0 ? 0 : 0) } }
        let empty = blocks.isEmpty
        return VStack(alignment: .leading, spacing: 4) {
            HStack { eyebrow("일정", color: accent); Spacer(); eyebrow(dateLabel) }
            if empty { Text(days > 2 ? "이번 주 일정 없음" : "오늘·내일 일정 없음").font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary).padding(.top, 2) }
            ForEach(blocks, id: \.0) { b in
                if days > 2 || b.1 > 0 { Text(b.0).font(.system(size: 11, weight: .bold)).foregroundStyle(b.1 == 0 ? accent : .secondary).padding(.top, 3) }
                ForEach(b.2) { e in row(e, day: b.1) }
            }
            Spacer(minLength: 0)
        }
    }
    /// 이번 주 월~일 띠 — 오늘 강조, 일정 있는 날은 점(개수만큼 최대 3)
    var weekStrip: some View {
        let today = cal.startOfDay(for: entry.date)
        let mon = cal.date(byAdding: .day, value: -((cal.component(.weekday, from: today) + 5) % 7), to: today)!
        let names = ["월", "화", "수", "목", "금", "토", "일"]
        return HStack(spacing: 4) {
            ForEach(0..<7, id: \.self) { i in
                let d = cal.date(byAdding: .day, value: i, to: mon)!, k = WidgetEvent.key(d), n = WidgetEvent.on(entry.events, k).count, isToday = d == today, past = d < today
                VStack(spacing: 2) {
                    Text(names[i]).font(.system(size: 9, weight: .semibold)).foregroundStyle(i == 6 ? (glass ? .primary : DeskWidgetView.live) : .secondary)
                    Text("\(cal.component(.day, from: d))").font(.system(size: 13, weight: isToday ? .bold : .medium, design: .rounded)).monospacedDigit()
                        .foregroundStyle(isToday ? Color.white : .primary).frame(width: 22, height: 22).background(isToday ? accent : .clear, in: Circle())
                    HStack(spacing: 2) { ForEach(0..<min(n, 3), id: \.self) { _ in Circle().fill(isToday ? accent : .secondary).frame(width: 3.5, height: 3.5) } }.frame(height: 4)
                }.frame(maxWidth: .infinity).opacity(past ? 0.45 : 1)
            }
        }
    }
    /// 주간: 띠 + 앞으로 7일 일정(오늘·내일·M/D)
    func week(rows: Int) -> some View {
        var used = 0
        var blocks: [(String, Int, [WidgetEvent])] = []
        for i in 0..<7 { let ev = events(i); if !ev.isEmpty, used < rows { let take = Array(ev.prefix(rows - used)); blocks.append((WidgetEvent.dayLabel(key(i), now: entry.date), i, take)); used += take.count } }
        let total = (0..<7).reduce(0) { $0 + events($1).count }
        return VStack(alignment: .leading, spacing: 4) {
            HStack { eyebrow("일정", color: accent); Spacer(); eyebrow(total > 0 ? "7일간 \(total)개" : dateLabel) }
            weekStrip.padding(.vertical, 2)
            if blocks.isEmpty { Text("앞으로 7일 일정 없음").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).padding(.top, 2) }
            ForEach(blocks, id: \.0) { b in
                if rows > 4 { Text(b.0).font(.system(size: 11, weight: .bold)).foregroundStyle(b.1 == 0 ? accent : .secondary).padding(.top, 3); ForEach(b.2) { e in row(e, day: b.1) } }
                else { ForEach(b.2) { e in HStack(spacing: 6) { dot(e); Text(b.0 == "오늘" || b.0 == "내일" ? b.0 : String(b.0.prefix { $0 != " " })).font(.system(size: 11, weight: .bold)).foregroundStyle(b.1 == 0 ? accent : .secondary).frame(width: 30, alignment: .leading); Text(e.timeLabel ?? "종일").font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(.secondary).frame(width: 34, alignment: .leading); Text(e.title).font(.system(size: 13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8); Spacer(minLength: 0) }.opacity(past(e, day: b.1) ? 0.4 : 1) } }
            }
            Spacer(minLength: 0)
        }
    }
    var lock: some View {
        let ev = events(0)
        return VStack(alignment: .leading, spacing: 1) {
            if ev.isEmpty { Text("오늘 일정 없음").font(.headline); if let n = events(1).first { Text("내일 " + (n.timeLabel.map { $0 + " " } ?? "") + n.title).font(.caption2).foregroundStyle(.secondary).lineLimit(1) } }
            else {
                Text("오늘 \(ev.count)개").font(.caption.weight(.semibold))
                ForEach(ev.prefix(2)) { e in Text((e.timeLabel.map { $0 + " " } ?? "") + e.title).font(.caption2).lineLimit(1) }
            }
        }
    }
}
/// 위젯 배경 — 홈 화면은 시스템 회색 배경, 잠금 화면(사각)은 투명. 잠금 화면에 회색 배경을 깔면 벽지 위에 상자처럼 보인다
struct WidgetChrome: ViewModifier {
    let accessory: Bool
    func body(content: Content) -> some View {
        if accessory { content.containerBackground(.clear, for: .widget) }
        else { content.containerBackground(.fill.tertiary, for: .widget) }
    }
}
extension Color { init(hex: String) { var v: UInt64 = 0; Scanner(string: hex).scanHexInt64(&v); self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255) } }
