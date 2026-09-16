// 시간표 저장(App Group) — 앱이 받아서 쓰고 위젯이 읽는다. FamilyControls 없이도 쓸 수 있게 Store와 분리
import Foundation

enum TimetableStore {
    static let groupID = "group.nyuheatgis"
    static let testDefaults = UserDefaults(suiteName: "desk-test-"+UUID().uuidString)!
    static var defaults: UserDefaults { TestRuntime.isTesting ? testDefaults : (UserDefaults(suiteName: groupID) ?? .standard) }
    static var timetable: Timetable? {
        get { defaults.data(forKey: "timetable").flatMap { try? JSONDecoder().decode(Timetable.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "timetable") }
    }
    static var fetchedAt: Date? {
        get { defaults.object(forKey: "timetableFetchedAt") as? Date }
        set { defaults.set(newValue, forKey: "timetableFetchedAt") }
    }
    static var classAlarmOn: Bool {
        get { defaults.object(forKey: "classAlarmOn") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "classAlarmOn") }
    }
    static var unanswered: Int {
        get { defaults.integer(forKey: "unanswered") }
        set { defaults.set(newValue, forKey: "unanswered") }
    }
    static var faceIDOn: Bool {
        get { defaults.bool(forKey: "faceIDOn") }
        set { defaults.set(newValue, forKey: "faceIDOn") }
    }
    static var apiKey: String? {
        get { defaults.string(forKey: "fb-apikey") }
        set { defaults.set(newValue, forKey: "fb-apikey") }
    }
    /// 할 일 위젯 스냅샷 — 앱이 쓰고 위젯이 읽고(체크 시) 되쓴다
    static var todos: [WidgetTodo] {
        get { defaults.data(forKey: "todos").flatMap { try? JSONDecoder().decode([WidgetTodo].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "todos") }
    }
    /// 일정 위젯·알림 스냅샷(앞으로 2주) — 앱이 desk/calendar + Apple 캘린더를 합쳐 저장
    static var events: [WidgetEvent] {
        get { defaults.data(forKey: "events").flatMap { try? JSONDecoder().decode([WidgetEvent].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "events") }
    }
    static var eventAlarmOn: Bool {
        get { defaults.object(forKey: "eventAlarmOn") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "eventAlarmOn") }
    }
    /// APNs 기기 토큰(hex) — 앱이 받아 두었다가 로그인되면 desk/push/tokens 에 올림
    static var pushToken: String? {
        get { defaults.string(forKey: "pushToken") }
        set { defaults.set(newValue, forKey: "pushToken") }
    }
    static var pushTokenUploaded: String? {
        get { defaults.string(forKey: "pushTokenUploaded") }
        set { defaults.set(newValue, forKey: "pushTokenUploaded") }
    }
}
