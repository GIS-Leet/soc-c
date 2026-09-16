// Live Activity 속성 — 앱과 위젯 확장이 공유. 카운트다운은 시스템이 그리므로(Text(timerInterval:)) 앱은 교시 경계에서만 갱신
#if !targetEnvironment(macCatalyst)
import Foundation
import ActivityKit

struct ClassActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var mode: String            // "now" 수업 중 / "next" 다음 수업 대기 / "done" 오늘 끝
        var period: Int             // 지금 또는 다음 교시
        var subject: String
        var start: Date             // 그 교시 시작
        var end: Date               // 그 교시 끝
        var nextPeriod: Int?        // 수업 중일 때 다음 교시
        var nextSubject: String?
        var nextStart: Date?
    }
    var weekday: String
}
#endif
