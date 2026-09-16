// 「자료」 — GitHub 비공개 저장소 폴더의 파일: 목록(캐시)·미리보기(HTML은 웹뷰, 그 외 QuickLook)·업로드·삭제
import SwiftUI
import QuickLook
import WebKit
import UniformTypeIdentifiers
import PDFKit
import CryptoKit
import PencilKit

struct MaterialsView: View {
    @EnvironmentObject var store: DeskStore
    @State private var folder = GitHubFiles.folders[0]
    @State private var files: [GHFile] = []
    @State private var uploadFailures: [String] = []
    @State private var loading = false
    @State private var busyFile: String?
    @State private var error: String?
    @State private var preview: URL?
    @State private var htmlPreview: URL?
    @State private var importing = false
    @State private var ink: InkTarget? = nil
    init(initialFolder: String? = nil) { _folder=State(initialValue:initialFolder.flatMap { GitHubFiles.folders.contains($0) ? $0 : nil } ?? GitHubFiles.folders[0]) }
    struct InkTarget: Identifiable { let name: String; let doc: PDFDocument; let key: String; var id: String { key } }
    var body: some View {
        List {
            Section {
                Picker("폴더", selection: $folder) { ForEach(GitHubFiles.folders, id: \.self) { Text($0) } }.pickerStyle(.segmented).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            }
            if !uploadFailures.isEmpty { Section("업로드 결과") { ForEach(uploadFailures,id:\.self) { Text($0).foregroundStyle(DeskTheme.live) };NavigationLink("대기·실패 파일 확인") { UploadQueueView() };Button("확인한 결과 지우기") { uploadFailures=[] } } }
            Section {
                if store.github == nil { Text("PC desk의 자료 탭에서 GitHub 토큰을 먼저 저장해 주세요.").foregroundStyle(.secondary) }
                else if files.isEmpty && !loading { EmptyHint(icon: "folder", title: "이 폴더에 파일이 없습니다", text: "오른쪽 위 + 로 올리거나, 필기 화면에서 「자료실에 PDF로 저장」하면 여기 쌓입니다.") }
                else if files.isEmpty { Text("불러오는 중…").foregroundStyle(.secondary) }
                ForEach(files) { f in
                    Button { Task { await open(f) } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: icon(f.name)).scaledFont(22).foregroundStyle(DeskTheme.accent).frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) { Text(f.name).scaledFont(15, .medium).lineLimit(2); Text(size(f.size) + (MaterialsCache.cached(f) != nil ? " · 저장됨" : "")).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            if busyFile == f.id { ProgressView() } else { Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary) }
                        }
                    }.buttonStyle(.plain)
                    .contextMenu { if annotatable(f) { Button("필기하기", systemImage: "pencil.tip.crop.circle") { Task { await annotate(f) } } } }
                    .swipeActions(edge: .leading) { if annotatable(f) { Button { Task { await annotate(f) } } label: { Label("필기", systemImage: "pencil.tip") }.tint(DeskTheme.accent) } }
                    .swipeActions(edge: .trailing) { Button(role: .destructive) { Task { await delete(f) } } label: { Label("삭제", systemImage: "trash") } }
                }
            } header: { HStack { Text(files.isEmpty ? "" : "\(files.count)개"); Spacer(); if loading && !files.isEmpty { ProgressView().controlSize(.mini) } } } footer: { if let e = error { Text(e).foregroundStyle(DeskTheme.live) } }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("자료")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { importing = true } label: { Image(systemName: "square.and.arrow.up") }.disabled(store.github == nil) } }
        .refreshable { await load(force: true) }
        .task(id: folder) { files = MaterialsCache.list(folder,repo:store.github?.repo); await load(force: false) }
        .onChange(of: store.github?.repo) { _, _ in files=[];Task { await load(force: true) } }
        .quickLookPreview($preview)
        .sheet(item: $htmlPreview) { u in HTMLPreview(url: u, onAnnotate: { if let f = files.first(where: { MaterialsCache.cached($0) == u }) { htmlPreview = nil; Task { await annotate(f) } } }) }
        .fullScreenCover(item: $ink) { t in DocInkScreen(name: t.name, doc: t.doc, storageKey: t.key, onSave: { data, name in try await save(data, name) }).environmentObject(store) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.item], allowsMultipleSelection: true) { res in Task { await upload(res) } }
    }
    /// 캐시가 있으면 즉시 보여주고 뒤에서 갱신. 5분 안에 받은 목록은 다시 안 받음(당겨서 새로고침은 예외)
    func load(force: Bool) async {
        guard let gh = store.github else { return }
        if !force, let at = MaterialsCache.fetchedAt(folder,repo:gh.repo), Date().timeIntervalSince(at) < 300, !files.isEmpty { return }
        let targetFolder=folder
        loading = true; defer { if folder == targetFolder { loading = false } }
        do { let l = try await gh.list(targetFolder);guard targetFolder == folder,gh.repo == store.github?.repo else { return };files = l; MaterialsCache.save(folder,l,repo:gh.repo); error = nil } catch { self.error = error.localizedDescription; Report.shared.fail("자료 목록", error, show: false) }
    }
    func open(_ f: GHFile) async {
        guard let gh = store.github else { return }
        busyFile = f.id; defer { busyFile = nil }
        do {
            let url: URL
            if let c = MaterialsCache.cached(f) { url = c } else { url = try MaterialsCache.store(f, from: try await gh.download(f)) }
            if ["html", "htm"].contains((f.name as NSString).pathExtension.lowercased()) { htmlPreview = url } else { preview = url }
        } catch { self.error = error.localizedDescription }
    }
    func annotatable(_ f: GHFile) -> Bool { ["pdf", "html", "htm"].contains((f.name as NSString).pathExtension.lowercased()) }
    /// PDF는 바로, HTML은 A4 PDF로 바꿔 필기 화면으로
    func annotate(_ f: GHFile) async {
        guard let gh = store.github else { return }
        busyFile = f.id; defer { busyFile = nil }
        do {
            let url: URL
            if let c = MaterialsCache.cached(f) { url = c } else { url = try MaterialsCache.store(f, from: try await gh.download(f)) }
            let doc: PDFDocument?
            if (f.name as NSString).pathExtension.lowercased() == "pdf" { doc = PDFDocument(url: url) }
            else {
                let cache = url.deletingLastPathComponent().appendingPathComponent(f.name + ".pdf")   // 같은 sha 폴더 → 파일이 바뀌면 자동으로 새로 변환
                if let d = PDFDocument(url: cache), d.pageCount > 0 { doc = d }
                else { let data = try await HTMLToPDF.render(url); try? data.write(to: cache); doc = PDFDocument(data: data) }
            }
            guard let doc, doc.pageCount > 0 else { error = "문서를 열지 못했습니다"; return }
            ink = InkTarget(name: f.name, doc: doc, key: DocInk.key(for: f.path))
        } catch { self.error = error.localizedDescription }
    }
    /// 필기 합친 PDF를 같은 폴더에 저장(있으면 덮어씀)
    func save(_ data: Data, _ name: String) async throws -> MaterialOpener.SaveOutcome {
        guard let gh = store.github else { throw NSError(domain: "desk", code: 2, userInfo: [NSLocalizedDescriptionKey: "자료실 연결이 없습니다"]) }
        let result=try await MaterialOpener.saveOrQueue(data,name:name,folder:folder,gh:gh);await load(force:true);return result
    }
    func delete(_ f: GHFile) async { guard let gh = store.github else { return }; files.removeAll { $0.id == f.id }; do { try await gh.delete(f); MaterialsCache.save(folder,files,repo:gh.repo) } catch { self.error = error.localizedDescription; await load(force: true) } }
    func upload(_ res: Result<[URL], Error>) async {
        guard let gh=store.github,case .success(let urls)=res else { return }
        let targetFolder=folder
        for u in urls {
            guard u.startAccessingSecurityScopedResource() else { uploadFailures.append(u.lastPathComponent+" · 파일 접근 거절");continue }
            defer { u.stopAccessingSecurityScopedResource() }
            do {
                let data=try Data(contentsOf:u)
                let outcome=try await MaterialOpener.saveOrQueue(data,name:u.lastPathComponent,folder:targetFolder,gh:gh)
                if outcome == .queued { uploadFailures.append(u.lastPathComponent+" · 기기에 보관, 전송 대기") }
            } catch { uploadFailures.append(u.lastPathComponent+" · "+error.localizedDescription) }
        }
        await load(force:true)
        store.pendingUploads=UploadQueue.pending().count
    }
    func icon(_ n: String) -> String { let e = (n as NSString).pathExtension.lowercased(); return ["pdf"].contains(e) ? "doc.richtext" : ["png", "jpg", "jpeg", "heic"].contains(e) ? "photo" : ["ppt", "pptx"].contains(e) ? "rectangle.on.rectangle" : ["doc", "docx", "hwp", "hwpx"].contains(e) ? "doc.text" : ["xlsx", "csv"].contains(e) ? "tablecells" : ["html", "htm"].contains(e) ? "globe" : "doc" }
    func size(_ b: Int) -> String { b < 1024 ? "\(b) B" : b < 1_048_576 ? String(format: "%.0f KB", Double(b) / 1024) : String(format: "%.1f MB", Double(b) / 1_048_576) }
}

/// 목록·파일 캐시 — 목록은 UserDefaults(JSON), 파일은 Caches/materials/<sha>/<name>
enum MaterialsCache {
    static let dir: URL = (TestRuntime.isTesting ? TestRuntime.directory : FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]).appendingPathComponent("materials",isDirectory:true)
    static var defaults: UserDefaults { TestRuntime.isTesting ? TimetableStore.testDefaults : .standard }
    static func identity(_ parts: [String]) -> String { SHA256.hash(data:Data(parts.joined(separator:"\u{0}").utf8)).map { String(format:"%02x",$0) }.joined() }
    static func list(_ folder: String, repo: String?) -> [GHFile] {
        guard let repo,let d=defaults.data(forKey:"mat-list-v2-"+identity([repo,folder])),let arr=try? JSONSerialization.jsonObject(with:d) as? [[String:Any]] else { return [] }
        return arr.compactMap { f in guard let n=f["name"] as? String,let p=f["path"] as? String,let sha=f["sha"] as? String else { return nil };return GHFile(name:n,path:p,sha:sha,size:f["size"] as? Int ?? 0,downloadURL:nil,repo:repo) }
    }
    static func save(_ folder: String, _ files: [GHFile], repo: String) {
        let arr=files.map { ["name":$0.name,"path":$0.path,"sha":$0.sha,"size":$0.size] as [String:Any] }
        defaults.set(try? JSONSerialization.data(withJSONObject:arr),forKey:"mat-list-v2-"+identity([repo,folder]))
        defaults.set(Date(),forKey:"mat-at-v2-"+identity([repo,folder]))
    }
    static func fetchedAt(_ folder: String, repo: String) -> Date? { defaults.object(forKey:"mat-at-v2-"+identity([repo,folder])) as? Date }
    static func location(_ f: GHFile) -> URL? {
        guard let repo=f.repo,!f.name.contains("/"),f.name != ".",f.name != ".." else { return nil }
        return dir.appendingPathComponent(identity([repo,f.path,f.sha]),isDirectory:true).appendingPathComponent(f.name)
    }
    static func cached(_ f: GHFile) -> URL? { guard let u=location(f),FileManager.default.fileExists(atPath:u.path) else { return nil };return u }
    static func store(_ f: GHFile, from tmp: URL) throws -> URL {
        guard let u=location(f) else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at:u.deletingLastPathComponent(),withIntermediateDirectories:true)
        try Data(contentsOf:tmp).write(to:u,options:.atomic);try? FileManager.default.removeItem(at:tmp);return u
    }
}

/// 화면 확인용 샘플 학습지 — UITEST_HTML=1 로 앱을 띄울 때만 쓴다(확대 금지 설정을 일부러 넣어 둠)
enum HTMLPreviewSample {
    static func make() -> URL? {
        let html = """
        <!doctype html><html lang="ko"><head><meta charset="utf-8">
        <meta name="viewport" content="width=794, initial-scale=1, user-scalable=no, maximum-scale=1">
        <style>body{font-family:-apple-system,sans-serif;margin:0;padding:28px;width:794px}h1{font-size:30px;margin:0 0 6px}
        table{border-collapse:collapse;width:100%;margin-top:14px}td,th{border:1px solid #999;padding:8px 10px;font-size:15px}</style>
        </head><body><h1>지형 학습지 — 하천 지형</h1><p>다음 표의 빈칸을 채우시오.</p>
        <table><tr><th>구분</th><th>형성 과정</th><th>대표 사례</th></tr>
        <tr><td>선상지</td><td>산지에서 평지로 나오며 유속이 줄어 퇴적</td><td>사천 곤양천</td></tr>
        <tr><td>범람원</td><td>홍수 때 넘친 물이 토사를 쌓음</td><td>낙동강 중·하류</td></tr>
        <tr><td>삼각주</td><td>하구에서 유속이 급히 줄어 퇴적</td><td>낙동강 하구</td></tr></table>
        <p>손가락으로 벌려 확대가 되는지 확인해 보세요.</p></body></html>
        """
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("sample-worksheet.html")
        try? html.write(to: u, atomically: true, encoding: .utf8)
        return u
    }
}

/// HTML 자료 미리보기 — 웹뷰 (QuickLook은 HTML을 제대로 못 그림)
struct HTMLPreview: View {
    let url: URL
    var onAnnotate: (() -> Void)? = nil
    @Environment(\.dismiss) var dismiss
    @State private var presentationOwner = UUID()
    @State private var chrome = true   // 가로에서는 숨겨 전체 화면(전자칠판 미러링), 화면을 한 번 누르면 다시 보임
    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height, full = wide && !chrome
            NavigationStack {
                FileWebView(url: url,presentationOwner:presentationOwner)
                    .ignoresSafeArea(edges: full ? .all : .bottom)
                    .simultaneousGesture(TapGesture().onEnded { if wide { withAnimation(.easeInOut(duration: 0.2)) { chrome.toggle() } } })
                    .navigationTitle(url.lastPathComponent).navigationBarTitleDisplayMode(.inline)
                    .toolbar(full ? .hidden : .visible, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                        ToolbarItemGroup(placement: .topBarTrailing) {
                            if let onAnnotate { Button { onAnnotate() } label: { Image(systemName: "pencil.tip.crop.circle") } }
                            ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                        }
                    }
            }
            .statusBarHidden(full)
            .onChange(of: wide) { _, w in chrome = !w }   // 가로로 돌리면 자동 전체 화면, 세로로 돌아오면 원래대로
        }
        .onAppear { PresentationState.shared.begin(presentationOwner);UIApplication.shared.isIdleTimerDisabled = true }    // 미러링 중 화면이 꺼지지 않게
        .onDisappear { PresentationState.shared.clear(owner:presentationOwner);UIApplication.shared.isIdleTimerDisabled = false }
    }
}
struct FileWebView: UIViewRepresentable {
    let url: URL
    let presentationOwner: UUID
    func makeCoordinator() -> Coordinator { Coordinator(owner:presentationOwner) }
    final class Coordinator: NSObject {
        let owner: UUID
        var timer: Timer?
        var capturing=false
        init(owner: UUID) { self.owner=owner }
        func start(_ web: WKWebView) {
            timer=Timer.scheduledTimer(withTimeInterval:0.3,repeats:true) { [weak self,weak web] _ in
                guard let self,let web,!self.capturing else { return }
                let state=PresentationState.shared
                guard state.owns(self.owner),state.externalConnected,!state.suspended,web.bounds.width>0,web.bounds.height>0 else { return }
                self.capturing=true
                let config=WKSnapshotConfiguration();config.rect=web.bounds
                web.takeSnapshot(with:config) { [weak self] image,_ in
                    guard let self else { return };self.capturing=false
                    guard let image else { return }
                    state.show(background:image,size:image.size,drawing:PKDrawing(),owner:self.owner)
                }
            }
        }
        deinit { timer?.invalidate() }
    }
    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        // 문서가 확대를 막아 두었으면(user-scalable=no) 풀어 준다 — 칠판에 띄워 키워 보기 위해. 폭·배치는 건드리지 않는다
        let js = "var m=document.querySelector('meta[name=viewport]'); if(m){var c=m.getAttribute('content')||''; m.setAttribute('content', c.replace(/user-scalable\\s*=\\s*(no|0)/gi,'user-scalable=yes').replace(/maximum-scale\\s*=\\s*[\\d.]+/gi,'maximum-scale=5'));}"
        cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        if TestRuntime.isTesting { cfg.websiteDataStore = .nonPersistent() }
        let w = WKWebView(frame: .zero, configuration: cfg)
        if TestRuntime.isTesting {
            let html=(try? String(contentsOf:url,encoding:.utf8)) ?? ""
            w.loadHTMLString("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">"+html,baseURL:nil)
        } else { w.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) }
        context.coordinator.start(w)
        return w
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) { coordinator.timer?.invalidate();coordinator.timer=nil;uiView.stopLoading() }
}
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
