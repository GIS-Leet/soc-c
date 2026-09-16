// 일정 알림·일정 위젯 — desk/calendar + Apple 캘린더를 합쳐 App Group 스냅샷으로 저장하고, 매일 아침 요약·시각 있는 일정 10분 전 로컬 알림을 예약(디스코드 알림 대체)
import Foundation
import UserNotifications
import WidgetKit
import UIKit
import SwiftUI

enum EventAlarm {
    /// 스냅샷 만들기(앞으로 14일)
    static func snapshot(desk: [String: [CalEvent]], external: [String: [ExternalEvent]], now: Date = Date(), days: Int = 14, cal: Calendar = .current) -> [WidgetEvent] {
        var out: [WidgetEvent] = []
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: cal.startOfDay(for: now)) else { continue }
            let k = WidgetEvent.key(d)
            for e in desk[k] ?? [] { let s = WidgetEvent.split(e.text); out.append(WidgetEvent(id: "d-" + e.id, date: k, title: s.title, minutes: s.minutes, source: "desk")) }
            for e in external[k] ?? [] { out.append(WidgetEvent(id: "a-" + e.id, date: k, title: e.title, minutes: e.minutes, source: "apple", colorHex: hex(e.color))) }
        }
        return out
    }
    static func hex(_ c: Color) -> String? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
    /// 스냅샷 저장 → 위젯 갱신 → 알림 예약
    @MainActor static func sync(desk: [String: [CalEvent]], external: [String: [ExternalEvent]]) {
        let snap = snapshot(desk: desk, external: external)
        if snap != TimetableStore.events { TimetableStore.events = snap; WidgetCenter.shared.reloadTimelines(ofKind: "DeskCalendar") }
        schedule(snap)
    }
    static func schedule(_ events: [WidgetEvent]? = nil) {
        let list = events ?? TimetableStore.events
        let nc = UNUserNotificationCenter.current()
        nc.getPendingNotificationRequests { reqs in
            nc.removePendingNotificationRequests(withIdentifiers: reqs.map(\.identifier).filter { $0.hasPrefix("event-") })
            guard TimetableStore.eventAlarmOn else { return }
            for it in EventAlarmPlan.items(list, now: Date()).prefix(50) {
                let c = UNMutableNotificationContent(); c.title = it.title; c.body = it.body; c.sound = .default; c.userInfo = ["calendar": true]
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: it.fire)
                nc.add(UNNotificationRequest(identifier: it.id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))) { e in if let e { Report.note("일정 알림 예약", e.localizedDescription) } }
            }
        }
    }
}
