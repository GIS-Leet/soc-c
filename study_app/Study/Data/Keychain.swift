// Keychain 간단 래퍼 — Firebase 갱신 토큰 보관
import Foundation
import Security
import LocalAuthentication

enum Keychain {
    static let service = "nyuheatgis"
    static let group = "group.nyuheatgis"   // 일반 항목은 App Group 접근 그룹 → 위젯·공유 확장과 공유 (생체 항목은 앱 전용)
    private static func base(_ key: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecAttrAccessGroup as String: group] }
    /// 생체 인증(Face ID)이 있어야만 읽히는 항목 — 상담 암호구절 기억용
    static func setBiometric(_ value: String, for key: String) -> Bool {
        if TestRuntime.isTesting { return false }
        delete(key)
        guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .biometryCurrentSet, nil) else { return false }
        let a: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecValueData as String: Data(value.utf8), kSecAttrAccessControl as String: ac]
        return SecItemAdd(a as CFDictionary, nil) == errSecSuccess
    }
    static func getBiometric(_ key: String, reason: String) -> String? {
        if TestRuntime.isTesting { return nil }
        let ctx = LAContext(); ctx.localizedReason = reason
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne, kSecUseAuthenticationContext as String: ctx]
        q[kSecUseOperationPrompt as String] = reason
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func exists(_ key: String) -> Bool {
        if TestRuntime.isTesting { return false }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail]
        let st = SecItemCopyMatching(q as CFDictionary, nil); return st == errSecSuccess || st == errSecInteractionNotAllowed
    }
    static func set(_ value: String, for key: String) {
        if TestRuntime.isTesting { return }
        let q = base(key)
        SecItemDelete(q as CFDictionary)
        var a = q; a[kSecValueData as String] = Data(value.utf8); a[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly   // 백업으로 다른 기기에 옮겨지지 않음
        SecItemAdd(a as CFDictionary, nil)
    }
    static func get(_ key: String) -> String? {
        if TestRuntime.isTesting { return nil }
        var q = base(key)
        q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func delete(_ key: String) {
        if TestRuntime.isTesting { return }
        SecItemDelete(base(key) as CFDictionary)
    }
}
