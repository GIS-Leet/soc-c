// 예정 회차마다 알림(「Study」)과 DeviceActivity 스케줄(→ Monitor 확장이 자물쇠)을 등록. 발성 연습(21:00, 30분마다 리마인드)도 같은 방식
#if !targetEnvironment(macCatalyst)
import Foundation
import UserNotifications
import DeviceActivity

enum Triggers {
    static let center = DeviceActivityCenter()
    static func register() {
        let upcoming = Store.randomLockOn ? Scheduler.upcoming() : []   // 꺼져 있으면 전부 제거만
        let now = Date(), vocal = VocalRoutine.reminders(now: now, days: 7), vocalLocks = VocalRoutine.lockDates(now: now, days: 5)
        // 알림: 기존 회차 알림 제거 후 다시 등록
        let nc = UNUserNotificationCenter.current()
        nc.getPendingNotificationRequests { reqs in
            nc.removePendingNotificationRequests(withIdentifiers: reqs.map(\.identifier).filter { $0.hasPrefix("slot-") || $0.hasPrefix("vocal-") })
            for u in upcoming {
                let c = UNMutableNotificationContent(); c.title = "Study"; c.sound = .default; c.userInfo = ["open": true]
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: u.date)
                nc.add(UNNotificationRequest(identifier: "slot-\(u.day)-\(u.slot)", content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
            }
            for v in vocal {
                let c = UNMutableNotificationContent(); c.title = v.n == 0 ? "발성 연습" : "발성 연습 아직"; c.body = v.n == 0 ? "\(VocalRoutine.totalMinutes)분, 지금 시작" : "끝내야 잠금이 풀립니다"; c.sound = .default; c.userInfo = ["vocal": true]
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: v.date)
                nc.add(UNNotificationRequest(identifier: "vocal-\(v.day)-\(v.n)", content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
            }
        }
        // 자물쇠 스케줄: 시작 시각에 intervalDidStart → Store.lock()
        center.stopMonitoring()
        for u in upcoming.prefix(14) {   // 동시 감시 개수 제한(20) 대비 — 공부 14 + 발성 5
            let start = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: u.date)
            let end = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: u.date.addingTimeInterval(20 * 60))
            let schedule = DeviceActivitySchedule(intervalStart: start, intervalEnd: end, repeats: false)
            try? center.startMonitoring(DeviceActivityName("slot-\(u.day)-\(u.slot)"), during: schedule)
        }
        for v in vocalLocks {
            let start = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: v.date)
            let end = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: v.date.addingTimeInterval(Double(VocalRoutine.lockMinutes) * 60))
            try? center.startMonitoring(DeviceActivityName("vocal-\(v.day)"), during: DeviceActivitySchedule(intervalStart: start, intervalEnd: end, repeats: false))
        }
    }
}
#else
enum Triggers { static func register() {} }
#endif
