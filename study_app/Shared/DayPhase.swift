// 하루의 국면 — 시간표와 지금 시각으로 아침·수업 중·쉬는 시간·공강·방과 후·주말을 판정한다. 오늘 화면의 무대와 위젯 문구가 같은 판정을 쓴다.
import Foundation

enum DayPhase: Equatable {
    case weekend                                        // 평일이 아님
    case noClasses                                      // 평일인데 수업이 없음
    case morning(first: Timetable.Slot)                 // 첫 수업 전
    case inClass(Timetable.Slot, left: Int, next: Timetable.Slot?)   // 수업 중 (남은 분)
    case breakTime(next: Timetable.Slot, in: Int)       // 쉬는 시간 — 다음 수업까지 짧게 남음
    case free(next: Timetable.Slot, in: Int)            // 공강 — 다음 수업까지 길게 남음
    case after(last: Timetable.Slot)                    // 오늘 수업 끝

    /// 쉬는 시간과 공강의 경계(분)
    static let breakLimit = 20

    static func of(_ t: Timetable?, now: Date, cal: Calendar = .current) -> DayPhase {
        guard Timetable.dayKey(now, cal: cal) != nil else { return .weekend }
        guard let t else { return .noClasses }
        let todays = t.slots(on: now, cal: cal).filter { $0.subject != nil }
        guard let first = todays.first, let last = todays.last else { return .noClasses }
        let m = Timetable.minutes(now, cal: cal), len = Timetable.periodLength
        if m < first.start { return .morning(first: first) }
        if let cur = todays.first(where: { m >= $0.start && m < $0.start + len }) {
            return .inClass(cur, left: cur.start + len - m, next: todays.first { $0.start > m })
        }
        if let next = todays.first(where: { $0.start > m }) {
            let gap = next.start - m
            return gap <= breakLimit ? .breakTime(next: next, in: gap) : .free(next: next, in: gap)
        }
        return .after(last: last)
    }

    var label: String {
        switch self {
        case .weekend: "주말"; case .noClasses: "수업 없는 날"; case .morning: "등교 전"; case .inClass: "수업 중"
        case .breakTime: "쉬는 시간"; case .free: "공강"; case .after: "수업 끝"
        }
    }
    /// 무대가 보여줄 수업(지금 또는 다음)
    var focusSlot: Timetable.Slot? {
        switch self {
        case .morning(let f): f; case .inClass(let s, _, _): s; case .breakTime(let n, _): n; case .free(let n, _): n; default: nil
        }
    }
    var isInClass: Bool { if case .inClass = self { return true }; return false }
}
