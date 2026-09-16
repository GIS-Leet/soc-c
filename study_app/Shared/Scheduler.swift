// 회차 시각 뽑기·잠금 판단 (순수 로직, 앱과 테스트가 공유). 평일 08:10~16:00, 주말 10:00~20:00, 하루 4회, 45분 이상 간격
import Foundation

enum Scheduler {
    static let perDay = 4
    static let minGap = 45   // 분

    static func isWeekend(_ d: Date, cal: Calendar = .current) -> Bool { let w = cal.component(.weekday, from: d); return w == 1 || w == 7 }
    /// 그날의 창(분 단위, 시작 포함·끝 제외)
    static func window(for d: Date, cal: Calendar = .current) -> (start: Int, end: Int) {
        if isWeekend(d, cal: cal) { return (start: 600, end: 1200) }   // 10:00~20:00
        return (start: 490, end: 960)                                     // 08:10~16:00
    }
    /// 창 안에서 서로 minGap 이상 떨어진 시각 perDay개 (오름차순)
    static func pickTimes<G: RandomNumberGenerator>(for d: Date, using rng: inout G, cal: Calendar = .current) -> [Int] {
        let (start, end) = window(for: d, cal: cal)
        // 최소 간격을 먼저 빼고 남는 여유를 랜덤 배분 → 항상 간격 보장
        let span = end - start - (perDay - 1) * minGap
        var offsets = (0..<perDay).map { _ in Int.random(in: 0..<max(1, span), using: &rng) }.sorted()   // 끝 시각은 제외
        for i in 0..<perDay { offsets[i] += start + i * minGap }
        return offsets
    }
    /// 오늘부터 days일치 예정을 채움(이미 있는 날은 유지). 지난 날짜는 지움
    static func ensure(days: Int, now: Date = Date(), cal: Calendar = .current) {
        var slots = Store.slots, done = Store.done
        var rng = SystemRandomNumberGenerator()
        let today = Store.key(now)
        slots = slots.filter { $0.key >= today }; done = done.filter { $0.key >= today }
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: now) else { continue }
            let k = Store.key(d)
            if slots[k] == nil { slots[k] = pickTimes(for: d, using: &rng, cal: cal) }
        }
        Store.slots = slots; Store.done = done
    }
    static func minutes(_ d: Date, cal: Calendar = .current) -> Int { cal.component(.hour, from: d) * 60 + cal.component(.minute, from: d) }
    /// 지금 기준 지났는데 완료 안 한 회차 번호들(1~4)
    static func passedUndone(now: Date = Date(), cal: Calendar = .current) -> [Int] {
        let k = Store.key(now), times = Store.slots[k] ?? [], doneToday = Set(Store.done[k] ?? [])
        let m = minutes(now, cal: cal)
        return times.enumerated().compactMap { (i, t) in t <= m && !doneToday.contains(i + 1) ? i + 1 : nil }
    }
    /// 오늘 첫 완료 전이면 full(카드 읽기+시험), 이미 한 번 했으면 test(시험만)
    static func mode(now: Date = Date()) -> String { (Store.done[Store.key(now)] ?? []).isEmpty ? "full" : "test" }
    /// 세션 통과: 지난 회차 전부 완료 처리(없으면 '추가' 회차 0) + 자물쇠 해제(발성 연습이 밀려 있으면 유지)
    static func markDone(now: Date = Date(), cal: Calendar = .current) -> [Int] {
        let k = Store.key(now)
        var done = Store.done
        let passed = passedUndone(now: now, cal: cal)
        done[k] = Array(Set((done[k] ?? []) + (passed.isEmpty ? [0] : passed))).sorted()
        Store.done = done
        if !VocalRoutine.pending(now: now, cal: cal) { Store.unlock() }
        return passed
    }
    /// 예정된 미래 회차 (날짜, 회차 번호, Date)
    static func upcoming(now: Date = Date(), cal: Calendar = .current) -> [(day: String, slot: Int, date: Date)] {
        var out: [(String, Int, Date)] = []
        for (k, times) in Store.slots {
            guard let base = Store.dayFormatter.date(from: k) else { continue }
            for (i, t) in times.enumerated() {
                guard let d = cal.date(bySettingHour: t / 60, minute: t % 60, second: 0, of: base), d > now else { continue }
                out.append((k, i + 1, d))
            }
        }
        return out.sorted { $0.2 < $1.2 }
    }
}
