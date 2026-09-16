// 백업은 파일별 SHA-256과 상대 경로를 검증한 뒤 임시 저장소에서 교체한다.
import Foundation
import CryptoKit

struct BackupArchive: Codable {
    struct Entry: Codable { let path: String; let size: Int; let sha256: String; let data: Data }
    var schemaVersion=2
    var app="Desk"
    var createdAt=Date().timeIntervalSince1970
    var excluded=["인증 토큰과 비밀번호", "원격에만 있는 자료", "Apple 캘린더 원본"]
    var includedRoots=["snapshots","ink","uploads","materials","drafts","class-drafts"]
    var entries: [Entry]
    static let roots:Set<String>=["snapshots","ink","uploads","materials","drafts","class-drafts","state"]
    static func hash(_ data: Data) -> String { SHA256.hash(data:data).map { String(format:"%02x",$0) }.joined() }
    static func entry(_ path: String,_ data: Data) -> Entry { Entry(path:path,size:data.count,sha256:hash(data),data:data) }
    struct Invalid: LocalizedError { let message: String;var errorDescription: String? { message } }
    func validated() throws -> [String:Data] {
        guard schemaVersion==2,app=="Desk" else { throw Invalid(message:"지원하지 않는 백업 형식입니다. 원본은 변경하지 않았습니다.") }
        guard Set(includedRoots).isSubset(of:Self.roots.subtracting(["state"])) else { throw Invalid(message:"잘못된 백업 포함 범위입니다.") }
        var files:[String:Data]=[:]
        for entry in entries {
            let parts=entry.path.split(separator:"/",omittingEmptySubsequences:false).map(String.init)
            guard parts.count>=2,Self.roots.contains(parts[0]),parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\\") }),files[entry.path]==nil,entry.data.count==entry.size,Self.hash(entry.data)==entry.sha256 else { throw Invalid(message:"백업 경로·중복 파일 또는 체크섬이 올바르지 않습니다.") }
            files[entry.path]=entry.data
        }
        guard files["state/queue.json"] != nil,files["state/settings.json"] != nil else { throw Invalid(message:"필수 백업 manifest가 없습니다.") }
        return files
    }
    func stage(in directory: URL) throws -> [String:Data] {
        let files=try validated()
        for root in includedRoots { try FileManager.default.createDirectory(at:directory.appendingPathComponent(root),withIntermediateDirectories:true) }
        for (path,data) in files {
            let url=directory.appendingPathComponent(path)
            try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
            try data.write(to:url,options:.atomic)
        }
        return files
    }
}
