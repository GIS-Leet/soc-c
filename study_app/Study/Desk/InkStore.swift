// 손글씨 저장 — 오프라인 우선. 페이지 기록(그림·종이·크기·배경·개체·북마크·OCR)을 기기에 먼저 쓰고, 큐로 Firebase에 올린다.
// 열 때는 로컬을 즉시 쓰고 원격(최대 4초)을 받아 updatedAt 이 새 쪽으로 합친다
import Foundation
import PencilKit
import UIKit

enum Paper: String, Codable, CaseIterable { case blank, lined, grid, dot, cornell
    var label: String { switch self { case .blank: "무지"; case .lined: "줄"; case .grid: "모눈"; case .dot: "점"; case .cornell: "코넬" } }
}
enum Tint: String, Codable, CaseIterable { case white, ivory, dark
    var label: String { switch self { case .white: "흰색"; case .ivory: "아이보리"; case .dark: "어두움" } }
    var ui: UIColor { switch self { case .white: .white; case .ivory: UIColor(red: 0.99, green: 0.97, blue: 0.91, alpha: 1); case .dark: UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1) } }
    var line: UIColor { self == .dark ? UIColor(white: 1, alpha: 0.16) : UIColor(white: 0, alpha: 0.10) }
}
/// 잉크 외 개체(텍스트 상자·사진). 좌표는 페이지 기준
struct InkObject: Codable, Equatable, Identifiable {
    var id: String = UUID().uuidString.prefix(8).lowercased()
    var kind: String            // text | image
    var x: Double; var y: Double; var w: Double; var h: Double
    var text: String? = nil; var fontSize: Double = 22; var color: String = "000000"
    var image: String? = nil    // JPEG base64
    var rect: CGRect { CGRect(x: x, y: y, width: w, height: h) }
}

struct InkPage: Identifiable, Equatable {
    var key: String
    var drawing: PKDrawing
    var paper: Paper = .blank
    var size: CGSize = InkCodec.pageSize
    var tint: Tint = .white
    var bg: Data? = nil                 // 가져온 사진·PDF 쪽(JPEG)
    var objects: [InkObject] = []
    var bookmark = false
    var ocr: String? = nil
    var updatedAt: Double = 0
    var id: String { key }
    init(key: String, drawing: PKDrawing, paper: Paper = .blank, size: CGSize = InkCodec.pageSize, tint: Tint = .white, bg: Data? = nil) {
        self.key = key; self.drawing = drawing; self.paper = paper; self.size = size; self.tint = tint; self.bg = bg
    }
    static func from(key: String, record r: [String: Any]) -> InkPage? {
        guard let encoded = r["data"] as? String, let drawing = try? InkCodec.decode(encoded) else { return nil }
        var p = InkPage(key: key, drawing: drawing)
        p.paper = Paper(rawValue: r["paper"] as? String ?? "") ?? .blank
        p.tint = Tint(rawValue: r["tint"] as? String ?? "") ?? .white
        let w = FB.ms(r["w"]), h = FB.ms(r["h"]); if w > 0, h > 0 { p.size = CGSize(width: w, height: h) }
        p.bg = (r["bg"] as? String).flatMap { Data(base64Encoded: $0) }
        p.objects = (r["objects"] as? String).flatMap { try? JSONDecoder().decode([InkObject].self, from: Data($0.utf8)) } ?? []
        p.bookmark = r["bookmark"] as? Bool ?? false
        p.ocr = r["ocr"] as? String
        p.updatedAt = FB.ms(r["updatedAt"])
        return p
    }
    /// 저장용 사전 (data 는 미리 압축해 넘김)
    func record(data: String, updatedAt: Double) -> [String: Any] {
        var r: [String: Any] = ["data": data, "updatedAt": updatedAt, "w": Double(size.width), "h": Double(size.height)]
        if paper != .blank { r["paper"] = paper.rawValue }
        if tint != .white { r["tint"] = tint.rawValue }
        if let bg { r["bg"] = bg.base64EncodedString() }
        if !objects.isEmpty, let d = try? JSONEncoder().encode(objects) { r["objects"] = String(decoding: d, as: UTF8.self) }
        if bookmark { r["bookmark"] = true }
        if let ocr, !ocr.isEmpty { r["ocr"] = ocr }
        return r
    }
    /// 90° 시계 방향 회전 (x,y) → (h−y, x)
    func rotated() -> InkPage {
        var p = self; p.size = CGSize(width: size.height, height: size.width)
        p.drawing = drawing.transformed(using: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: size.height, ty: 0))
        p.objects = objects.map { o in var n = o; n.x = size.height - o.y - o.h; n.y = o.x; n.w = o.h; n.h = o.w; return n }
        if let bg, let img = UIImage(data: bg) { p.bg = UIImage(cgImage: img.cgImage!, scale: img.scale, orientation: .right).normalized().jpegData(compressionQuality: 0.8) }
        return p
    }
}
extension UIImage { func normalized() -> UIImage { UIGraphicsImageRenderer(size: size).image { _ in draw(in: CGRect(origin: .zero, size: size)) } } }

/// 종이 템플릿 그림(2배, 캐시)
enum PaperRenderer {
    nonisolated(unsafe) static var cache: [String: UIImage] = [:]
    static func image(_ paper: Paper, size: CGSize, tint: Tint) -> UIImage {
        let k = "\(paper.rawValue)-\(Int(size.width))x\(Int(size.height))-\(tint.rawValue)"
        if let c = cache[k] { return c }
        let f = UIGraphicsImageRendererFormat(); f.scale = 2
        let img = UIGraphicsImageRenderer(size: size, format: f).image { ctx in
            let cg = ctx.cgContext
            tint.ui.setFill(); cg.fill(CGRect(origin: .zero, size: size))
            cg.setStrokeColor(tint.line.cgColor); cg.setLineWidth(1)
            let top: CGFloat = 80, gap: CGFloat = paper == .lined ? 32 : 24
            switch paper {
            case .blank: break
            case .lined: var y = top; while y < size.height - 24 { cg.move(to: CGPoint(x: 40, y: y)); cg.addLine(to: CGPoint(x: size.width - 40, y: y)); y += gap }; cg.strokePath()
            case .grid: var x: CGFloat = 0; while x <= size.width { cg.move(to: CGPoint(x: x, y: 0)); cg.addLine(to: CGPoint(x: x, y: size.height)); x += gap }; var y: CGFloat = 0; while y <= size.height { cg.move(to: CGPoint(x: 0, y: y)); cg.addLine(to: CGPoint(x: size.width, y: y)); y += gap }; cg.strokePath()
            case .dot: cg.setFillColor(tint.line.withAlphaComponent(tint == .dark ? 0.35 : 0.28).cgColor); var y: CGFloat = gap; while y < size.height { var x: CGFloat = gap; while x < size.width { cg.fillEllipse(in: CGRect(x: x - 1.2, y: y - 1.2, width: 2.4, height: 2.4)); x += gap }; y += gap }
            case .cornell:
                let cue = (size.width * 0.3).rounded(), sum = size.height - 150
                cg.setLineWidth(1.5); cg.move(to: CGPoint(x: 0, y: top)); cg.addLine(to: CGPoint(x: size.width, y: top))
                cg.move(to: CGPoint(x: cue, y: top)); cg.addLine(to: CGPoint(x: cue, y: sum)); cg.move(to: CGPoint(x: 0, y: sum)); cg.addLine(to: CGPoint(x: size.width, y: sum)); cg.strokePath()
                cg.setLineWidth(1); var y = top + 32; while y < sum - 8 { cg.move(to: CGPoint(x: cue + 12, y: y)); cg.addLine(to: CGPoint(x: size.width - 24, y: y)); y += 32 }; cg.strokePath()
            }
        }
        cache[k] = img; return img
    }
    /// 페이지의 배경 그림 — 가져온 이미지 > 템플릿. 무지 흰색이면 nil(빈 종이)
    static func background(for p: InkPage) -> UIImage? {
        if let bg = p.bg, let img = UIImage(data: bg) { return img }
        if p.paper == .blank && p.tint == .white { return nil }
        return image(p.paper, size: p.size, tint: p.tint)
    }
}

/// 기기 로컬 저장 + 업로드 큐
enum InkLocal {
    static let root: URL = { if TestRuntime.isTesting { let u=TestRuntime.directory.appendingPathComponent("ink",isDirectory:true);try? FileManager.default.createDirectory(at:u,withIntermediateDirectories:true);return u };let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ink", isDirectory: true); try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true); return u }()
    static func folder(_ key: String) -> URL { let u = root.appendingPathComponent(key, isDirectory: true); try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true); return u }
    static func load(_ key: String) throws -> [String: [String: Any]] {
        var out: [String: [String: Any]] = [:]
        for f in try FileManager.default.contentsOfDirectory(at: folder(key), includingPropertiesForKeys: nil) where f.pathExtension == "json" {
            let data = try Data(contentsOf: f)
            guard let record = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CocoaError(.fileReadCorruptFile) }; out[f.deletingPathExtension().lastPathComponent] = record
        }
        return out
    }
    static func save(_ key: String, _ page: String, _ record: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: record)
        try data.write(to: folder(key).appendingPathComponent(page + ".json"), options: .atomic)
    }
    static func delete(_ key: String, _ page: String) throws {
        let url = folder(key).appendingPathComponent(page + ".json")
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
    static func replaceAll(_ key: String, _ records: [String: [String: Any]]) throws {
        let old = try load(key)
        for (page, record) in records { try save(key, page, record) }
        for (page, record) in old where records[page] == nil && record["data"] != nil { try delete(key, page) }
    }
    typealias Op = DurableWriteQueue.Op
    static let queueURL = root.appendingPathComponent("pending-v2.json")
    static let generation = InkSaveGeneration()
    static var isWriting: Bool { generation.isWriting || !engine.recovery.isEmpty }
    static func resetAfterRestore() throws { try prepare(); try engine.restoreRecords(engine.records()) }
    private static let migrationLock = NSRecursiveLock()
    static let engine = DurableWriteQueue(url: queueURL, send: { operation in
        try TestRuntime.requireLiveAccess()
        let value = try operation.json.map { try JSONSerialization.jsonObject(with: Data($0.utf8), options: [.fragmentsAllowed]) }
        switch operation.method {
        case "put": try await RTDB.put(operation.path, value ?? NSNull())
        case "patch": try await RTDB.patch(operation.path, (value as? [String: Any]) ?? [:])
        case "delete": try await RTDB.delete(operation.path)
        default: throw CocoaError(.coderInvalidValue)
        }
    })
    static func prepare() throws { migrationLock.lock(); defer { migrationLock.unlock() }; try InkQueueMigration.prepare(root: root, queue: engine) }
    static func pending() -> [Op] { (try? prepare()); return ((try? engine.snapshot()) ?? []) + engine.recovery }
    static func setPending(_ operations: [Op]) throws { try prepare(); try engine.replace(operations) }
    static func enqueue(put path: String, _ value: Any) throws { try prepare(); try engine.enqueue("put", path, value) }
    static func enqueue(patch path: String, _ value: [String: Any]) throws { try prepare(); try engine.enqueue("patch", path, value) }
    static func enqueue(delete path: String) throws { try prepare(); try engine.enqueue("delete", path, nil) }
    static var draining: Bool { engine.isDraining }
    static func drain() async {
        guard !TestRuntime.isTesting, !Backup.hasInterruptedRestore else { return }
        do { try prepare(); _ = await engine.drain() }
        catch { Report.note("필기 전송 대기", error.localizedDescription) }
    }
    static var pendingCount: Int { pending().count }

}

struct TimeoutError: Error {}
func withTimeout<T: Sendable>(_ seconds: Double, _ op: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { g in
        g.addTask { try await op() }
        g.addTask { try await Task.sleep(for: .seconds(seconds)); throw TimeoutError() }
        let r = try await g.next()!; g.cancelAll(); return r
    }
}

extension DeskStore {
    /// 로컬 즉시 + 원격 합치기(최대 4초). 원격이 더 새로우면 로컬을 덮어씀
    func loadInk(_ key: String) async throws -> [InkPage] {
        _ = InkLocal.generation.begin(key, "loading"); defer { InkLocal.generation.finish() }
        var records = try InkLocal.load(key)
        guard records.allSatisfy({ InkPage.from(key: $0.key, record: $0.value) != nil }) else { throw CocoaError(.fileReadCorruptFile) }
        do {
            try InkLocal.prepare()
            let prior = try InkLocal.engine.acknowledgedIDs()
            if !TestRuntime.isTesting, let remote = try? await withTimeout(4, { try await RTDB.get("desk/ink/\(key)") }) {
                let raw = FB.dict(remote).compactMapValues { $0 as? [String: Any] }
                try InkLocal.replaceAll(key, raw)
                try InkLocal.engine.confirmServerSnapshot(raw, at: "desk/ink/\(key)", authoritativeAfter: prior)
                records = raw
            }
            records = (try InkLocal.engine.overlay(records, at: "desk/ink/\(key)") as? [String: [String: Any]]) ?? [:]
        } catch { self.error = "필기 복구 확인 필요: \(error.localizedDescription)"; throw error }
        let pages = InkCodec.sorted(Array(records.keys)).compactMap { InkPage.from(key: $0, record: records[$0]!) }
        if pages.count != records.count { self.error = "읽을 수 없는 필기가 있습니다. 손상된 원본은 보존했습니다."; throw CocoaError(.fileReadCorruptFile) }
        return pages
    }
    /// 완료는 원격 ACK가 아니라 큐와 페이지의 로컬 영속 저장을 뜻한다.
    func saveInk(_ key: String, page: InkPage, note: Bool = true, preview: Bool = false, encode: @escaping (PKDrawing) async throws -> String = { drawing in try await Task.detached(priority: .utility) { try InkCodec.encode(drawing) }.value }) async throws {
        let ticket = InkLocal.generation.begin(key, page.key); defer { InkLocal.generation.finish() }
        let now = Date().timeIntervalSince1970 * 1000, drawing = page.drawing
        let data = try await encode(drawing)
        guard InkLocal.generation.current(ticket) else { throw CancellationError() }
        let record = page.record(data: data, updatedAt: now)
        try InkLocal.enqueue(put: "desk/ink/\(key)/\(page.key)", record)
        try InkLocal.save(key, page.key, record)
        if note { try InkLocal.enqueue(patch: "desk/notes/\(key)", ["ink": true, "updatedAt": now]) }
        Task { await InkLocal.drain() }
    }
    func deleteInk(_ key: String, key page: String, last: Bool, note: Bool = true) throws {
        InkLocal.generation.invalidate(key, page)
        try InkLocal.enqueue(delete: "desk/ink/\(key)/\(page)")
        try InkLocal.delete(key, page)
        if note && last { try InkLocal.enqueue(patch: "desk/notes/\(key)", ["ink": false]) }
        Task { await InkLocal.drain() }
    }
    /// 기존 pN 포맷을 유지한다. 새 manifest/기기간 CAS는 별도 이관 전까지 도입하지 않는다.
    func saveAllInk(_ key: String, pages: [InkPage], note: Bool = true) async throws -> [InkPage] {
        InkLocal.generation.invalidateAll(key)
        let ticket = InkLocal.generation.begin(key, "structure"); defer { InkLocal.generation.finish() }
        let now = Date().timeIntervalSince1970 * 1000
        var out: [InkPage] = [], records: [String: [String: Any]] = [:]
        for (index, page) in pages.enumerated() {
            var next = page; next.key = InkCodec.key(index + 1); next.updatedAt = now
            let drawing = next.drawing
            let encoded = try await Task.detached(priority: .utility) { try InkCodec.encode(drawing) }.value
            records[next.key] = next.record(data: encoded, updatedAt: now); out.append(next)
        }
        guard InkLocal.generation.current(ticket) else { throw CancellationError() }
        try InkLocal.enqueue(put: "desk/ink/\(key)", records)
        try InkLocal.replaceAll(key, records)
        if note { try InkLocal.enqueue(patch: "desk/notes/\(key)", ["ink": !pages.isEmpty, "updatedAt": now]) }
        Task { await InkLocal.drain() }; return out
    }
    func saveInkText(_ noteID: String, _ text: String) {
        do { try InkLocal.enqueue(patch: "desk/notes/\(noteID)", ["inkText": String(text.prefix(4000))]); Task { await InkLocal.drain() } }
        catch { self.error = "필기 검색 저장 실패: \(error.localizedDescription)" }
    }
    /// 노트 편집 띠용 작은 미리보기(로컬/원격 합친 페이지를 합성)
    func loadInkPreviews(_ key: String) async -> [(key: String, image: UIImage)] {
        let pages = (try? await loadInk(key)) ?? []
        return await Task.detached(priority: .utility) {
            pages.map { p in
                let w: CGFloat = 240, k = w / p.size.width, target = CGSize(width: w, height: (p.size.height * k).rounded())
                let img = UIGraphicsImageRenderer(size: target).image { ctx in
                    (p.tint.ui).setFill(); ctx.fill(CGRect(origin: .zero, size: target))
                    PaperRenderer.background(for: p)?.draw(in: CGRect(origin: .zero, size: target))
                    if !p.drawing.strokes.isEmpty { p.drawing.image(from: CGRect(origin: .zero, size: p.size), scale: k).draw(in: CGRect(origin: .zero, size: target)) }
                }
                return (p.key, img)
            }
        }.value
    }
}

/// 페이지들(배경 + 개체 + 잉크) → PDF
enum InkExport {
    static func pdf(_ pages: [InkPage]) -> Data {
        guard let first = pages.first else { return Data() }
        return UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: first.size)).pdfData { ctx in
            for p in pages {
                let rect = CGRect(origin: .zero, size: p.size)
                ctx.beginPage(withBounds: rect, pageInfo: [:])
                p.tint.ui.setFill(); ctx.fill(rect)
                PaperRenderer.background(for: p)?.draw(in: rect)
                ObjectRenderer.draw(p.objects, in: ctx.cgContext)
                if !p.drawing.strokes.isEmpty { p.drawing.image(from: rect, scale: 2).draw(in: rect) }
            }
        }
    }
}
/// 개체 그리기(내보내기·썸네일용)
enum ObjectRenderer {
    static func draw(_ objects: [InkObject], in cg: CGContext) {
        for o in objects {
            if o.kind == "image", let s = o.image, let d = Data(base64Encoded: s), let img = UIImage(data: d) { img.draw(in: o.rect) }
            else if o.kind == "text", let t = o.text {
                let para = NSMutableParagraphStyle(); para.lineBreakMode = .byWordWrapping
                (t as NSString).draw(in: o.rect.insetBy(dx: 6, dy: 6), withAttributes: [.font: UIFont.systemFont(ofSize: o.fontSize), .foregroundColor: UIColor(hex: o.color) ?? .black, .paragraphStyle: para])
            }
        }
    }
}
