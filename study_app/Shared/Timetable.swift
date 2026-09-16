// 시간표: Firebase desk/timetable(JSON) 정규화, 교시 시각 상수, 오늘 항목·다음 수업·알림 대상 계산 (앱·위젯·테스트 공유)
import Foundation

/// 교시 시각표 — 학교마다 다르므로 설정에서 바꿀 수 있게. App Group 에 저장해 앱·위젯·확장이 같은 값을 씀(desk/periods 에도 올려 Mac 알림 도구가 읽음)
struct PeriodSchedule: Codable, Equatable {
    var starts: [Int: Int]   // 교시 → 시작 분
    var length: Int          // 수업 길이(분)
    static let standard = PeriodSchedule(starts: [1: 8*60+20, 2: 9*60+20, 3: 10*60+20, 4: 11*60+20, 5: 13*60+10, 6: 14*60+10, 7: 15*60+10], length: 50)
    private static let key = "periods"
    private static var cached: PeriodSchedule? = nil
    static var current: PeriodSchedule {
        get { if let c = cached { return c }; let v = TimetableStore.defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(PeriodSchedule.self, from: $0) } ?? standard; cached = v; return v }
        set { cached = newValue; TimetableStore.defaults.set(try? JSONEncoder().encode(newValue), forKey: key) }
    }
    /// Firebase desk/periods {"starts": {"1": 500, …}, "length": 50}
    static func parse(_ any: Any?) -> PeriodSchedule? {
        guard let d = any as? [String: Any], let st = d["starts"] as? [String: Any] else { return nil }
        var starts: [Int: Int] = [:]
        for (k, v) in st { if let p = Int(k), let m = (v as? Int) ?? (v as? NSNumber)?.intValue { starts[p] = m } }
        guard starts.count >= 1 else { return nil }
        return PeriodSchedule(starts: starts, length: (d["length"] as? Int) ?? 50)
    }
    var plain: [String: Any] { ["starts": Dictionary(uniqueKeysWithValues: starts.map { (String($0.key), $0.value) }), "length": length] }
}

struct Timetable: Codable, Equatable {
    static var periodStart: [Int: Int] { PeriodSchedule.current.starts }
    static var periodLength: Int { PeriodSchedule.current.length }
    static let dayKeys = ["mon", "tue", "wed", "thu", "fri"]
    var days: [String: [Int: String]]   // "mon" → [1: "106 통사2C"]

    /// Firebase는 숫자 키를 배열([null, "a", …])로 주기도 하고 사전({"2": "a"})으로 주기도 함
    static func parse(_ json: Any?) -> Timetable {
        var out: [String: [Int: String]] = [:]
        guard let root = json as? [String: Any] else { return Timetable(days: [:]) }
        for key in dayKeys {
            var m: [Int: String] = [:]
            if let arr = root[key] as? [Any?] { for (i, v) in arr.enumerated() { if let s = v as? String, !s.isEmpty { m[i] = s } } }
            else if let dict = root[key] as? [String: Any] { for (k, v) in dict { if let p = Int(k), let s = v as? String, !s.isEmpty { m[p] = s } } }
            out[key] = m
        }
        return Timetable(days: out)
    }
    static func hhmm(_ period: Int) -> String { let m = periodStart[period] ?? 0; return "\(m / 60):" + String(format: "%02d", m % 60) }
    static func minutes(_ d: Date, cal: Calendar = .current) -> Int { cal.component(.hour, from: d) * 60 + cal.component(.minute, from: d) }
    /// Calendar weekday(1=일…7=토) → 요일 키. 주말은 nil
    static func dayKey(_ d: Date, cal: Calendar = .current) -> String? { let w = cal.component(.weekday, from: d); return (2...6).contains(w) ? dayKeys[w - 2] : nil }

    func subjects(on d: Date, cal: Calendar = .current) -> [Int: String] { Self.dayKey(d, cal: cal).flatMap { days[$0] } ?? [:] }
    struct Slot: Equatable { let period: Int; let start: Int; let subject: String? }
    /// 그날 1~7교시 전체(빈 교시는 subject nil)
    func slots(on d: Date, cal: Calendar = .current) -> [Slot] {
        let s = subjects(on: d, cal: cal)
        return (1...7).map { Slot(period: $0, start: Self.periodStart[$0]!, subject: s[$0]) }
    }
    /// 지금 진행 중인 수업
    func current(at now: Date, cal: Calendar = .current) -> Slot? {
        let m = Self.minutes(now, cal: cal)
        return slots(on: now, cal: cal).first { $0.subject != nil && m >= $0.start && m < $0.start + Self.periodLength }
    }
    /// 다음 수업(아직 시작 안 한 것 중 첫 수업)
    func next(at now: Date, cal: Calendar = .current) -> Slot? {
        let m = Self.minutes(now, cal: cal)
        return slots(on: now, cal: cal).first { $0.subject != nil && $0.start > m }
    }
    /// 화면이 보여줄 날 — 오늘 수업이 다 끝났으면(마지막 수업 종료 후, 수업 없는 평일은 16:00 이후, 주말) 다음 평일로 넘김
    struct Focus: Equatable { let date: Date; let shifted: Bool }
    func focus(at now: Date, cal: Calendar = .current) -> Focus {
        if Self.dayKey(now, cal: cal) != nil {
            let todays = slots(on: now, cal: cal).filter { $0.subject != nil }
            let end = todays.last.map { $0.start + Self.periodLength } ?? 16 * 60
            if Self.minutes(now, cal: cal) < end { return Focus(date: now, shifted: false) }
        }
        var d = cal.startOfDay(for: now)
        repeat { d = cal.date(byAdding: .day, value: 1, to: d)! } while Self.dayKey(d, cal: cal) == nil
        return Focus(date: d, shifted: true)
    }
    /// 「내일」/「월요일」 같은 표기
    static func focusLabel(_ f: Focus, now: Date, cal: Calendar = .current) -> String {
        let fmt = DateFormatter(); fmt.locale = Locale(identifier: "ko_KR"); fmt.dateFormat = "EEEE"
        let day = fmt.string(from: f.date)
        return cal.isDate(f.date, inSameDayAs: cal.date(byAdding: .day, value: 1, to: now)!) ? "내일 (\(day.prefix(1)))" : day
    }
    struct Alarm: Equatable { let date: Date; let period: Int; let subject: String }
    /// 앞으로 days일 동안(오늘 포함) 수업 시작 lead분 전 알림 대상. 이미 지난 것은 제외
    func alarms(from now: Date, days: Int, lead: Int = 2, cal: Calendar = .current) -> [Alarm] {
        var out: [Alarm] = []
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: now) else { continue }
            for s in slots(on: d, cal: cal) {
                guard let subj = s.subject, let fire = cal.date(bySettingHour: (s.start - lead) / 60, minute: (s.start - lead) % 60, second: 0, of: d), fire > now else { continue }
                out.append(Alarm(date: fire, period: s.period, subject: subj))
            }
        }
        return out.sorted { $0.date < $1.date }
    }
}
