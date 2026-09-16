// 레이저 포인터 — 캔버스 위 투명 층. 누르는 동안 빨간 꼬리가 따라오고 떼면 사라짐(잉크로 남지 않음). 외부 화면에도 같은 궤적을 보냄
import UIKit
import SwiftUI

struct LaserPoint: Equatable { let p: CGPoint; let t: TimeInterval }   // p 는 페이지 좌표

final class LaserView: UIView {
    var toPage: ((CGPoint) -> CGPoint)?     // 뷰 좌표 → 페이지 좌표
    var onUpdate: (([LaserPoint]) -> Void)?
    private var points: [(CGPoint, TimeInterval)] = []
    private var link: CADisplayLink?
    static let life: TimeInterval = 0.7
    override init(frame: CGRect) { super.init(frame: frame); backgroundColor = .clear; isOpaque = false; isMultipleTouchEnabled = false }
    required init?(coder: NSCoder) { fatalError() }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { add(touches); start() }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { add(touches) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { }
    private func add(_ touches: Set<UITouch>) { guard let t = touches.first else { return }; points.append((t.location(in: self), CACurrentMediaTime())) }
    private func start() { if link == nil { link = CADisplayLink(target: self, selector: #selector(tick)); link?.add(to: .main, forMode: .common) } }
    @objc private func tick() {
        let now = CACurrentMediaTime(); points.removeAll { now - $0.1 > Self.life }
        setNeedsDisplay()
        onUpdate?(points.map { LaserPoint(p: toPage?($0.0) ?? $0.0, t: $0.1) })
        if points.isEmpty { link?.invalidate(); link = nil }
    }
    override func draw(_ rect: CGRect) {
        guard points.count > 0, let ctx = UIGraphicsGetCurrentContext() else { return }
        let now = CACurrentMediaTime()
        ctx.setLineCap(.round); ctx.setLineJoin(.round)
        for i in 1..<max(points.count, 1) {
            let age = now - points[i].1, a = max(0, 1 - age / Self.life)
            ctx.setStrokeColor(UIColor(red: 1, green: 0.16, blue: 0.16, alpha: a * 0.9).cgColor); ctx.setLineWidth(4 + 4 * a)
            ctx.setShadow(offset: .zero, blur: 10, color: UIColor.red.withAlphaComponent(a * 0.8).cgColor)
            ctx.move(to: points[i - 1].0); ctx.addLine(to: points[i].0); ctx.strokePath()
        }
        if let last = points.last { ctx.setFillColor(UIColor.red.cgColor); ctx.setShadow(offset: .zero, blur: 14, color: UIColor.red.cgColor); ctx.fillEllipse(in: CGRect(x: last.0.x - 6, y: last.0.y - 6, width: 12, height: 12)) }
    }
}

/// 외부 화면·발표용 SwiftUI 레이저 궤적 (페이지 좌표를 k 배로)
struct LaserTrail: View {
    let points: [LaserPoint]; let scale: CGFloat
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 60, paused: points.isEmpty)) { _ in
            Canvas { ctx, _ in
                let now = CACurrentMediaTime()
                for i in 1..<max(points.count, 1) {
                    let a = max(0, 1 - (now - points[i].t) / LaserView.life); guard a > 0 else { continue }
                    var path = Path(); path.move(to: CGPoint(x: points[i - 1].p.x * scale, y: points[i - 1].p.y * scale)); path.addLine(to: CGPoint(x: points[i].p.x * scale, y: points[i].p.y * scale))
                    ctx.stroke(path, with: .color(.red.opacity(a * 0.9)), style: StrokeStyle(lineWidth: (4 + 4 * a) * scale, lineCap: .round))
                }
                if let l = points.last { ctx.fill(Path(ellipseIn: CGRect(x: l.p.x * scale - 6 * scale, y: l.p.y * scale - 6 * scale, width: 12 * scale, height: 12 * scale)), with: .color(.red)) }
            }
        }
        .allowsHitTesting(false)
    }
}
