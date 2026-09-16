// 월 달력 — 한 달 격자(일요일 시작) + 고른 날의 일정 목록. iPhone 은 점, 넓은 화면(Mac·iPad)은 칸에 제목. 좌우로 밀어 달 넘김
import SwiftUI

/// 달력 격자 계산(순수 함수)
enum MonthGrid {
    struct Day: Identifiable, Equatable { let date: Date; let key: String; let day: Int; let inMonth: Bool; let weekday: Int; var id: String { key } }
    static func start(of d: Date, cal: Calendar = .current) -> Date { cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? d }
    /// 그 달을 덮는 주 단위 칸(앞뒤 달 날짜 포함, 4~6주)
    static func days(month: Date, cal: Calendar = .current) -> [Day] {
        let first = start(of: month, cal: cal)
        let offset = cal.component(.weekday, from: first) - 1
        let count = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let cells = (offset + count + 6) / 7 * 7
        return (0..<cells).compactMap { i in
            guard let d = cal.date(byAdding: .day, value: i - offset, to: first) else { return nil }
            return Day(date: d, key: FB.key(d), day: cal.component(.day, from: d), inMonth: i >= offset && i < offset + count, weekday: cal.component(.weekday, from: d))
        }
    }
    static func shift(_ month: Date, by n: Int, cal: Calendar = .current) -> Date { cal.date(byAdding: .month, value: n, to: start(of: month, cal: cal)) ?? month }
    static func title(_ month: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yyyy년 M월"; return f.string(from: month) }
}

/// 하루 일정 모으기(순수 함수) — 종일(디데이·마감·Desk·Apple) 먼저, 그다음 시각순
enum DayAgenda {
    enum Kind: Int, Equatable { case dday, todo, desk, apple }
    struct Item: Identifiable, Equatable {
        let id: String; let kind: Kind; let title: String; let minute: Int?; let sub: String?
        var color: Color? = nil; var event: CalEvent? = nil
    }
    static func items(key: String, desk: [CalEvent], external: [ExternalEvent], todos: [Todo], ddays: [DDay]) -> [Item] {
        var out: [Item] = []
        out += ddays.filter { $0.date == key }.map { Item(id: "d" + $0.id, kind: .dday, title: $0.label, minute: nil, sub: "디데이") }
        out += todos.filter { !$0.done && $0.due == key }.map { Item(id: "t" + $0.id, kind: .todo, title: $0.text, minute: nil, sub: "할 일 마감") }
        out += desk.filter { $0.date == key }.map { e in let s = WidgetEvent.split(e.text); return Item(id: "e" + e.id, kind: .desk, title: s.title, minute: s.minutes, sub: nil, event: e) }
        out += external.filter { $0.date == key }.map { Item(id: "x" + $0.id, kind: .apple, title: $0.title, minute: $0.minutes, sub: $0.calendar, color: $0.color) }
        return out.sorted { ($0.minute ?? -1, $0.kind.rawValue, $0.title) < ($1.minute ?? -1, $1.kind.rawValue, $1.title) }
    }
}

struct MonthCalendarView: View {
    @EnvironmentObject var store: DeskStore
    @EnvironmentObject var cal: CalendarModel
    @State private var month: Date
    @State private var selected: Date
    @State private var external: [String: [ExternalEvent]] = [:]
    @State private var showAdd = false
    init(selected: Date? = nil) {
        let s = selected ?? TodayView.testNow ?? Date()
        _selected = State(initialValue: s); _month = State(initialValue: MonthGrid.start(of: s))
    }
    var today: Date { TodayView.testNow ?? Date() }
    static let weekdays = ["일", "월", "화", "수", "목", "금", "토"]

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width >= 760
            ScrollView {
                Group {
                    if wide {
                        HStack(alignment: .top, spacing: 20) { grid(wide: true); agenda.frame(width: 320) }
                    } else {
                        VStack(spacing: 16) { grid(wide: false); agenda }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: 1100).frame(maxWidth: .infinity)
            }
        }
        .background(DeskTheme.canvas)
        .navigationTitle(MonthGrid.title(month))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { go(-1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("이전 달").keyboardShortcut(.leftArrow, modifiers: [])
                Button("오늘") { withAnimation(.snappy) { selected = today; month = MonthGrid.start(of: today) } }.keyboardShortcut("t", modifiers: .command)
                Button { go(1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("다음 달").keyboardShortcut(.rightArrow, modifiers: [])
            }
        }
        .sheet(isPresented: $showAdd) { AddEventSheet(date: selected) }
        .task(id: FB.key(month)) { loadExternal() }
        .onChange(of: cal.external) { _, _ in loadExternal() }
    }

    func go(_ n: Int) {
        withAnimation(.snappy) {
            month = MonthGrid.shift(month, by: n)
            let c = Calendar.current
            if !c.isDate(selected, equalTo: month, toGranularity: .month) { selected = c.isDate(today, equalTo: month, toGranularity: .month) ? today : month }
        }
    }
    func loadExternal() {
        let days = MonthGrid.days(month: month)
        guard let first = days.first?.date, let last = days.last?.date else { return }
        external = cal.externalEvents(from: Calendar.current.startOfDay(for: first), to: Calendar.current.startOfDay(for: last).addingTimeInterval(86400))
    }
    func items(_ key: String) -> [DayAgenda.Item] {
        DayAgenda.items(key: key, desk: store.calendar[key] ?? [], external: external[key] ?? [], todos: store.todos, ddays: store.ddays)
    }
    func color(_ it: DayAgenda.Item) -> Color {
        switch it.kind { case .desk: DeskTheme.accent; case .apple: it.color ?? .secondary; case .todo: DeskTheme.warn; case .dday: DeskTheme.brand }
    }

    // ── 격자
    func grid(wide: Bool) -> some View {
        VStack(spacing: wide ? 6 : 4) {
            HStack(spacing: 0) {
                ForEach(Array(Self.weekdays.enumerated()), id: \.offset) { i, w in
                    Text(w).scaledFont(12, .semibold).foregroundStyle(i == 0 ? DeskTheme.live : .secondary).frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 2)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: wide ? 6 : 2), count: 7), spacing: wide ? 6 : 4) {
                ForEach(MonthGrid.days(month: month)) { d in cell(d, wide: wide) }
            }
        }
        .padding(wide ? 14 : 10)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(DeskTheme.card))
        .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { v in
            if abs(v.translation.width) > max(60, abs(v.translation.height) * 1.5) { go(v.translation.width < 0 ? 1 : -1) }
        })
    }
    func cell(_ d: MonthGrid.Day, wide: Bool) -> some View {
        let list = items(d.key), isToday = d.key == FB.key(today), isSel = d.key == FB.key(selected)
        let shape = RoundedRectangle(cornerRadius: wide ? 10 : 12, style: .continuous)
        return Button {
            withAnimation(.snappy) { selected = d.date; if !d.inMonth { month = MonthGrid.start(of: d.date) } }
        } label: {
            VStack(alignment: wide ? .leading : .center, spacing: 3) {
                Text("\(d.day)")
                    .scaledFont(wide ? 13 : 15, isToday ? .bold : .medium, mono: true)
                    .foregroundStyle(isToday ? Color.white : d.weekday == 1 ? DeskTheme.live : Color.primary)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(isToday ? DeskTheme.accent : Color.clear))
                if wide {
                    ForEach(list.prefix(3)) { it in
                        HStack(spacing: 4) {
                            Circle().fill(color(it)).frame(width: 5, height: 5)
                            Text(it.title).scaledFont(11, .medium).foregroundStyle(.primary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if list.count > 3 { Text("+\(list.count - 3)").scaledFont(10, .semibold).foregroundStyle(.secondary) }
                } else {
                    HStack(spacing: 3) { ForEach(list.prefix(3)) { it in Circle().fill(color(it)).frame(width: 5, height: 5) } }.frame(height: 6)
                }
            }
            .padding(wide ? 6 : 2)
            .frame(maxWidth: .infinity, minHeight: wide ? 96 : 50, alignment: wide ? .topLeading : .top)
            .background(shape.fill(isSel ? DeskTheme.accent.opacity(0.12) : Color.clear))
            .overlay(shape.strokeBorder(isSel ? DeskTheme.accent.opacity(0.45) : Color.clear, lineWidth: 1))
            .opacity(d.inMonth ? 1 : 0.35)
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Self.longDate(d.date)), " + (list.isEmpty ? "일정 없음" : "일정 \(list.count)개"))
        .accessibilityIdentifier("day-\(d.key)")
    }

    // ── 고른 날
    var agenda: some View {
        let list = items(FB.key(selected))
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(Self.longDate(selected)).desk(.title)
                Spacer()
                Text(relative(selected)).desk(.small).foregroundStyle(.secondary)
            }
            if let c = classSummary(selected) { Text(c).desk(.small).foregroundStyle(.secondary) }
            if list.isEmpty { Text("일정 없음").desk(.body).foregroundStyle(.secondary).padding(.vertical, 4) }
            ForEach(list) { it in row(it) }
            Button { showAdd = true } label: { Label("이 날 일정 추가", systemImage: "plus.circle.fill").desk(.bodyStrong) }
                .buttonStyle(.plain).foregroundStyle(DeskTheme.accent).padding(.top, 2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(DeskTheme.card))
    }
    func row(_ it: DayAgenda.Item) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(it.minute.map { String(format: "%d:%02d", $0 / 60, $0 % 60) } ?? "종일")
                .scaledFont(13, .semibold, mono: true).foregroundStyle(.secondary).frame(width: 44, alignment: .trailing)
            Circle().fill(color(it)).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(it.title).desk(.body).foregroundStyle(.primary)
                if let s = it.sub { Text(s).desk(.small).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .contextMenu { if let e = it.event { Button("일정 삭제", systemImage: "trash", role: .destructive) { store.deleteEvent(e) } } }
    }
    static func longDate(_ d: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M월 d일 EEEE"; return f.string(from: d) }
    func relative(_ d: Date) -> String {
        let c = Calendar.current, n = c.dateComponents([.day], from: c.startOfDay(for: today), to: c.startOfDay(for: d)).day ?? 0
        return n == 0 ? "오늘" : n == 1 ? "내일" : n == -1 ? "어제" : n > 0 ? "\(n)일 뒤" : "\(-n)일 전"
    }
    func classSummary(_ d: Date) -> String? {
        guard Timetable.dayKey(d) != nil, let t = TimetableStore.timetable else { return nil }
        let n = t.slots(on: d).filter { $0.subject != nil }.count
        return n == 0 ? "수업 없음" : "수업 \(n)개"
    }
}
