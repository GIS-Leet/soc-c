// Siri·단축어(App Intents) — 다음 수업, 할 일 추가, 지금 공부, 미답변 질문
import AppIntents
import SwiftUI

private func say(_ s: String) -> IntentDialog { IntentDialog(stringLiteral: s) }

struct NextClassIntent: AppIntent {
    static var title: LocalizedStringResource = "다음 수업"
    static var description = IntentDescription("지금 또는 다음 수업을 알려줍니다.")
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let now = Date()
        guard let t = TimetableStore.timetable else { return .result(dialog: say("시간표가 아직 없습니다. Desk 앱을 한 번 열어 주세요.")) }
        if Timetable.dayKey(now) == nil { return .result(dialog: say("오늘은 수업이 없습니다.")) }
        if let c = t.current(at: now) { let left = c.start + Timetable.periodLength - Timetable.minutes(now); return .result(dialog: say("지금 \(c.period)교시 \(c.subject!) 수업 중, \(left)분 남았습니다." + (t.next(at: now).map { " 다음은 \($0.period)교시 \(Timetable.hhmm($0.period)) \($0.subject!)." } ?? ""))) }
        if let n = t.next(at: now) { return .result(dialog: say("다음 수업은 \(n.period)교시 \(Timetable.hhmm(n.period)) \(n.subject!), \(n.start - Timetable.minutes(now))분 후입니다.")) }
        return .result(dialog: say("오늘 수업은 모두 끝났습니다."))
    }
}
struct AddTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 추가"
    static var description = IntentDescription("Desk 할 일에 항목을 추가합니다.")
    @Parameter(title: "할 일") var text: String
    static var parameterSummary: some ParameterSummary { Summary("할 일 \(\.$text) 추가") }
    func perform() async throws -> some IntentResult & ProvidesDialog {
        _ = try await FirebaseSession.shared.token()
        var v: [String: Any] = ["text": text, "done": false, "createdAt": Date().timeIntervalSince1970 * 1000]
        v["due"] = nil
        try await RTDB.push("desk/todos", v)
        return .result(dialog: say("할 일에 '\(text)'을(를) 추가했습니다."))
    }
}
struct StartStudyIntent: AppIntent {
    static var title: LocalizedStringResource = "지금 공부"
    static var description = IntentDescription("Desk 공부 세션을 엽니다.")
    static var openAppWhenRun = true
    @MainActor func perform() async throws -> some IntentResult { AppModel.shared.openStudy(); return .result() }
}
struct UnansweredIntent: AppIntent {
    static var title: LocalizedStringResource = "미답변 질문"
    static var description = IntentDescription("답변하지 않은 학생 질문 수를 알려줍니다.")
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let n = TimetableStore.unanswered
        return .result(dialog: say(n == 0 ? "미답변 질문이 없습니다." : "미답변 질문이 \(n)개 있습니다."))
    }
}
struct DeskShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: NextClassIntent(), phrases: ["\(.applicationName)에서 다음 수업", "\(.applicationName) 다음 수업 알려줘", "\(.applicationName) 지금 수업"], shortTitle: "다음 수업", systemImageName: "clock")
        AppShortcut(intent: AddTodoIntent(), phrases: ["\(.applicationName)에 할 일 추가", "\(.applicationName) 할 일 추가해줘"], shortTitle: "할 일 추가", systemImageName: "checklist")
        AppShortcut(intent: StartStudyIntent(), phrases: ["\(.applicationName) 공부 시작", "\(.applicationName)에서 지금 공부"], shortTitle: "지금 공부", systemImageName: "book")
        AppShortcut(intent: UnansweredIntent(), phrases: ["\(.applicationName) 미답변 질문", "\(.applicationName)에 답변할 질문"], shortTitle: "미답변 질문", systemImageName: "bubble.left.and.bubble.right")
    }
}
