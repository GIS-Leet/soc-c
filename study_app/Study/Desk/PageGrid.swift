// 페이지 한눈에 보기 — 굿노트식 썸네일 격자. 현재 쪽 강조, 누르면 그 쪽으로 이동 (자료·노트 공용)
// 썸네일은 ThumbCache 가 뒤에서 미리 만들어 두므로 격자는 그림만 꺼내 쓴다(열 때 버벅임 없음)
import SwiftUI
import PencilKit

/// 페이지별 썸네일 캐시 — 배경(PDF)과 잉크(획 수로 버전 관리)를 폭 360으로 합성, 전부 백그라운드
@MainActor
final class ThumbCache: ObservableObject {
    @Published private(set) var images: [String: UIImage] = [:]   // "i-strokeCount"
    private var inFlight: Set<String> = []
    private var bgCache: [Int: UIImage] = [:]                        // 배경만 따로(잉크가 바뀌어도 재사용)
    static func key(_ i: Int, _ d: PKDrawing) -> String { "\(i)-\(d.strokes.count)" }
    func invalidate() { images = [:]; bgCache = [:]; inFlight = [] }
    func image(_ i: Int, _ d: PKDrawing) -> UIImage? { images[Self.key(i, d)] }
    /// 없으면 만들기 시작(중복 방지). background 는 백그라운드 스레드에서 호출됨
    func ensure(_ i: Int, size: CGSize, drawing: PKDrawing, background: @escaping @Sendable (Int) -> UIImage?, priority: TaskPriority = .userInitiated) {
        let k = Self.key(i, drawing)
        guard images[k] == nil, !inFlight.contains(k) else { return }
        inFlight.insert(k)
        let bg = bgCache[i]
        Task.detached(priority: priority) {
            let w: CGFloat = 360, s = w / size.width, target = CGSize(width: w, height: (size.height * s).rounded())
            let back = bg ?? background(i)
            let ink = drawing.strokes.isEmpty ? nil : drawing.image(from: CGRect(origin: .zero, size: size), scale: s)
            let img = UIGraphicsImageRenderer(size: target).image { ctx in
                UIColor.white.setFill(); ctx.fill(CGRect(origin: .zero, size: target))
                back?.draw(in: CGRect(origin: .zero, size: target)); ink?.draw(in: CGRect(origin: .zero, size: target))
            }
            await MainActor.run { if let back, self.bgCache[i] == nil { self.bgCache[i] = back }; self.images[k] = img; self.inFlight.remove(k); if self.images.count > 400 { self.images = [:] } }
        }
    }
    /// 문서를 열자마자 전 쪽 썸네일을 낮은 우선순위로 만들어 둔다
    func prewarm(count: Int, size: @escaping (Int) -> CGSize, drawing: @escaping (Int) -> PKDrawing, background: @escaping @Sendable (Int) -> UIImage?) {
        for i in 0..<count { ensure(i, size: size(i), drawing: drawing(i), background: background, priority: .utility) }
    }
}

struct PageGridSheet: View {
    let count: Int
    let current: Int
    let pageSize: (Int) -> CGSize
    let background: @Sendable (Int) -> UIImage?
    let drawing: (Int) -> PKDrawing
    var bookmarked: (Int) -> Bool = { _ in false }
    @ObservedObject var cache: ThumbCache
    let onPick: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var onlyBookmarks = false
    var shown: [Int] { (0..<count).filter { !onlyBookmarks || bookmarked($0) } }
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: hSize == .regular ? 170 : 120), spacing: 14)], spacing: 18) {
                        ForEach(shown, id: \.self) { i in
                            let d = drawing(i), size = pageSize(i)
                            Button { onPick(i); dismiss() } label: {
                                VStack(spacing: 6) {
                                    Group {
                                        if let img = cache.image(i, d) { Image(uiImage: img).resizable() }
                                        else { Color.white.overlay(ProgressView().controlSize(.mini)).onAppear { cache.ensure(i, size: size, drawing: d, background: background) } }
                                    }
                                    .aspectRatio(size.width / size.height, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(i == current ? DeskTheme.accent : Color.primary.opacity(0.12), lineWidth: i == current ? 2.5 : 1))
                                    .overlay(alignment: .topTrailing) { if bookmarked(i) { Image(systemName: "bookmark.fill").desk(.body).foregroundStyle(DeskTheme.live).padding(6) } }
                                    .shadow(color: .black.opacity(0.08), radius: 3, y: 1)
                                    Text("\(i + 1)").font(.system(size: 12, weight: i == current ? .bold : .regular).monospacedDigit()).foregroundStyle(i == current ? DeskTheme.accent : .secondary)
                                }
                            }.buttonStyle(.plain).id(i)
                        }
                    }
                    .padding(16)
                }
                .onAppear { proxy.scrollTo(current, anchor: .center) }
            }
            .background(DeskTheme.canvas)
            .navigationTitle("페이지 \(current + 1) / \(count)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) { if (0..<count).contains(where: bookmarked) { Toggle(isOn: $onlyBookmarks) { Image(systemName: onlyBookmarks ? "bookmark.fill" : "bookmark") }.toggleStyle(.button) } }
            }
        }
    }
}

/// 내비게이션 바 가운데 「3 / 28 ▾」 — 누르면 격자
struct PageTitleButton: View {
    let index: Int; let count: Int; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) { Text("\(index + 1) / \(count)").scaledFont(15, .semibold, mono: true); Image(systemName: "chevron.down").scaledFont(10, .bold) }
                .foregroundStyle(.primary).padding(.horizontal, 10).padding(.vertical, 5).background(Color.primary.opacity(0.06), in: Capsule())
        }.buttonStyle(.plain)
    }
}
