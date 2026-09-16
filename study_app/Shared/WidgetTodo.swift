// 할 일 위젯용 스냅샷 모델 — 앱이 App Group에 저장, 위젯이 표시·체크 (앱·위젯·테스트 공유)
import Foundation

struct WidgetTodo: Codable, Equatable, Identifiable {
    let id: String; var text: String; var done: Bool; var due: String?

    /// 위젯 표시 순서: 미완료 먼저 → 마감 빠른 순 → 마감 있는 것 먼저
    static func order(_ list: [WidgetTodo]) -> [WidgetTodo] {
        list.enumerated().sorted { a, b in
            if a.element.done != b.element.done { return !a.element.done }
            if let x = a.element.due, let y = b.element.due, x != y { return x < y }
            if (a.element.due == nil) != (b.element.due == nil) { return a.element.due != nil }
            return a.offset < b.offset
        }.map(\.element)
    }
    /// 마감 라벨: 오늘·내일·지남 N일·M/D
    static func dueLabel(_ due: String, now: Date = Date(), cal: Calendar = .current) -> String {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: due) else { return due }
        let n = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day ?? 0
        if n == 0 { return "오늘" }; if n == 1 { return "내일" }; if n < 0 { return "지남 \(-n)일" }
        let p = due.split(separator: "-"); return p.count == 3 ? "\(Int(p[1]) ?? 0)/\(Int(p[2]) ?? 0)" : due
    }
    /// 체크 토글(스냅샷 즉시 반영). 되돌릴 때도 같은 함수
    static func toggled(_ list: [WidgetTodo], id: String) -> [WidgetTodo] { list.map { var t = $0; if t.id == id { t.done.toggle() }; return t } }
}
