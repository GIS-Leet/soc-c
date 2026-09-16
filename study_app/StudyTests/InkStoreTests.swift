// 오프라인 저장·페이지 기록·종이 템플릿·회전 테스트
import XCTest
import PencilKit
import PDFKit
@testable import Desk

final class InkStoreTests: XCTestCase {
    func test_페이지_기록_왕복() throws {
        var p = InkPage(key: "p3", drawing: PKDrawing(), paper: .cornell, size: CGSize(width: 1024, height: 768), tint: .ivory)
        p.bookmark = true; p.ocr = "지리"; p.objects = [InkObject(kind: "text", x: 10, y: 20, w: 200, h: 60, text: "메모")]
        let rec = p.record(data: try InkCodec.encode(PKDrawing()), updatedAt: 123)
        XCTAssertTrue(JSONSerialization.isValidJSONObject(rec))
        let back = InkPage.from(key: "p3", record: rec)!
        XCTAssertEqual(back.paper, .cornell); XCTAssertEqual(back.tint, .ivory); XCTAssertEqual(back.size, CGSize(width: 1024, height: 768))
        XCTAssertTrue(back.bookmark); XCTAssertEqual(back.ocr, "지리"); XCTAssertEqual(back.objects.first?.text, "메모"); XCTAssertEqual(back.updatedAt, 123)
    }
    func test_회전() {
        var p = InkPage(key: "p1", drawing: PKDrawing(), size: CGSize(width: 800, height: 600))
        p.objects = [InkObject(kind: "text", x: 0, y: 0, w: 100, h: 50, text: "a")]
        let r = p.rotated()
        XCTAssertEqual(r.size, CGSize(width: 600, height: 800)); XCTAssertEqual(r.objects[0].x, 550); XCTAssertEqual(r.objects[0].y, 0); XCTAssertEqual(r.objects[0].w, 50)
    }
    func test_종이_그림과_배경_규칙() {
        for paper in Paper.allCases { XCTAssertEqual(PaperRenderer.image(paper, size: CGSize(width: 200, height: 300), tint: .dark).size, CGSize(width: 200, height: 300)) }
        XCTAssertNil(PaperRenderer.background(for: InkPage(key: "p1", drawing: PKDrawing())))
        XCTAssertNotNil(PaperRenderer.background(for: InkPage(key: "p1", drawing: PKDrawing(), paper: .lined)))
        XCTAssertNotNil(PaperRenderer.background(for: InkPage(key: "p1", drawing: PKDrawing(), tint: .ivory)))
    }
    func test_로컬_저장과_큐() throws {
        let key = "test_\(UUID().uuidString.prefix(6))"
        try InkLocal.save(key, "p1", ["data": "x", "updatedAt": 5.0]); try InkLocal.save(key, "p2", ["data": "y", "updatedAt": 6.0])
        XCTAssertEqual(Set(try InkLocal.load(key).keys), ["p1", "p2"])
        try InkLocal.delete(key, "p1"); XCTAssertEqual(Array(try InkLocal.load(key).keys), ["p2"])
        let audio = InkLocal.folder(key).appendingPathComponent("audio/voice.m4a")
        try FileManager.default.createDirectory(at: audio.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data([1,2,3]).write(to: audio)
        try InkLocal.replaceAll(key, ["p1": ["data": "z", "updatedAt": 7.0]]); XCTAssertEqual(try InkLocal.load(key)["p1"]?["data"] as? String, "z")
        XCTAssertEqual(try Data(contentsOf: audio), Data([1,2,3]))
        let before = InkLocal.pending()
        try InkLocal.enqueue(put: "desk/ink/\(key)/p1", ["a": 1]); try InkLocal.enqueue(put: "desk/ink/\(key)/p1", ["a": 2]); try InkLocal.enqueue(delete: "desk/ink/\(key)/p2")
        let mine = InkLocal.pending().filter { $0.path.contains(key) }
        XCTAssertEqual(mine.count, 3); XCTAssertTrue(mine[0].json!.contains("1")); XCTAssertNotEqual(mine[0].id, mine[1].id)
        try InkLocal.setPending(before); try? FileManager.default.removeItem(at: InkLocal.folder(key))
    }
    func test_PDF_내보내기_쪽_크기() {
        let pages = [InkPage(key: "p1", drawing: PKDrawing(), paper: .grid), InkPage(key: "p2", drawing: PKDrawing(), size: CGSize(width: 1280, height: 720))]
        let doc = PDFDocument(data: InkExport.pdf(pages))!
        XCTAssertEqual(doc.pageCount, 2); XCTAssertEqual(doc.page(at: 1)!.bounds(for: .mediaBox).size, CGSize(width: 1280, height: 720))
    }
    func test_손상필기는정상빈그림으로바뀌지않는다() throws {
        XCTAssertNil(InkPage.from(key: "p1", record: ["data": "corrupt"]))
        let empty = try InkCodec.encode(PKDrawing())
        XCTAssertNotNil(InkPage.from(key: "p1", record: ["data": empty]))
    }

    @MainActor func test_실제저장압축역전과삭제뒤늦은완료를막는다() async throws {
        XCTAssertTrue(TestRuntime.isTesting)
        let key = "test-" + UUID().uuidString, store = DeskStore()
        let before = InkLocal.pending()
        defer { try? InkLocal.setPending(before); try? FileManager.default.removeItem(at: InkLocal.folder(key)) }
        let entered = expectation(description: "compression suspended")
        var resume: CheckedContinuation<String, Error>?
        var first = InkPage(key: "p1", drawing: PKDrawing()); first.ocr = "v1"
        let old = Task { try await store.saveInk(key, page: first, note: false, encode: { _ in
            try await withCheckedThrowingContinuation { resume = $0; entered.fulfill() }
        }) }
        await fulfillment(of: [entered], timeout: 2)
        XCTAssertTrue(InkLocal.isWriting)
        var second = first; second.ocr = "v2"
        try await store.saveInk(key, page: second, note: false)
        resume?.resume(returning: try InkCodec.encode(PKDrawing()))
        do { try await old.value; XCTFail("stale compression must fail") } catch {}
        XCTAssertEqual(try InkLocal.load(key)["p1"]?["ocr"] as? String, "v2")
        let deleted = expectation(description: "delete during compression")
        let late = Task { try await store.saveInk(key, page: first, note: false, encode: { _ in
            try await withCheckedThrowingContinuation { resume = $0; deleted.fulfill() }
        }) }
        await fulfillment(of: [deleted], timeout: 2)
        try store.deleteInk(key, key: "p1", last: true, note: false)
        resume?.resume(returning: try InkCodec.encode(PKDrawing()))
        do { try await late.value; XCTFail("deleted page must not return") } catch {}
        XCTAssertNil(try InkLocal.load(key)["p1"])
    }
    @MainActor func test_압축실패는빈데이터를저장하지않는다() async throws {
        let key = "failure-" + UUID().uuidString, store = DeskStore()
        defer { try? FileManager.default.removeItem(at: InkLocal.folder(key)) }
        do { try await store.saveInk(key, page: InkPage(key: "p1", drawing: PKDrawing()), note: false, encode: { _ in throw CocoaError(.fileWriteUnknown) }); XCTFail("must fail") } catch {}
        XCTAssertNil(try InkLocal.load(key)["p1"])
        XCTAssertThrowsError(try InkLocal.save(key, "missing/child", ["data": "must not disappear silently"]))
    }

}
