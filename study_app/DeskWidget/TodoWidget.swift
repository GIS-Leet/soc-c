// 할 일 위젯(인터랙티브) — 위젯에서 바로 체크. 스냅샷(App Group) 먼저 바꾸고 Firebase desk/todos 에 반영, 실패하면 되돌림
import WidgetKit
import SwiftUI
import AppIntents

struct ToggleTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 체크"
    static var isDiscoverable = false
    @Parameter(title: "id") var id: String
    init() {}
    init(id: String) { self.id = id }
    func perform() async throws -> some IntentResult {
        let before = TimetableStore.todos
        guard let t = before.first(where: { $0.id == id }) else { return .result() }
        TimetableStore.todos = WidgetTodo.toggled(before, id: id)
        do { try await RTDB.patch("desk/todos/\(id)", ["done": !t.done]) }
        catch { TimetableStore.todos = before }
        return .result()
    }
}

struct TodoEntry: TimelineEntry { let date: Date; let todos: [WidgetTodo] }

struct TodoProvider: TimelineProvider {
    static let sample = [WidgetTodo(id: "a", text: "2학년 수행평가 채점", done: false, due: nil), WidgetTodo(id: "b", text: "교과협의회 자료", done: false, due: nil), WidgetTodo(id: "c", text: "상담 일지 정리", done: true, due: nil)]
    func placeholder(in context: Context) -> TodoEntry { TodoEntry(date: Date(), todos: Self.sample) }
    func getSnapshot(in context: Context, completion: @escaping (TodoEntry) -> Void) { completion(TodoEntry(date: Date(), todos: context.isPreview ? Self.sample : TimetableStore.todos)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodoEntry>) -> Void) {
        let now = Date(), midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now))!
        completion(Timeline(entries: [TodoEntry(date: now, todos: TimetableStore.todos), TodoEntry(date: midnight, todos: TimetableStore.todos)], policy: .atEnd))
    }
}

struct TodoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DeskTodo", provider: TodoProvider()) { TodoWidgetView(entry: $0) }
            .configurationDisplayName("할 일")
            .description("desk 할 일 — 위젯에서 바로 체크")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct TodoWidgetView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.widgetRenderingMode) var renderingMode
    let entry: TodoEntry
    var glass: Bool { renderingMode != .fullColor }
    var accent: Color { glass ? .primary : DeskWidgetView.accent }
    var rows: Int { family == .systemLarge ? 9 : 4 }
    var body: some View {
        let list = WidgetTodo.order(entry.todos), open = list.filter { !$0.done }
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("할 일").font(.system(size: 11, weight: .bold)).tracking(1).foregroundStyle(accent).widgetAccentable()
                Spacer()
                Text(open.isEmpty ? "모두 완료" : "\(open.count)개 남음").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
            }
            if list.isEmpty {
                Text(entry.todos.isEmpty ? "할 일이 없습니다" : "").font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary)
            }
            ForEach(list.prefix(rows)) { t in
                HStack(spacing: 8) {
                    Button(intent: ToggleTodoIntent(id: t.id)) {
                        Image(systemName: t.done ? "checkmark.circle.fill" : "circle").font(.system(size: 18))
                            .foregroundStyle(t.done ? (glass ? Color.primary : DeskWidgetView.success) : Color.secondary)
                    }.buttonStyle(.plain)
                    Text(t.text).font(.system(size: 14, weight: .medium)).strikethrough(t.done).foregroundStyle(t.done ? .secondary : .primary).lineLimit(1)
                    Spacer(minLength: 0)
                    if let d = t.due, !t.done {
                        let l = WidgetTodo.dueLabel(d, now: entry.date)
                        Text(l).font(.system(size: 11, weight: .semibold)).foregroundStyle(l == "오늘" || l.hasPrefix("지남") ? (glass ? Color.primary : DeskWidgetView.live) : Color.secondary)
                    }
                }
                .frame(height: 22)
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}
