// 잉크 외 개체 — 텍스트 상자·사진. 종이 위, 잉크 아래 층. 「개체」 도구일 때만 누르기·끌기·확대·편집이 되고, 다른 도구일 땐 그냥 보임
import UIKit
import SwiftUI
import PencilKit

/// 개체 층(UIKit) — 페이지 좌표계로 bounds 를 두고 transform 으로 확대만 맞춘다
final class ObjectsLayer: UIView, UIGestureRecognizerDelegate {
    var objects: [InkObject] = [] { didSet { rebuild() } }
    var pageSize: CGSize = InkCodec.pageSize
    var editing = false { didSet { isUserInteractionEnabled = editing; select(nil) } }
    var onChange: (([InkObject]) -> Void)?
    var onEditText: ((InkObject) -> Void)?
    var onAddText: ((CGPoint) -> Void)?
    private var views: [String: UIView] = [:]
    private(set) var selectedID: String? { didSet { for (id, v) in views { v.layer.borderWidth = id == selectedID ? 2 : 0 } } }
    override init(frame: CGRect) {
        super.init(frame: frame); isUserInteractionEnabled = false; layer.anchorPoint = .zero
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped)); addGestureRecognizer(tap)
        let dbl = UITapGestureRecognizer(target: self, action: #selector(doubleTapped)); dbl.numberOfTapsRequired = 2; addGestureRecognizer(dbl); tap.require(toFail: dbl)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned)); pan.maximumNumberOfTouches = 1; addGestureRecognizer(pan)
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched)); addGestureRecognizer(pinch)
        let long = UILongPressGestureRecognizer(target: self, action: #selector(longPressed)); addGestureRecognizer(long)
    }
    required init?(coder: NSCoder) { fatalError() }
    func select(_ id: String?) { selectedID = id }
    /// 페이지 좌표계 그대로: bounds = 페이지, 확대는 transform
    func sync(zoom z: CGFloat, offset o: CGPoint) {
        bounds = CGRect(origin: .zero, size: pageSize)
        transform = CGAffineTransform(scaleX: z, y: z)
        frame.origin = CGPoint(x: -o.x, y: -o.y)
    }
    func rebuild() {
        views.values.forEach { $0.removeFromSuperview() }; views = [:]
        for o in objects {
            let v: UIView
            if o.kind == "image", let s = o.image, let d = Data(base64Encoded: s), let img = UIImage(data: d) { let iv = UIImageView(image: img); iv.contentMode = .scaleToFill; v = iv }
            else { let l = UILabel(); l.text = o.text; l.numberOfLines = 0; l.font = .systemFont(ofSize: o.fontSize); l.textColor = UIColor(hex: o.color) ?? .black; l.backgroundColor = .clear; v = l }
            v.frame = o.rect; v.layer.borderColor = UIColor(red: 0, green: 0.41, blue: 0.85, alpha: 1).cgColor; v.layer.borderWidth = o.id == selectedID ? 2 : 0
            addSubview(v); views[o.id] = v
        }
    }
    private func hit(_ p: CGPoint) -> InkObject? { objects.last { $0.rect.insetBy(dx: -8, dy: -8).contains(p) } }
    @objc private func tapped(_ g: UITapGestureRecognizer) {
        let p = g.location(in: self)
        if let o = hit(p) { select(o.id) } else if selectedID != nil { select(nil) } else { onAddText?(p) }
    }
    @objc private func doubleTapped(_ g: UITapGestureRecognizer) { if let o = hit(g.location(in: self)), o.kind == "text" { select(o.id); onEditText?(o) } }
    private var panStart: CGRect = .zero
    @objc private func panned(_ g: UIPanGestureRecognizer) {
        guard let id = selectedID ?? hit(g.location(in: self))?.id, let i = objects.firstIndex(where: { $0.id == id }) else { return }
        if g.state == .began { select(id); panStart = objects[i].rect }
        let t = g.translation(in: self)
        objects[i].x = panStart.origin.x + t.x; objects[i].y = panStart.origin.y + t.y
        views[id]?.frame = objects[i].rect
        if g.state == .ended || g.state == .cancelled { onChange?(objects) }
    }
    private var pinchStart: CGRect = .zero
    @objc private func pinched(_ g: UIPinchGestureRecognizer) {
        guard let id = selectedID, let i = objects.firstIndex(where: { $0.id == id }) else { return }
        if g.state == .began { pinchStart = objects[i].rect }
        let s = max(0.2, g.scale), c = CGPoint(x: pinchStart.midX, y: pinchStart.midY)
        let w = pinchStart.width * s, h = pinchStart.height * s
        objects[i].x = c.x - w / 2; objects[i].y = c.y - h / 2; objects[i].w = w; objects[i].h = h
        if objects[i].kind == "text" { objects[i].fontSize = max(8, (objects[i].fontSize * (s / max(0.01, pinchLast))).rounded()) ; (views[id] as? UILabel)?.font = .systemFont(ofSize: objects[i].fontSize) }
        pinchLast = s
        views[id]?.frame = objects[i].rect
        if g.state == .ended || g.state == .cancelled { pinchLast = 1; onChange?(objects) }
    }
    private var pinchLast: CGFloat = 1
    @objc private func longPressed(_ g: UILongPressGestureRecognizer) {
        guard g.state == .began, let o = hit(g.location(in: self)) else { return }
        select(o.id)
        let menu = UIMenuController.shared   // 단순 삭제 확인 대신 바로 삭제
        _ = menu
        objects.removeAll { $0.id == o.id }; onChange?(objects)
    }
    func deleteSelected() { guard let id = selectedID else { return }; objects.removeAll { $0.id == id }; onChange?(objects) }
}

/// 텍스트 입력 시트
struct TextObjectSheet: View {
    @State var text: String
    @State var fontSize: Double
    @State var color: Color
    var onDone: (String, Double, Color) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                TextField("내용", text: $text, axis: .vertical).lineLimit(3...8).scaledFont(17)
                HStack { Text("글자 크기"); Slider(value: $fontSize, in: 12...72, step: 1); Text("\(Int(fontSize))").monospacedDigit().frame(width: 30) }
                ColorPicker("색", selection: $color, supportsOpacity: false)
            }
            .navigationTitle("텍스트 상자").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("완료") { onDone(text, fontSize, color); dismiss() }.disabled(text.trimmingCharacters(in: .whitespaces).isEmpty) } }
        }.presentationDetents([.medium])
    }
}
