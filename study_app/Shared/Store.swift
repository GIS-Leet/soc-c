// 앱·확장이 공유하는 상태(App Group): 잠글 앱 선택, 회차 예정 시각, 완료 상태, 자물쇠 켜기/끄기
import Foundation
import UIKit
#if !targetEnvironment(macCatalyst)
import FamilyControls
import ManagedSettings
#endif

enum Store {
    static let groupID = "group.nyuheatgis"
    static var defaults: UserDefaults { UserDefaults(suiteName: groupID) ?? .standard }

    // ── 잠글 앱 (Mac 에는 Screen Time 이 없어 잠금 자체가 없음) ──
    #if !targetEnvironment(macCatalyst)
    static var selection: FamilyActivitySelection {
        get { (defaults.data(forKey: "selection")).flatMap { try? JSONDecoder().decode(FamilyActivitySelection.self, from: $0) } ?? FamilyActivitySelection() }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "selection") }
    }
    /// 랜덤 회차 잠금 사용 여부 — iPad(수업용)는 기본 끔, iPhone은 켬
    static var randomLockOn: Bool {
        get { defaults.object(forKey: "randomLockOn") as? Bool ?? (UIDevice.current.userInterfaceIdiom != .pad) }
        set { defaults.set(newValue, forKey: "randomLockOn") }
    }
    static var hasSelection: Bool { let s = selection; return !s.applicationTokens.isEmpty || !s.categoryTokens.isEmpty || !s.webDomainTokens.isEmpty }
    #else
    static var randomLockOn: Bool { get { false } set {} }
    static var hasSelection: Bool { false }
    #endif

    // ── 회차 시각: 날짜(yyyy-MM-dd) → 분 단위 시각 4개 (오름차순) ──
    static var slots: [String: [Int]] {
        get { defaults.dictionary(forKey: "slots") as? [String: [Int]] ?? [:] }
        set { defaults.set(newValue, forKey: "slots") }
    }
    // ── 완료: 날짜 → 완료한 회차 번호(1~4) ──
    static var done: [String: [Int]] {
        get { defaults.dictionary(forKey: "done") as? [String: [Int]] ?? [:] }
        set { defaults.set(newValue, forKey: "done") }
    }
    static var lockedSince: Date? {
        get { defaults.object(forKey: "lockedSince") as? Date }
        set { defaults.set(newValue, forKey: "lockedSince") }
    }

    // ── 자물쇠 ──
    #if targetEnvironment(macCatalyst)
    static func lock() {}
    static func unlock() { lockedSince = nil }
    #else
    static let managed = ManagedSettingsStore()
    static func lock() {
        let s = selection
        managed.shield.applications = s.applicationTokens.isEmpty ? nil : s.applicationTokens
        managed.shield.applicationCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
        managed.shield.webDomains = s.webDomainTokens.isEmpty ? nil : s.webDomainTokens
        if lockedSince == nil { lockedSince = Date() }
    }
    static func unlock() {
        managed.clearAllSettings()
        lockedSince = nil
    }
    #endif
    static var isLocked: Bool { lockedSince != nil }

    // ── 날짜 키 ──
    static let dayFormatter: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yyyy-MM-dd"; return f }()
    static func key(_ d: Date) -> String { dayFormatter.string(from: d) }
}
