// 손글씨 도구 막대 — STRATUM 톤(흰 바, 괘선, 파란 액센트)의 두 줄 막대. PencilKit 도구 전부:
// 잉크 7종(펜·연필·형광펜·모노라인·만년필·수채·크레용), 지우개 3종(픽셀·획·고정폭), 올가미, 자, 색(기본 10 + 직접 고르기), 굵기, 투명도, 되돌리기
import SwiftUI
import PencilKit

@MainActor
final class InkController: ObservableObject {
    enum Tool: String, CaseIterable, Identifiable {
        case pen, pencil, marker, monoline, fountain, watercolor, crayon, eraser, lasso, laser, object
        var id: String { rawValue }
        var label: String { switch self { case .pen: "펜"; case .pencil: "연필"; case .marker: "형광펜"; case .monoline: "모노라인"; case .fountain: "만년필"; case .watercolor: "수채"; case .crayon: "크레용"; case .eraser: "지우개"; case .lasso: "올가미"; case .laser: "레이저"; case .object: "개체" } }
        var icon: String { switch self { case .pen: "pencil.tip"; case .pencil: "pencil"; case .marker: "highlighter"; case .monoline: "pencil.line"; case .fountain: "paintbrush.pointed"; case .watercolor: "paintbrush"; case .crayon: "scribble.variable"; case .eraser: "eraser"; case .lasso: "lasso"; case .laser: "rays"; case .object: "textbox" } }
        var isInk: Bool { !(self == .eraser || self == .lasso || self == .laser || self == .object) }
        var inkType: PKInkingTool.InkType? {
            switch self { case .pen: .pen; case .pencil: .pencil; case .marker: .marker; case .monoline: .monoline; case .fountain: .fountainPen; case .watercolor: .watercolor; case .crayon: .crayon; default: nil }
        }
    }
    enum EraserKind: String, CaseIterable { case bitmap, vector, fixed
        var label: String { switch self { case .bitmap: "픽셀"; case .vector: "획 단위"; case .fixed: "고정 폭" } }
        var pk: PKEraserTool.EraserType { switch self { case .bitmap: .bitmap; case .vector: .vector; case .fixed: .fixedWidthBitmap } }
    }
    /// 펜 7색 — 앱 색 규칙과 같은 잉크색(검정·회색·파랑·빨강·초록·주황·보라). 원색 대신 채도를 한 단계 낮춘 값
    static let penSwatches: [UIColor] = [.black, UIColor(white: 0.45, alpha: 1), UIColor(red: 0, green: 0.41, blue: 0.85, alpha: 1), UIColor(red: 0.79, green: 0, blue: 0.06, alpha: 1), UIColor(red: 0.09, green: 0.49, blue: 0.21, alpha: 1), UIColor(red: 0.85, green: 0.42, blue: 0, alpha: 1), UIColor(red: 0.45, green: 0.25, blue: 0.75, alpha: 1)]
    /// 형광펜 4색 — 반투명으로 겹쳐도 글자가 보이는 밝은 색(노랑·연두·분홍·하늘)
    static let markerSwatches: [UIColor] = [UIColor(red: 1, green: 0.85, blue: 0.1, alpha: 1), UIColor(red: 0.5, green: 0.88, blue: 0.4, alpha: 1), UIColor(red: 1, green: 0.55, blue: 0.72, alpha: 1), UIColor(red: 0.4, green: 0.76, blue: 1, alpha: 1)]
    static var swatches: [UIColor] { penSwatches + markerSwatches }
    /// 즐겨찾기 펜(색·굵기·투명도 프리셋)
    struct Preset: Codable, Equatable, Identifiable { var tool: String; var color: String; var width: Double; var opacity: Double; var id: String { "\(tool)-\(color)-\(width)-\(opacity)" } }
    static let defaultPresets: [Preset] = [Preset(tool: "pen", color: "000000", width: 0.3, opacity: 1), Preset(tool: "pen", color: "0069D9", width: 0.3, opacity: 1), Preset(tool: "pen", color: "C9000F", width: 0.3, opacity: 1), Preset(tool: "marker", color: "FFE633", width: 0.5, opacity: 1), Preset(tool: "marker", color: "99F266", width: 0.5, opacity: 1), Preset(tool: "pencil", color: "737373", width: 0.4, opacity: 1)]
    private let d = UserDefaults.standard
    @Published var favorites: [Preset] { didSet { d.set(try? JSONEncoder().encode(favorites), forKey: "ink.favorites") } }
    @Published var shapes: Bool { didSet { d.set(shapes, forKey: "ink.shapes") } }          // 도형 인식
    @Published var markerStraight: Bool { didSet { d.set(markerStraight, forKey: "ink.mstraight") } }   // 형광펜 직선
    private(set) var previousTool: Tool = .pen
    @Published var tool: Tool { didSet { if oldValue != tool { previousTool = oldValue }; d.set(tool.rawValue, forKey: "ink.tool"); apply() } }
    @Published var color: Color { didSet { d.set(UIColor(color).hex, forKey: "ink.color"); apply() } }
    @Published var markerColor: Color { didSet { d.set(UIColor(markerColor).hex, forKey: "ink.mcolor"); apply() } }
    @Published var width: Double { didSet { d.set(width, forKey: "ink.w.\(tool.rawValue)"); apply() } }   // 0~1, 도구별 범위에 맞춤
    @Published var opacity: Double { didSet { d.set(opacity, forKey: "ink.opacity"); apply() } }
    @Published var eraser: EraserKind { didSet { d.set(eraser.rawValue, forKey: "ink.eraser"); apply() } }
    @Published var ruler = false { didSet { canvas?.isRulerActive = ruler } }
    @Published var systemPalette: Bool { didSet { d.set(systemPalette, forKey: "ink.system"); apply() } }
    @Published var canUndo = false; @Published var canRedo = false
    weak var canvas: PKCanvasView?
    let picker = PKToolPicker()

    init() {
        let d = UserDefaults.standard
        tool = Tool(rawValue: d.string(forKey: "ink.tool") ?? "") ?? .pen
        color = Color(UIColor(hex: d.string(forKey: "ink.color")) ?? .black)
        markerColor = Color(UIColor(hex: d.string(forKey: "ink.mcolor")) ?? Self.markerSwatches[0])
        width = d.object(forKey: "ink.w.\(d.string(forKey: "ink.tool") ?? "pen")") as? Double ?? 0.3
        opacity = d.object(forKey: "ink.opacity") as? Double ?? 1
        eraser = EraserKind(rawValue: d.string(forKey: "ink.eraser") ?? "") ?? .bitmap
        systemPalette = d.bool(forKey: "ink.system")
        favorites = d.data(forKey: "ink.favorites").flatMap { try? JSONDecoder().decode([Preset].self, from: $0) } ?? Self.defaultPresets
        shapes = d.object(forKey: "ink.shapes") as? Bool ?? true
        markerStraight = d.object(forKey: "ink.mstraight") as? Bool ?? true
        if tool == .laser || tool == .object { tool = .pen }
    }
    /// 즐겨찾기 적용·저장
    func apply(_ p: Preset) { let t = Tool(rawValue: p.tool) ?? .pen; tool = t; if t == .marker { markerColor = Color(UIColor(hex: p.color) ?? .yellow) } else { color = Color(UIColor(hex: p.color) ?? .black) }; width = p.width; opacity = p.opacity }
    func saveFavorite(at i: Int) { guard tool.isInk, favorites.indices.contains(i) else { return }; favorites[i] = Preset(tool: tool.rawValue, color: UIColor(activeColor).hex, width: width, opacity: opacity) }
    var currentPreset: Preset? { tool.isInk ? Preset(tool: tool.rawValue, color: UIColor(activeColor).hex, width: width, opacity: opacity) : nil }
    /// Pencil 두 번 탭
    func pencilTap() {
        switch UIPencilInteraction.preferredTapAction {
        case .switchEraser: tool = tool == .eraser ? (previousTool == .eraser ? .pen : previousTool) : .eraser
        case .switchPrevious: tool = previousTool
        case .showColorPalette, .showInkAttributes: if let i = favorites.firstIndex(where: { $0 == currentPreset }) { apply(favorites[(i + 1) % favorites.count]) } else if let f = favorites.first { apply(f) }
        default: break
        }
    }
    /// 도구를 바꾸면 그 도구에 저장된 굵기를 되살림
    func select(_ t: Tool) { let w = d.object(forKey: "ink.w.\(t.rawValue)") as? Double; tool = t; if let w { width = w } }
    var activeColor: Color { get { tool == .marker ? markerColor : color } set { if tool == .marker { markerColor = newValue } else { color = newValue } } }
    var widthRange: ClosedRange<CGFloat> { tool.inkType?.validWidthRange ?? (1...40) }
    var widthValue: CGFloat { let r = widthRange; return r.lowerBound + (r.upperBound - r.lowerBound) * CGFloat(width) }
    var pkTool: PKTool {
        switch tool {
        case .laser, .object: return PKInkingTool(.pen, color: .clear, width: 1)   // 오버레이 층이 입력을 받으므로 캔버스엔 안 그려짐
        case .eraser: return eraser == .fixed ? PKEraserTool(.fixedWidthBitmap, width: widthValue) : PKEraserTool(eraser.pk)
        case .lasso: return PKLassoTool()
        default: return PKInkingTool(tool.inkType ?? .pen, color: UIColor(activeColor).withAlphaComponent(CGFloat(opacity)), width: widthValue)
        }
    }
    func attach(_ c: PKCanvasView) { canvas = c; picker.addObserver(c); paletteShown = nil; apply(); refreshUndo() }
    private var paletteShown: Bool? = nil
    func apply() {
        guard let c = canvas else { return }
        if paletteShown != systemPalette { picker.setVisible(systemPalette, forFirstResponder: c); paletteShown = systemPalette }
        if systemPalette { if !c.isFirstResponder { c.becomeFirstResponder() } } else { c.tool = pkTool }
        if c.isRulerActive != ruler { c.isRulerActive = ruler }
    }
    func undo() { canvas?.undoManager?.undo(); refreshUndo() }
    func redo() { canvas?.undoManager?.redo(); refreshUndo() }
    func refreshUndo() { let u = canvas?.undoManager?.canUndo ?? false, r = canvas?.undoManager?.canRedo ?? false; if canUndo != u { canUndo = u }; if canRedo != r { canRedo = r } }
}

extension UIColor {
    var hex: String { var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0; getRed(&r, green: &g, blue: &b, alpha: &a); return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255)) }
    convenience init?(hex: String?) { guard let h = hex, h.count == 6, let v = UInt32(h, radix: 16) else { return nil }; self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1) }
}

/// 두 줄 도구 막대. 위: 도구·지우개·올가미·자 / 되돌리기. 아래: 색·굵기·투명도(잉크) 또는 지우개 종류
struct InkToolbar: View {
    @ObservedObject var c: InkController
    @Environment(\.horizontalSizeClass) private var hSize
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if hSize == .regular {
                    HStack(spacing: 4) {
                        ForEach(Array(c.favorites.enumerated()), id: \.offset) { i, f in
                            let on = c.currentPreset == f
                            Button { c.apply(f) } label: {
                                ZStack {
                                    Image(systemName: (InkController.Tool(rawValue: f.tool) ?? .pen).icon).scaledFont(12, .semibold).foregroundStyle(Color(UIColor(hex: f.color) ?? .black))
                                }
                                .frame(width: 30, height: 30).background(on ? Color(.systemBackground) : .clear, in: Circle())
                                .overlay(Circle().strokeBorder(Color(UIColor(hex: f.color) ?? .black).opacity(on ? 1 : 0.35), lineWidth: on ? 2 : 1))
                            }.buttonStyle(.plain).accessibilityLabel("즐겨찾기 펜 \(i + 1)")
                            .contextMenu { Button("현재 펜을 여기에 저장", systemImage: "star") { c.saveFavorite(at: i) } }
                        }
                    }.padding(3).background(Color.primary.opacity(0.06), in: Capsule())
                    HStack(spacing: 2) { ForEach(InkController.Tool.allCases.filter(\.isInk)) { chip($0) } }.padding(3).background(Color.primary.opacity(0.06), in: Capsule())
                } else {
                    Menu { ForEach(InkController.Tool.allCases.filter(\.isInk)) { t in Button(t.label, systemImage: t.icon) { c.select(t) } } } label: {
                        HStack(spacing: 6) { Image(systemName: c.tool.isInk ? c.tool.icon : "pencil.tip"); Text(c.tool.isInk ? c.tool.label : "펜"); Image(systemName: "chevron.down").font(.caption2) }
                            .scaledFont(14, .semibold).padding(.horizontal, 12).frame(height: 32)
                            .background(c.tool.isInk ? Color(.systemBackground) : .clear, in: Capsule()).foregroundStyle(c.tool.isInk ? DeskTheme.accent : .primary)
                    }.padding(3).background(Color.primary.opacity(0.06), in: Capsule())
                }
                HStack(spacing: 2) { chip(.eraser); chip(.lasso); chip(.laser); chip(.object) }.padding(3).background(Color.primary.opacity(0.06), in: Capsule())
                Button { c.ruler.toggle() } label: { Image(systemName: "ruler").accessibilityLabel("자").scaledFont(16, .semibold).frame(width: 36, height: 32).background(c.ruler ? DeskTheme.accent.opacity(0.12) : .clear, in: Capsule()).foregroundStyle(c.ruler ? DeskTheme.accent : .primary) }.buttonStyle(.plain)
                HStack(spacing: 2) {
                    Button { c.undo() } label: { Image(systemName: "arrow.uturn.backward").frame(width: 36, height: 32) }.accessibilityLabel("되돌리기").disabled(!c.canUndo)
                    Button { c.redo() } label: { Image(systemName: "arrow.uturn.forward").frame(width: 36, height: 32) }.accessibilityLabel("다시 실행").disabled(!c.canRedo)
                }.padding(3).background(Color.primary.opacity(0.06), in: Capsule())
                if hSize == .regular { ClassClock() }
            }
            .scaledFont(17).padding(.horizontal, 14).frame(maxWidth: .infinity).frame(height: 46)   // 가운데 정렬
            Divider().opacity(0.4).padding(.horizontal, 14)
            HStack(spacing: 14) {
                if c.tool.isInk {
                    HStack(spacing: 7) {
                        ForEach(Array((c.tool == .marker ? InkController.markerSwatches : InkController.penSwatches).enumerated()), id: \.offset) { _, u in
                            let on = UIColor(c.activeColor).hex == u.hex
                            Circle().fill(Color(u)).frame(width: 20, height: 20)
                                .overlay(Circle().strokeBorder(on ? Color.primary : Color.primary.opacity(0.12), lineWidth: on ? 2.5 : 1))
                                .onTapGesture { c.activeColor = Color(u) }.accessibilityLabel("색 \(u.hex)").accessibilityAddTraits(.isButton)
                        }
                        ColorPicker("", selection: Binding(get: { c.activeColor }, set: { c.activeColor = $0 }), supportsOpacity: false).labelsHidden().frame(width: 26)
                    }
                    Divider().frame(height: 18)
                    HStack(spacing: 8) {
                        Image(systemName: "lineweight").scaledFont(12).foregroundStyle(.secondary)
                        Slider(value: $c.width, in: 0...1).frame(width: hSize == .regular ? 140 : 90).tint(DeskTheme.accent)
                        Circle().fill(Color(UIColor(c.activeColor))).frame(width: min(18, 4 + c.widthValue * 0.6), height: min(18, 4 + c.widthValue * 0.6)).frame(width: 18)
                    }
                    if hSize == .regular {
                        Divider().frame(height: 18)
                        HStack(spacing: 8) {
                            Image(systemName: "circle.lefthalf.filled").scaledFont(12).foregroundStyle(.secondary)
                            Slider(value: $c.opacity, in: 0.15...1).frame(width: 110).tint(DeskTheme.accent)
                            Text("\(Int(c.opacity * 100))%").scaledFont(11, mono: true).foregroundStyle(.secondary).frame(width: 34, alignment: .trailing)
                        }
                    }
                } else if c.tool == .eraser {
                    Picker("", selection: $c.eraser) { ForEach(InkController.EraserKind.allCases, id: \.self) { Text($0.label) } }.pickerStyle(.segmented).frame(width: 260)
                    if c.eraser == .fixed { Slider(value: $c.width, in: 0...1).frame(width: 140).tint(DeskTheme.accent) }
                    Text(c.eraser == .vector ? "닿은 획을 통째로 지웁니다" : c.eraser == .bitmap ? "닿은 부분만 지웁니다" : "일정한 폭으로 지웁니다").font(.footnote).foregroundStyle(.secondary)
                } else if c.tool == .object {
                    Text("빈 곳을 누르면 텍스트 상자, 개체를 눌러 고른 뒤 끌어 옮기고 두 손가락으로 크기 조절, 두 번 눌러 글 수정, 길게 눌러 삭제").font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                } else if c.tool == .laser {
                    Text("누르는 동안만 빨간 점이 보이고 지나간 자리는 사라집니다. 외부 화면에도 함께 표시됩니다.").font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text("올가미로 감싼 획을 옮기거나 복사·삭제할 수 있습니다").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 14).frame(maxWidth: .infinity).frame(height: 40)   // 가운데 정렬
        }
        .padding(.vertical, 2)
        .deskGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 10).padding(.top, 4).padding(.bottom, 6)
        .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
    }
    func chip(_ t: InkController.Tool) -> some View {
        Button { c.select(t) } label: {
            Image(systemName: t.icon).desk(.bodyStrong).frame(width: 38, height: 32)
                .background(c.tool == t ? Color(.systemBackground) : .clear, in: Capsule())
                .foregroundStyle(c.tool == t ? DeskTheme.accent : .primary)
                .shadow(color: c.tool == t ? .black.opacity(0.08) : .clear, radius: 2, y: 1)
        }.buttonStyle(.plain).help(t.label).accessibilityLabel(t.label).accessibilityAddTraits(c.tool == t ? .isSelected : [])
    }
}

