// 세특 자료 모음 — 한 학생의 관찰·상담 기록, 출결, 질문 이력, 메모를 한 화면에 모으고, 기기 안 언어 모델로 초안(기재요령 규칙)을 만들어 노트에 저장
import SwiftUI
import CryptoKit
#if canImport(FoundationModels)
import FoundationModels
#endif

struct StudentDossierView: View {
    let student: Student; let key: SymmetricKey
    @EnvironmentObject var store: DeskStore
    @State private var draft = ""; @State private var busy = false; @State private var saved = false; @State private var semester = "1학기 위주 (400~480자)"
    var questions: [Question] { store.questions.filter { $0.author.trimmingCharacters(in: .whitespaces) == student.name.trimmingCharacters(in: .whitespaces) }.sorted { $0.timestamp < $1.timestamp } }
    var attendance: String { let a = SeatChart.summary(store.charts(key: key), student: student.id); return a.isEmpty ? "결석·지각·조퇴 없음" : SeatChart.summaryText(a) }
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                DeskCard {
                    Eyebrow(text: "자료 요약", trailing: "\(student.logs.count)건 기록 · 질문 \(questions.count)")
                    Text("\(student.num.isEmpty ? "" : student.num + "번 ")\(student.name)").desk(.heading)
                    Text("출결: " + attendance).desk(.body).foregroundStyle(.secondary)
                    if !student.note.isEmpty { Text(student.note).desk(.body).lineSpacing(2) }
                }
                DeskCard {
                    Eyebrow(text: "관찰·상담 기록 (시간순)")
                    if student.logs.isEmpty { Text("기록이 없습니다 — 좌석표에서 자리를 길게 눌러 남기면 여기 쌓입니다").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(student.logs.sorted { $0.date < $1.date }) { l in HStack(alignment: .top, spacing: 8) { Text(l.date.suffix(5)).scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 40, alignment: .leading); Text(l.tag).desk(.label).foregroundStyle(l.tag == "상담" ? DeskTheme.accent : .secondary).frame(width: 30, alignment: .leading); Text(l.text).desk(.body) } }
                }
                if !questions.isEmpty { DeskCard { Eyebrow(text: "질문 이력"); ForEach(questions) { q in VStack(alignment: .leading, spacing: 2) { Text(q.title.isEmpty ? String(q.text.prefix(40)) : q.title).scaledFont(14, .semibold); Text(q.time).scaledFont(11).foregroundStyle(.secondary) } } } }
                DeskCard {
                    Eyebrow(text: "세특 초안", trailing: SeteukDraft.available ? "기기 안 모델" : "모델 없음")
                    Picker("분량", selection: $semester) { ForEach(["1학기 위주 (400~480자)", "1·2학기 합산 (500자)"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
                    Text("기재요령 규칙(명사형 종결·특수문자 금지·대회/기관명/수상 등 금지·관찰에 없는 사실 창작 금지)로 초안을 만듭니다. AI 초안은 윤문 보조용이며 최종 입력 전 반드시 직접 확인·수정하세요.").font(.footnote).foregroundStyle(.secondary)
                    if SeteukDraft.available {
                        Button { Task { busy = true; draft = await SeteukDraft.make(student: student, attendance: attendance, questions: questions, limit: semester.contains("합산") ? 500 : 460); busy = false } } label: { Label(busy ? "만드는 중…" : "초안 만들기", systemImage: "wand.and.stars") }.disabled(busy || student.logs.isEmpty)
                    } else { Text("iPhone 16 Pro 등 Apple Intelligence 기기에서 열면 초안을 만들 수 있습니다. 여기서는 자료 묶음만 노트로 저장하세요.").font(.footnote).foregroundStyle(.secondary) }
                    if !draft.isEmpty { TextEditor(text: $draft).frame(minHeight: 160).desk(.body); Text("\(draft.count)자").scaledFont(12, mono: true).foregroundStyle(draft.count > 500 ? DeskTheme.live : .secondary) }
                    HStack {
                        Button(saved ? "노트에 저장됨" : "자료+초안을 노트로") { Task { await saveNote() } }.disabled(saved)
                        Spacer()
                        if !draft.isEmpty { Button("초안 복사") { UIPasteboard.general.string = draft } }
                    }.scaledFont(14, .semibold)
                }
            }.padding(16)
        }
        .background(DeskTheme.canvas).navigationTitle("세특 자료").navigationBarTitleDisplayMode(.inline)
    }
    func saveNote() async {
        var md = "# 세특 자료 · \(student.name)\n\n출결: \(attendance)\n\n## 관찰·상담\n" + student.logs.sorted { $0.date < $1.date }.map { "- \($0.date) [\($0.tag)] \($0.text)" }.joined(separator: "\n")
        if !questions.isEmpty { md += "\n\n## 질문\n" + questions.map { "- \($0.time) \($0.title.isEmpty ? String($0.text.prefix(60)) : $0.title)" }.joined(separator: "\n") }
        if !draft.isEmpty { md += "\n\n## 초안 (\(draft.count)자, 확인 필요)\n\(draft)" }
        if let id = await store.newNote() { store.saveNote(id, title: "세특 자료 · \(student.name)", md: md, keepPrev: nil); saved = true }
    }
}

enum SeteukDraft {
    static var available: Bool { QAAssist.onDeviceAvailable }
    static let rules = """
    당신은 고등학교 통합사회 교사입니다. 아래 관찰 기록만 근거로 세부능력 및 특기사항 초안을 씁니다.
    규칙: 1) 모든 문장은 명사형 어미(~함, ~임, ~보임, ~향상됨)로 끝냄. 2) 학생 이름·주어를 쓰지 않음. 3) 특수문자·번호·줄바꿈 없이 한 문단. 4) 대회·수상·자격증·대학명·기관명·어학시험·방과후·MOOC·소논문·해외활동·부모 직업은 절대 쓰지 않음. 5) 기록에 없는 사실은 만들지 않음, 과장하지 않음. 6) 활동 나열이 아니라 성취 특성·참여도·변화와 성장이 드러나게. 7) 어휘는 세련되게(갈무리, 벼리다, 길어 올리다 등) 쓰되 자연스럽게. 8) 지정한 글자 수 이내.
    """
    static func make(student: Student, attendance: String, questions: [Question], limit: Int) async -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), case .available = SystemLanguageModel.default.availability {
            let logs = student.logs.sorted { $0.date < $1.date }.map { "\($0.date) [\($0.tag)] \($0.text)" }.joined(separator: "\n")
            let qs = questions.map { "\($0.time) 질문: \($0.title) \($0.text.prefix(80))" }.joined(separator: "\n")
            let prompt = "글자 수: \(limit)자 이내.\n관찰·상담 기록:\n\(logs)\n" + (qs.isEmpty ? "" : "수업 관련 질문:\n\(qs)\n") + (student.note.isEmpty ? "" : "교사 메모: \(student.note)\n") + "출결: \(attendance)\n\n위 자료만으로 세특 초안 한 문단을 쓰세요."
            let session = LanguageModelSession(instructions: rules)
            do { let resp = try await session.respond(to: prompt); let text: String = resp.content; return text.trimmingCharacters(in: .whitespacesAndNewlines) } catch { await Report.shared.fail("세특 초안", error, show: false); return "" }
        }
        #endif
        return ""
    }
}
