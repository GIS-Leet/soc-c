// 좌석표 모델 — 반별 행×열 배치(학생 id)와 날짜별 출결. 상담 키로 암호화해 desk/class/seating/{id} 에 저장
import Foundation

struct SeatChart: Identifiable, Equatable {
    let id: String; var name: String; var rows: Int; var cols: Int
    var seats: [String?]                     // rows*cols, 앞줄(교탁 쪽)부터 행 우선
    var attendance: [String: [String: String]] = [:]   // 날짜 → 학생 id → 표시
    static let marks = ["지각", "결석", "조퇴"]
    static let maxSide = 8

    init(id: String, name: String, rows: Int, cols: Int, seats: [String?]? = nil, attendance: [String: [String: String]] = [:]) {
        self.id = id; self.name = name; self.rows = min(max(rows, 1), Self.maxSide); self.cols = min(max(cols, 1), Self.maxSide)
        let n = self.rows * self.cols
        var s = seats ?? []; if s.count < n { s += Array(repeating: nil, count: n - s.count) }; self.seats = Array(s.prefix(n))
        self.attendance = attendance
    }
    static func from(_ id: String, _ any: Any) -> SeatChart? {
        guard let d = any as? [String: Any], let name = d["name"] as? String, let r = d["rows"] as? Int, let c = d["cols"] as? Int else { return nil }
        let seats = ((d["seats"] as? [Any]) ?? []).map { $0 as? String }
        var att: [String: [String: String]] = [:]
        for (date, v) in (d["attendance"] as? [String: Any]) ?? [:] { if let m = v as? [String: String], !m.isEmpty { att[date] = m } }
        return SeatChart(id: id, name: name, rows: r, cols: c, seats: seats, attendance: att)
    }
    var plain: [String: Any] {
        var d: [String: Any] = ["name": name, "rows": rows, "cols": cols, "seats": seats.map { $0.map { $0 as Any } ?? NSNull() }]
        let att = attendance.filter { !$0.value.isEmpty }; if !att.isEmpty { d["attendance"] = att }
        return d
    }
    func index(_ r: Int, _ c: Int) -> Int { r * cols + c }
    var seated: Set<String> { Set(seats.compactMap { $0 }) }
    /// 출석 탭 순환: — → 지각 → 결석 → 조퇴 → —
    static func nextMark(_ m: String?) -> String? {
        guard let m, let i = marks.firstIndex(of: m) else { return marks.first }
        return i + 1 < marks.count ? marks[i + 1] : nil
    }
    mutating func cycle(_ sid: String, on date: String) {
        var day = attendance[date] ?? [:]
        if let n = Self.nextMark(day[sid]) { day[sid] = n } else { day.removeValue(forKey: sid) }
        attendance[date] = day
    }
    func mark(_ sid: String, on date: String) -> String? { attendance[date]?[sid] }
    /// 그날 표시별 인원
    func counts(on date: String) -> [String: Int] { (attendance[date] ?? [:]).values.reduce(into: [:]) { $0[$1, default: 0] += 1 } }
    /// 학생 한 명의 누적 출결 (여러 좌석표 합산)
    static func summary(_ charts: [SeatChart], student sid: String) -> [String: Int] {
        charts.reduce(into: [:]) { acc, ch in for (_, day) in ch.attendance { if let m = day[sid] { acc[m, default: 0] += 1 } } }
    }
    static func summaryText(_ s: [String: Int]) -> String { marks.compactMap { m in (s[m] ?? 0) > 0 ? "\(m) \(s[m]!)" : nil }.joined(separator: " · ") }
}
