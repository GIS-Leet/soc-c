// 시간표를 Firebase에서 받아 저장하고, 앞으로 5일치 수업마다 시작 2분 전 무음 알림을 예약. 위젯도 갱신
import Foundation
import UserNotifications
import WidgetKit

enum ClassAlarm {
    static let url = URL(string: "https://soc-c-qna-default-rtdb.firebaseio.com/desk/timetable.json")!
    static func refresh() async {
        guard !TestRuntime.isTesting else { return }
        if let (data, _) = try? await URLSession.shared.data(from: url), let json = try? JSONSerialization.jsonObject(with: data) {
            TimetableStore.timetable = Timetable.parse(json)
            TimetableStore.fetchedAt = Date()
        }
        if let j = try? await RTDB.get("desk/periods"), let ps = PeriodSchedule.parse(j), ps != PeriodSchedule.current { PeriodSchedule.current = ps }   // 로그인된 경우 교시 설정 동기화
        schedule()
        WidgetCenter.shared.reloadAllTimelines()
    }
    static func schedule() {
        guard !TestRuntime.isTesting else { return }
        let nc = UNUserNotificationCenter.current()
        nc.getPendingNotificationRequests { reqs in
            nc.removePendingNotificationRequests(withIdentifiers: reqs.map(\.identifier).filter { $0.hasPrefix("class-") })
            guard TimetableStore.classAlarmOn, let t = TimetableStore.timetable else { return }
            for a in t.alarms(from: Date(), days: 5) {
                let c = UNMutableNotificationContent()
                c.title = "수업 2분 전"; c.body = "\(a.period)교시 \(Timetable.hhmm(a.period)) · \(a.subject)"   // 무음 — Mac 알림과 동일
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: a.date)
                let id = "class-\(comps.year!)-\(comps.month!)-\(comps.day!)-\(a.period)"
                nc.add(UNNotificationRequest(identifier: id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))) { e in if let e { Report.note("수업 알림 예약", e.localizedDescription) } }
            }
        }
    }
}
