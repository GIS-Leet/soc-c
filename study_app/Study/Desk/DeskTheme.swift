// Desk 네이티브 화면 공통 — 색·서체·작은 부품 (STRATUM 토큰을 SwiftUI로 옮김)
import SwiftUI

enum DeskTheme {
    // 값은 Shared/DeskColors.xcassets — 라이트/다크 따로. 규칙은 DeskColors.swift 머리글
    static let accent = DeskColors.accent
    static let live = DeskColors.live
    static let success = DeskColors.success
    static let warn = DeskColors.warn
    static let brand = DeskColors.brand   // 아이콘 남색 — 히어로 숫자·큰 수치
    static let canvas = DeskColors.canvas // 화면 바탕(쿨톤)
    static let card = DeskColors.card     // 카드·무대 면
}

/// 섹션 머리 — STRATUM .dash-h (작은 대문자·자간·액센트)
struct Eyebrow: View {
    let text: String
    var trailing: String? = nil
    var color: Color = DeskTheme.accent
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text).scaledFont(12, .bold).tracking(1.2).foregroundStyle(color)
            Spacer()
            if let t = trailing { Text(t).scaledFont(12, .semibold).foregroundStyle(.secondary) }
        }
        .textCase(.uppercase)
    }
}

/// 카드 — 흰 면(다크: 회색), 큰 라운드. 라이트는 배경 대비만으로 서고, 다크만 옅은 테두리. `tint` 를 주면 그 색이 왼쪽 위에서 옅게 번지는 히어로 카드
struct DeskCard<Content: View>: View {
    var tint: Color? = nil
    @ViewBuilder var content: Content
    @Environment(\.colorScheme) private var scheme
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 18, style: .continuous) }
    var body: some View {
        VStack(alignment: .leading, spacing: 9) { content }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    shape.fill(DeskTheme.card)
                    if let tint {
                        shape.fill(LinearGradient(colors: [tint.opacity(scheme == .dark ? 0.17 : 0.16), tint.opacity(scheme == .dark ? 0.03 : 0.02)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    }
                }
            }
            .overlay(shape.strokeBorder(tint.map { $0.opacity(scheme == .dark ? 0.26 : 0.18) } ?? (scheme == .dark ? Color.white.opacity(0.08) : .clear), lineWidth: 0.5))
    }
}

/// 번호·시각·과목 한 줄 (시간표)
struct PeriodRow: View {
    let period: Int; let start: String; let subject: String?; let state: State
    enum State { case done, now, next, later, empty }
    @Environment(\.colorScheme) private var scheme
    /// 반 색 — 교실 번호로 정해진다. 끝난 수업은 연하게, 빈 교시는 회색
    var classColor: Color? { DeskColors.cls(subject: subject, scheme: scheme) }
    var body: some View {
        HStack(spacing: 10) {
            Text("\(period)").scaledFont(12, .bold, design: .rounded).frame(width: 20, height: 20)
                .background(Circle().fill(circleColor)).foregroundStyle(state == .empty || state == .done ? Color.primary.opacity(0.45) : .white)
            Text(start).scaledFont(13, mono: true).foregroundStyle(.secondary).frame(width: 40, alignment: .leading)
            Text(subject ?? "—").font(.system(size: 15, weight: subject == nil ? .regular : .semibold)).lineLimit(1).minimumScaleFactor(0.75)
                .foregroundStyle(subject == nil ? Color.primary.opacity(0.3) : state == .done ? Color.secondary : Color.primary)
            Spacer()
            if state == .now { Text("지금").font(.caption.bold()).foregroundStyle(DeskTheme.live) }
            if state == .next { Text("다음").font(.caption.weight(.semibold)).foregroundStyle(DeskTheme.accent) }
        }
        .padding(.horizontal, 8).frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 8).fill(state == .now ? DeskTheme.live.opacity(0.10) : state == .next ? DeskTheme.accent.opacity(0.08) : .clear))
    }
    var circleColor: Color {
        switch state {
        case .now, .next, .later: classColor ?? (state == .now ? DeskTheme.live : state == .next ? DeskTheme.accent : Color.primary.opacity(0.7))
        case .done: classColor?.opacity(0.22) ?? Color.primary.opacity(0.12)
        case .empty: Color.primary.opacity(0.07)
        }
    }
}

// ── 촉감 ──
enum Haptic {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}

// ── iOS 26 유리(Liquid Glass) — 조작·내비게이션 층에만. 이전 OS 는 재질로 대체 ──
extension View {
    @ViewBuilder func deskGlass<S: InsettableShape>(in shape: S, tint: Color? = nil) -> some View {
        if #available(iOS 26.0, *) { self.glassEffect(tint.map { .regular.tint($0) } ?? .regular, in: shape) }
        else { self.background(.regularMaterial, in: shape).overlay(shape.strokeBorder(.quaternary, lineWidth: 0.5)) }
    }
}

/// 주요 버튼 — iOS 26 유리 강조, 이전 OS 는 채운 버튼
extension View {
    @ViewBuilder func deskProminent() -> some View {
        if #available(iOS 26.0, *) { self.buttonStyle(.glassProminent) } else { self.buttonStyle(.borderedProminent) }
    }
}

/// 반 색 점 — 반 이름 앞에 붙여 시간표·진도·좌석표·상담이 같은 색으로 이어지게
struct ClassDot: View {
    let name: String?; var size: CGFloat = 8
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Circle().fill(DeskColors.cls(name: name, scheme: scheme) ?? Color.primary.opacity(0.25)).frame(width: size, height: size).accessibilityHidden(true)
    }
}

// ── 타이포 토큰 6개 — 숫자(둥근 굵게)·제목·본문 강조·본문·작은 글·라벨 ──
enum DeskText { case number(CGFloat), heading, title, bodyStrong, body, small, label }
extension View {
    @ViewBuilder func desk(_ t: DeskText) -> some View {
        switch t {
        case .number(let n): self.scaledFont(n, .bold, design: .rounded, mono: true).contentTransition(.numericText())
        case .heading: self.scaledFont(20, .bold)
        case .title: self.scaledFont(17, .semibold)
        case .bodyStrong: self.scaledFont(15, .semibold)
        case .body: self.scaledFont(15)
        case .small: self.scaledFont(13)
        case .label: self.scaledFont(12, .bold)
        }
    }
}

/// 구역 — 카드 없이 제목 한 줄과 여백으로만 나눈다(Things 식). 「오늘 전체」의 일정·할 일·공지·진도·공부·노트
struct DeskSection<Content: View>: View {
    let title: String; var trailing: String? = nil
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).desk(.title)
                Spacer()
                if let t = trailing { Text(t).desk(.small).foregroundStyle(.secondary) }
            }
            content
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
