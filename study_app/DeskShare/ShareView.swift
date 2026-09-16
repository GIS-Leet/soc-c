// 「Desk에 보내기」 화면 — 노트로 저장하거나 자료 폴더(GitHub)에 업로드. 로그인 세션은 앱과 키체인(App Group)으로 공유
import SwiftUI
#if STUDY_TESTS
@testable import Desk   // 테스트 타깃에서 이 파일을 함께 컴파일할 때 (확장 타깃은 소스 공유)
#endif

struct ShareView: View {
    let context: NSExtensionContext?
    var preset: ShareItems? = nil    // 테스트·미리보기용
    enum Target: String, CaseIterable { case note = "노트", material = "자료", lecture = "강의 영상" }
    @State private var items: ShareItems? = nil
    @State private var target: Target = .note
    @State private var title = ""; @State private var body_ = ""
    @State private var folder = "수업"
    @State private var unit = ""; @State private var date = Date(); @State private var note = ""
    var yt: String? { items.flatMap { YouTubeID.parse([$0.url?.absoluteString, $0.text].compactMap { $0 }.joined(separator: " ")) } }
    @State private var busy = false; @State private var error: String? = nil
    static let accent = DeskColors.accent

    var body: some View {
        NavigationStack {
            Form {
                if let items {
                    if items.hasFiles || yt != nil { Picker("저장 위치", selection: $target) { ForEach(Target.allCases.filter { $0 != .lecture || yt != nil }, id: \.self) { Text($0.rawValue) } }.pickerStyle(.segmented) }
                    if target == .note {
                        Section("노트") {
                            TextField("제목", text: $title)
                            TextEditor(text: $body_).frame(minHeight: 120)
                        }
                        if items.hasFiles { Section { Text("사진·파일은 노트에 들어가지 않습니다. 「자료」를 고르면 저장소에 올립니다.").font(.footnote).foregroundStyle(.secondary) } }
                    } else if target == .lecture {
                        Section("강의 영상 · \(yt ?? "")") {
                            TextField("제목", text: $title)
                            TextField("단원 (예: 3.1 기후 환경)", text: $unit)
                            DatePicker("날짜", selection: $date, displayedComponents: .date)
                            TextField("메모", text: $note, axis: .vertical)
                        }
                        Section { Text("홈페이지에서 학번 인증을 마친 학생에게 바로 보입니다.").font(.footnote).foregroundStyle(.secondary) }
                    } else {
                        Section("폴더") { Picker("폴더", selection: $folder) { ForEach(GitHubFiles.folders, id: \.self) { Text($0) } }.pickerStyle(.segmented) }
                        Section("파일 \(items.files.count)개") { ForEach(items.files) { f in HStack { Text(f.name).lineLimit(1); Spacer(); Text(Self.size(f.data.count)).foregroundStyle(.secondary).font(.footnote) } } }
                    }
                    if let e = error { Section { Text(e).font(.footnote).foregroundStyle(.red) } }
                } else {
                    Section { HStack { ProgressView(); Text("항목 읽는 중…").foregroundStyle(.secondary) } }
                }
            }
            .navigationTitle("Desk에 보내기").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { context?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)) } }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "저장 중…" : "저장") { Task { await save() } }.disabled(busy || items == nil || (target == .note && title.isEmpty && body_.isEmpty) || (target == .lecture && yt == nil)).tint(Self.accent) }
            }
        }
        .task {
            let loaded: ShareItems
            if let preset { loaded = preset } else { loaded = await ShareItems.load(context?.inputItems as? [NSExtensionItem] ?? []) }
            items = loaded; title = loaded.noteTitle; body_ = loaded.noteBody; target = loaded.hasFiles ? .material : .note
            if yt != nil { target = .lecture; title = loaded.text?.components(separatedBy: "\n").first ?? "" }   // YouTube 앱 공유 텍스트는 첫 줄이 제목
        }
    }
    static func size(_ n: Int) -> String { n < 1024 * 1024 ? "\(n / 1024) KB" : String(format: "%.1f MB", Double(n) / 1048576) }

    func save() async {
        guard let items else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            _ = try await FirebaseSession.shared.token()
            if target == .note {
                let now = Date().timeIntervalSince1970 * 1000
                try await RTDB.push("desk/notes", ["title": title, "md": body_, "createdAt": now, "updatedAt": now])
            } else if target == .lecture {
                let all = (try await RTDB.get("videos") as? [String: Any]) ?? [:]
                let minOrder = all.values.compactMap { ($0 as? [String: Any])?["order"] as? Double }.min() ?? 0
                let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
                try await RTDB.push("videos", ["yt": yt!, "title": title, "unit": unit, "date": f.string(from: date), "order": minOrder - 1, "note": note, "createdAt": Date().timeIntervalSince1970 * 1000])
            } else {
                let g = FB_dict(try await RTDB.get("desk/settings/github"))
                guard let tok = g["token"] as? String, let repo = g["repo"] as? String, !tok.isEmpty else { throw Msg("자료실 GitHub 설정이 없습니다. Desk 설정에서 저장소·토큰을 먼저 넣어 주세요.") }
                let gh = GitHubFiles(token: tok, repo: repo)
                let existing = Dictionary(uniqueKeysWithValues: (try await gh.list(folder)).map { ($0.name, $0.sha) })
                for f in items.files { try await gh.upload(folder, name: f.name, data: f.data, existingSha: existing[f.name]) }
            }
            context?.completeRequest(returningItems: nil)
        } catch is FirebaseSession.NotSignedIn { error = "Desk 앱에서 먼저 로그인해 주세요." }
        catch { self.error = error.localizedDescription }
    }
    struct Msg: LocalizedError { let m: String; init(_ m: String) { self.m = m }; var errorDescription: String? { m } }
    func FB_dict(_ any: Any?) -> [String: Any] { (any as? [String: Any]) ?? [:] }
}
