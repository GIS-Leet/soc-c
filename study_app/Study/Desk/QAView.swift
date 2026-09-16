// 「Q&A」 — 학생 질문 목록(미답변/전체)과 상세·답글
import SwiftUI

struct QAView: View {
    var body: some View { NavigationStack { QAListView() } }
}

/// 질문 목록 — 「수업」 탭 안에서 밀어 들어오므로 NavigationStack 없이
struct QAListView: View {
    @EnvironmentObject var store: DeskStore
    @State private var mode = 0   // 0 미답변, 1 전체
    @State private var search = ""
    var items: [Question] { (mode == 0 ? store.questions.filter(\.open) : store.questions).filter { ListSearch.matches(search,fields:[$0.title,$0.text,$0.author]+$0.replies.map(\.text)) } }
    var body: some View {
        Group {
            List {
                Section {
                    if items.isEmpty { VStack(alignment:.leading,spacing:8) { Text(search.isEmpty ? (mode == 0 ? "미답변 질문이 없습니다" : "질문이 없습니다") : "검색 결과가 없습니다").foregroundStyle(.secondary);if !search.isEmpty { Button("검색·필터 초기화") { search="";mode=1 } } } }
                    ForEach(items) { q in
                        NavigationLink { QADetailView(questionID: q.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    if q.open { Circle().fill(DeskTheme.live).frame(width: 7, height: 7) }
                                    if q.isSecret { Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.secondary) }
                                    Text(q.title.isEmpty ? "제목 없음" : q.title).scaledFont(16, .semibold).lineLimit(1)
                                }
                                Text(q.text).desk(.body).foregroundStyle(.secondary).lineLimit(2)
                                HStack(spacing: 6) {
                                    Text("\(q.author) · \(q.time)").font(.caption).foregroundStyle(.tertiary)
                                    Spacer()
                                    ReadChip(q: q)
                                }
                            }.padding(.vertical, 3)
                        }
                        .swipeActions(edge: .leading) { if q.needsFollowUp { Button { store.resolveFollowUp(q) } label: { Label("확인함", systemImage: "checkmark.circle") }.tint(DeskTheme.success) } }
                        .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteQuestion(q) } label: { Label("삭제", systemImage: "trash") } }
                    }
                } header: {
                    Picker("", selection: $mode) { Text("미답변 \(store.unanswered)").tag(0); Text("전체 \(store.questions.count)").tag(1) }.pickerStyle(.segmented).textCase(nil).padding(.bottom, 6)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("학생 질문")
            .searchable(text:$search,prompt:"제목·내용·학생 이름")
        }
    }
}

struct QADetailView: View {
    let questionID: String
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) var dismiss
    @State private var draft = ""
    @FocusState private var focused: Bool
    @State private var related: [QAAssist.Related] = []
    @State private var mats: [GHFile] = []
    @State private var drafting = false
    @State private var assistOpen = true
    @State private var matTarget: MaterialOpener.Target? = nil
    @State private var matBusy: String? = nil
    var q: Question? { store.questions.first { $0.id == questionID } }
    var body: some View {
        Group {
            if let q {
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            DeskCard {
                                HStack(spacing: 6) { if q.isSecret { Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary) }; Text(q.title.isEmpty ? "제목 없음" : q.title).desk(.heading) }
                                HStack { Text("\(q.author) · \(q.time)").font(.caption).foregroundStyle(.secondary); Spacer(); ReadChip(q: q) }
                                Text(q.text).scaledFont(16).lineSpacing(3).textSelection(.enabled)
                                if let u = q.imageUrl, let url = URL(string: u) { BoardAttachmentView(url: url).clipShape(RoundedRectangle(cornerRadius: 10)) }
                            }
                            if q.needsFollowUp {
                                HStack(spacing: 10) {
                                    Image(systemName: "arrowshape.turn.up.left.circle.fill").foregroundStyle(DeskTheme.live)
                                    VStack(alignment: .leading, spacing: 2) { Text("학생이 이어서 물었습니다").scaledFont(14, .semibold); Text("답할 게 없으면(예: 「확인했습니다」) 확인함으로 넘기세요").font(.caption).foregroundStyle(.secondary) }
                                    Spacer()
                                    Button("확인함") { store.resolveFollowUp(q) }.font(.caption.weight(.semibold)).buttonStyle(.bordered).tint(DeskTheme.accent)
                                }
                                .padding(12).background(DeskTheme.live.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                            }
                            if !related.isEmpty || !mats.isEmpty || q.open { assistCard(q) }
                            Eyebrow(text: "답변", trailing: q.replies.isEmpty ? "아직 없음" : "\(q.replies.count)개").padding(.horizontal, 4)
                            ForEach(q.replies) { r in ReplyCard(q: q, r: r) }
                        }
                        .padding(16)
                    }
                    .background(DeskTheme.canvas)
                    HStack(alignment: .bottom, spacing: 8) {
                        TextField("답변을 입력", text: $draft, axis: .vertical).lineLimit(1...5).focused($focused).padding(10).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                        Button { let t = draft.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return }; if store.reply(q, t) { draft = ""; focused = false; Haptic.light() } } label: { Image(systemName: "arrow.up.circle.fill").scaledFont(30).frame(minWidth:44,minHeight:44) }.accessibilityLabel("답변 전송 대기열에 보관")
                            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8).background(.bar)
                }
                .navigationTitle("질문").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if let next=store.questions.first(where:{$0.open && $0.id != questionID}) { ToolbarItem(placement:.topBarTrailing) { NavigationLink("다음 미처리") { QADetailView(questionID:next.id) } } }
                    ToolbarItem(placement: .topBarTrailing) { Menu { Button("질문 삭제", systemImage: "trash", role: .destructive) { store.deleteQuestion(q); dismiss() } } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("더 보기") } }
            } else { ContentUnavailableView("삭제된 질문", systemImage: "trash") }
        }
        .onAppear { draft = ReplyDrafts.read(questionID) }
        .onChange(of: draft) { _, value in ReplyDrafts.save(questionID, value) }
        .task(id: questionID) { if let q { related = QAAssist.related(q, in: store.questions); mats = QAAssist.materials(q, files: LessonPrep.cachedFiles(repo:store.github?.repo)) } }
        .fullScreenCover(item: $matTarget) { t in DocInkScreen(name: t.name, doc: t.doc, storageKey: t.key).environmentObject(store) }
    }
    /// 답변 도우미 — 비슷한 이전 답·관련 자료·초안
    func assistCard(_ q: Question) -> some View {
        DeskCard {
            HStack { Eyebrow(text: "답변 도우미", trailing: QAAssist.onDeviceAvailable ? "기기 안 모델" : nil); Button { withAnimation { assistOpen.toggle() } } label: { Image(systemName: assistOpen ? "chevron.up" : "chevron.down").font(.caption) }.buttonStyle(.plain).foregroundStyle(.secondary) }
            if assistOpen {
                if !related.isEmpty {
                    ForEach(related) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(r.q.title.isEmpty ? String(r.q.text.prefix(30)) : r.q.title).scaledFont(13, .semibold).lineLimit(1); Spacer(); Text("\(Int(r.score * 100))%").font(.caption2.monospacedDigit()).foregroundStyle(.secondary) }
                            Text(r.answer).desk(.small).foregroundStyle(.secondary).lineLimit(3)
                            Button("이 답을 초안으로") { draft = r.answer; focused = true }.font(.caption.weight(.semibold)).buttonStyle(.plain).foregroundStyle(DeskTheme.accent)
                        }.padding(10).background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
                if !mats.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) { ForEach(mats) { f in Button { Task { await openMat(f) } } label: { HStack(spacing: 4) { if matBusy == f.id { ProgressView().controlSize(.mini) } else { Image(systemName: "doc.text") }; Text(f.name).lineLimit(1) }.font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6).background(DeskTheme.accent.opacity(0.1), in: Capsule()).foregroundStyle(DeskTheme.accent) }.buttonStyle(.plain) } } }
                }
                if q.open {
                    Button { Task { drafting = true; let d = await QAAssist.draft(q, related: related); if !d.isEmpty { draft = d; focused = true }; drafting = false } } label: { Label(drafting ? "초안 만드는 중…" : "답변 초안 만들기", systemImage: "wand.and.stars").scaledFont(14, .semibold) }.disabled(drafting || (!QAAssist.onDeviceAvailable && related.isEmpty))
                    if !QAAssist.onDeviceAvailable && related.isEmpty { Text("비슷한 이전 답이 없고 이 기기엔 Apple 언어 모델이 없어 초안을 만들 수 없습니다").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
    }
    func openMat(_ f: GHFile) async {
        guard let gh = store.github else { return }
        matBusy = f.id; defer { matBusy = nil }
        do { matTarget = try await MaterialOpener.annotate(f, gh: gh) } catch { Report.shared.fail("자료 열기", error) }
    }
}


/// 학생 확인 여부 칩 — 답변 전 / 답변 완료·미확인 / 확인함(시각)
struct ReadChip: View {
    let q: Question
    var body: some View {
        let st = q.readState
        Label(q.readLabel, systemImage: st == .read ? "checkmark.circle.fill" : st == .done ? "circle.dotted" : "clock")
            .font(.caption2.weight(.semibold)).labelStyle(.titleAndIcon)
            .foregroundStyle(st == .read ? DeskTheme.success : st == .done ? DeskTheme.warn : Color.secondary)
            .lineLimit(1)
    }
}

/// 답글 카드 — 본문 + 학생/교사 대댓글 + 대댓글 작성
struct ReplyCard: View {
    let q: Question; let r: Reply
    @EnvironmentObject var store: DeskStore
    @State private var composing = false
    @State private var text = ""
    @FocusState private var focused: Bool
    var body: some View {
        DeskCard {
            Text(r.text).desk(.body).lineSpacing(2).textSelection(.enabled)
            if let u = r.imageUrl, let url = URL(string: u) { BoardAttachmentView(url: url).clipShape(RoundedRectangle(cornerRadius: 10)) }
            HStack { Text(r.isTeacher ? "교사 답변" : "댓글").font(.caption.weight(.semibold)).foregroundStyle(r.isTeacher ? DeskTheme.accent : .secondary); Text("· \(r.time)").font(.caption).foregroundStyle(.secondary); Spacer()
                Button { composing.toggle(); focused = composing } label: { Label("대댓글", systemImage: "arrowshape.turn.up.left").font(.caption) }.buttonStyle(.plain).foregroundStyle(DeskTheme.accent)
                Button(role: .destructive) { store.deleteReply(q, r) } label: { Image(systemName: "trash").font(.caption) }.buttonStyle(.plain).foregroundStyle(.secondary) }
            if !r.subReplies.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(r.subReplies) { s in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(s.isTeacher ? DeskTheme.accent.opacity(0.15) : Color.primary.opacity(0.08)).frame(width: 24, height: 24)
                                .overlay(Text(String(s.author.prefix(1))).desk(.label).foregroundStyle(s.isTeacher ? DeskTheme.accent : .secondary))
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) { Text(s.author).font(.caption.weight(.semibold)); Text(s.time).font(.caption2).foregroundStyle(.secondary) }
                                Text(s.text).desk(.body).textSelection(.enabled)
                                if let u = s.imageUrl, let url = URL(string: u) { BoardAttachmentView(url: url).frame(maxHeight: 200).clipShape(RoundedRectangle(cornerRadius: 8)) }
                            }
                            Spacer(minLength: 0)
                            Button(role: .destructive) { store.deleteSubReply(q, r, s) } label: { Image(systemName: "xmark").font(.caption2) }.buttonStyle(.plain).foregroundStyle(.tertiary)
                        }
                    }
                }
                .padding(.leading, 6).padding(.top, 4).overlay(alignment: .leading) { Rectangle().fill(Color.primary.opacity(0.08)).frame(width: 2) }
            }
            if composing {
                HStack(alignment: .bottom, spacing: 8) {
                    TextField("대댓글", text: $text, axis: .vertical).lineLimit(1...4).focused($focused).padding(8).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                    Button { let t = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return }; if store.subReply(q, r, t) { text = ""; composing = false } } label: { Image(systemName: "arrow.up.circle.fill").scaledFont(26).frame(minWidth:44,minHeight:44) }.accessibilityLabel("대댓글 전송 대기열에 보관").disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .onAppear { text = ReplyDrafts.read(q.id + "/" + r.id) }
        .onChange(of: text) { _, value in ReplyDrafts.save(q.id + "/" + r.id, value) }
    }
}
