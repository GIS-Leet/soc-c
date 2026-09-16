import Foundation
import CryptoKit
import Security

enum ClassEditError: LocalizedError {
    case conflict, deleted, malformed, setupUnavailable
    var errorDescription: String? {
        switch self {
        case .conflict: return "다른 기기에서 메모를 변경했습니다. 입력을 보관했으니 최신 내용을 확인해 주세요."
        case .deleted: return "삭제된 학생은 수정할 수 없습니다. 입력은 이 기기에 남아 있습니다."
        case .malformed: return "상담 데이터 형식을 읽을 수 없습니다. 원본을 변경하지 않았습니다."
        case .setupUnavailable: return "기존 암호 설정을 확인하지 못했습니다. 연결을 확인해 다시 시도해 주세요."
        }
    }
}
enum StudentEdit {
    case setNote(String, baseline: String), appendLog(StudentLog), deleteLog(String)
    func applying(to source: [String: Any], studentID: String) throws -> [String: Any] {
        var result = source
        guard let student = Student.from(studentID, source) else { throw ClassEditError.malformed }
        guard source["logs"] == nil || source["logs"] is [[String: Any]] else { throw ClassEditError.malformed }
        var logs = source["logs"] as? [[String: Any]] ?? []
        for index in logs.indices { logs[index]["recordID"] = student.logs[index].recordID }
        switch self {
        case .setNote(let note, let baseline):
            guard student.note == baseline || student.note == note else { throw ClassEditError.conflict }
            result["note"] = note
        case .appendLog(let log):
            if !student.logs.contains(where: { $0.recordID == log.recordID }) {
                logs.append(["recordID": log.recordID, "date": log.date, "text": log.text, "tag": log.tag, "photos": log.photos])
            }
        case .deleteLog(let id): logs.removeAll { $0["recordID"] as? String == id }
        }
        result["logs"] = logs; return result
    }
}
struct ClassPersistence {
    var get: (String) async throws -> RTDB.VersionedValue = RTDB.getWithETag
    var put: (String, Any, String) async throws -> Bool = { try await RTDB.putIfMatch($0, $1, etag: $2) }
    func setup(_ pass: String) async throws -> (salt: String, check: ClassCrypto.Blob, key: SymmetricKey) {
        let current = try await get("desk/class/meta")
        guard current.value == nil else { throw ClassEditError.setupUnavailable }
        var bytes = [UInt8](repeating: 0, count: 16)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw CocoaError(.coderInvalidValue) }
        let salt = Data(bytes).base64EncodedString()
        guard let key = ClassCrypto.key(pass: pass, saltB64: salt) else { throw ClassCrypto.BadPass() }
        let check = try ClassCrypto.encrypt(ClassCrypto.checkText, key: key)
        guard try await put("desk/class/meta", ["salt": salt, "check": ["iv": check.iv, "ct": check.ct]], current.etag) else { throw ClassEditError.setupUnavailable }
        return (salt, check, key)
    }
    func edit(_ id: String, _ edit: StudentEdit, key: SymmetricKey) async throws -> ClassCrypto.Blob {
        let path = "desk/class/students/" + id
        for _ in 0..<8 {
            let current = try await get(path)
            guard current.value != nil else { throw ClassEditError.deleted }
            guard var wrapper = current.value as? [String: Any], let blob = ClassCrypto.blob(wrapper["enc"]),
                  let plain = try ClassCrypto.decrypt(blob, key: key) as? [String: Any] else { throw ClassEditError.malformed }
            let next = try ClassCrypto.encrypt(edit.applying(to: plain, studentID: id), key: key)
            wrapper["enc"] = ["iv": next.iv, "ct": next.ct]
            if try await put(path, wrapper, current.etag) { return next }
        }
        throw ClassEditError.conflict
    }
}

/// 메모 초안도 상담 키로 암호화하여 서버 실패·화면 종료 뒤 입력을 보존한다.
enum ClassDrafts {
    static func url(_ id: String) -> URL {
        let root = TestRuntime.storage("class-drafts") { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("class-drafts") }
        return root.appendingPathComponent(id + ".json")
    }
    static func save(_ id: String, note: String, baseline: String, key: SymmetricKey) throws {
        let blob = try ClassCrypto.encrypt(["note": note, "baseline": baseline], key: key), target = url(id)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: ["iv": blob.iv, "ct": blob.ct]).write(to: target, options: .atomic)
    }
    static func read(_ id: String, key: SymmetricKey) -> (note: String, baseline: String)? {
        guard let data = try? Data(contentsOf: url(id)), let json = try? JSONSerialization.jsonObject(with: data), let blob = ClassCrypto.blob(json), let value = try? ClassCrypto.decrypt(blob, key: key) as? [String: String], let note = value["note"], let baseline = value["baseline"] else { return nil }
        return (note, baseline)
    }
    static func confirmSaved(_ id: String, note: String, baseline: String, key: SymmetricKey) throws {
        guard let draft = read(id, key: key) else { return }
        if draft.note == note { try FileManager.default.removeItem(at: url(id)) }
        else if draft.baseline == baseline { try save(id, note: draft.note, baseline: note, key: key) }
    }
    static func clear(_ id: String, matching note: String, key: SymmetricKey) {
        if read(id, key: key)?.note == note { try? FileManager.default.removeItem(at: url(id)) }
    }
}
