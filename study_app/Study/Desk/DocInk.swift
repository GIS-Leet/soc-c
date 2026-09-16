// 자료(PDF·HTML)에 손글씨 — PDF 페이지를 배경으로 깐 PencilKit 캔버스. HTML은 A4로 쪽을 나눠 PDF로 바꾼 뒤 같은 방식
// 저장: desk/ink/doc_{경로 해시}/{pN} (노트 손글씨와 같은 형식). 내보내기: 페이지 그림 + 잉크를 합친 PDF → 자료실 「이름-필기.pdf」
import SwiftUI
import PDFKit
import PencilKit
import PhotosUI
import WebKit
import CryptoKit

enum DocInk {
    /// 파일 경로 → 저장 키 (노트 id와 겹치지 않게 doc_ 접두)
    static func key(for path: String) -> String { "doc_" + SHA256.hash(data: Data(path.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined() }
    static func pageSize(_ doc: PDFDocument, _ i: Int) -> CGSize {
        guard let p = doc.page(at: i) else { return InkCodec.pageSize }
        let b = p.bounds(for: .mediaBox); let rot = p.rotation % 180 != 0
        return rot ? CGSize(width: b.height, height: b.width) : b.size
    }
    /// 페이지 배경 그림(2배 해상도, 회전 반영)
    static func render(_ doc: PDFDocument, _ i: Int) -> UIImage? {
        guard let p = doc.page(at: i) else { return nil }
        let s = pageSize(doc, i); return p.thumbnail(of: CGSize(width: s.width * 2, height: s.height * 2), for: .mediaBox)
    }
    /// 격자용 작은 배경(폭 360)
    static func thumb(_ doc: PDFDocument, _ i: Int) -> UIImage? {
        guard let p = doc.page(at: i) else { return nil }
        let s = pageSize(doc, i); return p.thumbnail(of: CGSize(width: 360, height: 360 * s.height / s.width), for: .mediaBox)
    }
    /// 페이지 그림 + 잉크 → PDF 데이터
    static func export(_ doc: PDFDocument, pages: [InkPage]) -> Data {
        let r = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: pageSize(doc, 0)))
        return r.pdfData { ctx in
            for i in 0..<doc.pageCount {
                let size = pageSize(doc, i), rect = CGRect(origin: .zero, size: size)
                ctx.beginPage(withBounds: rect, pageInfo: [:])
                render(doc, i)?.draw(in: rect)
                if let p = pages.first(where: { $0.key == InkCodec.key(i + 1) }) {
                    ObjectRenderer.draw(p.objects, in: ctx.cgContext)
                    if !p.drawing.strokes.isEmpty { p.drawing.image(from: rect, scale: 2).draw(in: rect) }
                }
            }
        }
    }
}

/// 자료 필기 화면 — 페이지 수는 문서에 고정, 잉크만 저장. 내보내기(자료실 저장·공유)
struct DocInkScreen: View {
    let name: String; let doc: PDFDocument; let storageKey: String
    var onSave: ((Data, String) async throws -> MaterialOpener.SaveOutcome)? = nil   // 자료실에 「이름-필기.pdf」 저장(실패는 throw)
    var lesson: LessonContext? = nil                     // 어느 반 몇 차시(오늘 카드에서 열면 채워짐, 없으면 수업 중일 때 시간표로 추정)
    @EnvironmentObject var store: DeskStore
    @State private var edited = false
    @State private var wrap: LessonContext? = nil
    @State private var wrapFinished = false
    @State private var wrapSavedResult: String? = nil
    @State private var flushing = false
    @Environment(\.scenePhase) private var phase
    @State private var overlayKey: String? = nil            // 다른 반 필기 겹쳐 보기
    @State private var overlayPages: [String: InkPage] = [:]
    @State private var overlayCandidates: [String] = []
    @State private var split = false                        // 좌우 분할: 오른쪽에 빈 종이
    @State private var scratch: [InkPage] = []
    @State private var scratchDirty: Set<String> = []
    @State private var continuous = false
    @State private var slideDir = 0   // 페이지 넘김 방향(전환 애니메이션)
    @StateObject private var rec: InkRecorder
    @State private var showRecordings = false
    init(name: String, doc: PDFDocument, storageKey: String, onSave: ((Data, String) async throws -> MaterialOpener.SaveOutcome)? = nil, lesson: LessonContext? = nil) {
        self.name = name; self.doc = doc; self.storageKey = storageKey; self.onSave = onSave; self.lesson = lesson
        _rec = StateObject(wrappedValue: InkRecorder(key: storageKey))
    }
    var baseKey: String { storageKey.replacingOccurrences(of: "-c[0-9]+$", with: "", options: .regularExpression) }
    var scratchKey: String { storageKey + "_scratch" }
    @Environment(\.dismiss) private var dismiss
    @State private var pages: [InkPage] = []
    @State private var index = 0
    @State private var loading = true
    @State private var dirty: Set<String> = []
    @State private var saveTask: Task<Void, Never>?
    @State private var backgrounds: [Int: UIImage] = [:]
    @State private var exportURL: URL? = nil
    @State private var busy = false; @State private var msg: String? = nil
    @AppStorage("inkFinger") private var finger = UIDevice.current.userInterfaceIdiom == .phone
    @StateObject private var tools = InkController()
    @ObservedObject private var pres = PresentationState.shared
    @State private var presentationOwner = UUID()
    @State private var showGrid = false
    @StateObject private var thumbs = ThumbCache()
    @State private var textEdit: InkCanvasScreen.TextEditTarget? = nil
    @State private var objectPhotos: [PhotosPickerItem] = []
    @State private var ocrText: String? = nil
    var exportName: String { ((name as NSString).deletingPathExtension) + "-필기.pdf" }
    var body: some View {
        NavigationStack {
            Group {
                if loading { ProgressView("문서 여는 중…") }
                else {
                    HStack(spacing: 0) {
                    PKCanvasRepresentable(drawing: Binding(get: { pages[index].drawing }, set: { pages[index].drawing = $0; markDirty(); pres.update(drawing: $0, owner: presentationOwner) }), fingerDraws: finger, pageKey: pages[index].key + (overlayKey ?? ""), pageSize: DocInk.pageSize(doc, index), background: displayBackground(index), controller: tools,
                                          objects: pages[index].objects, onObjects: { pages[index].objects = $0; markDirty() }, onEditText: { textEdit = .init(id: $0.id, obj: $0, at: .zero) }, onAddText: { textEdit = .init(id: "new", obj: nil, at: $0) }, onPageSwipe: { go($0) })
                        .ignoresSafeArea(edges: .bottom)
                        .modifier(PageSlide(index: index, direction: slideDir))
                    if split, scratch.indices.contains(index) {
                        Divider()
                        PKCanvasRepresentable(drawing: Binding(get: { scratch[index].drawing }, set: { scratch[index].drawing = $0; scratchDirty.insert(scratch[index].key); saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .seconds(1.5)); if !Task.isCancelled { flush() } } }), fingerDraws: finger, pageKey: "scratch-" + scratch[index].key, pageSize: scratch[index].size, background: PaperRenderer.background(for: scratch[index]), controller: tools)
                            .ignoresSafeArea(edges: .bottom).accessibilityLabel("빈 종이 \(index + 1)")
                    }
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { if !loading && !tools.systemPalette && !pres.hideChrome { InkToolbar(c: tools) } }
            .toolbar(pres.hideChrome ? .hidden : .visible, for: .navigationBar)
            .overlay(alignment: .bottomLeading) { if pres.hideChrome { PresentationExitButton() } }
            .statusBarHidden(pres.hideChrome)
            .background(DeskTheme.canvas)
            .navigationTitle(loading ? name : "").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("완료") { Task { do { try await flushLocal(); if edited, let c = lessonContext { wrap = c } else { dismiss() } } catch { msg = "저장 실패 · 재시도 필요" } } } }
                ToolbarItem(placement: .principal) { if !loading { PageTitleButton(index: index, count: doc.pageCount) { showGrid = true } } }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { go(-1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("이전 쪽").disabled(index <= 0)
                    Button { go(1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("다음 쪽").disabled(index >= doc.pageCount - 1)
                    Button { showGrid = true } label: { Image(systemName: "square.grid.2x2") }.accessibilityLabel("페이지 격자")
                    Menu {
                        Toggle("손가락으로 그리기", isOn: $finger)
                        Toggle("시스템 팔레트 쓰기", isOn: $tools.systemPalette)
                        Toggle("도형 인식 (끝에서 멈추면 반듯하게)", isOn: $tools.shapes)
                        Toggle("형광펜 직선 긋기", isOn: $tools.markerStraight)
                        Section("녹음") {
                            if rec.recording { Button("녹음 정지 (\(InkRecorder.fmt(rec.elapsed)))", systemImage: "stop.circle") { rec.stop() } }
                            else { Button("수업 녹음 시작", systemImage: "record.circle") { Task { await rec.start(page: index) } } }
                            Button("녹음 목록 (\(rec.recordings.count))", systemImage: "waveform") { showRecordings = true }
                        }
                        Section("보기") {
                            Button("이어서 보기 (연속 스크롤)", systemImage: "rectangle.portrait.on.rectangle.portrait") { continuous = true }
                            if UIDevice.current.userInterfaceIdiom == .pad { Toggle("오른쪽에 빈 종이 (좌우 분할)", isOn: $split) }
                            Menu {
                                Button("겹치지 않기") { overlayKey = nil }
                                ForEach(overlayCandidates, id: \.self) { k in Button(InkKeys.label(k, base: baseKey) + " 필기") { Task { await loadOverlay(k) } } }
                                if overlayCandidates.isEmpty { Text("다른 반 필기가 없습니다") }
                            } label: { Label(overlayKey.map { "겹쳐 보는 중: " + InkKeys.label($0, base: baseKey) } ?? "다른 반 필기 겹쳐 보기", systemImage: "square.2.layers.3d") }
                        }
                        Divider()
                        Button("발표 모드 (도구 숨기기)", systemImage: "play.rectangle") { pres.hideChrome = true }
                        if pres.externalConnected { Label("외부 화면에 페이지 표시 중", systemImage: "tv").foregroundStyle(.secondary) }
                        Section("개체") {
                            Button("텍스트 상자 추가", systemImage: "textbox") { tools.tool = .object; textEdit = .init(id: "new", obj: nil, at: CGPoint(x: 80, y: 120)) }
                            PhotosPicker(selection: $objectPhotos, maxSelectionCount: 1, matching: .images) { Label("사진 붙이기", systemImage: "photo.on.rectangle") }
                            Button("손글씨 → 텍스트", systemImage: "text.viewfinder") { if pages.indices.contains(index) { Task { ocrText = await InkOCR.recognize(pages[index].drawing, size: DocInk.pageSize(doc, index)) } } }
                            Button(pages.indices.contains(index) && pages[index].bookmark ? "북마크 해제" : "북마크", systemImage: "bookmark") { if pages.indices.contains(index) { pages[index].bookmark.toggle(); markDirty(); flush() } }
                        }
                        if onSave != nil { Button("자료실에 PDF로 저장", systemImage: "square.and.arrow.down") { Task { await export(save: true) } } }
                        Button("PDF 공유", systemImage: "square.and.arrow.up") { Task { await export(save: false) } }
                        Button("이 페이지 필기 지우기", systemImage: "eraser", role: .destructive) { if pages.indices.contains(index) { pages[index].drawing = PKDrawing(); pages[index].objects = []; markDirty(); flush() } }
                    } label: { if busy { ProgressView() } else { Image(systemName: "ellipsis.circle") } }
                }
                if let m = msg { ToolbarItem(placement: .principal) { Text(m).font(.caption).foregroundStyle(.secondary) } }
            }
            .sheet(item: $exportURL) { u in ShareSheet(items: [u]) }
            .sheet(isPresented: $showRecordings) { RecordingsSheet(rec: rec) }
            .overlay(alignment: .bottom) { if rec.recording || rec.playing != nil { RecordingBar(rec: rec).padding(.bottom, 12) } }
            .onChange(of: index) { _, i in rec.mark(page: i) }
            .onAppear { rec.onPage = { i in if i != index, i >= 0, i < doc.pageCount { changePage(i) } } }
            .sheet(isPresented: $continuous) { ContinuousPagesSheet(count: doc.pageCount, pageSize: { DocInk.pageSize(doc, $0) }, image: { DocInk.thumb(doc, $0) }, drawing: { pages.indices.contains($0) ? pages[$0].drawing : PKDrawing() }) { i in changePage(i) } }
            .onChange(of: split) { _, on in if on && scratch.isEmpty { Task { await loadScratch() } } }
            .sheet(item: $wrap, onDismiss: { if wrapFinished { dismiss() } }) { c in
                LessonWrapSheet(ctx: c, canSave: onSave != nil, cls: store.progress.classes.first { $0.id == c.classID }, total: store.progress.lessons.count) { save, step in
                    try await flushLocal()
                    var result = wrapSavedResult ?? "기기에 필기 보관"
                    if save && wrapSavedResult == nil { result = try await exportResult(save: true, name: c.fileName); wrapSavedResult = result }
                    if step { try LessonCompletion.enqueue(c);Task { await store.drainQueue() };result += " · 진도 전송 대기" }
                    wrapFinished=true;return result
                }
            }
            .sheet(item: $textEdit) { t in
                TextObjectSheet(text: t.obj?.text ?? "", fontSize: t.obj?.fontSize ?? 22, color: Color(UIColor(hex: t.obj?.color) ?? .black)) { text, size, color in
                    var objs = pages[index].objects
                    if let o = t.obj, let i = objs.firstIndex(where: { $0.id == o.id }) { objs[i].text = text; objs[i].fontSize = size; objs[i].color = UIColor(color).hex; objs[i].h = max(objs[i].h, size * 1.6) }
                    else { objs.append(InkObject(kind: "text", x: t.at.x, y: t.at.y, w: 360, h: size * 1.6 * Double(max(1, text.split(separator: "\n").count)) + 12, text: text, fontSize: size, color: UIColor(color).hex)) }
                    pages[index].objects = objs; markDirty()
                }
            }
            .sheet(item: Binding(get: { ocrText.map { OCRText(text: $0) } }, set: { if $0 == nil { ocrText = nil } })) { t in OCRSheet(text: t.text) }
            .onChange(of: objectPhotos) { _, items in
                guard let it = items.first else { return }
                Task { if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    let ps = DocInk.pageSize(doc, index), maxW = min(ps.width * 0.5, 640), k = min(1, maxW / img.size.width), size = CGSize(width: img.size.width * k, height: img.size.height * k)
                    let small = UIGraphicsImageRenderer(size: size).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
                    pages[index].objects.append(InkObject(kind: "image", x: 60, y: 100, w: size.width, h: size.height, image: small.jpegData(compressionQuality: 0.7)?.base64EncodedString())); tools.tool = .object; markDirty() }
                    objectPhotos = [] }
            }
            .sheet(isPresented: $showGrid) {
                PageGridSheet(count: doc.pageCount, current: index, pageSize: { DocInk.pageSize(doc, $0) }, background: { DocInk.thumb(doc, $0) }, drawing: { pages.indices.contains($0) ? pages[$0].drawing : PKDrawing() }, bookmarked: { pages.indices.contains($0) && pages[$0].bookmark }, cache: thumbs) { i in changePage(i) }
            }
        }
        .onChange(of: showGrid) { _, open in if open { refreshThumb() } }
        .task {
            pres.begin(presentationOwner)
            let restored: [InkPage]
            do { restored = try await store.loadInk(storageKey) }
            catch { msg = "필기를 읽지 못했습니다. 원본을 보존했습니다."; return }
            let saved = Dictionary(uniqueKeysWithValues: restored.map { ($0.key, $0) })
            pages = (0..<doc.pageCount).map { i in var p = saved[InkCodec.key(i + 1)] ?? InkPage(key: InkCodec.key(i + 1), drawing: PKDrawing()); p.size = DocInk.pageSize(doc, i); return p }
            backgrounds[0] = DocInk.render(doc, 0)   // 첫 쪽은 바로
            Task { overlayCandidates = await InkKeys.candidates(base: baseKey, current: storageKey) }
            loading = false
            present(); prefetch()
            thumbs.prewarm(count: doc.pageCount, size: { DocInk.pageSize(doc, $0) }, drawing: { pages[$0].drawing }, background: { DocInk.thumb(doc, $0) })
        }
        .onChange(of: index) { _, _ in present(); prefetch() }
        .disabled(busy || flushing)
        .interactiveDismissDisabled(!dirty.isEmpty || !scratchDirty.isEmpty)
        .onChange(of: phase) { _, value in if value == .background { flush() } }
        .onDisappear { flush(); pres.clear(owner:presentationOwner); if rec.recording { rec.stop() }; rec.stopPlayback() }
    }
    /// 현재·앞뒤 2쪽 배경을 뒤에서 미리 그려 둔다(메인 스레드 막지 않음)
    func prefetch() {
        for i in [index, index + 1, index - 1, index + 2, index - 2] where i >= 0 && i < doc.pageCount && backgrounds[i] == nil {
            Task.detached(priority: i == index ? .userInitiated : .utility) {
                let img = DocInk.render(doc, i)
                await MainActor.run {
                    backgrounds[i] = img; if backgrounds.count > 9 { backgrounds = backgrounds.filter { abs($0.key - index) <= 3 } }
                    if i == index, pres.owns(presentationOwner), pres.active, pres.background == nil { pres.background = img }   // 외부 화면(전자칠판·AirPlay)에 배경이 늦게 도착하던 문제
                }
            }
        }
    }
    func background(_ i: Int) -> UIImage? { backgrounds[i] ?? DocInk.render(doc, i) }
    func go(_ d: Int) { Haptic.light(); slideDir = d; changePage(max(0, min(doc.pageCount - 1, index + d))) }
    func changePage(_ target: Int) { Task { do { try await flushLocal(); refreshThumb(); index = target } catch { msg = "필기 저장 실패 · 재시도 필요" } } }
    func refreshThumb() { thumbs.ensure(index, size: DocInk.pageSize(doc, index), drawing: pages[index].drawing, background: { DocInk.thumb(doc, $0) }, priority: .utility) }
    func present() {
        guard !pages.isEmpty else { return }
        let bg = backgrounds[index] ?? DocInk.render(doc, index)   // 배경이 아직 없으면 지금 그려서라도 함께 보냄
        if backgrounds[index] == nil { backgrounds[index] = bg }
        pres.show(background: bg, size: DocInk.pageSize(doc, index), drawing: pages[index].drawing, owner:presentationOwner)
    }
    /// 배경 + (겹쳐 보기 켜졌으면) 다른 반 필기 흐리게
    func displayBackground(_ i: Int) -> UIImage? {
        guard let k = overlayKey, let p = overlayPages[InkCodec.key(i + 1)] else { return backgrounds[i] }
        return InkOverlay.compose(backgrounds[i] ?? DocInk.render(doc, i), size: DocInk.pageSize(doc, i), overlay: p.drawing)
    }
    func loadOverlay(_ key: String) async {
        guard let ps = try? await store.loadInk(key) else { msg = "겹쳐 볼 필기를 읽지 못했습니다."; return }; overlayPages = Dictionary(uniqueKeysWithValues: ps.map { ($0.key, $0) }); overlayKey = key
    }
    func loadScratch() async {
        guard var ps = try? await store.loadInk(scratchKey) else { msg = "빈 종이 필기를 읽지 못했습니다."; return }
        for i in 0..<doc.pageCount where !ps.contains(where: { $0.key == InkCodec.key(i + 1) }) { ps.append(InkPage(key: InkCodec.key(i + 1), drawing: PKDrawing(), paper: .lined, size: DocInk.pageSize(doc, i), tint: .white)) }
        scratch = InkCodec.sorted(ps.map(\.key)).compactMap { k in ps.first { $0.key == k } }
    }
    func markDirty() { wrapSavedResult = nil; edited = true; dirty.insert(pages[index].key); saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .seconds(1.5)); if !Task.isCancelled { flush() } } }
    func flush() { Task { do { try await flushLocal() } catch { msg = "필기 저장 실패 · 재시도 필요" } } }
    func flushLocal() async throws {
        while flushing { try await Task.sleep(for: .milliseconds(30)) }
        flushing = true; defer { flushing = false }
        for page in pages.filter({ dirty.contains($0.key) }) {
            try await store.saveInk(storageKey, page: page, note: false)
            if pages.first(where: { $0.key == page.key }) == page { dirty.remove(page.key) }
        }
        for page in scratch.filter({ scratchDirty.contains($0.key) }) {
            try await store.saveInk(scratchKey, page: page, note: false)
            if scratch.first(where: { $0.key == page.key }) == page { scratchDirty.remove(page.key) }
        }
    }
    /// 수업 맥락: 넘겨받은 것 → 없으면 지금 수업 중인 시간표 칸으로 추정(수업 시간이 아니면 nil)
    var lessonContext: LessonContext? {
        if let lesson { return lesson }
        guard let p = LessonPrep.plan(table: TimetableStore.timetable, progress: store.progress, files: []), p.isNow else { return nil }
        return p.context
    }
    func export(save: Bool, name: String? = nil) async {
        do { msg=try await exportResult(save:save,name:name) } catch { msg="저장 실패 · 재시도 필요";Report.shared.fail("자료실 저장",error) }
    }
    func exportResult(save: Bool, name: String? = nil) async throws -> String {
        try await flushLocal();busy=true;defer {busy=false}
        let data=DocInk.export(doc,pages:pages)
        guard !data.isEmpty else { throw CocoaError(.fileWriteUnknown) }
        if save,let onSave {
            let outcome=try await onSave(data,name ?? exportName)
            return outcome == .uploaded ? "자료실 업로드 완료" : "기기에 보관 · 자료실 전송 대기"
        }
        let url=FileManager.default.temporaryDirectory.appendingPathComponent(exportName)
        try data.write(to:url,options:.atomic);exportURL=url;return "공유 파일 준비됨"
    }

}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// 수업 정리 — 필기본을 자료실 「수업」 폴더에 저장하고 진도를 한 차시 올릴지 묻는다
struct LessonWrapSheet: View {
    let ctx: LessonContext; let canSave: Bool; let cls: ProgressClass?; let total: Int
    let apply: (Bool, Bool) async throws -> String
    @Environment(\.dismiss) private var dismiss
    @State private var save = true; @State private var step = true; @State private var busy = false
    @State private var error: String?
    @State private var result: String?
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(ctx.label).font(.headline); Text(ctx.date.formatted(date: .abbreviated, time: .omitted) + " · " + ctx.room).font(.footnote).foregroundStyle(.secondary) }
                if canSave { Section { Toggle("필기본을 자료실 「수업」에 저장", isOn: $save); Text(ctx.fileName).font(.footnote.monospacedDigit()).foregroundStyle(.secondary) } }
                if let cls,let lesson=ctx.lessonNo { Section { Toggle("\(cls.name) \(lesson)차시까지 완료",isOn:$step).disabled(cls.done >= lesson);Text("같은 수업을 다시 확인해도 진도는 한 번만 반영됩니다.").font(.footnote).foregroundStyle(.secondary) } }
                if let error { Section { Text(error).foregroundStyle(DeskTheme.live);Text("필기본 저장을 끄면 진도만 명시적으로 반영할 수 있습니다.").font(.footnote) } }
                if let result { Section { Text(result).foregroundStyle(DeskTheme.success) } }
            }
            .navigationTitle("수업 정리").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("돌아가기") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button(result != nil ? "닫기" : busy ? "저장 중…" : "확인") { if result != nil { dismiss();return };busy=true;Task { do { result=try await apply(save && canSave,step && cls != nil);error=nil } catch { self.error=error.localizedDescription };busy=false } }.disabled(busy) }
            }
        }.presentationDetents([.medium])
    }
}
extension LessonContext: Identifiable { var id: String { "\(className)-\(FB.key(date))-\(lessonNo ?? 0)" } }
