// 자료 필기 — 저장 키, PDF 내보내기, HTML→PDF 쪽 나눔 테스트
import XCTest
import PDFKit
import PencilKit
@testable import Desk

final class DocInkTests: XCTestCase {
    func samplePDF(pages: Int) -> PDFDocument {
        let r = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 400, height: 600))
        let data = r.pdfData { ctx in for i in 0..<pages { ctx.beginPage(); ("page \\(i + 1)" as NSString).draw(at: CGPoint(x: 40, y: 40), withAttributes: [.font: UIFont.systemFont(ofSize: 24)]) } }
        return PDFDocument(data: data)!
    }
    func test_저장_키와_페이지_크기() {
        XCTAssertTrue(DocInk.key(for: "수업/a.pdf").hasPrefix("doc_")); XCTAssertEqual(DocInk.key(for: "수업/a.pdf").count, 20)
        XCTAssertNotEqual(DocInk.key(for: "수업/a.pdf"), DocInk.key(for: "수업/b.pdf"))
        let d = samplePDF(pages: 2); XCTAssertEqual(DocInk.pageSize(d, 0), CGSize(width: 400, height: 600)); XCTAssertNotNil(DocInk.render(d, 1))
    }
    func test_내보내기_쪽수_유지() {
        let d = samplePDF(pages: 3)
        var pts: [PKStrokePoint] = []
        for i in 0..<20 { pts.append(PKStrokePoint(location: CGPoint(x: 50 + i * 10, y: 300), timeOffset: TimeInterval(i) * 0.01, size: CGSize(width: 4, height: 4), opacity: 1, force: 1, azimuth: 0, altitude: CGFloat.pi / 2)) }
        let stroke = PKStroke(ink: PKInk(.pen, color: .red), path: PKStrokePath(controlPoints: pts, creationDate: Date()))
        let out = DocInk.export(d, pages: [InkPage(key: "p2", drawing: PKDrawing(strokes: [stroke]))])
        let back = PDFDocument(data: out)!
        XCTAssertEqual(back.pageCount, 3); XCTAssertEqual(back.page(at: 0)!.bounds(for: .mediaBox).size, CGSize(width: 400, height: 600))
    }
    @MainActor
    func test_HTML을_쪽_나눈_PDF로() async throws {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("docink-test.html")
        try ("<html><body><h1>제목</h1>" + String(repeating: "<p>본문 문단입니다. 지리학 카드.</p>", count: 120) + "</body></html>").write(to: u, atomically: true, encoding: .utf8)
        let data = try await HTMLToPDF.render(u)
        let doc = PDFDocument(data: data)!
        XCTAssertGreaterThan(doc.pageCount, 1); XCTAssertGreaterThanOrEqual(doc.page(at: 0)!.bounds(for: .mediaBox).width, HTMLToPDF.pageWidth)
        XCTAssertFalse(HTMLToPDF.isBlank(data))
        XCTAssertTrue(HTMLToPDF.isBlank(UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 100, height: 100)).pdfData { $0.beginPage() }))
    }
    /// 실제 자료(스크래치패드에 받아 둔 파일)로 빈 페이지가 아닌지 확인하고 첫 쪽을 PNG로 남김
    @MainActor
    func test_실제_자료_HTML() async throws {
        let dir = "/private/tmp/claude-501/-Users-leet/c0d63599-7c64-4eb8-9c7e-c0f8c2a01f9f/scratchpad"
        for name in ["mat_a.html", "mat_b.html", "mat_c.html"] {
            let u = URL(fileURLWithPath: dir + "/" + name)
            guard FileManager.default.fileExists(atPath: u.path) else { continue }
            let data = try await HTMLToPDF.render(u)
            let doc = PDFDocument(data: data)!
            XCTAssertGreaterThan(doc.pageCount, 0, name); XCTAssertFalse(HTMLToPDF.isBlank(data), name)
            if name == "mat_c.html" { XCTAssertEqual(doc.pageCount, 28); XCTAssertEqual(doc.page(at: 0)!.bounds(for: .mediaBox).size, CGSize(width: 1280, height: 720)) }
            let sz = doc.page(at: 0)!.bounds(for: .mediaBox).size
            let png = doc.page(at: 0)!.thumbnail(of: CGSize(width: 700, height: 700 * sz.height / sz.width), for: .mediaBox).pngData()!
            FileManager.default.createFile(atPath: dir + "/widget/" + name + ".png", contents: png)
            print("PAGES", name, doc.pageCount, doc.page(at: 0)!.bounds(for: .mediaBox).size)
        }
    }
}
