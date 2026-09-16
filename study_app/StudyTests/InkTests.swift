// 손글씨 인코딩·페이지 키 테스트
import XCTest
import PencilKit
@testable import Desk

final class InkTests: XCTestCase {
    func test_페이지_키_정렬_다음키() {
        XCTAssertEqual(InkCodec.sorted(["p10", "p2", "p1"]), ["p1", "p2", "p10"])
        XCTAssertEqual(InkCodec.nextKey(["p1", "p3"]), "p4"); XCTAssertEqual(InkCodec.nextKey([]), "p1")
    }
    func test_그림_압축_왕복() throws {
        var pts: [PKStrokePoint] = []
        for i in 0..<50 {
            let x = CGFloat(100 + i * 5), y = CGFloat(200 + (i % 7) * 3)
            pts.append(PKStrokePoint(location: CGPoint(x: x, y: y), timeOffset: TimeInterval(i) * 0.01, size: CGSize(width: 3, height: 3), opacity: 1, force: 1, azimuth: 0, altitude: CGFloat.pi / 2))
        }
        let path = PKStrokePath(controlPoints: pts, creationDate: Date())
        let d = PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .black), path: path)])
        let s = try InkCodec.encode(d)
        let back = try InkCodec.decode(s)
        XCTAssertEqual(back.strokes.count, 1); XCTAssertEqual(back.bounds.width, d.bounds.width, accuracy: 0.5)
        XCTAssertLessThan(s.count, d.dataRepresentation().count * 2)
        XCTAssertNotNil(InkCodec.preview(d))
        XCTAssertThrowsError(try InkCodec.decode("not-base64!!"))
    }
}
