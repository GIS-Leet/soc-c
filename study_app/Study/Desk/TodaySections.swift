// 「오늘 전체」 — 무대 아래. 하루 레일(수업·일정·기한 할 일을 시간순 한 줄에), 2열 타일(공부·디데이·공지·노트), 할 일 목록. Apple 날씨의 모듈 리듬 + Flighty 의 레일
import SwiftUI

/// 구역 캡션 — 아이콘 + 작은 대문자 라벨 (Apple 날씨 식)
struct SectionCaption<Trailing: View>: View {
    let icon: String; let text: String
    @ViewBuilder var trailing: Trailing
    init(_ icon: String, _ text: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) { self.icon = icon; self.text = text; self.trailing = trailing() }
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).scaledFont(11, .semibold)
            Text(text).scaledFont(12, .semibold).tracking(0.8).textCase(.uppercase).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            trailing
        }
        .foregroundStyle(.secondary)
    }
}

/// 하루 레일의 한 줄
struct RailItem: Identifiable {
    enum Kind { case cls, event, external, todo, now }
    let id: String; let minute: Int?; let title: String; let sub: String?; let color: Color; let kind: Kind
}

extension TodayView {
    @ViewBuilder func sections(now: Date) -> some View {
        dayRail(now: now)
        tileGrid(now: now)
        todoList(now: now)
    }

    // ── 하루 레일 ──
    func railItems(now: Date) -> [RailItem] {
        let f = focus(now), day = f.date, key = FB.key(day), t = TimetableStore.timetable
        var items: [RailItem] = []
        for s in t?.slots(on: day) ?? [] where s.subject != nil {
            let p = prep(s, date: day)
            items.append(RailItem(id: "c\(s.period)", minute: s.start, title: "\(s.period)교시 · \(p?.className ?? s.subject!)", sub: [p?.subjectName, p.map { "\($0.room)호" }, p?.lesson.map { "\($0.order)차시" }].compactMap { $0 }.joined(separator: " · "), color: classColor(s), kind: .cls))
        }
        for e in store.events(on: day) { items.append(RailItem(id: "e" + e.id, minute: TimelineLayout.minutes(in: e.text), title: e.text, sub: nil, color: DeskTheme.accent, kind: .event)) }
        for x in cal.external[key] ?? [] { items.append(RailItem(id: "x" + x.id, minute: x.minutes, title: x.title, sub: x.calendar, color: x.color, kind: .external)) }
        for td in store.todos where !td.done && td.due == key { items.append(RailItem(id: "t" + td.id, minute: nil, title: td.text, sub: "오늘까지", color: DeskTheme.warn, kind: .todo)) }
        items.sort { a, b in
            switch (a.minute, b.minute) { case (nil, nil): a.kind == .todo && b.kind != .todo; case (nil, _): true; case (_, nil): false; case (let x?, let y?): x < y }
        }
        if !f.shifted, let last = items.lastIndex(where: { ($0.minute ?? -1) <= Timetable.minutes(now) && $0.minute != nil }) {
            items.insert(RailItem(id: "now", minute: Timetable.minutes(now), title: "지금", sub: nil, color: DeskTheme.live, kind: .now), at: last + 1)
        }
        return items
    }
    func dayRail(now: Date) -> some View {
        let f = focus(now), items = railItems(now: now), m = f.shifted ? -1 : Timetable.minutes(now)
        return VStack(alignment: .leading, spacing: 10) {
            SectionCaption("calendar.day.timeline.left", f.shifted ? "\(Timetable.focusLabel(f, now: now)) 하루" : "오늘 하루") {
                Text({ let fm = DateFormatter(); fm.locale = Locale(identifier: "ko_KR"); fm.dateFormat = "M월 d일 EEEE"; return fm.string(from: f.date) }()).desk(.small)
            }
            if items.isEmpty {
                Text(Timetable.dayKey(f.date) == nil ? "주말 · 일정 없음" : "수업·일정 없음").desk(.body).foregroundStyle(.secondary).padding(.leading, 60)
            }
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, it in
                    railRow(it, first: i == 0, last: i == items.count - 1, past: m >= 0 && it.kind != .now && (it.minute.map { $0 + (it.kind == .cls ? Timetable.periodLength : 0) <= m } ?? false))
                }
            }
            let up = upcomingMerged(from: f.date).prefix(3)
            if !up.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(up, id: \.date) { u in
                        NavigationLink { MonthCalendarView(selected: FB.day.date(from: u.date)) } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(Self.short(u.date)).scaledFont(12, .semibold, mono: true).foregroundStyle(.tertiary).frame(width: 52, alignment: .trailing)
                                Text(u.texts.joined(separator: " · ")).desk(.small).foregroundStyle(.secondary).lineLimit(1)
                                Spacer(minLength: 0)
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }.padding(.top, 4)
            }
            HStack(spacing: 18) {
                addRow("일정 추가") { showAddEvent = true }
                NavigationLink { MonthCalendarView(selected: f.date) } label: { HStack { Image(systemName: "calendar"); Text("달력 보기") }.desk(.body).foregroundStyle(DeskTheme.accent) }.buttonStyle(.plain).padding(.top, 2)
            }.padding(.leading, 60)
        }
        .padding(.vertical, 6)
    }
    func railRow(_ it: RailItem, first: Bool, last: Bool, past: Bool) -> some View {
        let isNow = it.kind == .now
        return HStack(alignment: .top, spacing: 10) {
            Text(it.minute.map { m in "\(m / 60):" + String(format: "%02d", m % 60) } ?? (it.kind == .todo ? "기한" : "종일"))
                .scaledFont(13, isNow ? .bold : .semibold, mono: true).foregroundStyle(isNow ? DeskTheme.live : .secondary)
                .frame(width: 44, alignment: .trailing).padding(.top, isNow ? 0 : 11)
            ZStack {
                VStack(spacing: 0) {
                    Rectangle().fill(Color.primary.opacity(first ? 0 : 0.1)).frame(width: 2).frame(maxHeight: .infinity)
                    Rectangle().fill(Color.primary.opacity(last ? 0 : 0.1)).frame(width: 2).frame(maxHeight: .infinity)
                }
                if isNow { Circle().fill(DeskTheme.live).frame(width: 8, height: 8) }
                else {
                    Circle().fill(it.color).frame(width: 12, height: 12).overlay(Circle().strokeBorder(DeskTheme.canvas, lineWidth: 2))
                        .opacity(past ? 0.45 : 1).padding(.top, 0)
                }
            }
            .frame(width: 16).frame(maxHeight: .infinity)
            if isNow {
                Rectangle().fill(DeskTheme.live.opacity(0.7)).frame(height: 1.5).frame(maxWidth: .infinity).padding(.top, 3)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if it.kind == .todo { Image(systemName: "circle").font(.caption).foregroundStyle(DeskTheme.warn) }
                        Text(it.title).desk(.bodyStrong).lineLimit(2)
                    }
                    if let s = it.sub, !s.isEmpty { Text(s).desk(.small).foregroundStyle(.secondary).lineLimit(1) }
                }
                .padding(.top, 9).opacity(past ? 0.5 : 1)
                Spacer(minLength: 0)
            }
        }
        .frame(minHeight: isNow ? 10 : 46)
        .accessibilityElement(children: .combine)
    }

    // ── 타일 2열 ──
    func tileGrid(now: Date) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            studyTile
            ddayTile(now: now)
            noticeTile
            noteTile
        }
        .padding(.vertical, 6)
    }
    func tile<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) { content() }
            .padding(14).frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
            .background(DeskTheme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(scheme == .dark ? Color.white.opacity(0.08) : .clear, lineWidth: 0.5))
    }
    var studyTile: some View {
        let g = store.dailyGoal()
        return Button { m.openStudy() } label: {
            tile {
                SectionCaption("book", "공부")
                HStack(spacing: 10) {
                    ZStack {
                        Circle().stroke(Color.primary.opacity(0.08), lineWidth: 5)
                        Circle().trim(from: 0, to: g.total > 0 ? CGFloat(g.done) / CGFloat(g.total) : 0)
                            .stroke(g.done == g.total ? AnyShapeStyle(DeskTheme.success) : AnyShapeStyle(AngularGradient(colors: [DeskTheme.accent.opacity(0.55), DeskTheme.accent], center: .center, startAngle: .degrees(-90), endAngle: .degrees(270))), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        Text("\(g.done)/\(g.total)").scaledFont(10, .bold, mono: true)
                    }.frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .lastTextBaseline, spacing: 3) { Text("\(store.streak)").desk(.number(28)).foregroundStyle(DeskTheme.brand).lineLimit(1).minimumScaleFactor(0.6); Text("일 연속").desk(.small).foregroundStyle(.secondary).lineLimit(1) }
                    }
                }
                Text(store.todayMinutes > 0 ? "오늘 \(store.todayMinutes)분" : (g.done == g.total ? "오늘 몫 끝" : "오늘 아직 없음")).desk(.small).foregroundStyle(.secondary).lineLimit(1)
            }
        }.buttonStyle(.plain).accessibilityLabel("공부 \(store.streak)일 연속, 오늘 몫 \(g.done)/\(g.total)")
    }
    func ddayTile(now: Date) -> some View {
        let list = store.ddays.filter { ($0.days(from: now) ?? 0) >= -1 }.sorted { ($0.days(from: now) ?? 0) < ($1.days(from: now) ?? 0) }
        return tile {
            SectionCaption("flag", "디데이") { Button { showAddDDay = true } label: { Image(systemName: "plus").scaledFont(12, .semibold) }.accessibilityLabel("디데이 추가") }
            if let d = list.first {
                Text(d.badge).desk(.number(28)).foregroundStyle((d.days(from: now) ?? 99) <= 7 ? DeskTheme.live : DeskTheme.brand)
                Text(d.label).desk(.bodyStrong).lineLimit(1)
                if list.count > 1, let n = list.dropFirst().first { Text("\(n.label) \(n.badge)").desk(.small).foregroundStyle(.secondary).lineLimit(1) }
            } else {
                Text("—").desk(.number(28)).foregroundStyle(.tertiary)
                Text("등록된 디데이 없음").desk(.small).foregroundStyle(.secondary)
            }
        }
        .contextMenu { ForEach(list.prefix(5)) { d in Button("\(d.label) 삭제", systemImage: "trash", role: .destructive) { store.deleteDDay(d) } } }
    }
    var noticeTile: some View {
        NavigationLink { NoticeListView() } label: {
            tile {
                SectionCaption("megaphone", "홈페이지 공지") { Button { showAddNotice = true } label: { Image(systemName: "plus").scaledFont(12, .semibold) }.accessibilityLabel("공지 추가") }
                if let n = store.notices.first {
                    Text("\(store.notices.count)").desk(.number(28)).foregroundStyle(DeskTheme.brand)
                    Text(n.text).desk(.small).lineLimit(2)
                    Text(n.date).scaledFont(11, mono: true).foregroundStyle(.tertiary)
                } else {
                    Text("0").desk(.number(28)).foregroundStyle(.tertiary)
                    Text("게시된 공지 없음").desk(.small).foregroundStyle(.secondary)
                }
            }
        }.buttonStyle(.plain)
    }
    var noteTile: some View {
        Group {
            if let n = store.notes.first {
                NavigationLink { NoteEditor(noteID: n.id) } label: {
                    tile {
                        SectionCaption("note.text", "최근 노트") { Text(Note.timeLabel(n.updatedAt)).scaledFont(11, mono: true) }
                        HStack(spacing: 5) { if n.pinned { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(DeskTheme.warn) }; Text(n.displayTitle).desk(.bodyStrong).lineLimit(2) }
                        Text(n.preview).desk(.small).foregroundStyle(.secondary).lineLimit(2)
                    }
                }.buttonStyle(.plain)
            } else {
                Button { m.tab = 1 } label: { tile { SectionCaption("note.text", "최근 노트"); Text("노트 없음").desk(.small).foregroundStyle(.secondary) } }.buttonStyle(.plain)
            }
        }
    }

    // ── 할 일 ──
    func todoList(now: Date) -> some View {
        let open = store.todos.filter { !$0.done }, shown = Array((open + store.todos.filter(\.done)).prefix(6))
        return VStack(alignment: .leading, spacing: 8) {
            SectionCaption("checklist", "할 일") { Text(open.isEmpty ? "모두 완료" : "\(open.count)개 남음").desk(.small) }
            if store.todos.isEmpty { Text("할 일 없음").desk(.body).foregroundStyle(.secondary) }
            ForEach(shown) { t in
                HStack(spacing: 12) {
                    Button { Haptic.light(); withAnimation(.spring(duration: 0.3)) { store.toggle(t) } } label: {
                        Image(systemName: t.done ? "checkmark.circle.fill" : "circle").scaledFont(22).foregroundStyle(t.done ? DeskTheme.success : Color.primary.opacity(0.28)).contentTransition(.symbolEffect(.replace))
                    }.buttonStyle(.plain).accessibilityLabel(t.done ? "완료됨 · \(t.text)" : "완료 표시 · \(t.text)")
                    Text(t.text).desk(.body).strikethrough(t.done).foregroundStyle(t.done ? .secondary : .primary).lineLimit(2)
                    Spacer()
                    if let d = t.due, !t.done { Text(dueLabel(d)).scaledFont(11, .semibold).foregroundStyle(dueLabel(d) == "오늘" || dueLabel(d).hasPrefix("지남") ? DeskTheme.warn : .secondary).padding(.horizontal, 7).padding(.vertical, 3).background(Color.primary.opacity(0.06), in: Capsule()) }
                }
                .padding(.vertical, 3)
                .contextMenu { Button("삭제", systemImage: "trash", role: .destructive) { store.deleteTodo(t) } }
            }
            addRow("할 일 추가") { showAddTodo = true }
        }
        .padding(.vertical, 6)
    }
}
