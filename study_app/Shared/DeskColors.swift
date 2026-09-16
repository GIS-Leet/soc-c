// Desk 색 체계 — 앱·위젯이 같은 에셋(DeskColors.xcassets)에서 가져온다. 라이트/다크 값이 따로 있어 검정 위에서도 4.5:1 이상.
// 규칙: 파랑(액센트) = 조작·다음, 빨강 = 지금·주의, 초록 = 완료, 주황 = 뒤처짐·고정, 남색(브랜드) = 큰 숫자·제목. 반(학급)은 고유 색.
import SwiftUI
import UIKit

enum DeskColors {
    static func readableInk(on color: Color, scheme: ColorScheme) -> Color {
        let ui=UIColor(color).resolvedColor(with:UITraitCollection(userInterfaceStyle:scheme == .dark ? .dark : .light))
        var r:CGFloat=0,g:CGFloat=0,b:CGFloat=0,a:CGFloat=0;ui.getRed(&r,green:&g,blue:&b,alpha:&a)
        func linear(_ value:CGFloat)->Double { let value=Double(value);return value<=0.04045 ? value/12.92 : pow((value+0.055)/1.055,2.4) }
        let luminance=0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b)
        return luminance>0.179 ? .black : .white
    }
    static let accent = Color("AccentColor")
    static let live = Color("DeskLive")
    static let success = Color("DeskSuccess")
    static let warn = Color("DeskWarn")
    static let brand = Color("DeskBrand")
    static let canvas = Color("DeskCanvas")   // 화면 바탕 — 라이트 푸른 회백, 다크 남색 검정
    static let card = Color("DeskCard")       // 카드·무대 면

    /// 반 고유 색 12가지 — 전부 쿨톤(초록 150° ~ 자주 284°). 이웃한 번호끼리는 색상환에서 30° 이상 떨어지게 배열해 같은 날 겹쳐도 구분된다.
    /// 라이트는 흰 숫자가 올라가도록 어둡게, 다크는 검정 위에서 살도록 밝고 채도를 낮춘다
    struct ClassHue { let name: String; let hue: Double; var lightBrightness: Double = 0.72; var lightSaturation: Double = 0.70 }
    static let classHues: [ClassHue] = [
        ClassHue(name: "코발트", hue: 220, lightBrightness: 0.72),                              // 1반
        ClassHue(name: "하늘", hue: 200, lightBrightness: 0.76),                                // 2반
        ClassHue(name: "청록", hue: 172, lightBrightness: 0.62),                                // 3반
        ClassHue(name: "먼지보라", hue: 268, lightBrightness: 0.70, lightSaturation: 0.45),    // 4반
        ClassHue(name: "청옥", hue: 186, lightBrightness: 0.66),                                // 5반
        ClassHue(name: "라벤더", hue: 250, lightBrightness: 0.78, lightSaturation: 0.55),      // 6반
        ClassHue(name: "자주", hue: 284, lightBrightness: 0.72),                                // 7반
        ClassHue(name: "민트", hue: 160, lightBrightness: 0.60),                                // 8반
        ClassHue(name: "제비꽃", hue: 276, lightBrightness: 0.70),                              // 9반
        ClassHue(name: "남보라", hue: 232, lightBrightness: 0.82),                              // 10반
        ClassHue(name: "강청", hue: 210, lightBrightness: 0.70, lightSaturation: 0.85),        // 11반
        ClassHue(name: "초록", hue: 150, lightBrightness: 0.58),                                // 12반
    ]
    /// 반 번호 → 색 (1반부터 순환)
    static func cls(_ number: Int?, dark: Bool) -> Color? {
        guard let n = number, n > 0 else { return nil }
        let h = classHues[(n - 1) % classHues.count]
        return dark ? Color(hue: h.hue / 360, saturation: 0.52, brightness: 0.96) : Color(hue: h.hue / 360, saturation: h.lightSaturation, brightness: h.lightBrightness)
    }
    /// "103 통사2C" → 3 (교실 마지막 두 자리 = 반). 세 자리 교실이 아니면 nil
    static func classNumber(subject: String) -> Int? {
        let room = subject.split(separator: " ").first.map(String.init) ?? subject
        guard room.count == 3, let n = Int(room), n % 100 > 0 else { return nil }
        return n % 100
    }
    /// "3반", "2학년 7반", "3" → 3. 마지막 숫자 묶음
    static func classNumber(name: String) -> Int? {
        let digits = name.split(whereSeparator: { !$0.isNumber }).map(String.init)
        return digits.last.flatMap(Int.init).flatMap { $0 > 0 && $0 < 100 ? $0 : nil }
    }
}

/// 라이트/다크에 맞는 반 색 — 뷰에서 `@Environment(\.colorScheme)` 값을 넘긴다
extension DeskColors {
    static func cls(subject: String?, scheme: ColorScheme) -> Color? { subject.flatMap { cls(classNumber(subject: $0), dark: scheme == .dark) } }
    static func cls(name: String?, scheme: ColorScheme) -> Color? { name.flatMap { cls(classNumber(name: $0), dark: scheme == .dark) } }
}
