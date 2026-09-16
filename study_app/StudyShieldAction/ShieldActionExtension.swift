// 자물쇠 화면의 「Study 열기」 — 확장은 앱을 직접 열 수 없어 즉시 알림을 띄우고, 알림을 누르면 앱이 열린다
import ManagedSettings
import UserNotifications

class ShieldActionExtension: ShieldActionDelegate {
    private func openViaNotification() {
        let c = UNMutableNotificationContent()
        c.title = "Study"; c.body = "눌러서 공부를 시작하세요"; c.sound = .default
        c.userInfo = ["open": true]
        let req = UNNotificationRequest(identifier: "open-study", content: c, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        if action == .primaryButtonPressed { openViaNotification() }
        completionHandler(.close)
    }
    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        if action == .primaryButtonPressed { openViaNotification() }
        completionHandler(.close)
    }
    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        if action == .primaryButtonPressed { openViaNotification() }
        completionHandler(.close)
    }
}
