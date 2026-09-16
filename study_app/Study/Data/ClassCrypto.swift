// 상담 기록 암호화 — PC(WebCrypto)와 바이트 단위 호환: PBKDF2-HMAC-SHA256 150,000회 → AES-GCM(iv 12B, ct+tag)
import Foundation
import CryptoKit
import CommonCrypto

enum ClassCrypto {
    static let checkText = "geographia-desk-v1"
    static let iterations: UInt32 = 150_000
    struct Blob: Equatable { let iv: String; let ct: String }   // base64
    struct BadPass: LocalizedError { var errorDescription: String? { "암호구절이 맞지 않습니다." } }

    static func key(pass: String, saltB64: String) -> SymmetricKey? {
        guard let salt = Data(base64Encoded: saltB64) else { return nil }
        var out = [UInt8](repeating: 0, count: 32)
        let pw = Array(pass.utf8)
        let ok = salt.withUnsafeBytes { s -> Int32 in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), pw.map { CChar(bitPattern: $0) }, pw.count, s.baseAddress?.assumingMemoryBound(to: UInt8.self), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), iterations, &out, out.count)
        }
        return ok == kCCSuccess ? SymmetricKey(data: Data(out)) : nil
    }
    /// JSON 값(문자열·사전 등)을 PC와 같은 JSON.stringify 형태로 암호화
    static func encrypt(_ value: Any, key: SymmetricKey) throws -> Blob {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .withoutEscapingSlashes])
        let nonce = AES.GCM.Nonce()
        let box = try AES.GCM.seal(data, using: key, nonce: nonce)
        return Blob(iv: Data(nonce).base64EncodedString(), ct: (box.ciphertext + box.tag).base64EncodedString())
    }
    static func decrypt(_ blob: Blob, key: SymmetricKey) throws -> Any {
        guard let iv = Data(base64Encoded: blob.iv), let ct = Data(base64Encoded: blob.ct), ct.count > 16 else { throw BadPass() }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ct.dropLast(16), tag: ct.suffix(16))
        let pt: Data
        do { pt = try AES.GCM.open(box, using: key) } catch { throw BadPass() }
        return try JSONSerialization.jsonObject(with: pt, options: [.fragmentsAllowed])
    }
    static func blob(_ any: Any?) -> Blob? { guard let d = any as? [String: Any], let iv = d["iv"] as? String, let ct = d["ct"] as? String else { return nil }; return Blob(iv: iv, ct: ct) }
}

struct StudentLog: Identifiable, Equatable { var id: Int; var date: String; var text: String; var tag: String; var photos: [String] = []; var recordID: String = UUID().uuidString }
struct Student: Identifiable, Equatable {
    let id: String; var num: String; var name: String; var note: String; var logs: [StudentLog]
    static func from(_ id: String, _ any: Any) -> Student? {
        guard let d = any as? [String: Any] else { return nil }
        let logs = ((d["logs"] as? [Any]) ?? []).enumerated().compactMap { i, l -> StudentLog? in
            guard let m = l as? [String: Any] else { return nil }
            let fingerprint = (try? JSONSerialization.data(withJSONObject: m, options: [.sortedKeys])) ?? Data()
            let stable = m["recordID"] as? String ?? "legacy-" + SHA256.hash(data: Data("\(id)/\(i)/".utf8) + fingerprint).map { String(format: "%02x", $0) }.joined()
            return StudentLog(id: i, date: m["date"] as? String ?? "", text: m["text"] as? String ?? "", tag: m["tag"] as? String ?? "", photos: (m["photos"] as? [String]) ?? [], recordID: stable)
        }
        return Student(id: id, num: d["num"] as? String ?? "", name: d["name"] as? String ?? "", note: d["note"] as? String ?? "", logs: logs)
    }
    var plain: [String: Any] { ["num": num, "name": name, "note": note, "logs": logs.map { l -> [String: Any] in var d: [String: Any] = ["date": l.date, "text": l.text, "tag": l.tag, "recordID": l.recordID]; if !l.photos.isEmpty { d["photos"] = l.photos }; return d }] }
}
