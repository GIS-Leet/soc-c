// 공부 탭 — 오늘 회차·잠금 상태·잠글 앱·테스트
import SwiftUI
#if !targetEnvironment(macCatalyst)
import FamilyControls
#endif

struct StudyView: View {
    @EnvironmentObject var m: AppModel
    @EnvironmentObject var store: DeskStore
    @State private var libRoute: LibRoute? = ProcessInfo.processInfo.environment["UITEST_LIBRARY"].map { LibRoute(random: $0 == "random") }   // 화면 확인용: 켜자마자 카드 서재
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink { CardLibraryView() } label: { Label("전체 카드 읽기", systemImage: "books.vertical") }
                    NavigationLink { CardLibraryView(random: true) } label: { Label("아무 카드 한 장", systemImage: "shuffle") }
                } header: { Text("카드 서재") } footer: { Text("지리·일본어·영어 카드를 날짜와 상관없이 자세한 설명·용어·예문·대화까지 읽습니다. 오늘 카드를 누르면 그 카드 전체가 열립니다.") }
                Section("오늘 카드") {
                    if store.dailyCards.isEmpty { Text("불러오는 중…").foregroundStyle(.secondary) }
                    ForEach(store.dailyCards) { c in
                        NavigationLink { CardLibraryView(subject: c.subject, day: c.day) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(c.subject).desk(.label).foregroundStyle(DeskTheme.accent); Spacer(); Text("Day \(c.day)" + (c.round > 1 ? " · \(c.round)회차" : "") + (c.left <= 14 ? " · 남은 분량 \(c.left)일" : "")).scaledFont(11, mono: true).foregroundStyle(c.left <= 14 ? DeskTheme.warn : .secondary) }
                            Text(c.title).scaledFont(16, .semibold)
                            if !c.line.isEmpty { Text(c.line).desk(.body).foregroundStyle(.secondary).lineLimit(2) }
                        }.padding(.vertical, 2)
                        }
                    }
                    let g = store.dailyGoal()
                    HStack { Text("오늘 몫 \(g.done)/\(g.total)").scaledFont(14, .semibold).foregroundStyle(g.done == g.total ? DeskTheme.success : .primary); Spacer(); Button("지금 공부") { m.openStudy() }.deskProminent() }
                }
                #if !targetEnvironment(macCatalyst)
                Section {
                    HStack {
                        Label(m.vocalDoneToday ? "오늘 끝" : m.vocalPending ? "밀림 · 21:00" : "오늘 21:00", systemImage: m.vocalDoneToday ? "checkmark.circle.fill" : "waveform").foregroundStyle(m.vocalDoneToday ? DeskTheme.success : m.vocalPending ? DeskTheme.live : Color.primary)
                        Spacer()
                        if !m.vocalDoneToday { Button("지금 시작") { m.openVocal() }.deskProminent().controlSize(.small) }
                    }
                    Toggle("매일 21:00 발성 연습", isOn: Binding(get: { m.vocalOn }, set: { m.setVocal($0) }))
                    Text("몸 풀기·호흡·립트릴·허밍·공명·낭독·마무리 \(VocalRoutine.totalMinutes)분. 21:00 부터 끝낼 때까지 앱이 잠기고 30분마다 알림이 옵니다. 미리 해도 됩니다.").font(.footnote).foregroundStyle(.secondary)
                } header: { Text("발성 연습") }
                Section {
                    Toggle("랜덤 잠금", isOn: Binding(get: { m.randomLock }, set: { m.setRandomLock($0) }))
                    Text(m.randomLock ? "평일 08:10–16:00 · 주말 10:00–20:00 사이 랜덤 4번, 시험을 통과할 때까지 잠깁니다." : "이 기기에서는 랜덤으로 뜨지 않습니다. 「지금 공부」로 언제든 공부할 수 있습니다. (수업용 iPad 기본값)").font(.footnote).foregroundStyle(.secondary)
                }
                Section("오늘") {
                    if !m.randomLock { Text("랜덤 회차 없음").foregroundStyle(.secondary) }
                    else if m.todayTimes.isEmpty { Text("예정 없음").foregroundStyle(.secondary) }
                    ForEach(Array(m.todayTimes.enumerated()), id: \.offset) { i, t in
                        HStack {
                            Text("\(i + 1)회차").foregroundStyle(.secondary)
                            Text(AppModel.hhmm(t)).monospacedDigit()
                            Spacer()
                            if m.doneToday.contains(i + 1) { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                            else if Scheduler.passedUndone().contains(i + 1) { Text("대기 중").foregroundStyle(DeskTheme.live).font(.footnote) }
                        }
                    }
                    HStack {
                        Label(m.locked ? "잠금 중" : "해제됨", systemImage: m.locked ? "lock.fill" : "lock.open").foregroundStyle(m.locked ? DeskTheme.live : Color.secondary)
                        Spacer()
                        Button("지금 공부") { m.openStudy() }.buttonStyle(.borderedProminent)
                    }
                }
                Section("잠글 앱") {
                    Button { m.showPicker = true } label: {
                        HStack { Text("앱·카테고리 고르기"); Spacer()
                            Text("\(m.selection.applicationTokens.count)개 앱 · \(m.selection.categoryTokens.count)개 카테고리").foregroundStyle(.secondary).font(.footnote) }
                    }.disabled(!m.screenTimeAuthorized)
                }
                Section("테스트") {
                    Button("지금 잠그기") { m.lockNow() }.disabled(!m.screenTimeAuthorized)
                    Button("잠금 풀기 (Face ID)", role: .destructive) { Task { await m.unlockNow() } }
                }
                #else
                Section { Text("Mac 에서는 공부 탭이 강제 잠금 없이 오늘 카드와 공부 창만 제공합니다").font(.footnote).foregroundStyle(.secondary) }
                #endif
            }
            .navigationTitle("공부")
            .navigationDestination(item: $libRoute) { r in CardLibraryView(random: r.random) }
            .onChange(of: m.libraryRequest) { _, _ in libRoute = LibRoute(random: false) }
            .onChange(of: m.randomCardRequest) { _, _ in libRoute = LibRoute(random: true) }
            .refreshable { await store.refreshDailyCards(force: true) }
            .task { await store.refreshDailyCards() }
        }
        #if !targetEnvironment(macCatalyst)
        .familyActivityPicker(isPresented: $m.showPicker, selection: $m.selection)
        .onChange(of: m.showPicker) { _, shown in if !shown { m.saveSelection() } }
        #endif
    }
}
