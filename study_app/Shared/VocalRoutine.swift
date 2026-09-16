// 발성 연습 루틴 — 매일 21:00 iPhone 에서 단계 타이머(약 12분). 단계 목록, 오늘 했나·밀렸나 판단, 리마인드 시각(순수 로직, 앱·확장·테스트 공유)
import Foundation
import UIKit

enum VocalRoutine {
    struct Step: Equatable, Identifiable { let title: String; let guide: String; let seconds: Int; var id: String { title } }
    static let steps: [Step] = [
        Step(title: "몸 풀기", guide: "어깨를 크게 돌리고 목을 좌우로 천천히. 하품하듯 입을 열고 「하아」 한숨을 세 번.", seconds: 60),
        Step(title: "호흡", guide: "배에 손을 얹고 4초 들이쉬기 → 4초 멈추기 → 「스ㅡ」 소리로 8초 내쉬기. 어깨는 올라가지 않게.", seconds: 120),
        Step(title: "립트릴", guide: "입술을 가볍게 떨며 「브르르」. 편한 음에서 위로, 다시 아래로 미끄러지기. 끊기면 숨을 더 깊게.", seconds: 120),
        Step(title: "허밍", guide: "입을 다물고 「음ㅡ」. 코와 입술에 울림이 느껴지면 5음(도레미파솔)을 오르내리기.", seconds: 120),
        Step(title: "공명", guide: "「응ㅡ아」 로 울림을 코 뒤에서 앞으로 옮기기. 이어서 「니-네-나」 를 같은 자리에서.", seconds: 120),
        Step(title: "낭독", guide: "내일 수업 첫 문장을 또박또박. 어미까지 끝맺고, 교실 뒷자리에 닿는 크기로.", seconds: 120),
        Step(title: "마무리", guide: "낮은 음으로 편하게 허밍. 하품하듯 한숨 세 번으로 목을 풀고 끝.", seconds: 60),
    ]
    static var totalMinutes: Int { steps.map(\.seconds).reduce(0, +) / 60 }
    static let dueMinute = 21 * 60          // 21:00
    static let remindEvery = 30, lastRemind = 23 * 60 + 30
    static let lockMinutes = 20             // DeviceActivity 창(시작 시점에만 잠금)

    static func minutes(_ d: Date, cal: Calendar = .current) -> Int { cal.component(.hour, from: d) * 60 + cal.component(.minute, from: d) }
    static func isDone(_ now: Date, done: [String] = Store.vocalDone) -> Bool { done.contains(Store.key(now)) }
    /// 21:00 이 지났는데 오늘 안 했나 (잠금·채근 기준)
    static func pending(now: Date, on: Bool = Store.vocalOn, done: [String] = Store.vocalDone, cal: Calendar = .current) -> Bool {
        on && minutes(now, cal: cal) >= dueMinute && !isDone(now, done: done)
    }
    /// 오늘 완료 표시 + 지난 날짜 정리. 밀린 공부가 없으면 자물쇠 해제
    static func markDone(now: Date = Date(), cal: Calendar = .current) {
        let k = Store.key(now)
        Store.vocalDone = Array(Set(Store.vocalDone.filter { $0 >= Store.key(cal.date(byAdding: .day, value: -7, to: now) ?? now) } + [k])).sorted()
        if Scheduler.passedUndone(now: now, cal: cal).isEmpty { Store.unlock() }
    }
    /// 리마인드 시각 — 오늘부터 days 일, 21:00 부터 30분마다 23:30 까지. 오늘 이미 했거나 지난 시각은 제외
    static func reminders(now: Date, days: Int, on: Bool = Store.vocalOn, done: [String] = Store.vocalDone, cal: Calendar = .current) -> [(day: String, n: Int, date: Date)] {
        guard on else { return [] }
        var out: [(String, Int, Date)] = []
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: now) else { continue }
            let k = Store.key(d); if done.contains(k) { continue }
            for (n, m) in stride(from: dueMinute, through: lastRemind, by: remindEvery).enumerated() {
                guard let at = cal.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: d), at > now else { continue }
                out.append((k, n, at))
            }
        }
        return out
    }
    /// 잠금 시각(21:00) — 오늘부터 days 일, 오늘 한 날·지난 시각 제외
    static func lockDates(now: Date, days: Int, on: Bool = Store.vocalOn, done: [String] = Store.vocalDone, cal: Calendar = .current) -> [(day: String, date: Date)] {
        reminders(now: now, days: days, on: on, done: done, cal: cal).filter { $0.n == 0 }.map { ($0.day, $0.date) }
    }
}

extension Store {
    /// 발성 연습 완료한 날짜들
    static var vocalDone: [String] {
        get { defaults.stringArray(forKey: "vocalDone") ?? [] }
        set { defaults.set(newValue, forKey: "vocalDone") }
    }
    /// 발성 루틴 사용 — iPhone 만 기본 켬(Mac·iPad 없음)
    static var vocalOn: Bool {
        get {
            #if targetEnvironment(macCatalyst)
            return false
            #else
            return defaults.object(forKey: "vocalOn") as? Bool ?? (UIDevice.current.userInterfaceIdiom == .phone)
            #endif
        }
        set { defaults.set(newValue, forKey: "vocalOn") }
    }
}
