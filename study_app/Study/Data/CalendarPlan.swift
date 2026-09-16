import Foundation

/// 동기화 계획(순수 함수) — desk 일정과 Desk 캘린더 이벤트를 비교해 할 일을 정한다
enum CalendarPlan {
    struct DeskItem: Codable, Equatable { let date: String; let id: String; let text: String; var key: String { "\(date)/\(id)" } }
    struct EKItem: Equatable { let ekID: String; let tag: String?; let title: String; let date: String; let minutes: Int?; let modified: Date; var deskText: String { CalendarPlan.text(title: title, minutes: minutes) } }
    struct Plan: Equatable {
        var createEK: [DeskItem] = []; var updateEK: [(EKItem, DeskItem)] = []; var deleteEK: [EKItem] = []
        var createDesk: [EKItem] = []; var updateDesk: [(DeskItem, EKItem)] = []; var deleteDesk: [DeskItem] = []
        static func == (a: Plan, b: Plan) -> Bool { a.createEK == b.createEK && a.deleteEK == b.deleteEK && a.createDesk == b.createDesk && a.deleteDesk == b.deleteDesk && a.updateEK.map { $0.0.ekID } == b.updateEK.map { $0.0.ekID } && a.updateDesk.map { $0.0.key } == b.updateDesk.map { $0.0.key } }
    }
    /// desk 텍스트 → 제목(앞의 시각 표기 제거)
    static func title(of text: String) -> String {
        var t = text.trimmingCharacters(in: .whitespaces)
        for pat in [#"^\d{1,2}:\d{2}\s*"#, #"^(오전|오후)\s?\d{1,2}시(\s?\d{1,2}분)?\s*"#] { if let r = t.range(of: pat, options: .regularExpression) { t.removeSubrange(r); break } }
        return t.isEmpty ? text : t
    }
    /// 제목 + 시각 → desk 텍스트("16:30 회의")
    static func text(title: String, minutes: Int?) -> String { minutes.map { String(format: "%02d:%02d ", $0 / 60, $0 % 60) + title } ?? title }

    static func signature(_ event: EKItem) -> String { event.date + "\n" + event.deskText }
    static func rewritesEvent(_ kind: String) -> Bool { kind == "createEK" || kind == "updateEK" }

    /// mirrored: 지금까지 Desk 캘린더에 만들어 둔 desk 키. lastSync: 마지막 동기화 시각(그 뒤 Apple에서 고친 것은 Apple이 우선)
    static func plan(desk: [DeskItem], ek: [EKItem], mirrored: Set<String>, lastSync: Date, window: ClosedRange<String>? = nil, complete: Bool = true, verifiedAbsent: Set<String> = [], ownWrites: [String: String] = [:]) -> Plan {
        guard complete else { return Plan() }
        let desk = desk.filter { window?.contains($0.date) ?? true }
        var p = Plan()
        let deskByKey = Dictionary(uniqueKeysWithValues: desk.map { ($0.key, $0) })
        let ekByTag = Dictionary(ek.compactMap { e in e.tag.map { ($0, e) } }, uniquingKeysWith: { a, _ in a })
        for e in ek {
            guard let tag = e.tag else { if window?.contains(e.date) ?? true { p.createDesk.append(e) }; continue }          // Apple에서 직접 만든 이벤트 → desk로
            if let d = deskByKey[tag] {
                if d.text == e.deskText && d.date == e.date { continue }
                if e.modified > lastSync && ownWrites[e.ekID] != signature(e) { p.updateDesk.append((d, e)) } else { p.updateEK.append((e, d)) }
            } else if window?.contains(String(tag.prefix(10))) ?? true { p.deleteEK.append(e) }                                          // desk에서 지워짐
        }
        for d in desk where ekByTag[d.key] == nil {
            if mirrored.contains(d.key) { if verifiedAbsent.contains(d.key) { p.deleteDesk.append(d) } } else { p.createEK.append(d) }   // 예전에 미러링했는데 없으면 Apple에서 지운 것
        }
        return p
    }
}

