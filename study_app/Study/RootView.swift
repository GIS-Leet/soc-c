// 앱 골격 — 탭(Desk·공부·설정) + 공부 세션 전체화면 + Face ID 잠금 오버레이
import SwiftUI
import UserNotifications
import WidgetKit

struct RootView: View {
    @EnvironmentObject var m: AppModel
    @StateObject private var gate = LockGate()
    @Environment(\.scenePhase) private var phase

    @StateObject private var store = DeskStore.shared
    @StateObject private var cal = CalendarModel.shared
    @State private var calTask: Task<Void, Never>?
    @AppStorage("onboarded") private var onboarded = false
    @State private var showOnboarding = false
    @State private var htmlDemo: URL? = ProcessInfo.processInfo.environment["UITEST_HTML"] != nil ? HTMLPreviewSample.make() : nil   // 화면 확인용: 샘플 자료 미리보기
    private let isPad = UIDevice.current.userInterfaceIdiom == .pad   // size class 는 앱 전환 중 잠깐 바뀌어 화면이 재생성되므로 쓰지 않음
    /// 스트림 → 위젯·알림·캘린더 훅 (표현식이 길어 세 단계로 나눔)
    private var shell: AnyView { AnyView(Group { if isPad { splitView } else { tabView } }.environmentObject(store).environmentObject(cal)) }
    private var hooksA: AnyView {
        AnyView(shell
            .onChange(of: m.jumpToQA) { (_: Bool, v: Bool) in if v { m.tab = 2; m.jumpToQA = false } }
            .onChange(of: store.questions) { (_: [Question], qs: [Question]) in questionsChanged(qs) }
            .onChange(of: store.todos) { (_: [Todo], ts: [Todo]) in todosChanged(ts) }
            .onChange(of: store.calendar) { (_: [String: [CalEvent]], c: [String: [CalEvent]]) in calendarChanged(c) }
            .onChange(of: store.ready) { (_: Bool, r: Bool) in if r && !TestRuntime.isTesting { Task { await cal.refresh(desk: store); await store.uploadPushToken() } } })
    }
    private var observed: AnyView {
        AnyView(hooksA
            .onChange(of: cal.external) { (_: [String: [ExternalEvent]], e: [String: [ExternalEvent]]) in if !TestRuntime.isTesting { EventAlarm.sync(desk: store.calendar, external: e) } }
            .onChange(of: store.sessions) { (_: [StudySession], s: [StudySession]) in if !TestRuntime.isTesting { WeeklyReport.schedule(WeeklyReport.summary(sessions: s, quizlog: store.quizlog)) } }
            .onChange(of: store.progress) { (_: Progress, _: Progress) in scheduleReview() }
            .onChange(of: store.questions.count) { (_: Int, _: Int) in scheduleReview() }
            .onContinueUserActivity("nyuheatgis.note", perform: continueNote))
    }
    private func questionsChanged(_ qs: [Question]) {
        guard !TestRuntime.isTesting else { return }
        TimetableStore.unanswered = store.unanswered; BackgroundRefresh.remember(qs)
        UNUserNotificationCenter.current().setBadgeCount(store.unanswered) { _ in }
        WidgetCenter.shared.reloadTimelines(ofKind: "DeskLock")
    }
    private func todosChanged(_ ts: [Todo]) {
        guard !TestRuntime.isTesting else { return }
        let snap = ts.map { WidgetTodo(id: $0.id, text: $0.text, done: $0.done, due: $0.due) }
        if snap != TimetableStore.todos { TimetableStore.todos = snap; WidgetCenter.shared.reloadTimelines(ofKind: "DeskTodo") }
    }
    private func calendarChanged(_ c: [String: [CalEvent]]) {
        guard !TestRuntime.isTesting else { return }
        calTask?.cancel(); calTask = Task { try? await Task.sleep(for: .seconds(2)); if !Task.isCancelled { await cal.refresh(desk: store) } }
        EventAlarm.sync(desk: c, external: cal.external)
    }
    var body: some View {
        observed
        .fullScreenCover(isPresented: $m.showStudy) {
            StudyWebView(slot: m.studySlot, mode: m.studyMode) { m.studyFinished() }
                .ignoresSafeArea()
                .interactiveDismissDisabled(m.locked)
                .overlay(alignment: .topTrailing) {
                    if !m.locked { Button { m.showStudy = false } label: { Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(.secondary).padding() } }
                }
        }
        .fullScreenCover(isPresented: $m.showVocal) {
            VocalPracticeView { m.vocalFinished() }
                .interactiveDismissDisabled(m.locked)
                .overlay(alignment: .topTrailing) {
                    if !m.locked { Button { m.showVocal = false } label: { Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(.secondary).padding() } }
                }
        }
        .overlay(alignment: .top) { ReportBanner(onSignIn: signInAgain) }
        .safeAreaInset(edge: .bottom) {
            if store.saveState != .synced {
                HStack {
                    Image(systemName: "icloud.and.arrow.up")
                    switch store.saveState {
                    case .savingLocally: Text("기기에 저장 중")
                    case .pending(let count): Text("서버 전송 대기 \(count)건")
                    case .failed(let message): Text(message).lineLimit(2)
                    case .synced: EmptyView()
                    }
                    Spacer()
                    Button("재시도") { Task { await store.drainQueue(retryFailures: true) } }
                }.font(.caption).padding().background(.regularMaterial).accessibilityIdentifier("save-status")
            }
        }
        .overlay { LockOverlay(gate: gate) }
        .fullScreenCover(isPresented: $showOnboarding) { OnboardingView().environmentObject(m).environmentObject(cal).environmentObject(store) }
        .sheet(item: $htmlDemo) { u in HTMLPreview(url: u) }
        .onAppear { appeared() }
        .onChange(of: phase) { _, p in if p == .active { m.refresh(); Task { await store.start(); await store.drainQueue(); if !TestRuntime.isTesting { await InkLocal.drain() } } } else if p == .background { gate.arm() } }
    }
    private func appeared() {
        InkPerf.end("launch"); m.refresh(); gate.arm()
        Task { await store.start() }
        if !TestRuntime.isTesting { Backup.autoIfDue() }
        let uiTest = TestRuntime.isTesting
        if let t = ProcessInfo.processInfo.environment["UITEST_TAB"].flatMap(Int.init) { m.tab = t }
        if !onboarded && !uiTest { showOnboarding = true }
    }
    private func continueNote(_ a: NSUserActivity) { guard let id = a.userInfo?["id"] as? String else { return }; m.tab = 1; m.openNoteID = id }
    private func scheduleReview() { guard !TestRuntime.isTesting else { return }; TeacherReview.schedule(TeacherReview.make(progress: store.progress, questions: store.questions, calendar: store.calendar, ddays: store.ddays, sessions: store.sessions)) }
    private func signInAgain() { Task { _ = try? await Auth.signIn(); Report.shared.needsSignIn = false; store.stop(); await store.start() } }
    /// iPhone: 탭 5개
    var tabView: some View {
        TabView(selection: $m.tab) {
            TodayView().tabItem { Label("오늘", systemImage: "sun.max") }.tag(0)
            NotesView().tabItem { Label("노트", systemImage: "note.text") }.tag(1)
            ClassHubView().tabItem { Label("수업", systemImage: "person.2") }.badge(store.unanswered).tag(2)
            StudyView().tabItem { Label("공부", systemImage: "book") }.tag(3)
            MoreView().tabItem { Label("더보기", systemImage: "ellipsis.circle") }.tag(4)
        }
    }
    /// iPad(넓은 화면): 왼쪽 사이드바 + 오른쪽 내용. 탭 번호는 iPhone과 같고 더보기 항목은 5~8
    var splitView: some View {
        NavigationSplitView {
            List(selection: Binding(get: { Optional(m.tab) }, set: { m.tab = $0 ?? 0 })) {
                Section {
                    Label("오늘", systemImage: "sun.max").tag(0)
                    Label("노트", systemImage: "note.text").tag(1)
                    Label("수업", systemImage: "person.2").badge(store.unanswered).tag(2)
                    Label("공부", systemImage: "book").tag(3)
                    Label("더보기",systemImage:"ellipsis.circle").tag(4)
                }
                Section("더보기") {
                    Label("홈페이지 공지", systemImage: "megaphone").tag(7)
                    Label("Desk 웹", systemImage: "rectangle.grid.2x2").tag(8)
                    Label("설정", systemImage: "gearshape").tag(9)
                }
            }
            .navigationTitle("Desk")
        } detail: {
            switch m.tab {
            case 1: NotesView()
            case 2: ClassHubView()
            case 3: StudyView()
            case 4: MoreView()
            case 5: NavigationStack { MaterialsView() }
            case 6: NavigationStack { ClassView() }
            case 7: NavigationStack { NoticeListView() }
            case 8: NavigationStack { DeskView().navigationTitle("Desk 웹").navigationBarTitleDisplayMode(.inline) }
            case 9: NavigationStack { SettingsView() }
            default: TodayView()
            }
        }
    }
}
