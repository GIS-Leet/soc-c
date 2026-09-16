// 강의 영상 공용 코드 — YouTube ID 추출, 명단 해시(홈페이지 lecture.html 과 같은 규칙), 명단 텍스트 파싱. 앱·공유 확장·테스트가 함께 컴파일
import Foundation
import CryptoKit

enum YouTubeID {
    private static let idRe = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{11}$")
    private static let urlRe = try! NSRegularExpression(pattern: "https?://[^\\s<>\"']+")
    private static func isID(_ s: String) -> Bool { idRe.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }
    /// URL·공유 텍스트·ID 자체에서 11자 영상 ID 를 꺼낸다. YouTube 가 아니면 nil
    static func parse(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if isID(t) { return t }
        guard let m = urlRe.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)), let r = Range(m.range, in: t),
              let u = URL(string: String(t[r])), let host = u.host?.lowercased() else { return nil }
        guard host == "youtu.be" || host.hasSuffix("youtube.com") || host.hasSuffix("youtube-nocookie.com") else { return nil }
        let comps = u.pathComponents.filter { $0 != "/" }
        var cand: String? = nil
        if host == "youtu.be" { cand = comps.first }
        else if let v = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value { cand = v }
        else if comps.count >= 2, ["shorts", "live", "embed", "v"].contains(comps[0]) { cand = comps[1] }
        guard let c = cand, isID(c) else { return nil }
        return c
    }
}

enum RosterHash {
    static func sid(_ s: String) -> String { s.filter { ("0"..."9").contains($0) } }
    static func name(_ s: String) -> String { s.filter { !$0.isWhitespace }.precomposedStringWithCanonicalMapping }
    /// sha256(학번|이름) 소문자 hex — 홈페이지 lecture.html 의 hashId 와 같은 값이어야 한다
    static func h(sid: String, name: String) -> String {
        SHA256.hash(data: Data((Self.sid(sid) + "|" + Self.name(name)).utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum RosterLine {
    struct Entry: Equatable { let sid: String; let name: String }
    /// 한 줄 = "학번 이름"(공백·탭·쉼표 구분, 순서 무관). 숫자 덩어리가 학번, 나머지를 합친 것이 이름. 같은 학번은 마지막 줄이 남는다
    static func parse(_ text: String) -> [Entry] {
        var out: [String: Entry] = [:]; var order: [String] = []
        for raw in text.split(whereSeparator: \.isNewline) {
            let parts = raw.split { $0 == " " || $0 == "\t" || $0 == "," }.map(String.init)
            guard let sid = parts.first(where: { $0.count >= 3 && $0.allSatisfy { ("0"..."9").contains($0) } }) else { continue }
            let name = RosterHash.name(parts.filter { $0 != sid }.joined())
            guard !name.isEmpty else { continue }
            if out[sid] == nil { order.append(sid) }
            out[sid] = Entry(sid: sid, name: name)
        }
        return order.compactMap { out[$0] }
    }
}
