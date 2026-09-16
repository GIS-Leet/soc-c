// 수업 Live Activity — 잠금 화면·다이내믹 아일랜드에 지금/다음 수업. 앱이 앞으로 올 때 시작·갱신, 하교 후 종료
#if !targetEnvironment(macCatalyst)
import Foundation
import ActivityKit

enum LiveActivity {
    static var current: Activity<ClassActivityAttributes>? { Activity<ClassActivityAttributes>.activities.first }
    static func state(_ t: Timetable, now: Date, cal: Calendar = .current) -> ClassActivityAttributes.ContentState? {
        guard Timetable.dayKey(now, cal: cal) != nil else { return nil }
        let at = { (m: Int) in cal.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: now)! }
        if let c = t.current(at: now, cal: cal) {
            let n = t.next(at: now, cal: cal)
            return .init(mode: "now", period: c.period, subject: c.subject!, start: at(c.start), end: at(c.start + Timetable.periodLength), nextPeriod: n?.period, nextSubject: n?.subject, nextStart: n.map { at($0.start) })
        }
        if let n = t.next(at: now, cal: cal) {
            return .init(mode: "next", period: n.period, subject: n.subject!, start: at(n.start), end: at(n.start + Timetable.periodLength), nextPeriod: nil, nextSubject: nil, nextStart: nil)
        }
        return nil   // 오늘 수업 끝 → 활동 없음
    }
    /// 보여줄지·언제 치울지 — 다음 수업은 시작 20분 전부터, 진행 중 수업은 끝나면(마지막 수업이면 끝나는 시각에 자동 제거)
    static let leadMinutes = 20.0
    static func plan(_ t: Timetable, now: Date, cal: Calendar = .current) -> (state: ClassActivityAttributes.ContentState, autoDismissAt: Date?)? {
        guard let st = state(t, now: now, cal: cal) else { return nil }
        if st.mode == "next", st.start.timeIntervalSince(now) > leadMinutes * 60 { return nil }
        let last = st.mode == "now" && st.nextPeriod == nil
        return (st, last ? st.end : nil)
    }
    /// 시간표에 맞춰 시작/갱신/종료
    static func sync(now: Date = Date()) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, let t = TimetableStore.timetable else { return }
        let live = Activity<ClassActivityAttributes>.activities.filter { $0.activityState == .active }
        guard let p = plan(t, now: now) else { for a in Activity<ClassActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }; return }
        let content = ActivityContent(state: p.state, staleDate: p.state.mode == "now" ? p.state.end : p.state.start)
        var activity = live.first
        if activity == nil {
            for a in Activity<ClassActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "EEEE"
            do { activity = try Activity.request(attributes: ClassActivityAttributes(weekday: f.string(from: now)), content: content, pushType: nil) } catch { Report.note("Live Activity", error.localizedDescription) }
        } else { await activity?.update(content) }
        if let d = p.autoDismissAt, let a = activity { await a.end(content, dismissalPolicy: .after(d)) }   // 마지막 수업: 끝나는 시각에 잠금 화면에서 자동 제거
    }
}
#else
import Foundation
/// Mac 에는 Live Activity 가 없다 — 호출부가 그대로 컴파일되도록 빈 구현
enum LiveActivity { static func sync(now: Date = Date()) async {} }
#endif
