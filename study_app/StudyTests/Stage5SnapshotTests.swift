// 5단계 화면 스냅샷(좌석표·공유 화면·할 일 위젯) + 공유 항목 파싱 테스트
import XCTest
import SwiftUI
import CryptoKit
import UniformTypeIdentifiers
import PDFKit
import PencilKit
@testable import Desk

final class Stage5SnapshotTests: XCTestCase {
    let outDir = "/private/tmp/claude-501/-Users-leet/c0d63599-7c64-4eb8-9c7e-c0f8c2a01f9f/scratchpad/widget"
    /// NavigationStack·Form 은 ImageRenderer 가 못 그리므로 UIKit 창에 올려 화면 계층을 그린다
    @MainActor
    func render<V: View>(_ v: V, size: CGSize, name: String) {
        let host = UIHostingController(rootView: v.environment(\.locale, Locale(identifier: "ko_KR")))
        let window = UIWindow(frame: CGRect(origin: .zero, size: size)); window.rootViewController = host; window.makeKeyAndVisible()
        for _ in 0..<10 { RunLoop.main.run(until: Date().addingTimeInterval(0.15)) }
        host.view.setNeedsLayout(); host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        let img = UIGraphicsImageRenderer(size: size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = 2; return f }()).image { ctx in window.layer.render(in: ctx.cgContext) }
        guard let png = img.pngData() else { return XCTFail("render") }
        try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: "\(outDir)/\(name).png", contents: png)
        window.isHidden = true
    }
    @MainActor
    func test_좌석표_화면() throws {
        let store = DeskStore.shared
        let key = ClassCrypto.key(pass: "test-pass", saltB64: Data(repeating: 7, count: 16).base64EncodedString())!
        let names = ["김하늘", "이준서", "박서연", "최민준", "정지우", "강도윤", "윤서아", "임하준", "한지민", "오유진", "서예준", "신수아"]
        var enc: [String: ClassCrypto.Blob] = [:]
        for (i, n) in names.enumerated() {
            var s = Student(id: "s\(i)", num: "\(i + 1)", name: n, note: "", logs: [])
            if i == 2 { s.logs = [StudentLog(id: 0, date: FB.key(Date()), text: "발표 잘함", tag: "관찰")] }
            enc["s\(i)"] = try ClassCrypto.encrypt(s.plain, key: key)
        }
        store.studentsEnc = enc
        var chart = SeatChart(id: "c1", name: "2-3", rows: 4, cols: 5)
        for i in 0..<names.count { chart.seats[i] = "s\(i)" }
        let today = FB.key(Date()); chart.cycle("s1", on: today); chart.cycle("s4", on: today); chart.cycle("s4", on: today)
        store.chartsEnc = ["c1": try ClassCrypto.encrypt(chart.plain, key: key)]
        XCTAssertEqual(store.charts(key: key).first?.seated.count, 12)
        for (mode, name) in [(SeatChartView.Mode.observe, "seat_observe"), (.attend, "seat_attend"), (.arrange, "seat_arrange")] {
            render(NavigationStack { SeatChartView(chartID: "c1", key: key, initialMode: mode) }.environmentObject(store), size: CGSize(width: 393, height: 620), name: name)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: "\(outDir)/seat_attend.png"))
    }
    /// 자료 필기 화면 — PDF 페이지가 캔버스 뒤에 보여야 함(흰 종이로 가려지면 실패)
    @MainActor
    func test_자료_필기_화면() throws {
        let r = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 1280, height: 720))
        let pdf = r.pdfData { ctx in ctx.beginPage(); UIColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 1).setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 1280, height: 720)); ("슬라이드 1 · 수업 범위" as NSString).draw(at: CGPoint(x: 80, y: 80), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 48), .foregroundColor: UIColor.white]) }
        let doc = PDFDocument(data: pdf)!
        let v = DocInkScreen(name: "test.pdf", doc: doc, storageKey: "doc_test").environmentObject(DeskStore.shared)
        render(v, size: CGSize(width: 1194, height: 834), name: "doc_ink")
        PresentationState.shared.hideChrome = true
        render(v, size: CGSize(width: 1194, height: 834), name: "doc_ink_present")
        PresentationState.shared.hideChrome = false
        render(PresentationView(), size: CGSize(width: 1920, height: 1080), name: "external")
        // 페이지 격자
        let many = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 1280, height: 720)).pdfData { ctx in for i in 0..<9 { ctx.beginPage(); UIColor(white: 0.96, alpha: 1).setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 1280, height: 720)); ("슬라이드 \\(i + 1)" as NSString).draw(at: CGPoint(x: 80, y: 80), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 64)]) } }
        let mdoc = PDFDocument(data: many)!
        let cache = ThumbCache()
        cache.prewarm(count: 9, size: { DocInk.pageSize(mdoc, $0) }, drawing: { _ in PKDrawing() }, background: { DocInk.thumb(mdoc, $0) })
        for _ in 0..<10 { RunLoop.main.run(until: Date().addingTimeInterval(0.15)) }
        let grid = PageGridSheet(count: 9, current: 3, pageSize: { DocInk.pageSize(mdoc, $0) }, background: { DocInk.thumb(mdoc, $0) }, drawing: { _ in PKDrawing() }, cache: cache) { _ in }
        render(grid, size: CGSize(width: 1194, height: 834), name: "page_grid")
        XCTAssertEqual(cache.images.count, 9)
        // 가운데 픽셀이 흰색이면 캔버스가 페이지를 가린 것
        let img = UIImage(contentsOfFile: "\(outDir)/doc_ink.png")!.cgImage!
        let px = pixel(img, x: img.width / 2, y: img.height / 2)
        XCTAssertLessThan(px.0, 100, "페이지 배경이 보여야 함(어두운 슬라이드) — 흰색이면 가려짐: \(px)")
    }
    func pixel(_ img: CGImage, x: Int, y: Int) -> (UInt8, UInt8, UInt8) {
        let data = img.dataProvider!.data! as Data; let bpp = img.bitsPerPixel / 8; let i = y * img.bytesPerRow + x * bpp
        return (data[i], data[i + 1], data[i + 2])
    }
    @MainActor
    func test_공유_화면() {
        let url = ShareItems(url: URL(string: "https://www.apple.com/kr/")!, text: nil, title: "Apple (대한민국)")
        render(ShareView(context: nil, preset: url), size: CGSize(width: 393, height: 560), name: "share_note")
        let files = ShareItems(url: nil, text: nil, title: nil, files: [.init(name: "IMG_20260909_151000_1.jpg", data: Data(count: 320_000)), .init(name: "수행평가.pdf", data: Data(count: 2_400_000))])
        render(ShareView(context: nil, preset: files), size: CGSize(width: 393, height: 560), name: "share_files")
        XCTAssertTrue(FileManager.default.fileExists(atPath: "\(outDir)/share_files.png"))
    }
    func test_공유_항목_파싱() async {
        let item = NSExtensionItem()
        item.attributedTitle = NSAttributedString(string: "Apple")
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("share-test.pdf"); try? Data("%PDF-1.4 test".utf8).write(to: tmp)
        let pdf = NSItemProvider(contentsOf: tmp)!; pdf.suggestedName = "share-test"   // 파일 앱처럼 확장자 없는 이름
        item.attachments = [NSItemProvider(item: URL(string: "https://www.apple.com/kr/")! as NSURL, typeIdentifier: UTType.url.identifier),
                            NSItemProvider(item: "안녕" as NSString, typeIdentifier: UTType.plainText.identifier), pdf]
        let out = await ShareItems.load([item])
        XCTAssertEqual(out.url?.host, "www.apple.com"); XCTAssertEqual(out.text, "안녕"); XCTAssertEqual(out.title, "Apple")
        XCTAssertEqual(out.files.map(\.name), ["share-test.pdf"]); XCTAssertEqual(out.files.first?.data.count, 13)
        XCTAssertEqual(out.noteTitle, "Apple"); XCTAssertEqual(out.noteBody, "안녕\n\nhttps://www.apple.com/kr/")
        XCTAssertEqual(ShareItems(text: "첫 줄\n둘째").noteTitle, "첫 줄")
    }
}
