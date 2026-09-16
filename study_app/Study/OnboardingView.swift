// 첫 실행 안내(3장) — 권한 → 시간표·교시 시간 → 위젯. 한 번 보면 다시 안 뜸(설정에서 다시 볼 수 있음)
import SwiftUI
import WidgetKit

struct OnboardingView: View {
    @EnvironmentObject var m: AppModel
    @EnvironmentObject var cal: CalendarModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("onboarded") private var onboarded = false
    @State private var page = 0
    @State private var periods = false
    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                permissions.tag(0); timetable.tag(1); widgets.tag(2)
            }.tabViewStyle(.page(indexDisplayMode: .always)).indexViewStyle(.page(backgroundDisplayMode: .always))
            HStack {
                Button("건너뛰기") { finish() }.foregroundStyle(.secondary)
                Spacer()
                Button(page < 2 ? "다음" : "시작") { if page < 2 { withAnimation { page += 1 } } else { finish() } }.deskProminent()
            }.padding(20)
        }
        .background(DeskTheme.canvas)
        .sheet(isPresented: $periods) { NavigationStack { PeriodEditor() } }
        .interactiveDismissDisabled()
    }
    func finish() { onboarded = true; dismiss() }
    func card<C: View>(_ title: String, _ sub: String, @ViewBuilder _ c: () -> C) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(title).font(.system(.largeTitle, design: .rounded).weight(.bold)).padding(.top, 40)
                Text(sub).font(.body).foregroundStyle(.secondary)
                c()
            }.padding(24).frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
    }
    var permissions: some View {
        card("권한 세 가지", "Desk 가 수업·일정을 챙기려면 아래 권한이 필요합니다. 나중에 설정에서도 바꿀 수 있어요.") {
            VStack(spacing: 10) {
                permRow("알림", "수업 2분 전·일정·질문 알림", ok: m.notificationsAuthorized) { Task { await m.requestNotifications() } }
                permRow("캘린더", "Apple 캘린더 일정을 오늘 화면에", ok: cal.authorized) { Task { await cal.requestAccess() } }
                #if !targetEnvironment(macCatalyst)
                permRow("Screen Time", "공부 시간 앱 잠금(선택)", ok: m.screenTimeAuthorized) { Task { await m.requestScreenTime() } }
                #endif
            }
        }
    }
    func permRow(_ t: String, _ d: String, ok: Bool, action: @escaping () -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) { Text(t).font(.headline); Text(d).font(.footnote).foregroundStyle(.secondary) }
            Spacer()
            if ok { Image(systemName: "checkmark.circle.fill").foregroundStyle(DeskTheme.success).accessibilityLabel("허용됨") } else { Button("허용", action: action).buttonStyle(.bordered).controlSize(.small) }
        }.padding(14).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
    var timetable: some View {
        card("시간표와 교시 시간", "시간표는 desk 웹에서 받아옵니다. 교시 시작 시각은 학교에 맞게 바꿔 두세요.") {
            let t = TimetableStore.timetable
            VStack(alignment: .leading, spacing: 10) {
                if let t { Text("받아온 시간표: 주 \(Timetable.dayKeys.reduce(0) { $0 + (t.days[$1]?.count ?? 0) })시간").font(.headline) }
                else { Text("아직 시간표가 없습니다 — 로그인 후 오늘 화면을 당겨 새로고침하면 받아옵니다").font(.subheadline).foregroundStyle(.secondary) }
                Text("1교시 \(Timetable.hhmm(1)) 시작 · \(Timetable.periodLength)분 수업").font(.subheadline)
                Button("교시 시간 바꾸기") { periods = true }.buttonStyle(.bordered).controlSize(.small)
            }.padding(14).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
    }
    var widgets: some View {
        card("위젯을 올려 두세요", "홈 화면을 길게 눌러 위젯 추가 → Desk. 잠금 화면에도 넣을 수 있어요.") {
            VStack(alignment: .leading, spacing: 8) {
                Label("오늘 시간표 — 지금·다음 수업", systemImage: "calendar.day.timeline.left")
                Label("일정 — 이번 주 desk·Apple 캘린더", systemImage: "calendar")
                Label("할 일 — 위젯에서 바로 체크", systemImage: "checklist")
                Label("잠금 화면 — 다음 수업·일정 한 줄", systemImage: "lock")
            }.font(.subheadline).padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
    }
}

/// 교시 시작 시각·수업 길이 편집 — App Group 저장 + desk/periods 업로드(Mac 알림 도구 공유), 알림·위젯 재예약
struct PeriodEditor: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) private var dismiss
    @State private var starts: [Int: Int] = PeriodSchedule.current.starts
    @State private var length = PeriodSchedule.current.length
    var body: some View {
        Form {
            Section("교시 시작") {
                ForEach(1...7, id: \.self) { p in
                    DatePicker("\(p)교시", selection: Binding(get: { Calendar.current.date(bySettingHour: (starts[p] ?? 0) / 60, minute: (starts[p] ?? 0) % 60, second: 0, of: Date()) ?? Date() }, set: { starts[p] = Timetable.minutes($0) }), displayedComponents: .hourAndMinute)
                }
            }
            Section { Stepper("수업 길이 \(length)분", value: $length, in: 30...90, step: 5) }
            Section { Button("기본값(8:20 시작·50분)으로") { starts = PeriodSchedule.standard.starts; length = PeriodSchedule.standard.length } }
        }
        .navigationTitle("교시 시간").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("저장") { let ps = PeriodSchedule(starts: starts, length: length); PeriodSchedule.current = ps; store.qput("desk/periods", ps.plain); ClassAlarm.schedule(); Task { await LiveActivity.sync() }; WidgetCenter.shared.reloadAllTimelines(); dismiss() } } }
    }
}
