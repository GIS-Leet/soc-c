// 백그라운드 갱신 — 새 질문·대댓글을 감지해 로컬 알림, 앱 배지 갱신, Live Activity·시간표 갱신. 서버 없이 iOS가 주는 기회에 실행
import Foundation
import BackgroundTasks
import UserNotifications
import UIKit

enum BackgroundRefresh {
    static let id = "nyuheatgis.refresh"
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: nil) { task in
            guard let t = task as? BGAppRefreshTask else { return }
            schedule()
            let job = Task { await run(); t.setTaskCompleted(success: true) }
            t.expirationHandler = { job.cancel() }
        }
    }
    static func schedule(after minutes: Double = 30) {
        let req = BGAppRefreshTaskRequest(identifier: id); req.earliestBeginDate = Date().addingTimeInterval(minutes * 60)
        try? BGTaskScheduler.shared.submit(req)
    }
    /// 실행: 새 질문 키(shallow) + 최근 질문 15개의 대댓글 수 비교
    static func run() async {
        await ClassAlarm.refresh(); await LiveActivity.sync()
        _ = await WriteQueue.drain(); await InkLocal.drain()   // 오프라인에서 쌓인 변경·필기 전송
        guard let token = try? await FirebaseSession.shared.token() else { return }
        let d = TimetableStore.defaults
        // 1) 새 질문
        var comps = URLComponents(url: RTDB.base.appendingPathComponent("questions.json"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [.init(name: "shallow", value: "true"), .init(name: "auth", value: token)]
        guard let (data, _) = try? await URLSession.shared.data(from: comps.url!), let keys = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?.keys else { return }
        let known = Set(d.stringArray(forKey: "qa-known") ?? [])
        let all = Set(keys)
        if !known.isEmpty {
            for k in all.subtracting(known).sorted() { if let q = await fetchQuestion(k, token) { notify("새 질문", q.title.isEmpty ? String(q.text.prefix(60)) : q.title, id: "q-\(k)") } }
        }
        d.set(Array(all), forKey: "qa-known")
        // 2) 최근 15개 질문의 대댓글 수
        let recent = all.sorted().suffix(15)
        var counts = d.dictionary(forKey: "qa-subcount") as? [String: Int] ?? [:]
        for k in recent {
            guard let q = await fetchQuestion(k, token) else { continue }
            let n = q.replies.reduce(0) { $0 + $1.subReplies.filter { !$0.isTeacher }.count }
            if let prev = counts[k], n > prev { notify("학생 대댓글", (q.title.isEmpty ? String(q.text.prefix(40)) : q.title) + " · " + (q.replies.flatMap(\.subReplies).last?.text.prefix(50) ?? ""), id: "s-\(k)-\(n)") }
            counts[k] = n
        }
        d.set(counts, forKey: "qa-subcount")
        await MainActor.run { UNUserNotificationCenter.current().setBadgeCount(TimetableStore.unanswered) { _ in } }
        // 3) 일정(desk/calendar + Apple) → 위젯 스냅샷·아침 요약·10분 전 알림
        if let c = try? await RTDB.get("desk/calendar") { let desk = CalEvent.parse(c); await MainActor.run { CalendarModel.shared.reloadExternal(); EventAlarm.sync(desk: desk, external: CalendarModel.shared.external) } }
    }
    static func fetchQuestion(_ id: String, _ token: String) async -> Question? {
        var c = URLComponents(url: RTDB.base.appendingPathComponent("questions/\(id).json"), resolvingAgainstBaseURL: false)!; c.queryItems = [.init(name: "auth", value: token)]
        guard let (data, _) = try? await URLSession.shared.data(from: c.url!), let v = try? JSONSerialization.jsonObject(with: data) else { return nil }
        return Question.parse([id: v]).first
    }
    static func notify(_ title: String, _ body: String, id: String) {
        let c = UNMutableNotificationContent(); c.title = title; c.body = body; c.sound = .default; c.userInfo = ["qa": true]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }
    /// 앱이 켜져 있을 때 스트림으로 받은 최신 상태를 기준점으로 저장(그래야 배경에서 '새로움'만 감지)
    static func remember(_ questions: [Question]) {
        let d = TimetableStore.defaults
        d.set(questions.map(\.id), forKey: "qa-known")
        var counts: [String: Int] = [:]
        for q in questions.sorted(by: { $0.id > $1.id }).prefix(15) { counts[q.id] = q.replies.reduce(0) { $0 + $1.subReplies.filter { !$0.isTeacher }.count } }
        d.set(counts, forKey: "qa-subcount")
    }
}
