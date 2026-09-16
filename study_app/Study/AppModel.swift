// 앱 상태: 권한·예정·잠금·로그인·설정. 화면들과 웹뷰가 이걸 본다
import SwiftUI
#if !targetEnvironment(macCatalyst)
import FamilyControls
#endif
import UserNotifications
import GoogleSignIn
import LocalAuthentication

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()
    #if !targetEnvironment(macCatalyst)
    @Published var screenTimeAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
    @Published var selection = Store.selection
    #else
    @Published var screenTimeAuthorized = false
    #endif
    @Published var notificationsAuthorized = false
    @Published var showPicker = false
    @Published var showStudy = false
    @Published var studySlot = 0
    @Published var studyMode = "full"
    @Published var signedInEmail: String? = GIDSignIn.sharedInstance.currentUser?.profile?.email
    @Published var todayTimes: [Int] = []
    @Published var doneToday: [Int] = []
    @Published var locked = Store.isLocked
    @Published var message = ""
    @Published var faceID = TimetableStore.faceIDOn
    @Published var classAlarm = TimetableStore.classAlarmOn
    @Published var timetableAt: Date? = TimetableStore.fetchedAt
    @Published var jumpToQA = false
    @Published var openNoteID: String? = nil   // 새 창·알림으로 열 노트
    @Published var tab = 0
    @Published var libraryRequest = 0      // Mac 메뉴 ⌘L: 공부 탭 카드 서재 열기
    @Published var randomCardRequest = 0   // ⌘⇧L: 아무 카드 한 장
    @Published var newNoteRequest = 0          // ⌘N — 노트 탭이 보고 새 노트를 만든다
    @Published var randomLock = Store.randomLockOn
    @Published var showVocal = ProcessInfo.processInfo.environment["UITEST_VOCAL"] != nil   // 화면 확인용: 켜자마자 발성 화면
    @Published var vocalOn = Store.vocalOn
    @Published var vocalDoneToday = VocalRoutine.isDone(Date())
    @Published var vocalPending = VocalRoutine.pending(now: Date())

    func refresh() {
        randomLock = Store.randomLockOn
        if randomLock { Scheduler.ensure(days: 4) } else { Store.slots = [:] }   // 꺼져 있으면 예정 회차 없음 → 잠기지 않음
        let k = Store.key(Date())
        todayTimes = Store.slots[k] ?? []; doneToday = Store.done[k] ?? []
        vocalOn = Store.vocalOn; vocalDoneToday = VocalRoutine.isDone(Date()); vocalPending = VocalRoutine.pending(now: Date())
        #if !targetEnvironment(macCatalyst)
        selection = Store.selection
        screenTimeAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
        #endif
        signedInEmail = GIDSignIn.sharedInstance.currentUser?.profile?.email
        timetableAt = TimetableStore.fetchedAt
        Task { notificationsAuthorized = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .authorized }
        if (!Scheduler.passedUndone().isEmpty || vocalPending) && Store.hasSelection { Store.lock() }   // 확장이 놓쳤을 때 대비
        locked = Store.isLocked
        Triggers.register()
        Task { await ClassAlarm.refresh(); timetableAt = TimetableStore.fetchedAt; await LiveActivity.sync() }   // 시간표·수업 알림·위젯·Live Activity 갱신
        BackgroundRefresh.schedule()
        Task { await CalendarModel.shared.refresh() }
    }
    func requestScreenTime() async {
        #if !targetEnvironment(macCatalyst)
        do { try await AuthorizationCenter.shared.requestAuthorization(for: .individual); screenTimeAuthorized = true; message = "" }
        catch { message = "Screen Time 권한 실패: \(error.localizedDescription)" }
        #endif
    }
    func requestNotifications() async {
        notificationsAuthorized = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        Triggers.register(); ClassAlarm.schedule()
    }
    func saveSelection() {
        #if !targetEnvironment(macCatalyst)
        Store.selection = selection; if locked { Store.lock() }
        #endif
    }
    func setRandomLock(_ on: Bool) { Store.randomLockOn = on; refresh() }
    /// 잠금 화면·알림에서 「열기」 — 밀린 공부가 없고 발성만 밀렸으면 발성으로
    func openPending() { if Scheduler.passedUndone().isEmpty, VocalRoutine.pending(now: Date()) { openVocal() } else { openStudy() } }
    func openVocal() { showVocal = true }
    func vocalFinished() { VocalRoutine.markDone(); DeskStore.shared.logSession(subject: "발성", minutes: VocalRoutine.totalMinutes); showVocal = false; refresh() }
    func setVocal(_ on: Bool) { Store.vocalOn = on; refresh() }
    func openStudy() {
        studySlot = Scheduler.passedUndone().first ?? 0
        studyMode = Scheduler.mode()
        showStudy = true
    }
    func studyFinished() { _ = Scheduler.markDone(); showStudy = false; refresh() }
    func lockNow() { Store.lock(); locked = true }
    /// 테스트용 잠금 풀기 — Face ID(또는 암호) 확인 뒤에만 (시험 없이 푸는 뒷문 방지)
    func unlockNow() async {
        let ctx = LAContext(); var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err), (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "잠금 풀기")) == true else { message = "본인 확인이 안 되어 잠금을 풀지 않았습니다."; return }
        Store.unlock(); locked = false; Haptic.success()
    }
    func signIn() async {
        do {
            signedInEmail = try await Auth.signIn(); message = ""
            if let t = await Auth.tokens() { _ = try await FirebaseSession.shared.signIn(googleIDToken: t.id, accessToken: t.access) }
        } catch { message = "로그인 실패: \(error.localizedDescription)" }
    }
    static func hhmm(_ m: Int) -> String { String(format: "%02d:%02d", m / 60, m % 60) }
}
