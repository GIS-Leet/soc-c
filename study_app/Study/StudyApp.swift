// Study — 랜덤 시각에 앱들을 잠그고, 공부(시험 통과)해야 풀어 주는 나만의 앱
import SwiftUI
import GoogleSignIn
import UserNotifications

@main
struct StudyApp: App {
    private let testIsolation: Void = TestRuntime.install()
    private let restoreRecovery: Void = Backup.recoverOnLaunch()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onChange(of:phase) { _,phase in PresentationState.shared.suspended = phase != .active }
                .handlesExternalEvents(preferring: ["nyuheatgis.note"], allowing: ["*"])
                .onOpenURL { url in
                    if GIDSignIn.sharedInstance.handle(url) { return }
                    if url.scheme == "study" { model.openStudy() }
                }
        }
        .commands {   // Mac·iPad 키보드: ⌘1~5 탭, ⌘N 새 노트, ⌘R 새로고침, ⌘L 카드 서재, ⌘⇧L 아무 카드
            CommandGroup(replacing: .newItem) { Button("새 노트") { model.tab = 1; model.newNoteRequest += 1 }.keyboardShortcut("n") }
            CommandMenu("이동") {
                ForEach(Array(["오늘", "노트", "수업", "공부", "더보기"].enumerated()), id: \.offset) { i, name in
                    Button(name) { model.tab = i }.keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                }
                Divider()
                Button("새로고침") { model.refresh() }.keyboardShortcut("r")
                Divider()
                Button("카드 서재") { model.tab = 3; model.libraryRequest += 1 }.keyboardShortcut("l")
                Button("아무 카드 한 장") { model.tab = 3; model.randomCardRequest += 1 }.keyboardShortcut("l", modifiers: [.command, .shift])
            }
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        InkPerf.begin("launch")
        Metrics.shared.start()
        UNUserNotificationCenter.current().delegate = self
        Auth.configure()
        _ = FirebaseSession.apiKey   // App Group에 API 키 복사(위젯·공유 확장용)
        BackgroundRefresh.register(); BackgroundRefresh.schedule()
        application.registerForRemoteNotifications()   // Q&A 새 질문 푸시(qna_push 폴러가 APNs 로 보냄)
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        TimetableStore.pushToken = hex
        Task { await DeskStore.shared.uploadPushToken() }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { print("APNs 등록 실패: \(error.localizedDescription)") }
    /// 외부 화면(AirPlay·HDMI)이 붙으면 발표용 씬을, 그 밖(앱 본체)은 SwiftUI 기본 설정을 쓴다
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let cfg = UISceneConfiguration(name: nil, sessionRole: session.role)
        if session.role == .windowExternalDisplayNonInteractive { cfg.delegateClass = ExternalSceneDelegate.self }
        return cfg
    }
    // 앱이 떠 있을 때도 알림 배너 표시
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
    // 알림 탭 → 공부 화면
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        await MainActor.run { if info["qa"] as? Bool == true { AppModel.shared.jumpToQA = true } else if info["vocal"] as? Bool == true { AppModel.shared.openVocal() } else if info["open"] as? Bool == true { AppModel.shared.openPending() } }
    }
}
