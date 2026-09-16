// 강의 영상 — YouTube 일부 공개 영상 목록(단원별)·링크로 추가/편집·상세(임베드 재생 + 홈페이지 학생 시청 현황). 데이터는 videos/views, 명단은 roster/members
import SwiftUI
import WebKit

struct LectureVideosView: View {
    @EnvironmentObject var store: DeskStore
    @State private var adding = false
    var units: [(unit: String, videos: [LectureVideo])] {
        var order: [String] = []; var byUnit: [String: [LectureVideo]] = [:]
        for v in store.videos { let u = v.unit.isEmpty ? "단원 없음" : v.unit; if byUnit[u] == nil { order.append(u) }; byUnit[u, default: []].append(v) }
        return order.map { ($0, byUnit[$0]!) }
    }
    var body: some View {
        List {
            if store.videos.isEmpty {
                EmptyHint(icon: "play.rectangle", title: "강의 영상이 없습니다", text: "YouTube 앱에서 공유 → Desk 「강의 영상」으로 보내거나, 오른쪽 위 + 에 링크를 붙여 넣으세요. 등록한 영상은 홈페이지에서 학번 인증을 마친 학생에게 보입니다.")
            }
            ForEach(units, id: \.unit) { u in
                Section(u.unit) {
                    ForEach(u.videos) { v in
                        NavigationLink { LectureVideoDetail(video: v) } label: { row(v) }
                            .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteVideo(v.id) } label: { Label("삭제", systemImage: "trash") } }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("강의 영상")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $adding) { VideoFormSheet(video: nil) { yt, t, u, d, n in store.addVideo(yt: yt, title: t, unit: u, date: d, note: n) } }
    }
    func row(_ v: LectureVideo) -> some View {
        let w = store.watchers(of: v); let seen = w.filter { $0.rec != nil }.count
        return HStack(spacing: 12) {
            AsyncImage(url: v.thumb) { $0.resizable().scaledToFill() } placeholder: { Color.primary.opacity(0.06) }
                .frame(width: 88, height: 50).clipShape(RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 3) {
                Text(v.title.isEmpty ? v.yt : v.title).desk(.bodyStrong).lineLimit(2)
                Text([v.date, w.isEmpty ? nil : "시청 \(seen)/\(w.count)명"].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// 추가·편집 공용 시트. onSave(yt, title, unit, date, note)
struct VideoFormSheet: View {
    let video: LectureVideo?
    let onSave: (String, String, String, String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""; @State private var title = ""; @State private var unit = ""; @State private var date = Date(); @State private var note = ""
    var yt: String? { video?.yt ?? YouTubeID.parse(link) }
    var body: some View {
        NavigationStack {
            Form {
                if video == nil {
                    Section {
                        HStack {
                            TextField("YouTube 링크", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled()
                            Button("붙여넣기") { if let s = UIPasteboard.general.string { link = s } }.buttonStyle(.bordered).controlSize(.small)
                        }
                    } footer: { Text(link.isEmpty ? "일부 공개로 올린 영상의 공유 링크를 넣으세요." : (yt == nil ? "YouTube 링크가 아닙니다." : "영상 ID \(yt!)")).foregroundStyle(link.isEmpty || yt != nil ? .secondary : DeskTheme.live) }
                }
                Section("정보") {
                    TextField("제목", text: $title)
                    TextField("단원 (예: 3.1 기후 환경)", text: $unit)
                    DatePicker("날짜", selection: $date, displayedComponents: .date)
                    TextField("메모", text: $note, axis: .vertical)
                }
            }
            .navigationTitle(video == nil ? "영상 추가" : "영상 편집").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("저장") { onSave(yt!, title.trimmingCharacters(in: .whitespaces), unit.trimmingCharacters(in: .whitespaces), FB.key(date), note); dismiss() }.disabled(yt == nil) }
            }
            .onAppear { if let v = video { title = v.title; unit = v.unit; note = v.note; date = FB.day.date(from: v.date) ?? Date() } }
        }
    }
}

struct LectureVideoDetail: View {
    @EnvironmentObject var store: DeskStore
    let video: LectureVideo
    @State private var editing = false
    var current: LectureVideo { store.videos.first { $0.id == video.id } ?? video }
    var body: some View {
        let v = current, w = store.watchers(of: v)
        let seen = w.filter { $0.rec != nil }.count, done = w.filter { $0.rec?.done == true }.count
        List {
            Section {
                EmbedPlayer(url: v.embed).aspectRatio(16 / 9, contentMode: .fit).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                VStack(alignment: .leading, spacing: 4) {
                    Text(v.title.isEmpty ? v.yt : v.title).desk(.title)
                    Text([v.unit, v.date].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    if !v.note.isEmpty { Text(v.note).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            Section {
                if w.isEmpty { Text("홈페이지 명단이 비어 있습니다. 「홈페이지 명단」에서 학번·이름을 게시하면 시청 현황이 여기 나옵니다.").font(.footnote).foregroundStyle(.secondary) }
                ForEach(w, id: \.entry.h) { item in
                    HStack(spacing: 10) {
                        Text(item.entry.sid).scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 52, alignment: .leading)
                        Text(item.entry.name).desk(.body).frame(width: 64, alignment: .leading)
                        if let r = item.rec {
                            GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(r.done ? DeskTheme.success : DeskTheme.accent).frame(width: g.size.width * r.pct) } }.frame(height: 6)
                            Text("\(Int(r.pct * 100))%\(r.measured ? "" : "*")").accessibilityLabel(r.measured ? "실제 시청 \(Int(r.pct * 100))퍼센트" : "이전 위치 기반 기록 \(Int(r.pct * 100))퍼센트").scaledFont(12, mono: true).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
                            Text(Date(timeIntervalSince1970: r.at / 1000).formatted(.dateTime.month().day())).font(.caption2).foregroundStyle(.tertiary)
                        } else { Text("—").foregroundStyle(.tertiary); Spacer() }
                    }
                }
            } header: { Text(w.isEmpty ? "시청 현황" : "시청 \(seen) / 명단 \(w.count) · 완료 \(done)") } footer: { Text("새 기록은 실제 재생한 구간을 합산합니다. *는 재생 위치로 계산한 이전 기록입니다. 이 기록은 출결이나 본인 인증을 증명하지 않습니다.") }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("강의 영상").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("편집") { editing = true } } }
        .sheet(isPresented: $editing) { VideoFormSheet(video: v) { _, t, u, d, n in var nv = v; nv.title = t; nv.unit = u; nv.date = d; nv.note = n; store.updateVideo(nv) } }
    }
}

/// youtube-nocookie 임베드 웹뷰(인라인 재생). 홈페이지 주소를 baseURL 로 둔 HTML 안의 iframe 으로 연다 — URL 을 바로 열면 referer 가 없어 YouTube 가 "오류 153" 으로 거부
struct EmbedPlayer: UIViewRepresentable {
    let url: URL
    static let base = URL(string: "https://nyuheatgis.com/")!
    static func html(_ u: URL) -> String {
        if TestRuntime.isTesting { return "<p>격리된 영상 미리보기</p>" }
        return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>html,body{margin:0;background:#000;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe src=\"\(u.absoluteString)\" allow=\"autoplay; encrypted-media; picture-in-picture\" allowfullscreen referrerpolicy=\"strict-origin-when-cross-origin\"></iframe></body></html>"
    }
    final class Coordinator { var url: URL? }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let c = WKWebViewConfiguration(); c.allowsInlineMediaPlayback = true; c.mediaTypesRequiringUserActionForPlayback = []
        let w = WKWebView(frame: .zero, configuration: c); w.isOpaque = false; w.backgroundColor = .black; w.scrollView.isScrollEnabled = false
        w.loadHTMLString(Self.html(url), baseURL: Self.base); context.coordinator.url = url; return w
    }
    func updateUIView(_ w: WKWebView, context: Context) { if context.coordinator.url != url { context.coordinator.url = url; w.loadHTMLString(Self.html(url), baseURL: Self.base) } }
}
