// 「오늘」 타임라인 — 07:30~18:00 시간축에 수업 블록·시각 있는 일정·현재 시각 선, 위에는 종일 일정·오늘 마감 할 일
import SwiftUI

enum TimelineLayout {
    static let startMin = 7 * 60 + 30, endMin = 18 * 60
    static let pxPerMin: CGFloat = 1.35
    static func y(_ m: Int) -> CGFloat { CGFloat(m - startMin) * pxPerMin }
    /// 일정 텍스트 앞의 "16:30 …" / "오후 4시 …" → 분. 없으면 nil(종일)
    static func minutes(in text: String) -> Int? {
        let t = text.trimmingCharacters(in: .whitespaces)
        if let m = t.range(of: #"^(\d{1,2}):(\d{2})"#, options: .regularExpression) {
            let p = t[m].split(separator: ":"); if let h = Int(p[0]), let mi = Int(p[1]), h < 24, mi < 60 { return h * 60 + mi }
        }
        if let m = t.range(of: #"^(오전|오후)\s?(\d{1,2})시(\s?(\d{1,2})분)?"#, options: .regularExpression) {
            let s = String(t[m]); let pm = s.hasPrefix("오후")
            let nums = s.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty }.compactMap { Int($0) }
            guard let h0 = nums.first else { return nil }
            var h = h0 % 12; if pm { h += 12 }; return h * 60 + (nums.count > 1 ? nums[1] : 0)
        }
        return nil
    }
}

struct DayTimelineView: View {
    @EnvironmentObject var store: DeskStore
    @EnvironmentObject var cal: CalendarModel
    let now: Date
    let day: Date   // 보여줄 날(오늘 수업이 끝났으면 다음 평일)
    init(now: Date, day: Date? = nil) { self.now = now; self.day = day ?? now }
    var isToday: Bool { Calendar.current.isDate(day, inSameDayAs: now) }
    var t: Timetable? { TimetableStore.timetable }
    var dayEvents: [CalEvent] { store.events(on: day) }
    var timed: [(min: Int, e: CalEvent)] { dayEvents.compactMap { e in TimelineLayout.minutes(in: e.text).map { ($0, e) } }.sorted { $0.min < $1.min } }
    var allDay: [CalEvent] { dayEvents.filter { TimelineLayout.minutes(in: $0.text) == nil } }
    var dueToday: [Todo] { store.todos.filter { !$0.done && $0.due == FB.key(day) } }
    var ext: [ExternalEvent] { cal.external[FB.key(day)] ?? [] }
    var body: some View {
        VStack(spacing: 14) {
            if !allDay.isEmpty || !dueToday.isEmpty || ext.contains(where: { $0.minutes == nil }) {
                DeskCard {
                    Eyebrow(text: isToday ? "종일" : "종일 · " + TodayView.short(FB.key(day)))
                    ForEach(allDay) { e in HStack(spacing: 8) { Circle().fill(DeskTheme.accent).frame(width: 6, height: 6); Text(e.text).desk(.body) } }
                    ForEach(ext.filter { $0.minutes == nil }) { x in HStack(spacing: 8) { Circle().fill(x.color).frame(width: 6, height: 6); Text(x.title).desk(.body).foregroundStyle(.secondary); Spacer(); Text(x.calendar).font(.caption2).foregroundStyle(.tertiary) } }
                    ForEach(dueToday) { td in HStack(spacing: 8) { Image(systemName: "circle").desk(.body).foregroundStyle(DeskTheme.warn); Text(td.text).desk(.body); Spacer(); Text(isToday ? "오늘 마감" : "마감").font(.caption).foregroundStyle(DeskTheme.warn) } }
                }
            }
            DeskCard {
                ScrollViewReader { proxy in
                    ScrollView(.vertical, showsIndicators: false) {
                        ZStack(alignment: .topLeading) {
                            hours
                            classes
                            events
                            externalEvents
                            nowLine
                        }
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .frame(height: TimelineLayout.y(TimelineLayout.endMin) + 20, alignment: .topLeading)
                    }
                    .frame(height: 440)
                    .onAppear { let m = Timetable.minutes(now); if isToday, m > TimelineLayout.startMin { withAnimation { proxy.scrollTo("now", anchor: .center) } } }
                }
            }
        }
    }
    var hours: some View {
        ForEach(Array(stride(from: 8 * 60, through: 18 * 60, by: 60)), id: \.self) { m in
            HStack(alignment: .top, spacing: 8) {
                Text(String(format: "%02d:00", m / 60)).scaledFont(11, mono: true).foregroundStyle(.secondary).frame(width: 38, alignment: .trailing)
                Rectangle().fill(Color.primary.opacity(0.08)).frame(height: 1).padding(.top, 7)
            }
            .offset(y: TimelineLayout.y(m) - 7)
        }
    }
    var classes: some View {
        Group {
            if let t, Timetable.dayKey(day) != nil {
                let cur = isToday ? t.current(at: now) : nil, m = isToday ? Timetable.minutes(now) : 0
                ForEach(t.slots(on: day).filter { $0.subject != nil }, id: \.period) { s in
                    let isNow = cur?.period == s.period, done = s.start + Timetable.periodLength <= m
                    HStack(spacing: 8) {
                        Text("\(s.period)").scaledFont(12, .bold, design: .rounded).frame(width: 20, height: 20).background(Circle().fill(isNow ? DeskTheme.live : done ? Color.primary.opacity(0.15) : DeskTheme.accent)).foregroundStyle(done && !isNow ? Color.primary.opacity(0.5) : .white)
                        Text(s.subject!).scaledFont(14, .semibold).foregroundStyle(done && !isNow ? .secondary : .primary).lineLimit(1)
                        Spacer()
                        Text("\(Timetable.hhmm(s.period))–\(Timetable.hhmm(s.period + 0).isEmpty ? "" : endText(s.start))").scaledFont(11, mono: true).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 10)
                    .frame(height: CGFloat(Timetable.periodLength) * TimelineLayout.pxPerMin - 4)
                    .background(RoundedRectangle(cornerRadius: 10).fill(isNow ? DeskTheme.live.opacity(0.12) : done ? Color.primary.opacity(0.05) : DeskTheme.accent.opacity(0.10)))
                    .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(isNow ? DeskTheme.live : done ? Color.primary.opacity(0.25) : DeskTheme.accent).frame(width: 3).padding(.vertical, 6) }
                    .padding(.leading, 48)
                    .offset(y: TimelineLayout.y(s.start) + 2)
                }
            }
        }
    }
    func endText(_ start: Int) -> String { let e = start + Timetable.periodLength; return "\(e / 60):" + String(format: "%02d", e % 60) }
    var events: some View {
        ForEach(timed, id: \.e.id) { item in
            HStack(spacing: 6) {
                Circle().fill(DeskTheme.warn).frame(width: 6, height: 6)
                Text(item.e.text).scaledFont(13, .medium).lineLimit(1)
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Capsule().fill(DeskTheme.warn.opacity(0.12)))
            .padding(.leading, 48)
            .offset(y: TimelineLayout.y(item.min) - 6)
        }
    }
    /// Apple 캘린더 일정(시각 있는 것) — 캘린더 색 캡슐, 오른쪽 정렬로 desk 일정과 겹침 완화
    var externalEvents: some View {
        ForEach(ext.filter { $0.minutes != nil }) { x in
            HStack(spacing: 6) {
                Circle().fill(x.color).frame(width: 6, height: 6)
                Text(x.title).scaledFont(13, .medium).lineLimit(1)
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Capsule().fill(x.color.opacity(0.14)))
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
            .offset(y: TimelineLayout.y(x.minutes!) - 6)
        }
    }
    var nowLine: some View {
        let m = Timetable.minutes(now)
        return Group {
            if isToday, m >= TimelineLayout.startMin && m <= TimelineLayout.endMin {
                HStack(spacing: 0) {
                    Text(String(format: "%02d:%02d", m / 60, m % 60)).scaledFont(10, .bold, mono: true).foregroundStyle(.white).padding(.horizontal, 4).padding(.vertical, 1).background(Capsule().fill(DeskTheme.live)).frame(width: 46)
                    Rectangle().fill(DeskTheme.live).frame(height: 1.5)
                }
                .offset(y: TimelineLayout.y(m) - 8).id("now")
            }
        }
    }
}
