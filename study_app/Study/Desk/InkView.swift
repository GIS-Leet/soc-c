// 노트 손글씨 페이지 — PencilKit 캔버스(펜·형광펜·지우개·올가미·자), 여러 페이지, 자동 저장. iPad에선 Apple Pencil·팜 리젝션 자동
// 저장: desk/ink/{noteID}/{p1…} = {data: zlib+base64(PKDrawing), updatedAt}, 미리보기 desk/ink-preview/{noteID}/{p1…} = {jpg, updatedAt}
import SwiftUI
import PencilKit
import PhotosUI
import UIKit

enum InkCodec {
    static let pageSize = CGSize(width: 768, height: 1024)   // 세로 A4 비율
    static func encode(_ drawing: PKDrawing) throws -> String { try (drawing.dataRepresentation() as NSData).compressed(using: .zlib).base64EncodedString() }
    static func decode(_ s: String) throws -> PKDrawing {
        guard let z = Data(base64Encoded: s) else { throw NSError(domain: "Ink", code: 1, userInfo: [NSLocalizedDescriptionKey: "손글씨 데이터가 깨졌습니다"]) }
        return try PKDrawing(data: (z as NSData).decompressed(using: .zlib) as Data)
    }
    static func key(_ n: Int) -> String { "p\(n)" }
    static func number(_ key: String) -> Int { Int(key.dropFirst()) ?? 0 }
    static func sorted(_ keys: [String]) -> [String] { keys.sorted { number($0) < number($1) } }
    static func nextKey(_ keys: [String]) -> String { key((keys.map(number).max() ?? 0) + 1) }
    /// 미리보기 JPEG(흰 바탕, 0.3배)
    static func preview(_ drawing: PKDrawing) -> Data? {
        let r = CGRect(origin: .zero, size: pageSize), scale: CGFloat = 0.3
        let img = drawing.image(from: r, scale: scale)
        let out = UIGraphicsImageRenderer(size: CGSize(width: pageSize.width * scale, height: pageSize.height * scale)).image { ctx in
            UIColor.white.setFill(); ctx.fill(CGRect(origin: .zero, size: ctx.format.bounds.size)); img.draw(in: CGRect(origin: .zero, size: ctx.format.bounds.size))
        }
        return out.jpegData(compressionQuality: 0.6)
    }
}

/// 노트 편집 화면 아래 손글씨 페이지 띠
struct InkPagesSection: View {
    let noteID: String
    @EnvironmentObject var store: DeskStore
    @State private var previews: [(key: String, image: UIImage)] = []
    @State private var open: Int? = nil     // 열 페이지 번호(0부터), -1 = 새 페이지
    @State private var loaded = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Eyebrow(text: "손글씨", trailing: previews.isEmpty ? nil : "\(previews.count)쪽")
                Button { open = -1 } label: { Label("페이지 추가", systemImage: "pencil.tip.crop.circle.badge.plus").scaledFont(13, .semibold) }.buttonStyle(.plain).foregroundStyle(DeskTheme.accent)
            }
            if !previews.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(previews.enumerated()), id: \.element.key) { i, p in
                            Image(uiImage: p.image).resizable().aspectRatio(InkCodec.pageSize.width / InkCodec.pageSize.height, contentMode: .fit).frame(height: 120)
                                .clipShape(RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
                                .overlay(alignment: .bottomTrailing) { Text("\(i + 1)").scaledFont(10, .bold).padding(4).background(.ultraThinMaterial, in: Capsule()).padding(4) }
                                .onTapGesture { open = i }
                        }
                    }
                }
            } else if loaded { Text("Apple Pencil이나 손가락으로 쓰는 페이지를 붙일 수 있습니다.").font(.footnote).foregroundStyle(.secondary) }
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .task { if !loaded { previews = await store.loadInkPreviews(noteID); loaded = true } }
        .fullScreenCover(item: $open) { idx in InkCanvasScreen(noteID: noteID, startIndex: idx).environmentObject(store) }
        .onChange(of: open) { _, v in if v == nil { Task { previews = await store.loadInkPreviews(noteID) } } }
    }
}

/// 전체 화면 캔버스 + 페이지 넘김
struct InkCanvasScreen: View {
    let noteID: String; let startIndex: Int
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) private var dismiss
    @State private var pages: [InkPage] = []
    @State private var index = 0
    @State private var loading = true
    @State private var dirty: Set<String> = []
    @State private var flushing = false
    @State private var loadFailed = false
    @Environment(\.scenePhase) private var phase
    @State private var saveTask: Task<Void, Never>?
    @AppStorage("inkFinger") private var finger = UIDevice.current.userInterfaceIdiom == .phone   // iPhone은 손가락, iPad는 Pencil 기본
    @State private var confirmDelete = false
    @StateObject private var tools = InkController()
    @ObservedObject private var pres = PresentationState.shared
    @State private var presentationOwner = UUID()
    @State private var showGrid = false
    @State private var slideDir = 0
    @StateObject private var thumbs = ThumbCache()
    @State private var showNewPage = false; @State private var showManage = false
    @State private var photos: [PhotosPickerItem] = []; @State private var importingPDF = false
    @State private var exportURL: URL? = nil; @State private var busy = false
    @State private var textEdit: TextEditTarget? = nil
    @State private var objectPhotos: [PhotosPickerItem] = []
    @State private var ocrText: String? = nil
    struct TextEditTarget: Identifiable { let id: String; let obj: InkObject?; let at: CGPoint }
    var body: some View {
        NavigationStack {
            Group {
                if loading { ProgressView("손글씨 불러오는 중…") }
                else if pages.isEmpty { ContentUnavailableView("페이지 없음", systemImage: "pencil.tip") }
                else {
                    PKCanvasRepresentable(drawing: Binding(get: { pages[index].drawing }, set: { pages[index].drawing = $0; markDirty(); pres.update(drawing: $0, owner: presentationOwner) }), fingerDraws: finger, pageKey: pages[index].key + "-\(Int(pages[index].size.width))", pageSize: pages[index].size, background: PaperRenderer.background(for: pages[index]), controller: tools,
                                          objects: pages[index].objects, onObjects: { pages[index].objects = $0; markDirty() }, onEditText: { textEdit = TextEditTarget(id: $0.id, obj: $0, at: .zero) }, onAddText: { textEdit = TextEditTarget(id: "new", obj: nil, at: $0) }, onPageSwipe: { go($0) })
                        .modifier(PageSlide(index: index, direction: slideDir))
                        .ignoresSafeArea(edges: .bottom)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { if !loading && !tools.systemPalette && !pres.hideChrome { InkToolbar(c: tools) } }
            .toolbar(pres.hideChrome ? .hidden : .visible, for: .navigationBar)
            .overlay(alignment: .bottomLeading) { if pres.hideChrome { PresentationExitButton() } }
            .statusBarHidden(pres.hideChrome)
            .background(DeskTheme.canvas)
            .navigationTitle(pages.isEmpty ? "손글씨" : "").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("완료") { Task { do { try await flushLocal(); dismiss() } catch { store.error = "필기 저장 실패 · 재시도 필요" } } } }
                ToolbarItem(placement: .principal) { if !pages.isEmpty { PageTitleButton(index: index, count: pages.count) { showGrid = true } } }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if !loadFailed {
                    Button { go(-1) } label: { Image(systemName: "chevron.left") }.disabled(index <= 0)
                    Button { go(1) } label: { Image(systemName: "chevron.right") }.disabled(index >= pages.count - 1)
                    Button { showGrid = true } label: { Image(systemName: "square.grid.2x2") }.disabled(pages.isEmpty)
                    Button { showNewPage = true } label: { Image(systemName: "plus.rectangle.portrait") }
                    Menu {
                        Section("페이지") {
                            Button("페이지 관리 (순서·복제·회전)", systemImage: "list.bullet.rectangle") { Task { do { try await flushLocal(); showManage = true } catch { store.error = error.localizedDescription } } }
                            PhotosPicker(selection: $photos, maxSelectionCount: 20, matching: .images) { Label("사진 가져오기", systemImage: "photo") }
                            Button("PDF 가져오기", systemImage: "doc") { importingPDF = true }
                            Button(pages.indices.contains(index) && pages[index].bookmark ? "북마크 해제" : "북마크", systemImage: "bookmark") { if pages.indices.contains(index) { pages[index].bookmark.toggle(); dirty.insert(pages[index].key); flush() } }
                            Button("PDF로 공유", systemImage: "square.and.arrow.up") { Task { do { try await flushLocal(); let u = FileManager.default.temporaryDirectory.appendingPathComponent("손글씨.pdf"); try InkExport.pdf(pages).write(to: u, options: .atomic); exportURL = u } catch { store.error = error.localizedDescription } } }
                        }
                        Section("개체") {
                            Button("텍스트 상자 추가", systemImage: "textbox") { tools.tool = .object; textEdit = TextEditTarget(id: "new", obj: nil, at: CGPoint(x: 80, y: 120)) }
                            PhotosPicker(selection: $objectPhotos, maxSelectionCount: 1, matching: .images) { Label("사진 붙이기", systemImage: "photo.on.rectangle") }
                            Button("손글씨 → 텍스트", systemImage: "text.viewfinder") { if pages.indices.contains(index) { Task { ocrText = await InkOCR.recognize(pages[index].drawing, size: pages[index].size) } } }
                        }
                        Toggle("손가락으로 그리기", isOn: $finger)
                        Toggle("시스템 팔레트 쓰기", isOn: $tools.systemPalette)
                        Toggle("도형 인식 (끝에서 멈추면 반듯하게)", isOn: $tools.shapes)
                        Toggle("형광펜 직선 긋기", isOn: $tools.markerStraight)
                        Divider()
                        Button("발표 모드 (도구 숨기기)", systemImage: "play.rectangle") { pres.hideChrome = true }
                        if pres.externalConnected { Label("외부 화면에 페이지 표시 중", systemImage: "tv").foregroundStyle(.secondary) }
                        Button("이 페이지 필기 지우기", systemImage: "eraser", role: .destructive) { if pages.indices.contains(index) { pages[index].drawing = PKDrawing(); pages[index].objects = []; markDirty() } }.disabled(pages.isEmpty)
                        Button("이 페이지 삭제", systemImage: "trash", role: .destructive) { confirmDelete = true }.disabled(pages.isEmpty)
                    } label: { Image(systemName: "ellipsis.circle") }
                    }
                }
            }
            .confirmationDialog("이 페이지를 삭제할까요?", isPresented: $confirmDelete, titleVisibility: .visible) { Button("삭제", role: .destructive) { deletePage() } }
            .sheet(isPresented: $showGrid) {
                PageGridSheet(count: pages.count, current: index, pageSize: { pages.indices.contains($0) ? pages[$0].size : InkCodec.pageSize }, background: { i in pages.indices.contains(i) ? PaperRenderer.background(for: pages[i]) : nil }, drawing: { pages.indices.contains($0) ? pages[$0].drawing : PKDrawing() }, bookmarked: { pages.indices.contains($0) && pages[$0].bookmark }, cache: thumbs) { i in Task { do { try await flushLocal(); index = i } catch { store.error = error.localizedDescription } } }
            }
            .onChange(of: showGrid) { _, open in if open, !pages.isEmpty { let p = pages[index]; thumbs.ensure(index, size: p.size, drawing: p.drawing, background: { _ in PaperRenderer.background(for: p) }) } }
            .sheet(isPresented: $showNewPage) { NewPageSheet { paper, size, tint in insertPage(InkPage(key: "new", drawing: PKDrawing(), paper: paper, size: size, tint: tint)) } }
            .sheet(isPresented: $showManage) { PageManageSheet(pages: pages, cache: thumbs) { newPages in Task { await replaceAll(newPages) } } }
            .sheet(item: $exportURL) { u in ShareSheet(items: [u]) }
            .sheet(item: $textEdit) { t in
                TextObjectSheet(text: t.obj?.text ?? "", fontSize: t.obj?.fontSize ?? 22, color: Color(UIColor(hex: t.obj?.color) ?? .black)) { text, size, color in
                    var objs = pages[index].objects
                    if let o = t.obj, let i = objs.firstIndex(where: { $0.id == o.id }) { objs[i].text = text; objs[i].fontSize = size; objs[i].color = UIColor(color).hex; objs[i].h = max(objs[i].h, size * 1.6) }
                    else { let w = min(pages[index].size.width - t.at.x - 20, 420); objs.append(InkObject(kind: "text", x: t.at.x, y: t.at.y, w: max(160, w), h: size * 1.6 * Double(max(1, text.split(separator: "\n").count)) + 12, text: text, fontSize: size, color: UIColor(color).hex)) }
                    pages[index].objects = objs; markDirty()
                }
            }
            .sheet(item: Binding(get: { ocrText.map { OCRText(text: $0) } }, set: { if $0 == nil { ocrText = nil } })) { t in OCRSheet(text: t.text) }
            .onChange(of: objectPhotos) { _, items in
                guard let it = items.first else { return }
                Task { if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    let maxW = min(pages[index].size.width * 0.6, 640), k = min(1, maxW / img.size.width), size = CGSize(width: img.size.width * k, height: img.size.height * k)
                    let small = UIGraphicsImageRenderer(size: size).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
                    pages[index].objects.append(InkObject(kind: "image", x: 60, y: 100, w: size.width, h: size.height, image: small.jpegData(compressionQuality: 0.7)?.base64EncodedString())); tools.tool = .object; markDirty() }
                    objectPhotos = [] }
            }
            .fileImporter(isPresented: $importingPDF, allowedContentTypes: [.pdf]) { r in
                guard case .success(let u) = r, u.startAccessingSecurityScopedResource() else { return }
                let imported = PageImport.pages(fromPDF: u, startKey: 1); u.stopAccessingSecurityScopedResource()
                Task { await insertPages(imported) }
            }
            .onChange(of: photos) { _, items in
                guard !items.isEmpty else { return }
                Task { var new: [InkPage] = []; for it in items { if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { new.append(PageImport.page(from: img, key: "img")) } }; photos = []; await insertPages(new) }
            }
        }
        .task {
            pres.begin(presentationOwner)
            do { pages = try await store.loadInk(noteID) } catch { store.error = "필기를 읽지 못했습니다. 원본을 보존했습니다."; loadFailed = true; loading = false; return }
            if startIndex == -1 || pages.isEmpty {
                let d = UserDefaults.standard
                let size = NewPageSheet.sizes.first { $0.key == (d.string(forKey: "ink.size") ?? "portrait") }?.size ?? InkCodec.pageSize
                pages.append(InkPage(key: InkCodec.nextKey(pages.map(\.key)), drawing: PKDrawing(), paper: Paper(rawValue: d.string(forKey: "ink.paper") ?? "") ?? .blank, size: size, tint: Tint(rawValue: d.string(forKey: "ink.tint") ?? "") ?? .white)); index = pages.count - 1
            }
            else { index = min(startIndex, pages.count - 1) }
            loading = false
            present()
            let snap = pages
            thumbs.prewarm(count: pages.count, size: { snap[$0].size }, drawing: { snap[$0].drawing }, background: { i in PaperRenderer.background(for: snap[i]) })
        }
        .onChange(of: index) { _, _ in present() }
        .disabled(busy || flushing)
        .interactiveDismissDisabled(!dirty.isEmpty)
        .onChange(of: phase) { _, value in if value == .background { flush() } }
        .onDisappear { flush(); pres.clear(owner:presentationOwner) }
    }
    func go(_ d: Int) { Task { do { try await flushLocal(); Haptic.light(); slideDir = d; index = max(0, min(pages.count - 1, index + d)) } catch { store.error = error.localizedDescription } } }
    func present() { guard !pages.isEmpty else { return }; let p = pages[index]; pres.show(background: PaperRenderer.background(for: p), size: p.size, drawing: p.drawing, paper: p.tint.ui, owner:presentationOwner) }
    /// 현재 쪽 뒤에 삽입 → 키 재부여·전체 저장
    func insertPage(_ p: InkPage) { Task { await insertPages([p]) } }
    func insertPages(_ new: [InkPage]) async {
        guard !loadFailed, !new.isEmpty else { return }
        do { try await flushLocal() } catch { store.error = error.localizedDescription; return }; busy = true; defer { busy = false }
        var arr = pages; let at = pages.isEmpty ? 0 : index + 1
        arr.insert(contentsOf: new, at: at)
        do { pages = try await store.saveAllInk(noteID, pages: arr) } catch { store.error = error.localizedDescription; return }; thumbs.invalidate(); index = min(at, pages.count - 1); present()
    }
    func replaceAll(_ new: [InkPage]) async {
        guard !loadFailed else { return }
        busy = true; defer { busy = false }
        let cur = pages.indices.contains(index) ? pages[index].key : nil
        do { pages = try await store.saveAllInk(noteID, pages: new) } catch { store.error = error.localizedDescription; return }; thumbs.invalidate()
        index = max(0, min(pages.count - 1, new.firstIndex { $0.key == cur } ?? index)); if pages.isEmpty { dismiss() } else { present() }
    }
    func deletePage() {
        guard pages.indices.contains(index) else { return }
        let page = pages[index]
        do { try store.deleteInk(noteID, key: page.key, last: pages.count == 1) }
        catch { store.error = error.localizedDescription; return }
        pages.remove(at: index); dirty.remove(page.key); ocrTasks[page.key]?.cancel()
        if pages.isEmpty { dismiss() } else { index = min(index, pages.count - 1) }
    }
    func markDirty() { dirty.insert(pages[index].key); saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .seconds(1.5)); if !Task.isCancelled { flush() } } }
    /// 바뀐 페이지만 저장(빈 페이지는 저장하지 않음)
    func flush() { Task { do { try await flushLocal() } catch { store.error = "필기 저장 실패 · \(error.localizedDescription)" } } }
    func flushLocal() async throws {
        while flushing { try await Task.sleep(for: .milliseconds(30)) }
        flushing = true; defer { flushing = false }
        let changed = pages.filter { dirty.contains($0.key) }
        for page in changed {
            try await store.saveInk(noteID, page: page)
            if pages.first(where: { $0.key == page.key }) == page { dirty.remove(page.key) }
            scheduleOCR(page.key)
        }
    }
    /// 저장 5초 뒤 손글씨 인식 → 페이지 기록·노트 검색용 텍스트
    @State private var ocrTasks: [String: Task<Void, Never>] = [:]
    func scheduleOCR(_ key: String) {
        ocrTasks[key]?.cancel()
        ocrTasks[key] = Task {
            try? await Task.sleep(for: .seconds(5)); guard !Task.isCancelled, let i = pages.firstIndex(where: { $0.key == key }) else { return }
            let snapshot = pages[i]
            let text = await InkOCR.recognize(snapshot.drawing, size: snapshot.size)
            guard !Task.isCancelled, let j = pages.firstIndex(where: { $0.key == key }), pages[j] == snapshot, pages[j].ocr != text else { return }
            pages[j].ocr = text; dirty.insert(key)
            do { try await flushLocal() } catch { store.error = error.localizedDescription; return }
            store.saveInkText(noteID, pages.compactMap(\.ocr).joined(separator: "\n"))
        }
    }
}

/// PKCanvasView 래퍼 — 도구 팔레트, 페이지 크기 고정, 폭에 맞춰 확대.
/// 페이지(흰 종이 또는 PDF 그림)는 캔버스 "뒤"의 형제 뷰로 두고 캔버스의 스크롤·확대를 따라가게 한다
/// (캔버스 안에 넣으면 PencilKit의 그리기 층이 덮고, 확대할 때 따로 움직인다)
struct PKCanvasRepresentable: UIViewRepresentable {
    @Binding var drawing: PKDrawing
    var fingerDraws: Bool
    var pageKey: String = "p1"            // 페이지가 바뀌었는지 판단(그림 비교 대신)
    var pageSize: CGSize = InkCodec.pageSize
    var background: UIImage? = nil     // 자료 필기: PDF 페이지 그림
    var controller: InkController? = nil   // 도구 막대(없으면 시스템 팔레트)
    var objects: [InkObject] = []
    var onObjects: (([InkObject]) -> Void)? = nil
    var onEditText: ((InkObject) -> Void)? = nil
    var onAddText: ((CGPoint) -> Void)? = nil
    var onPageSwipe: ((Int) -> Void)? = nil   // 손가락으로 좌우로 넘기면 ±1
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> Container {
        let box = Container(pageSize: pageSize, background: background)
        let v = box.canvas
        v.delegate = context.coordinator
        v.drawing = drawing
        v.maximumZoomScale = 4
        v.bouncesZoom = true
        v.alwaysBounceHorizontal = true; v.alwaysBounceVertical = true   // 폭 맞춤 상태에서도 손가락 끌기가 인식돼 스와이프로 페이지를 넘길 수 있게
        context.coordinator.key = pageKey
        if let controller { controller.attach(v) }
        else { context.coordinator.picker.setVisible(true, forFirstResponder: v); context.coordinator.picker.addObserver(v); DispatchQueue.main.async { v.becomeFirstResponder() } }
        return box
    }
    /// 같은 캔버스를 계속 쓰고, 페이지가 바뀌면 그림·크기·배경만 갈아 끼운다 (캔버스 재생성은 느림)
    func updateUIView(_ box: Container, context: Context) {
        let v = box.canvas
        context.coordinator.parent = self
        v.drawingPolicy = fingerDraws ? .anyInput : .pencilOnly
        if context.coordinator.key != pageKey {
            context.coordinator.key = pageKey
            box.setPage(size: pageSize, background: background)
            v.drawing = drawing
            v.undoManager?.removeAllActions()
            context.coordinator.strokeCount = drawing.strokes.count
            InkPerf.end("page")
        } else {
            if box.page.image !== background && background != nil { box.page.image = background }   // 배경이 뒤늦게 준비됨
            // 메뉴에서 「필기 지우기」처럼 바깥에서 그림을 바꾼 경우(획 수가 다름) — 그리는 중이 아닐 때만 캔버스에 반영
            if !context.coordinator.editing, drawing.strokes.count != v.drawing.strokes.count, drawing.strokes.count != context.coordinator.strokeCount {
                v.drawing = drawing; v.undoManager?.removeAllActions(); context.coordinator.strokeCount = drawing.strokes.count; controller?.refreshUndo()
            }
        }
        if let controller, controller.canvas !== v { controller.attach(v); box.controller = controller }
        box.laser.isHidden = controller?.tool != .laser
        if box.objects.objects != objects { box.objects.objects = objects }
        box.objects.onChange = onObjects; box.objects.onEditText = onEditText; box.objects.onAddText = onAddText
        let editing = controller?.tool == .object
        if box.objects.editing != editing { box.objects.editing = editing }
        v.isUserInteractionEnabled = !editing
    }
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: PKCanvasRepresentable; let picker = PKToolPicker(); var editing = false; var key = ""; var strokeCount = 0
        init(_ p: PKCanvasRepresentable) { parent = p }
        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) { editing = true }
        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) { editing = false }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            let t0 = CFAbsoluteTimeGetCurrent(); defer { InkPerf.record("stroke", (CFAbsoluteTimeGetCurrent() - t0) * 1000) }
            var d = canvasView.drawing
            // 새 획 하나가 더해졌고 도형 인식이 켜져 있으면 교정
            if let c = parent.controller, d.strokes.count == strokeCount + 1, let last = d.strokes.last, c.tool.isInk, c.shapes || (c.tool == .marker && c.markerStraight),
               let rep = ShapeRecognizer.replacement(for: last, marker: c.tool == .marker && c.markerStraight, requireHold: c.shapes) {
                let old = d; d.strokes[d.strokes.count - 1] = rep
                canvasView.drawing = d
                canvasView.undoManager?.registerUndo(withTarget: canvasView) { $0.drawing = old }
            }
            strokeCount = d.strokes.count
            parent.drawing = d; parent.controller?.refreshUndo()
        }
        func scrollViewDidScroll(_ scrollView: UIScrollView) { (scrollView.superview as? Container)?.syncPage() }
        /// 손가락으로 빠르게 좌우로 끌면(가장자리에서) 페이지 넘김 — 슬라이드 넘기듯
        func scrollViewWillEndDragging(_ sv: UIScrollView, withVelocity v: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
            guard let swipe = parent.onPageSwipe, abs(v.x) > 0.6, abs(v.x) > abs(v.y) * 1.5 else { return }
            let maxX = max(0, sv.contentSize.width - sv.bounds.width + sv.adjustedContentInset.right)
            if v.x > 0, sv.contentOffset.x >= maxX - 2 { swipe(1) }        // 손가락을 왼쪽으로(다음 장 끌어오기) → 다음
            else if v.x < 0, sv.contentOffset.x <= 2 { swipe(-1) }         // 오른쪽으로 → 이전
        }
        func scrollViewDidZoom(_ scrollView: UIScrollView) { (scrollView.superview as? Container)?.syncPage() }
    }
    /// 회색 바탕 + 종이(그림) + 투명 캔버스
    final class Container: UIView, UIPencilInteractionDelegate, UIGestureRecognizerDelegate {
        var pageSize: CGSize
        let page = UIImageView()
        let canvas = PageCanvas()
        let laser = LaserView()
        let objects = ObjectsLayer()
        weak var controller: InkController?
        init(pageSize: CGSize, background: UIImage?) {
            self.pageSize = pageSize
            super.init(frame: .zero)
            backgroundColor = .systemGroupedBackground
            page.image = background; page.backgroundColor = .white; page.contentMode = .scaleToFill
            page.layer.shadowColor = UIColor.black.cgColor; page.layer.shadowOpacity = 0.12; page.layer.shadowRadius = 6; page.layer.shadowOffset = CGSize(width: 0, height: 2)
            addSubview(page)
            objects.pageSize = pageSize; addSubview(objects)
            canvas.pageSize = pageSize
            canvas.contentSize = pageSize
            canvas.backgroundColor = .clear; canvas.isOpaque = false
            canvas.onLayout = { [weak self] in self?.syncPage() }
            canvas.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(canvas)
            laser.isHidden = true; laser.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            laser.toPage = { [weak self] p in guard let s = self else { return p }; let z = s.canvas.zoomScale, o = s.canvas.contentOffset; return CGPoint(x: (p.x + o.x) / z, y: (p.y + o.y) / z) }
            laser.onUpdate = { pts in let p = PresentationState.shared; if p.externalConnected { p.ink.laser = pts } }
            addSubview(laser)
            // 두 손가락 탭 되돌리기, 세 손가락 탭 다시 실행
            for (n, sel) in [(2, #selector(undoTap)), (3, #selector(redoTap))] {
                let g = UITapGestureRecognizer(target: self, action: sel); g.numberOfTouchesRequired = n; g.cancelsTouchesInView = false; g.delegate = self; canvas.addGestureRecognizer(g)
            }
            let pi = UIPencilInteraction(); pi.delegate = self; canvas.addInteraction(pi)
        }
        required init?(coder: NSCoder) { fatalError() }
        @objc func undoTap() { controller?.undo() }
        @objc func redoTap() { controller?.redo() }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }
        func pencilInteractionDidTap(_ interaction: UIPencilInteraction) { controller?.pencilTap() }
        override func layoutSubviews() { super.layoutSubviews(); canvas.frame = bounds; laser.frame = bounds; syncPage() }
        /// 페이지 교체: 크기·배경 바꾸고 폭에 맞춰 다시 확대
        func setPage(size: CGSize, background: UIImage?) {
            pageSize = size; page.image = background
            canvas.pageSize = size; canvas.contentSize = size; objects.pageSize = size
            canvas.refit(); syncPage()
        }
        /// 캔버스의 내용 원점은 bounds 좌표로 -contentOffset 에 있고, 크기는 페이지×확대율
        func syncPage() {
            let z = canvas.zoomScale, o = canvas.contentOffset
            page.frame = CGRect(x: -o.x, y: -o.y, width: pageSize.width * z, height: pageSize.height * z)
            objects.sync(zoom: z, offset: o)
        }
    }
    final class PageCanvas: PKCanvasView {
        var pageSize = InkCodec.pageSize
        var onLayout: (() -> Void)?
        private var fitted = false
        override func layoutSubviews() {
            super.layoutSubviews()
            if bounds.width > 0, !fitted { refit(); fitted = true }
            onLayout?()
        }
        func refit() {
            guard bounds.width > 0 else { return }
            let fit = bounds.width / pageSize.width
            minimumZoomScale = min(fit, bounds.height / pageSize.height) * 0.98
            zoomScale = fit; contentOffset = .zero
        }
    }
}

struct OCRText: Identifiable { let text: String; var id: String { text } }
struct OCRSheet: View {
    let text: String
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView { Text(text.isEmpty ? "인식된 글자가 없습니다" : text).scaledFont(17).frame(maxWidth: .infinity, alignment: .leading).padding() }
                .navigationTitle("손글씨 → 텍스트").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("복사") { UIPasteboard.general.string = text }.disabled(text.isEmpty) } }
        }.presentationDetents([.medium, .large])
    }
}
