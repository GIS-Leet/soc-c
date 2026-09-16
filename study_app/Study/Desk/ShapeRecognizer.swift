// 도형 인식 — 획 끝에서 잠시 멈추면(홀드) 직선·타원·삼각형·사각형으로 바꿔 준다. 형광펜은 거의 직선이면 홀드 없이 곧게
import PencilKit
import CoreGraphics

enum ShapeRecognizer {
    enum Shape: Equatable { case line(CGPoint, CGPoint), ellipse(CGRect), polygon([CGPoint]) }

    /// 마지막 hold초 동안 tol 안에 머물렀는가
    static func held(_ s: PKStroke, hold: TimeInterval = 0.5, tol: CGFloat = 7) -> Bool {
        let pts = Array(s.path); guard let last = pts.last, pts.count > 4, last.timeOffset > hold + 0.15 else { return false }
        let tail = pts.filter { $0.timeOffset >= last.timeOffset - hold }
        guard tail.count >= 3 else { return false }
        return tail.allSatisfy { hypot($0.location.x - last.location.x, $0.location.y - last.location.y) <= tol }
    }

    static func classify(_ raw: [CGPoint], lineTolerance: CGFloat = 0.05) -> Shape? {
        let pts = raw.count > 2 ? raw : raw
        guard pts.count >= 3 else { return nil }
        let length = zip(pts, pts.dropFirst()).reduce(0) { $0 + dist($1.0, $1.1) }
        guard length > 24 else { return nil }
        let a = pts.first!, b = pts.last!, chord = dist(a, b)
        let box = bounds(pts)
        // 직선: 현에서 벗어난 최대 거리가 길이의 몇 %인가
        if chord / length > 0.85 {
            let dev = pts.map { distToLine($0, a, b) }.max() ?? 0
            if dev / length < lineTolerance { return .line(a, b) }
        }
        // 닫힌 도형
        guard chord < 0.25 * max(box.width, box.height) + 10, box.width > 12, box.height > 12 else { return nil }
        let cx = box.midX, cy = box.midY, rx = box.width / 2, ry = box.height / 2
        let devs = pts.map { p in abs(sqrt(pow((p.x - cx) / rx, 2) + pow((p.y - cy) / ry, 2)) - 1) }
        if devs.reduce(0, +) / CGFloat(devs.count) < 0.13 { return .ellipse(box) }
        let corners = simplify(pts, epsilon: 0.05 * length)
        var poly = corners; if let f = poly.first, let l = poly.last, dist(f, l) < 0.15 * length { poly.removeLast() }
        if poly.count == 4 {
            // 변이 거의 축에 나란하면 반듯한 사각형으로
            let axis = zip(poly, poly.dropFirst() + [poly[0]]).allSatisfy { e in let ang = abs(atan2(e.1.y - e.0.y, e.1.x - e.0.x)); return min(ang, abs(ang - .pi / 2), abs(ang - .pi)) < 0.2 }
            return .polygon(axis ? [CGPoint(x: box.minX, y: box.minY), CGPoint(x: box.maxX, y: box.minY), CGPoint(x: box.maxX, y: box.maxY), CGPoint(x: box.minX, y: box.maxY)] : poly)
        }
        if poly.count == 3 { return .polygon(poly) }
        return nil
    }

    /// 인식되면 같은 잉크·굵기로 새 획을 만든다
    static func replacement(for s: PKStroke, marker: Bool, requireHold: Bool = true) -> PKStroke? {
        let pts = Array(s.path)
        let locs = pts.map(\.location)
        var shape: Shape?
        if marker, case .line(let a, let b)? = classify(locs, lineTolerance: 0.09) { shape = .line(a, b) }   // 형광펜은 느슨하게, 홀드 없이
        if shape == nil { guard !requireHold || held(s) else { return nil }; shape = classify(locs) }
        guard let shape else { return nil }
        let size = pts.map(\.size.width).reduce(0, +) / CGFloat(max(pts.count, 1))
        return PKStroke(ink: s.ink, path: path(for: shape, size: CGSize(width: size, height: size)))
    }

    static func path(for shape: Shape, size: CGSize) -> PKStrokePath {
        var out: [CGPoint] = []
        switch shape {
        case .line(let a, let b): out = interp(a, b, n: 12)
        case .ellipse(let r):
            let n = 72; out = (0...n).map { i in let t = CGFloat(i) / CGFloat(n) * 2 * .pi; return CGPoint(x: r.midX + r.width / 2 * cos(t), y: r.midY + r.height / 2 * sin(t)) }
        case .polygon(let ps):
            for i in 0..<ps.count { let a = ps[i], b = ps[(i + 1) % ps.count]; out += [a, a]; out += interp(a, b, n: 8).dropFirst().dropLast(); out += [b, b] }   // 꼭짓점을 두 번 넣어 모서리를 날카롭게
        }
        let cps = out.enumerated().map { i, p in PKStrokePoint(location: p, timeOffset: TimeInterval(i) * 0.01, size: size, opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2) }
        return PKStrokePath(controlPoints: cps, creationDate: Date())
    }

    // ── 기하 도우미
    static func dist(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(a.x - b.x, a.y - b.y) }
    static func distToLine(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let l = dist(a, b); guard l > 0 else { return dist(p, a) }
        return abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / l
    }
    static func bounds(_ pts: [CGPoint]) -> CGRect {
        let xs = pts.map(\.x), ys = pts.map(\.y); return CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    }
    static func interp(_ a: CGPoint, _ b: CGPoint, n: Int) -> [CGPoint] { (0...n).map { i in let t = CGFloat(i) / CGFloat(n); return CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t) } }
    /// Douglas–Peucker
    static func simplify(_ pts: [CGPoint], epsilon: CGFloat) -> [CGPoint] {
        guard pts.count > 2 else { return pts }
        var maxD: CGFloat = 0, idx = 0
        for i in 1..<(pts.count - 1) { let d = distToLine(pts[i], pts[0], pts[pts.count - 1]); if d > maxD { maxD = d; idx = i } }
        if maxD > epsilon {
            let l = simplify(Array(pts[0...idx]), epsilon: epsilon), r = simplify(Array(pts[idx...]), epsilon: epsilon)
            return l.dropLast() + r
        }
        return [pts[0], pts[pts.count - 1]]
    }
}
