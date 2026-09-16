// 「오늘」 화면 — 교시 띠 + 국면별 무대(TodayStage) + 오늘 전체(TodaySections: 하루 레일·타일·할 일). 추가 시트는 아래
import SwiftUI

struct TodayView: View {
    @EnvironmentObject var store: DeskStore
    @EnvironmentObject var m: AppModel
    @EnvironmentObject var cal: CalendarModel
    @State var showAddNotice = false
    @State var showAddTodo = false
    @State var showAddEvent = false
    @State var showAddDDay = false
    @State var prepTarget: MaterialOpener.Target? = nil
    @State var prepCtx: LessonContext? = nil
    @State var prepBusy: String? = nil
    @State var selectedPeriod: Int? = nil          // 띠에서 고른 교시(미리보기)
    @State var openCalendar = ProcessInfo.processInfo.environment["UITEST_CALENDAR"] != nil   // 화면 확인용: 켜자마자 달력
    @Environment(\.colorScheme) var scheme
    @State var prepFiles: [GHFile] = []
    /// 화면 테스트용 시각 고정 — UITEST_NOW="yyyy-MM-dd HH:mm" (국면별 무대를 찍기 위해)
    static let testNow: Date? = ProcessInfo.processInfo.environment["UITEST_NOW"].flatMap { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: $0) }
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { ctx in
                let now = Self.testNow ?? ctx.date, t = TimetableStore.timetable, phase = DayPhase.of(t, now: now)
                GeometryReader { geo in
                ScrollView {
                    VStack(spacing: 18) {
                        if let e = store.error { errorCard(e) }
                        if geo.size.width >= 820 {   // 넓은 화면(iPad 가로): 왼쪽 띠·무대, 오른쪽 오늘 전체
                            HStack(alignment: .top, spacing: 28) {
                                VStack(spacing: 14) { PeriodStrip(now: now, table: t, selected: $selectedPeriod); stage(phase: phase, now: now) }.frame(width: 420)
                                VStack(spacing: 6) { sections(now: now) }
                            }
                        } else {
                            PeriodStrip(now: now, table: t, selected: $selectedPeriod)
                            stage(phase: phase, now: now)
                            VStack(spacing: 6) { sections(now: now) }.padding(.top, 6)
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                    .frame(maxWidth: 1000)
                    .frame(maxWidth: .infinity)
                }
                }
                .refreshable { await ClassAlarm.refresh(); m.refresh() }
                .animation(.spring(duration: 0.35, bounce: 0.12), value: selectedPeriod)
                .animation(.spring(duration: 0.45, bounce: 0.1), value: phase)
            }
            .background(DeskTheme.canvas)
            .navigationTitle("오늘")
            .navigationDestination(isPresented: $openCalendar) { MonthCalendarView() }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { MonthCalendarView() } label: { Image(systemName: "calendar") }.accessibilityLabel("달력").keyboardShortcut("k", modifiers: .command) } }
            .sheet(isPresented: $showAddTodo) { AddTodoSheet() }
            .fullScreenCover(item: $prepTarget) { t in DocInkScreen(name: t.name, doc: t.doc, storageKey: t.key, onSave: { data, name in guard let gh = store.github else { throw NSError(domain: "desk", code: 2, userInfo: [NSLocalizedDescriptionKey: "자료실 연결이 없습니다"]) }; return try await MaterialOpener.saveOrQueue(data, name: name, folder: "수업", gh: gh) }, lesson: prepCtx).environmentObject(store) }
            .task { await store.refreshDailyCards(); if let gh = store.github { await MaterialOpener.refreshLists(gh: gh); prepFiles = LessonPrep.cachedFiles(repo:gh.repo) } }
            .onChange(of: store.github?.repo) { _, _ in Task { if let gh = store.github { await MaterialOpener.refreshLists(gh: gh); prepFiles = LessonPrep.cachedFiles(repo:gh.repo) } } }
            .sheet(isPresented: $showAddNotice) { AddNoticeSheet() }
            .sheet(isPresented: $showAddEvent) { AddEventSheet() }
            .sheet(isPresented: $showAddDDay) { AddDDaySheet() }
        }
    }
    func errorCard(_ e: String) -> some View {
        DeskCard {
            Label("데이터 연결 안 됨", systemImage: "exclamationmark.triangle").desk(.bodyStrong).foregroundStyle(DeskTheme.warn)
            Text(e).font(.footnote).foregroundStyle(.secondary)
            Button("다시 로그인") { Task { await m.signIn(); store.stop(); await store.start() } }.buttonStyle(.bordered)
        }
    }
    /// 오늘 수업이 끝났으면 다음 평일을 보여준다
    func focus(_ now: Date) -> Timetable.Focus { TimetableStore.timetable?.focus(at: now) ?? Timetable.Focus(date: now, shifted: false) }
    func openPrep(_ f: GHFile, ctx: LessonContext) async {
        guard let gh = store.github else { return }
        prepBusy = f.id; defer { prepBusy = nil }
        do { prepCtx = ctx; let t = try await MaterialOpener.annotate(f, gh: gh); prepTarget = MaterialOpener.Target(name: t.name, doc: t.doc, key: InkKeys.classKey(t.key, className: ctx.classID == nil ? nil : ctx.className), folder: t.folder) } catch { Report.shared.fail("자료 열기", error) }
    }
    func weekday(_ d: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "EEEE"; return f.string(from: d) }
    static func short(_ key: String) -> String {   // "2026-09-12" → "9/12(금)"
        guard let d = FB.day.date(from: key) else { return key }
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M/d(E)"; return f.string(from: d)
    }
    func upcomingMerged(from base: Date) -> [(date: String, texts: [String])] {
        let c = Calendar.current
        return (1...7).compactMap { i in
            guard let d = c.date(byAdding: .day, value: i, to: base) else { return nil }
            let k = FB.key(d), texts = (store.calendar[k] ?? []).map(\.text) + (cal.external[k] ?? []).map(\.deskText)
            return texts.isEmpty ? nil : (k, texts)
        }
    }
    func dueLabel(_ due: String) -> String {
        guard let d = FB.day.date(from: due) else { return due }
        let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
        return n == 0 ? "오늘" : n == 1 ? "내일" : n < 0 ? "지남 \(-n)일" : Self.short(due)
    }
    func addRow(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { HStack { Image(systemName: "plus.circle.fill"); Text(title) }.desk(.body).foregroundStyle(DeskTheme.accent) }.buttonStyle(.plain).padding(.top, 2)
    }
}

// ── 추가 시트 ──
struct AddTodoSheet: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var text = ""; @State private var hasDue = false; @State private var due = Date()
    var body: some View {
        NavigationStack {
            Form {
                TextField("할 일", text: $text)
                Toggle("마감", isOn: $hasDue)
                if hasDue { DatePicker("날짜", selection: $due, displayedComponents: .date) }
            }
            .navigationTitle("할 일 추가").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("추가") { store.addTodo(text.trimmingCharacters(in: .whitespaces), due: hasDue ? FB.key(due) : nil); dismiss() }.disabled(text.trimmingCharacters(in: .whitespaces).isEmpty) } }
        }.presentationDetents([.medium])
    }
}
struct AddEventSheet: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var text = ""; @State private var date: Date
    init(date: Date = Date()) { _date = State(initialValue: date) }
    @State private var hasTime = false; @State private var time = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    /// 저장 형식은 PC·위젯·알림과 같은 "HH:MM 제목"
    var finalText: String { let t = text.trimmingCharacters(in: .whitespaces); return hasTime ? String(format: "%02d:%02d ", Calendar.current.component(.hour, from: time), Calendar.current.component(.minute, from: time)) + t : t }
    var body: some View {
        NavigationStack {
            Form {
                TextField("일정", text: $text)
                DatePicker("날짜", selection: $date, displayedComponents: .date)
                Toggle("시간", isOn: $hasTime.animation())
                if hasTime { DatePicker("시각", selection: $time, displayedComponents: .hourAndMinute); Text("10분 전에 알림이 오고, 위젯에도 시각이 표시됩니다").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("일정 추가").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("추가") { store.addEvent(FB.key(date), finalText); dismiss() }.disabled(text.trimmingCharacters(in: .whitespaces).isEmpty) } }
        }.presentationDetents([.medium, .large])
    }
}
struct AddDDaySheet: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var label = ""; @State private var date = Date()
    var body: some View {
        NavigationStack {
            Form { TextField("이름", text: $label); DatePicker("날짜", selection: $date, displayedComponents: .date) }
            .navigationTitle("디데이 추가").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("추가") { store.addDDay(label.trimmingCharacters(in: .whitespaces), FB.key(date)); dismiss() }.disabled(label.trimmingCharacters(in: .whitespaces).isEmpty) } }
        }.presentationDetents([.medium])
    }
}

struct AddNoticeSheet: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var text = ""; @State private var date = Notice.dateString()
    var body: some View {
        NavigationStack {
            Form {
                TextField("공지 내용", text: $text, axis: .vertical).lineLimit(1...4)
                TextField("날짜 (2026.08.06)", text: $date).keyboardType(.numbersAndPunctuation)
                Section { Text("저장 즉시 홈페이지 첫 화면에 반영됩니다. 최신 3개만 표시됩니다.").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("홈페이지 공지").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("게시") { store.addNotice(String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)), date: date.trimmingCharacters(in: .whitespaces).isEmpty ? Notice.dateString() : date.trimmingCharacters(in: .whitespaces)); dismiss() }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) } }
        }.presentationDetents([.medium])
    }
}

/// 공지 전체 목록 — 스와이프로 내리기
struct NoticeListView: View {
    @EnvironmentObject var store: DeskStore
    @State private var showAdd = false
    var body: some View {
        List {
            ForEach(Array(store.notices.enumerated()), id: \.element.id) { i, n in
                VStack(alignment: .leading, spacing: 3) {
                    HStack { Text(n.date).font(.caption.monospacedDigit()).foregroundStyle(.secondary); if i < 3 { Text("홈페이지 표시 중").font(.caption2.weight(.semibold)).foregroundStyle(DeskTheme.success) } }
                    Text(n.text).desk(.body)
                }
                .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteNotice(n) } label: { Label("내리기", systemImage: "trash") } }
            }
            if store.notices.isEmpty { Text("게시된 공지가 없습니다").foregroundStyle(.secondary) }
        }
        .navigationTitle("홈페이지 공지").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showAdd = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $showAdd) { AddNoticeSheet() }
    }
}
