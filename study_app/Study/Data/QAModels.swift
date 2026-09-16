// Q&A·진도 모델 — PC desk.html과 같은 필드·판정
import Foundation

struct SubReply: Identifiable, Equatable { let id: String; var author: String; var text: String; var time: String; var isTeacher: Bool; var imageUrl: String? }
struct Reply: Identifiable, Equatable { let id: String; var text: String; var time: String; var isTeacher: Bool; var imageUrl: String?; var subReplies: [SubReply] = [] }
struct Question: Identifiable, Equatable {
    let id: String; var title: String; var text: String; var author: String; var time: String; var timestamp: Double
    var isSecret: Bool; var imageUrl: String?; var replies: [Reply]; var readAt: Double = 0
    var followUpResolvedAt: Double = 0   // 교사가 '확인함(답변 불필요)' 누른 시각 — 그 전의 학생 대댓글은 답변 필요로 치지 않음
    var answered: Bool { !replies.isEmpty }   // desk와 동일: 답글이 하나라도 있으면 답변됨
    /// 학생이 답변 아래 이어서 물었는데(대댓글) 그 뒤 교사 답이 없고, '확인함' 처리도 안 됨
    func replyNeedsFollowUp(_ r: Reply) -> Bool { guard let last = r.subReplies.last, !last.isTeacher else { return false }; return followUpResolvedAt == 0 || Self.parseTime(last.time) > followUpResolvedAt }
    var needsFollowUp: Bool { replies.contains(where: replyNeedsFollowUp) }
    /// 미답변 목록 기준: 답변 없음 또는 후속 질문 대기
    var open: Bool { !answered || needsFollowUp }
    /// 학생 페이지(qna.html)와 같은 세 단계: 답변 전 → 답변 완료(미확인) → 확인함. 마지막 교사 답변보다 확인이 앞서면 다시 '미확인'
    enum ReadState { case wait, done, read }
    var lastTeacherTs: Double { replies.filter(\.isTeacher).map { Self.parseTime($0.time) }.max() ?? 0 }
    var readState: ReadState {
        guard replies.contains(where: \.isTeacher) else { return .wait }
        guard readAt > 0 else { return .done }
        return readAt + 60_000 >= lastTeacherTs ? .read : .done
    }
    var readLabel: String {
        switch readState {
        case .wait: return "답변 전"
        case .read: return "확인함 · " + Self.readAtLabel(readAt)
        case .done: return readAt > 0 ? "확인 후 답변 추가 · 미확인" : "답변 완료 · 미확인"
        }
    }
    static func readAtLabel(_ ms: Double) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M/d HH:mm"; return f.string(from: Date(timeIntervalSince1970: ms / 1000)) }
    /// 'YYYY/MM/DD AM/PM h:mm' → ms (qna.html parseTimeStr)
    static func parseTime(_ s: String, cal: Calendar = .current) -> Double {
        let parts = s.split(separator: " "); guard parts.count >= 3 else { return 0 }
        let d = parts[0].split(separator: "/"), hm = parts[2].split(separator: ":")
        guard d.count == 3, hm.count == 2, let y = Int(d[0]), let mo = Int(d[1]), let da = Int(d[2]), var h = Int(hm[0]), let mi = Int(hm[1]) else { return 0 }
        h = h % 12; if parts[1] == "PM" { h += 12 }
        return (cal.date(from: DateComponents(year: y, month: mo, day: da, hour: h, minute: mi))?.timeIntervalSince1970 ?? 0) * 1000
    }
    static func parse(_ any: Any?) -> [Question] {
        FB.dict(any).compactMap { k, v in
            guard let d = v as? [String: Any] else { return nil }
            let reps = FB.dict(d["replies"]).compactMap { rk, rv -> Reply? in
                guard let r = rv as? [String: Any] else { return nil }
                let subs = FB.dict(r["subReplies"]).compactMap { sk, sv -> SubReply? in
                    guard let x = sv as? [String: Any] else { return nil }
                    return SubReply(id: sk, author: x["author"] as? String ?? "익명", text: x["text"] as? String ?? "", time: x["time"] as? String ?? "", isTeacher: x["isTeacher"] as? Bool ?? false, imageUrl: (x["imageUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 })
                }.sorted { $0.id < $1.id }
                return Reply(id: rk, text: r["text"] as? String ?? "", time: r["time"] as? String ?? "", isTeacher: r["isTeacher"] as? Bool ?? false, imageUrl: (r["imageUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 }, subReplies: subs)
            }.sorted { $0.id < $1.id }
            return Question(id: k, title: d["title"] as? String ?? "", text: d["text"] as? String ?? "", author: d["author"] as? String ?? "익명", time: d["time"] as? String ?? "",
                            timestamp: FB.ms(d["timestamp"]), isSecret: d["isSecret"] as? Bool ?? false, imageUrl: (d["imageUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 }, replies: reps, readAt: FB.ms(d["readAt"]), followUpResolvedAt: FB.ms(d["followUpResolvedAt"]))
        }.sorted { $0.timestamp > $1.timestamp }
    }
    /// 'YYYY/MM/DD AM/PM h:mm' — PC qTimeStr
    static func timeString(_ d: Date = Date(), cal: Calendar = .current) -> String {
        let c = cal.dateComponents([.year, .month, .day, .hour, .minute], from: d)
        let h24 = c.hour!, ap = h24 >= 12 ? "PM" : "AM"; var h = h24 % 12; if h == 0 { h = 12 }
        return String(format: "%04d/%02d/%02d %@ %d:%02d", c.year!, c.month!, c.day!, ap, h, c.minute!)
    }
}

struct Lesson: Identifiable, Equatable { let id: String; var order: Int; var title: String; var unit: String }
struct ProgressClass: Identifiable, Equatable { let id: String; var name: String; var order: Int; var done: Int; var period: Int; var day: Int }
struct Progress: Equatable {
    var lessons: [Lesson] = []; var classes: [ProgressClass] = []; var examLabel: String? = nil; var examDate: String? = nil
    static func parse(_ any: Any?) -> Progress {
        let root = FB.dict(any)
        let lessons = FB.dict(root["lessons"]).compactMap { k, v -> Lesson? in
            guard let d = v as? [String: Any] else { return nil }
            return Lesson(id: k, order: (d["order"] as? Int) ?? Int(FB.ms(d["order"])), title: d["title"] as? String ?? "", unit: d["unit"] as? String ?? "")
        }.sorted { $0.order < $1.order }
        let classes = FB.dict(root["classes"]).compactMap { k, v -> ProgressClass? in
            guard let d = v as? [String: Any] else { return nil }
            return ProgressClass(id: k, name: d["name"] as? String ?? "", order: (d["order"] as? Int) ?? Int(FB.ms(d["order"])), done: (d["done"] as? Int) ?? Int(FB.ms(d["done"])), period: (d["period"] as? Int) ?? 0, day: (d["day"] as? Int) ?? 0)
        }.sorted { $0.order < $1.order }
        let exam = root["exam"] as? [String: Any]
        return Progress(lessons: lessons, classes: classes, examLabel: exam?["label"] as? String, examDate: exam?["date"] as? String)
    }
    func next(for c: ProgressClass) -> Lesson? { let i = max(0, min(lessons.count, c.done)); return i < lessons.count ? lessons[i] : nil }
}
