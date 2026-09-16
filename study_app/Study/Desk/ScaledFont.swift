// Dynamic Type — 고정 크기 디자인을 유지하되 사용자의 글자 크기 설정에 비례해 커지게(본문 기준). 접근성 크기도 시스템 설정을 따름
import SwiftUI

struct ScaledFontModifier: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    let size: CGFloat; let weight: Font.Weight; let design: Font.Design; let mono: Bool
    func body(content: Content) -> some View {
        let f = Font.system(size: size * scale, weight: weight, design: design)
        return content.font(mono ? f.monospacedDigit() : f)
    }
}
extension View {
    func scaledFont(_ size: CGFloat, _ weight: Font.Weight = .regular, design: Font.Design = .default, mono: Bool = false) -> some View {
        modifier(ScaledFontModifier(size: size, weight: weight, design: design, mono: mono))
    }
}
