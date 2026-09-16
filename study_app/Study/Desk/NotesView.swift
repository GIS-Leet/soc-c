// 「노트」 화면 — 목록(고정·검색·스와이프) + 편집 (실데이터: DeskStore). 편집은 1초 뒤 자동 저장, 첫 저장 전 이전 버전 보관(PC와 동일)
import SwiftUI

struct NotesView: View {
    @EnvironmentObject var store: DeskStore
    @EnvironmentObject var m: AppModel
    @State private var query = ""
    @State private var tag: String? = nil
    static func tags(in md: String) -> [String] { md.matches(of: /#([가-힣A-Za-z0-9_]{2,12})/).map { String($0.1) } }
    var allTags: [String] { let c = store.notes.flatMap { Self.tags(in: $0.md) }.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }; return c.sorted { $0.key == "연구" ? true : $1.key == "연구" ? false : $0.value > $1.value }.map(\.key) }
    @State private var openID: String? = nil
    var filtered: [Note] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let base = tag.map { t in store.notes.filter { NotesView.tags(in: $0.md).contains(t) } } ?? store.notes
        return q.isEmpty ? base : base.filter { $0.displayTitle.lowercased().contains(q) || $0.md.lowercased().contains(q) || $0.inkText.lowercased().contains(q) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(filtered) { n in
                        NavigationLink(value: n.id) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    if n.pinned { Image(systemName: "pin.fill").font(.caption).foregroundStyle(DeskTheme.warn) }
                                    if n.hasInk { Image(systemName: "pencil.tip").font(.caption).foregroundStyle(DeskTheme.accent) }
                                    Text(n.displayTitle).scaledFont(16, .semibold).lineLimit(1)
                                    Spacer()
                                    Text(Note.timeLabel(n.updatedAt)).font(.caption).foregroundStyle(.secondary)
                                }
                                Text(n.preview).desk(.body).foregroundStyle(.secondary).lineLimit(2)
                            }
                            .padding(.vertical, 4)
                        }
                        .swipeActions(edge: .leading) { Button { store.pin(n) } label: { Label(n.pinned ? "고정 해제" : "고정", systemImage: n.pinned ? "pin.slash" : "pin") }.tint(DeskTheme.warn) }
                        .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteNote(n) } label: { Label("삭제", systemImage: "trash") } }
                    }
                } header: {
                    Text(store.notes.isEmpty ? "" : "고정 \(store.notes.filter(\.pinned).count) · 노트 \(store.notes.count)").font(.footnote)
                }
                if store.notes.isEmpty { Section { EmptyHint(icon: "note.text", title: "첫 노트를 만들어 보세요", text: "마크다운으로 쓰고, iPad 에서는 손글씨 페이지를 붙일 수 있습니다. 공유 시트에서 「Desk」로 보내면 노트로 들어옵니다.", action: ("새 노트", { Task { if let id = await store.newNote() { openID = id } } })) }.listRowBackground(Color.clear) }
            }
            .listStyle(.insetGrouped)
            .safeAreaInset(edge: .top, spacing: 0) {
                if !allTags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) { ForEach(allTags, id: \.self) { t in Button { tag = tag == t ? nil : t } label: { Text("#" + t).scaledFont(12, .semibold).padding(.horizontal, 10).padding(.vertical, 5).background(tag == t ? DeskTheme.accent : Color.primary.opacity(0.06), in: Capsule()).foregroundStyle(tag == t ? .white : .primary) }.buttonStyle(.plain).accessibilityLabel("태그 " + t) } }.padding(.horizontal, 16).padding(.vertical, 6) }.background(.bar)
                }
            }
            .searchable(text: $query, prompt: "노트 검색")
            .navigationTitle("노트")
            .onChange(of: m.newNoteRequest) { _, _ in Task { if let id = await store.newNote() { openID = id } } }   // ⌘N
            .navigationDestination(for: String.self) { id in NoteEditor(noteID: id) }
            .navigationDestination(item: $openID) { id in NoteEditor(noteID: id) }
            .onChange(of: m.openNoteID) { _, id in if let id { openID = id; m.openNoteID = nil } }
            .onAppear { if let id = m.openNoteID { openID = id; m.openNoteID = nil } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button { Task { if let id = await store.newNote() { openID = id } } } label: { Image(systemName: "square.and.pencil") }.accessibilityLabel("새 노트") }
            }
        }
    }
}

struct NoteEditor: View {
    let noteID: String
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var title = ""
    @State private var md = ""
    @State private var loaded = false
    @State private var prev: Note? = nil          // 이 편집 세션의 첫 저장 전 원본
    @State private var savedAt: Date? = nil
    @State private var dirty = false
    @State private var localFailure = false
    @State private var saveTask: Task<Void, Never>? = nil
    var note: Note? { store.notes.first { $0.id == noteID } }
    var body: some View {
        VStack(spacing: 0) {
            TextField("제목", text: $title).scaledFont(22, .bold).padding(.horizontal, 20).padding(.top, 8).onChange(of: title) { _, _ in if loaded { schedule() } }
            Divider().padding(.horizontal, 20).padding(.vertical, 8)
            TextEditor(text: $md).scaledFont(16).lineSpacing(4).padding(.horizontal, 16).scrollContentBackground(.hidden).onChange(of: md) { _, _ in if loaded { schedule() } }
            Divider().padding(.horizontal, 20)
            InkPagesSection(noteID: noteID)
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { Text(status).font(.caption).foregroundStyle(.secondary) }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let n = note { Button(n.pinned ? "고정 해제" : "고정", systemImage: "pin") { store.pin(n) } }
                    Section("제작 요청 (Mac 인박스로)") {
                        Button("학습지 만들기 요청", systemImage: "doc.text") { store.requestMaterial(type: "worksheet", title: autoTitle(), md: md) }
                        Button("슬라이드 만들기 요청", systemImage: "rectangle.on.rectangle") { store.requestMaterial(type: "slides", title: autoTitle(), md: md) }
                    }
                    if localFailure { Button("기기 저장 다시 시도", systemImage: "arrow.clockwise") { saveNow() } }
                    Button("링크 제목 가져오기", systemImage: "link") { Task { await fetchLinkTitles() } }
                    Button("#연구 태그 넣기", systemImage: "number") { if !md.contains("#연구") { md = "#연구 " + md } }
                    if UIDevice.current.userInterfaceIdiom == .pad { Button("새 창에서 열기", systemImage: "rectangle.split.2x1") { let a = NSUserActivity(activityType: "nyuheatgis.note"); a.userInfo = ["id": noteID]; UIApplication.shared.requestSceneSessionActivation(nil, userActivity: a, options: nil) } }
                    Button("삭제", systemImage: "trash", role: .destructive) { if let n = note { store.deleteNote(n) }; dismiss() }
                } label: { Image(systemName: "ellipsis.circle") }
            }
            ToolbarItemGroup(placement: .keyboard) {
                Button { insert("**", "**") } label: { Image(systemName: "bold") }
                Button { insert("- ", "") } label: { Image(systemName: "list.bullet") }
                Button { insert("- [ ] ", "") } label: { Image(systemName: "checklist") }
                Button { insert("## ", "") } label: { Image(systemName: "number") }
                Spacer()
                Button("완료") { saveNow(); UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            }
        }
        .onAppear { if let n = note, !loaded { title = n.title; md = n.md; prev = n; loaded = true } }
        .onChange(of: note) { _, n in if let n, !loaded { title = n.title; md = n.md; prev = n; loaded = true } }
        .onDisappear { saveNow() }
    }
    func autoTitle() -> String { let t = title.trimmingCharacters(in: .whitespaces); return t.isEmpty ? String(md.split(separator: "\n").first ?? "제목 없음").trimmingCharacters(in: CharacterSet(charactersIn: "# ")) : t }
    /// 본문의 맨 URL 을 [제목](url) 로 — 참고문헌 캡처용
    func fetchLinkTitles() async {
        let urls = md.matches(of: /https?:\/\/[^\s\)\]]+/).compactMap { m -> String? in let r = m.range; let i = r.lowerBound; if i > md.startIndex, "([".contains(md[md.index(before: i)]) { return nil }; return String(m.0) }   // 이미 [..](..) 인 것은 제외
        for u in Array(NSOrderedSet(array: urls).array as? [String] ?? []) {
            guard let url = URL(string: u), let (d, _) = try? await URLSession.shared.data(from: url), let html = String(data: d, encoding: .utf8) ?? String(data: d, encoding: .isoLatin1),
                  let m = html.firstMatch(of: /<title[^>]*>([^<]{1,160})<\/title>/.ignoresCase()) else { continue }
            let t = String(m.1).replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&#39;", with: "'").replacingOccurrences(of: "&quot;", with: "\"").trimmingCharacters(in: .whitespacesAndNewlines)
            md = md.replacingOccurrences(of: u, with: "[\(t)](\(u))")
        }
    }
    var status: String {
        if localFailure { return "기기 저장 실패 · 다시 시도 필요" }
        if dirty { return "저장 중…" }
        if let s = savedAt { let f = DateFormatter(); f.dateFormat = "HH:mm"; return "기기에 보관 · \(f.string(from: s))" }
        if let n = note { return "수정 " + Note.timeLabel(n.updatedAt) }
        return ""
    }
    func schedule() { dirty = true; saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .seconds(1)); if !Task.isCancelled { saveNow() } } }
    func saveNow() {
        guard dirty, let n = note else { return }
        let t = title.trimmingCharacters(in: .whitespaces)
        let autoTitle = t.isEmpty ? String(md.split(separator: "\n").first ?? "").trimmingCharacters(in: .whitespaces).prefix(24) : Substring(t)
        guard store.saveNote(n.id, title: String(autoTitle), md: md, keepPrev: prev) else { localFailure = true; return }
        localFailure = false; prev = nil; dirty = false; savedAt = Date()
    }
    func insert(_ open: String, _ close: String) { md += (md.isEmpty || md.hasSuffix("\n") ? "" : "\n") + open + close }
}
