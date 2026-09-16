// 필기 화면 보조 — 남은 수업 시간 표시, 다른 반 필기 겹쳐 보기 후보, 연속 스크롤 보기
import SwiftUI
import PencilKit

/// 도구 막대 끝의 수업 시계 — 지금 교시·남은 분(30초마다 갱신). 수업 시간이 아니면 다음 수업까지
struct ClassClock: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { ctx in
            if let t = TimetableStore.timetable {
                let now = ctx.date, m = Timetable.minutes(now)
                if let c = t.current(at: now) {
                    let left = c.start + Timetable.periodLength - m
                    pill("\(c.period)교시 · \(left)분", color: left <= 5 ? DeskTheme.live : DeskTheme.accent, icon: "clock")
                } else if let n = t.next(at: now) {
                    pill("\(n.period)교시까지 \(n.start - m)분", color: .secondary, icon: "clock")
                }
            }
        }
    }
    func pill(_ s: String, color: Color, icon: String) -> some View {
        HStack(spacing: 4) { Image(systemName: icon).scaledFont(11, .semibold); Text(s).scaledFont(12, .semibold, mono: true) }
            .foregroundStyle(color).padding(.horizontal, 10).padding(.vertical, 5).background(color.opacity(0.1), in: Capsule())
            .accessibilityLabel("수업 시계 " + s)
    }
}

/// 자료 필기 저장 키 — 반별로 나눌 때 `{base}-c{반}`; 겹쳐 보기 후보 찾기
enum InkKeys {
    static func classKey(_ base: String, className: String?) -> String {
        guard let n = className?.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression), !n.isEmpty else { return base }
        return base + "-c" + n
    }
    static func label(_ key: String, base: String) -> String {
        guard key.hasPrefix(base), key.count > base.count else { return "공통" }
        let suf = key.dropFirst(base.count); return suf.hasPrefix("-c") ? String(suf.dropFirst(2)) + "반" : String(suf)
    }
    /// 같은 자료의 다른 필기 키(로컬 + 서버). 자기 자신 제외
    static func candidates(base: String, current: String) async -> [String] {
        var keys = Set((try? FileManager.default.contentsOfDirectory(atPath: InkLocal.root.path))?.filter { $0.hasPrefix(base) && !$0.hasSuffix("_scratch") } ?? [])
        if let remote = try? await RTDB.keys("desk/ink") { keys.formUnion(remote.filter { $0.hasPrefix(base) && !$0.hasSuffix("_scratch") }) }
        keys.remove(current)
        return keys.sorted()
    }
}

extension RTDB {
    /// 얕은 조회 — 자식 키만
    static func keys(_ path: String) async throws -> [String] {
        let (data, _) = try await URLSession.shared.data(from: try url(path, extra: ["shallow": "true"]))
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?.keys.map { $0 } ?? []
    }
}

/// 다른 필기를 배경에 흐리게 겹친 그림
enum InkOverlay {
    static func compose(_ background: UIImage?, size: CGSize, overlay: PKDrawing?, alpha: CGFloat = 0.35) -> UIImage? {
        guard let overlay, !overlay.strokes.isEmpty else { return background }
        let scale: CGFloat = 2
        let r = UIGraphicsImageRenderer(size: size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = scale; return f }())
        return r.image { ctx in
            if let bg = background { bg.draw(in: CGRect(origin: .zero, size: size)) } else { UIColor.white.setFill(); ctx.fill(CGRect(origin: .zero, size: size)) }
            overlay.image(from: CGRect(origin: .zero, size: size), scale: scale).draw(in: CGRect(origin: .zero, size: size), blendMode: .normal, alpha: alpha)
        }
    }
}

/// 연속 스크롤 보기 — 모든 쪽을 세로로 이어 읽고, 누르면 그 쪽으로
struct ContinuousPagesSheet: View {
    let count: Int
    let pageSize: (Int) -> CGSize
    let image: (Int) -> UIImage?
    let drawing: (Int) -> PKDrawing
    let onPick: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            GeometryReader { g in
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(0..<count, id: \.self) { i in
                            let ps = pageSize(i), w = min(g.size.width - 32, 900), h = w * ps.height / ps.width
                            ZStack(alignment: .topLeading) {
                                Group { if let img = image(i) { Image(uiImage: img).resizable() } else { Color.white } }
                                Image(uiImage: drawing(i).image(from: CGRect(origin: .zero, size: ps), scale: 1)).resizable()
                                Text("\(i + 1)").scaledFont(11, .bold, mono: true).padding(.horizontal, 7).padding(.vertical, 3).background(.thinMaterial, in: Capsule()).padding(8)
                            }
                            .frame(width: w, height: h).clipShape(RoundedRectangle(cornerRadius: 6)).shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                            .onTapGesture { onPick(i); dismiss() }
                            .accessibilityLabel("\(i + 1)쪽").accessibilityAddTraits(.isButton)
                        }
                    }.frame(maxWidth: .infinity).padding(.vertical, 16)
                }
            }
            .background(DeskTheme.canvas)
            .navigationTitle("이어서 보기 · \(count)쪽").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        }
    }
}

/// 페이지 넘김 전환 — 캔버스는 재사용하므로(빠름) 뷰를 바꾸지 않고, index 가 바뀌는 순간 잠깐 옆에서 밀려 들어오는 느낌만 준다
struct PageSlide: ViewModifier {
    let index: Int; let direction: Int
    @State private var offset: CGFloat = 0
    @State private var opacity: Double = 1
    func body(content: Content) -> some View {
        content.offset(x: offset).opacity(opacity)
            .onChange(of: index) { _, _ in
                guard direction != 0 else { return }
                offset = CGFloat(direction) * 28; opacity = 0.6
                withAnimation(.spring(duration: 0.32, bounce: 0.12)) { offset = 0; opacity = 1 }
            }
    }
}
