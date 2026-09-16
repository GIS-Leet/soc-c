// 도형 인식 테스트 — 직선·타원·사각형·홀드 판정
import XCTest
import PencilKit
@testable import Desk

final class ShapeTests: XCTestCase {
    func stroke(_ pts: [CGPoint], holdEnd: Bool) -> PKStroke {
        var cps = pts.enumerated().map { i, p in PKStrokePoint(location: p, timeOffset: TimeInterval(i) * 0.02, size: CGSize(width: 3, height: 3), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2) }
        if holdEnd, let last = pts.last { let t0 = cps.last!.timeOffset; for j in 1...8 { cps.append(PKStrokePoint(location: CGPoint(x: last.x + CGFloat(j % 2), y: last.y), timeOffset: t0 + TimeInterval(j) * 0.1, size: CGSize(width: 3, height: 3), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)) } }
        return PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: cps, creationDate: Date()))
    }
    func test_흔들린_직선() {
        let pts = (0...40).map { i in CGPoint(x: 100 + CGFloat(i) * 8, y: 200 + CGFloat(i % 3) * 2) }
        XCTAssertEqual(ShapeRecognizer.classify(pts), .line(pts.first!, pts.last!))
        XCTAssertTrue(ShapeRecognizer.held(stroke(pts, holdEnd: true))); XCTAssertFalse(ShapeRecognizer.held(stroke(pts, holdEnd: false)))
        XCTAssertNotNil(ShapeRecognizer.replacement(for: stroke(pts, holdEnd: true), marker: false))
        XCTAssertNil(ShapeRecognizer.replacement(for: stroke(pts, holdEnd: false), marker: false))
        XCTAssertNotNil(ShapeRecognizer.replacement(for: stroke(pts, holdEnd: false), marker: true))   // 형광펜은 홀드 없이
    }
    func test_손으로_그린_원과_사각형() {
        let circle = (0...60).map { i in let t = CGFloat(i) / 60 * 2 * .pi; return CGPoint(x: 300 + 80 * cos(t) + CGFloat(i % 2) * 3, y: 300 + 60 * sin(t)) }
        if case .ellipse(let r)? = ShapeRecognizer.classify(circle) { XCTAssertEqual(r.width, 163, accuracy: 6); XCTAssertEqual(r.height, 120, accuracy: 6) } else { XCTFail("타원 아님") }
        var rect: [CGPoint] = []
        for i in 0...20 { rect.append(CGPoint(x: 100 + CGFloat(i) * 10, y: 100 + CGFloat(i % 2))) }
        for i in 0...10 { rect.append(CGPoint(x: 300, y: 100 + CGFloat(i) * 10)) }
        for i in 0...20 { rect.append(CGPoint(x: 300 - CGFloat(i) * 10, y: 200)) }
        for i in 0...10 { rect.append(CGPoint(x: 100, y: 200 - CGFloat(i) * 10)) }
        if case .polygon(let ps)? = ShapeRecognizer.classify(rect) { XCTAssertEqual(ps.count, 4); XCTAssertEqual(ps[0], CGPoint(x: 100, y: 100)) } else { XCTFail("사각형 아님") }
        let scribble = (0...50).map { i in CGPoint(x: 100 + CGFloat(i) * 5, y: 100 + 60 * sin(CGFloat(i) * 0.9)) }
        XCTAssertNil(ShapeRecognizer.classify(scribble))
        let rep = ShapeRecognizer.replacement(for: stroke(rect, holdEnd: true), marker: false)!
        XCTAssertGreaterThan(rep.path.count, 20); XCTAssertEqual(rep.ink.inkType, .pen)
    }
}
