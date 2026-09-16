// 답변 도우미 — 비슷한 이전 질문·답, 관련 자료, 답변 초안(기기 안 Apple 언어 모델이 있으면 생성, 없으면 이전 답 기반 템플릿)
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

enum QAAssist {
    /// 낱말 + 2글자 조각(한국어 조사 변형에 강함)
    static func tokens(_ s: String) -> Set<String> {
        let words = s.lowercased().replacingOccurrences(of: "[^가-힣a-z0-9 ]", with: " ", options: .regularExpression).split(separator: " ").map(String.init).filter { $0.count >= 2 }
        var out = Set(words)
        for w in words where w.count >= 3 { let a = Array(w); for i in 0..<(a.count - 1) { out.insert(String(a[i...i + 1])) } }
        return out
    }
    static let stop: Set<String> = ["질문", "선생님", "안녕하세요", "감사합니다", "혹시", "있나요", "인가요", "인지", "하나요", "궁금", "합니다", "입니다", "니다", "습니", "요"]
    static func score(_ a: Set<String>, _ b: Set<String>) -> Double { let x = a.subtracting(stop), y = b.subtracting(stop); guard !x.isEmpty, !y.isEmpty else { return 0 }; return Double(x.intersection(y).count) / Double(min(x.count, y.count)) }
    struct Related: Identifiable { var q: Question; var answer: String; var score: Double; var id: String { q.id } }
    /// 답이 달린 다른 질문 중 비슷한 것 3개
    static func related(_ q: Question, in all: [Question], limit: Int = 3) -> [Related] {
        let t = tokens(q.title + " " + q.text)
        return all.compactMap { o -> Related? in
            guard o.id != q.id, let ans = o.replies.first(where: { $0.isTeacher })?.text, !ans.isEmpty else { return nil }
            let s = score(t, tokens(o.title + " " + o.text)); return s >= 0.25 ? Related(q: o, answer: ans, score: s) : nil
        }.sorted { $0.score > $1.score }.prefix(limit).map { $0 }
    }
    /// 질문 낱말이 이름에 들어 있는 자료
    static func materials(_ q: Question, files: [GHFile], limit: Int = 3) -> [GHFile] {
        let keys = tokens(q.title + " " + q.text).subtracting(stop).filter { $0.count >= 2 }
        return files.compactMap { f -> (GHFile, Int)? in let n = f.name.lowercased(); let sc = keys.filter { n.contains($0) }.map { $0.count >= 3 ? 2 : 1 }.reduce(0, +); return sc >= 2 ? (f, sc) : nil }
            .sorted { $0.1 > $1.1 }.prefix(limit).map(\.0)
    }
    /// 기기 안 모델 사용 가능?
    static var onDeviceAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { if case .available = SystemLanguageModel.default.availability { return true } }
        #endif
        return false
    }
    /// 답변 초안 — 기기 모델이 있으면 생성, 없으면 가장 비슷한 이전 답을 다듬어 제안
    static func draft(_ q: Question, related: [Related]) async -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), case .available = SystemLanguageModel.default.availability {
            let ref = related.prefix(2).map { "이전 질문: \($0.q.title.isEmpty ? String($0.q.text.prefix(80)) : $0.q.title)\n이전 답변: \($0.answer)" }.joined(separator: "\n\n")
            let session = LanguageModelSession(instructions: "당신은 고등학교 지리·통합사회 교사입니다. 학생의 질문에 한국어 존댓말로, 3~5문장, 핵심 개념을 정확히, 필요하면 예를 하나 들어 답합니다. 모르는 사실은 지어내지 말고 '수업 시간에 다시 설명'하겠다고 합니다. 이전 답변이 있으면 그 말투와 수준을 따릅니다. 인사말·서명 없이 본문만 씁니다.")
            let prompt = "학생 질문 제목: \(q.title)\n학생 질문: \(q.text)" + (ref.isEmpty ? "" : "\n\n참고할 이전 답변:\n\(ref)")
            if let r = try? await session.respond(to: prompt) { return r.content.trimmingCharacters(in: .whitespacesAndNewlines) }
        }
        #endif
        if let r = related.first { return "비슷한 질문에 이렇게 답한 적이 있어요.\n\n" + r.answer }
        return ""
    }
}
